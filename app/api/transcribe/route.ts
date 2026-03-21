import { NextResponse } from "next/server"
import OpenAI from "openai"
import { writeFile, unlink, readFile } from "fs/promises"
import { execFile } from "child_process"
import { promisify } from "util"
import { tmpdir } from "os"
import { join } from "path"
import { randomUUID } from "crypto"

const execFileAsync = promisify(execFile)
const GAP_THRESHOLD_S = 2.0

/** Extract audio from video as mp3 using ffmpeg, returns the audio buffer. */
async function extractAudio(videoBuffer: Buffer): Promise<{ buffer: Buffer; path: string }> {
  const id = randomUUID()
  const videoPath = join(tmpdir(), `dp-video-${id}.mp4`)
  const audioPath = join(tmpdir(), `dp-audio-${id}.mp3`)

  await writeFile(videoPath, videoBuffer)
  try {
    await execFileAsync("ffmpeg", [
      "-i", videoPath,
      "-vn",              // no video
      "-ac", "1",         // mono
      "-ar", "16000",     // 16kHz (Whisper native)
      "-b:a", "48k",      // low bitrate — keeps file small
      "-f", "mp3",
      "-y",               // overwrite
      audioPath,
    ], { timeout: 60_000 })

    const buffer = await readFile(audioPath)
    return { buffer, path: audioPath }
  } finally {
    await unlink(videoPath).catch(() => {})
  }
}

export async function POST(request: Request) {
  let audioPath: string | undefined
  try {
    const groq = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    })

    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      )
    }

    // Extract audio track only — much smaller than the full video
    const videoBuffer = Buffer.from(await file.arrayBuffer())
    const audio = await extractAudio(videoBuffer)
    audioPath = audio.path

    const audioFile = new File([audio.buffer], "audio.mp3", { type: "audio/mpeg" })

    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-large-v3-turbo",
      response_format: "verbose_json",
    })

    const result = transcription as unknown as {
      text: string
      language: string
      segments?: Array<{ start: number; end: number; text: string }>
    }

    const rawSegments = result.segments ?? []
    let currentSpeaker = "A"
    let speakerCount = 1

    const segments = rawSegments.map((seg, i) => {
      const mins = Math.floor(seg.start / 60)
      const secs = Math.floor(seg.start % 60)
      const timestamp = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`

      // Switch speaker on gaps > threshold
      if (i > 0) {
        const prevEnd = rawSegments[i - 1].end
        const gap = seg.start - prevEnd
        if (gap >= GAP_THRESHOLD_S) {
          currentSpeaker = currentSpeaker === "A" ? "B" : "A"
          if (speakerCount < 2) speakerCount = 2
        }
      }

      return {
        timestamp,
        speaker: `Speaker ${currentSpeaker}`,
        text: seg.text.trim(),
      }
    })

    if (segments.length === 0 && result.text) {
      segments.push({
        timestamp: "00:00",
        speaker: "Speaker A",
        text: result.text.trim(),
      })
    }

    return NextResponse.json({
      language: result.language ?? "unknown",
      segments,
      fullText: result.text ?? "",
      rawSegments: rawSegments.map((seg) => ({
        start: seg.start,
        end: seg.end,
        text: seg.text.trim(),
      })),
      diarization: {
        method: "pause-heuristic",
        speakerConfidence: "low",
        speakerCount,
        gapThresholdMs: GAP_THRESHOLD_S * 1000,
      },
    })
  } catch (error) {
    console.error("Transcription API error:", error)

    const message = error instanceof Error ? error.message : String(error)
    const isNoAudio =
      message.includes("no audio") ||
      message.includes("Invalid file") ||
      message.includes("could not process") ||
      message.includes("400") ||
      message.includes("does not contain any stream")

    if (isNoAudio) {
      // Return empty transcription instead of error for silent/no-audio videos
      return NextResponse.json({
        language: "unknown",
        segments: [],
        fullText: "",
        noAudio: true,
        diarization: {
          method: "pause-heuristic",
          speakerConfidence: "low",
          speakerCount: 0,
          gapThresholdMs: GAP_THRESHOLD_S * 1000,
        },
      })
    }

    return NextResponse.json(
      { error: `Transcription failed: ${message}` },
      { status: 500 }
    )
  } finally {
    if (audioPath) await unlink(audioPath).catch(() => {})
  }
}
