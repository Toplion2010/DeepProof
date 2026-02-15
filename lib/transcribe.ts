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

/**
 * Transcribes audio from a video URL using Groq's Whisper API (server-side).
 */
export async function transcribeVideo(
  videoUrl: string,
  onProgress?: ProgressCallback
): Promise<TranscriptionResult> {
  onProgress?.("Preparing video for transcription...")

  // Fetch the video blob and send it to the server API
  const response = await fetch(videoUrl)
  const blob = await response.blob()

  const formData = new FormData()
  formData.append("file", blob, "video.mp4")

  onProgress?.("Transcribing audio with Whisper AI (server-side)...")

  const apiResponse = await fetch("/api/transcribe", {
    method: "POST",
    body: formData,
  })

  if (!apiResponse.ok) {
    const errData = await apiResponse.json().catch(() => ({}))
    throw new Error(errData.error || `Transcription failed (${apiResponse.status})`)
  }

  const result: TranscriptionResult = await apiResponse.json()

  return result
}
