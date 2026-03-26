import { NextResponse } from "next/server"
import OpenAI from "openai"
import { incrementMetric } from "@/lib/metrics"
import { parseAndRepairJson } from "@/lib/json-repair"

interface VisionRequest {
  frames: string[]
  fileName: string
  duration: string
  consentGiven: boolean
}

const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
const TIMEOUT_MS = 15_000

export async function POST(request: Request) {
  incrementMetric("vision.calls")

  try {
    const body: VisionRequest = await request.json()
    const { frames, fileName, duration, consentGiven } = body

    if (consentGiven !== true) {
      return NextResponse.json(
        { error: "User consent is required for vision analysis" },
        { status: 400 }
      )
    }

    if (!frames || frames.length === 0) {
      return NextResponse.json({
        findings: [],
        modelId: VISION_MODEL,
        degraded: true,
        error: "No frames provided",
      })
    }

    // Select up to 4 evenly-spaced frames
    const selected = selectFrames(frames, 4)

    const groq = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const imageContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = selected.map(
        (frame) => ({
          type: "image_url" as const,
          image_url: { url: `data:image/jpeg;base64,${frame}` },
        })
      )

      const completion = await groq.chat.completions.create(
        {
          model: VISION_MODEL,
          temperature: 0.2,
          max_tokens: 512,
          messages: [
            {
              role: "system",
              content: `You are a visual forensics assistant. Describe observable visual anomalies in the provided video frames.

RULES:
- Only describe what you observe: lighting inconsistencies, blending artifacts, unnatural facial features, background discontinuities, compression artifacts, edge distortions.
- FINGER COUNT CHECK: If hands are visible, count the fingers on each hand. Humans have exactly 5 fingers per hand (including thumb). If any hand has more or fewer than 5 fingers, fused fingers, extra joints, or impossible finger positions, report it as an observation (e.g. "Hand in frame 2 appears to have 6 fingers on the right hand").
- You are NOT allowed to determine whether the video is fake or real.
- Do NOT output any probability, score, verdict, or judgment about authenticity.
- Return ONLY a JSON array of strings, each describing one observation.
- If no anomalies are observed, return an empty array [].`,
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Analyze these ${selected.length} frames from video "${fileName}" (duration: ${duration}) for visual anomalies. Return ONLY a JSON array of strings.`,
                },
                ...imageContent,
              ],
            },
          ],
        },
        { signal: controller.signal }
      )

      clearTimeout(timeout)

      const responseText = completion.choices[0]?.message?.content ?? "[]"
      const { data: findings } = parseAndRepairJson<string[]>(responseText)

      if (!Array.isArray(findings) || !findings.every((f) => typeof f === "string")) {
        incrementMetric("vision.errors")
        return NextResponse.json({
          findings: [],
          modelId: VISION_MODEL,
          degraded: true,
          error: "Invalid vision JSON output",
        })
      }

      return NextResponse.json({
        findings,
        modelId: VISION_MODEL,
        degraded: false,
      })
    } catch (err) {
      clearTimeout(timeout)
      throw err
    }
  } catch (error) {
    incrementMetric("vision.errors")
    const message = error instanceof Error ? error.message : "Vision analysis failed"
    const isAbort = error instanceof Error && error.name === "AbortError"
    console.error("Vision API error:", message)
    return NextResponse.json({
      findings: [],
      modelId: VISION_MODEL,
      degraded: true,
      error: isAbort ? "Vision analysis timed out" : message,
    })
  }
}

function selectFrames(frames: string[], max: number): string[] {
  if (frames.length <= max) return frames
  const step = frames.length / max
  return Array.from({ length: max }, (_, i) => frames[Math.floor(i * step)])
}
