import { NextResponse } from "next/server"
import OpenAI from "openai"
import { incrementMetric } from "@/lib/metrics"
import { parseAndRepairJson } from "@/lib/json-repair"
import type { FrameExplanation, FrameExplanationResult, AnalysisMode } from "@/lib/frame-explanation"

interface AnalyzeFramesRequest {
  frames: Array<{
    base64: string
    index: number
    timestamp: number
  }>
  fileName: string
  duration: string
  mode: AnalysisMode
  perFrameScores?: number[]
  forensicHints?: Array<{
    frameIndex: number
    elaScore: number
    noiseScore: number
  }>
}

const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
const BATCH_SIZE = 4
const BATCH_TIMEOUT_MS = 20_000
const TOTAL_TIMEOUT_MS = 60_000

const SYSTEM_PROMPT_FAST = `You are a visual forensics analyst. For each frame, briefly describe what you observe and list any visual anomalies. Focus on: blending artifacts, unnatural edges, lighting inconsistencies, compression artifacts, blur/ghosting, scale inconsistencies, physically implausible elements.

Return ONLY valid JSON: { "frames": [{ "frameIndex": N, "summary": "...", "description": "...", "anomalies": [{ "type": "...", "severity": 0-100, "confidence": 0-100, "description": "...", "region": "..." }] }] }

Valid anomaly types: blending-artifact, unnatural-edge, lighting-inconsistency, compression-artifact, blur-ghosting, scale-inconsistency, physically-implausible, texture-anomaly, color-mismatch, other`

const SYSTEM_PROMPT_DEEP = `You are a visual forensics analyst performing deep analysis. For each frame:
1. Provide a 4-6 sentence detailed description of what you observe
2. Compare frames to each other for temporal consistency
3. Reason about physical plausibility of scenes
4. Explain WHY anomalies are suspicious

Focus on: blending artifacts, unnatural edges, lighting inconsistencies, compression artifacts, blur/ghosting, scale inconsistencies, physically implausible elements, texture anomalies, color mismatches.

Return ONLY valid JSON: { "frames": [{ "frameIndex": N, "summary": "1-2 sentence summary", "description": "4-6 sentence detailed description", "anomalies": [{ "type": "...", "severity": 0-100, "confidence": 0-100, "description": "...", "region": "..." }] }] }

Valid anomaly types: blending-artifact, unnatural-edge, lighting-inconsistency, compression-artifact, blur-ghosting, scale-inconsistency, physically-implausible, texture-anomaly, color-mismatch, other`

export async function POST(request: Request) {
  incrementMetric("frames.calls")
  const startMs = Date.now()

  try {
    const body: AnalyzeFramesRequest = await request.json()
    const { frames, fileName, duration, mode, perFrameScores, forensicHints } = body

    if (!frames || frames.length === 0) {
      return NextResponse.json({
        frames: [],
        modelId: VISION_MODEL,
        mode: mode ?? "fast",
        degraded: true,
        error: "No frames provided",
        processingMs: Date.now() - startMs,
      } satisfies FrameExplanationResult)
    }

    const groq = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    })

    const systemPrompt = mode === "deep" ? SYSTEM_PROMPT_DEEP : SYSTEM_PROMPT_FAST
    const maxTokens = mode === "deep" ? 2048 : 1024

    // Batch frames into groups of BATCH_SIZE
    const batches: Array<typeof frames> = []
    for (let i = 0; i < frames.length; i += BATCH_SIZE) {
      batches.push(frames.slice(i, i + BATCH_SIZE))
    }

    const allExplanations: FrameExplanation[] = []
    let degraded = false
    const totalDeadline = Date.now() + TOTAL_TIMEOUT_MS

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      // Check total timeout
      if (Date.now() >= totalDeadline) {
        degraded = true
        break
      }

      const batch = batches[batchIdx]
      const batchResult = await processBatch(
        groq,
        batch,
        fileName,
        duration,
        mode,
        systemPrompt,
        maxTokens,
        perFrameScores,
        forensicHints,
        Math.min(BATCH_TIMEOUT_MS, totalDeadline - Date.now())
      )

      if (batchResult.error) {
        degraded = true
        break
      }

      allExplanations.push(...batchResult.frames)
    }

    return NextResponse.json({
      frames: allExplanations,
      modelId: VISION_MODEL,
      mode,
      degraded,
      processingMs: Date.now() - startMs,
    } satisfies FrameExplanationResult)
  } catch (error) {
    incrementMetric("frames.errors")
    const message = error instanceof Error ? error.message : "Frame analysis failed"
    console.error("Frame analysis API error:", message)
    return NextResponse.json({
      frames: [],
      modelId: VISION_MODEL,
      mode: "fast",
      degraded: true,
      error: message,
      processingMs: Date.now() - startMs,
    } satisfies FrameExplanationResult)
  }
}

