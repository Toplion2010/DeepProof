import { NextResponse } from "next/server"
import OpenAI from "openai"

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

    const segments = (result.segments ?? []).map((seg, i) => {
      const mins = Math.floor(seg.start / 60)
      const secs = Math.floor(seg.start % 60)
      const timestamp = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`

      return {
        timestamp,
        speaker: `Speaker ${i % 2 === 0 ? "A" : "B"}`,
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
    })
  } catch (error) {
    console.error("Transcription API error:", error)
    return NextResponse.json(
      { error: "Transcription failed. Check your GROQ_API_KEY." },
      { status: 500 }
    )
  }
}
