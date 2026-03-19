import { NextResponse } from "next/server"
import OpenAI from "openai"

const GAP_THRESHOLD_S = 2.0

export async function POST(request: Request) {
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

    const transcription = await groq.audio.transcriptions.create({
      file,
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
      message.includes("400")

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
      { error: "Transcription failed. Check your GROQ_API_KEY." },
      { status: 500 }
    )
  }
}