async function processBatch(
  groq: OpenAI,
  batch: Array<{ base64: string; index: number; timestamp: number }>,
  fileName: string,
  duration: string,
  mode: AnalysisMode,
  systemPrompt: string,
  maxTokens: number,
  perFrameScores?: number[],
  forensicHints?: Array<{ frameIndex: number; elaScore: number; noiseScore: number }>,
  timeoutMs = BATCH_TIMEOUT_MS
): Promise<{ frames: FrameExplanation[]; error?: string }> {
  const indices = batch.map((f) => f.index)
  const timestamps = batch.map((f) => `${f.timestamp.toFixed(1)}s`)

  let userPromptParts = [
    `Analyze frames ${indices.join(", ")} from "${fileName}" (duration: ${duration}).`,
    `Timestamps: ${timestamps.join(", ")}.`,
  ]

  if (perFrameScores && perFrameScores.length > 0) {
    const scoreStrs = batch
      .map((f) => {
        const score = perFrameScores[f.index]
        return score !== undefined ? `Frame ${f.index}: ${score}%` : null
      })
      .filter(Boolean)
    if (scoreStrs.length > 0) {
      userPromptParts.push(`AI detector scores: ${scoreStrs.join(", ")}`)
    }
  }

  if (forensicHints && forensicHints.length > 0) {
    const hintStrs = batch
      .map((f) => {
        const hint = forensicHints.find((h) => h.frameIndex === f.index)
        return hint ? `Frame ${f.index} ELA=${Math.round(hint.elaScore)}% Noise=${Math.round(hint.noiseScore)}%` : null
      })
      .filter(Boolean)
    if (hintStrs.length > 0) {
      userPromptParts.push(`Forensic hints: ${hintStrs.join(", ")}`)
    }
  }

  userPromptParts.push("Describe each frame and identify visual anomalies. Return ONLY valid JSON.")

  const imageContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = batch.map(
    (frame) => ({
      type: "image_url" as const,
      image_url: { url: `data:image/jpeg;base64,${frame.base64}` },
    })
  )

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  const attemptCall = async (): Promise<{ frames: FrameExplanation[]; error?: string }> => {
    const completion = await groq.chat.completions.create(
      {
        model: VISION_MODEL,
        temperature: 0.2,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userPromptParts.join(" ") },
              ...imageContent,
            ],
          },
        ],
      },
      { signal: controller.signal }
    )

    const responseText = completion.choices[0]?.message?.content ?? "{}"
    const { data } = parseAndRepairJson<{ frames?: FrameExplanation[] }>(responseText)

    if (!data?.frames || !Array.isArray(data.frames)) {
      return { frames: [], error: "Invalid JSON structure from vision model" }
    }

    // Validate and sanitize each frame explanation
    const validFrames: FrameExplanation[] = data.frames.map((f) => ({
      frameIndex: typeof f.frameIndex === "number" ? f.frameIndex : 0,
      timestamp: batch.find((b) => b.index === f.frameIndex)?.timestamp ?? 0,
      summary: typeof f.summary === "string" ? f.summary : "",
      description: typeof f.description === "string" ? f.description : "",
      anomalies: Array.isArray(f.anomalies)
        ? f.anomalies.map((a) => ({
            type: a.type ?? "other",
            severity: typeof a.severity === "number" ? Math.max(0, Math.min(100, a.severity)) : 0,
            confidence: typeof a.confidence === "number" ? Math.max(0, Math.min(100, a.confidence)) : 0,
            description: typeof a.description === "string" ? a.description : "",
            region: typeof a.region === "string" ? a.region : undefined,
          }))
        : [],
    }))

    return { frames: validFrames }
  }

  try {
    try {
      const result = await attemptCall()
      clearTimeout(timeout)
      return result
    } catch (err) {
      // Retry once on 429 rate limit
      if (err instanceof Error && "status" in err && (err as { status: number }).status === 429) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        try {
          const result = await attemptCall()
          clearTimeout(timeout)
          return result
        } catch {
          clearTimeout(timeout)
          incrementMetric("frames.errors")
          return { frames: [], error: "Rate limited after retry" }
        }
      }
      throw err
    }
  } catch (error) {
    clearTimeout(timeout)
    incrementMetric("frames.errors")
    const isAbort = error instanceof Error && error.name === "AbortError"
    return {
      frames: [],
      error: isAbort ? "Batch timed out" : error instanceof Error ? error.message : "Batch failed",
    }
  }
}
