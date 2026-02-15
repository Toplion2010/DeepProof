import type { AutomaticSpeechRecognitionOutput } from "@huggingface/transformers"

export interface TranscriptSegment {
  timestamp: string
  speaker: string
  text: string
}

export interface TranscriptionResult {
  language: string
  segments: TranscriptSegment[]
  fullText: string
}

type ProgressCallback = (message: string) => void

let cachedPipeline: unknown | null = null

/**
 * Extracts audio from a video blob URL and returns a 16kHz mono Float32Array
 * (the format Whisper expects).
 */
async function extractAudio(videoUrl: string): Promise<Float32Array> {
  const response = await fetch(videoUrl)
  const arrayBuffer = await response.arrayBuffer()

  const audioCtx = new AudioContext({ sampleRate: 16000 })
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)

  // Mix down to mono
  const numChannels = audioBuffer.numberOfChannels
  const length = audioBuffer.length
  const mono = new Float32Array(length)

  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      mono[i] += channelData[i] / numChannels
    }
  }

  await audioCtx.close()
  return mono
}

/**
 * Transcribes audio from a video URL using Whisper (runs in-browser via ONNX).
 */
export async function transcribeVideo(
  videoUrl: string,
  onProgress?: ProgressCallback
): Promise<TranscriptionResult> {
  onProgress?.("Extracting audio from video...")
  const audioData = await extractAudio(videoUrl)

  onProgress?.("Loading Whisper model (first time may take ~150MB download)...")
  if (!cachedPipeline) {
    const { pipeline } = await import("@huggingface/transformers")
    cachedPipeline = await pipeline(
      "automatic-speech-recognition",
      "onnx-community/whisper-small",
      { dtype: "fp32" }
    )
  }
  const transcriber = cachedPipeline

  onProgress?.("Transcribing audio...")
  const result = (await transcriber(audioData, {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
  })) as AutomaticSpeechRecognitionOutput

  // Extract language from the output (Whisper auto-detects)
  const language = (result as Record<string, unknown>).language as string | undefined ?? "unknown"

  // Parse chunks into segments
  const chunks = result.chunks ?? []
  const segments: TranscriptSegment[] = chunks.map((chunk, i) => {
    const startSec = Array.isArray(chunk.timestamp) ? (chunk.timestamp[0] ?? 0) : 0
    const mins = Math.floor(startSec / 60)
    const secs = Math.floor(startSec % 60)
    const timestamp = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`

    return {
      timestamp,
      speaker: `Speaker ${i % 2 === 0 ? "A" : "B"}`,
      text: chunk.text.trim(),
    }
  })

  // If no chunks, treat the whole output as one segment
  if (segments.length === 0 && result.text) {
    segments.push({
      timestamp: "00:00",
      speaker: "Speaker A",
      text: result.text.trim(),
    })
  }

  return {
    language,
    segments,
    fullText: result.text ?? "",
  }
}
