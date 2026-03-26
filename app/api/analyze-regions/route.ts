import { NextResponse } from "next/server"
import OpenAI from "openai"
import { incrementMetric } from "@/lib/metrics"
import { parseAndRepairJson } from "@/lib/json-repair"
import type { RegionAIAnalysis } from "@/lib/region-analysis"
import type { AnomalyType } from "@/lib/frame-explanation"

interface AnalyzeRegionsRequest {
  regions: Array<{
    index: number
    cropBase64: string
    forensicIntensity: number
    sourceSignals: string[]
    isDocument?: boolean
  }>
  fileName: string
}

interface AIRegionResponse {
  isSuspicious: boolean
  aiConfidence: number
  anomalyType: string
  explanation: string
}

const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
const MAX_REGIONS = 5
const REGION_TIMEOUT_MS = 8_000

const VALID_ANOMALY_TYPES: Set<string> = new Set([
  "blending-artifact", "unnatural-edge", "lighting-inconsistency",
  "compression-artifact", "blur-ghosting", "scale-inconsistency",
  "physically-implausible", "texture-anomaly", "color-mismatch", "other",
])

const SYSTEM_PROMPT = `You are analyzing a cropped region from a larger image flagged by forensic algorithms.
Focus on: unnatural edges, inconsistent lighting, texture mismatches, blending artifacts, compression inconsistencies.
Return ONLY valid JSON: { "isSuspicious": true/false, "aiConfidence": 0-100, "anomalyType": "...", "explanation": "1-2 sentences referencing visible issues" }

Valid anomaly types: blending-artifact, unnatural-edge, lighting-inconsistency, compression-artifact, blur-ghosting, scale-inconsistency, physically-implausible, texture-anomaly, color-mismatch, other`

const DOCUMENT_ADDENDUM = `\nPay special attention to signatures, stamps, text alignment, font inconsistencies, and ID photo regions.`

export async function POST(request: Request) {
  incrementMetric("regions.calls")
  const startMs = Date.now()

  try {
    const body: AnalyzeRegionsRequest = await request.json()
    const { regions, fileName } = body

    if (!regions || regions.length === 0) {
      return NextResponse.json({
        results: [],
        aiCallsMade: 0,
        degraded: true,
      })
    }

    const groq = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    })

    // Dedup crops by prefix hash
    const seen = new Set<string>()
    const uniqueRegions = regions.slice(0, MAX_REGIONS).filter((r) => {
      const hash = r.cropBase64.substring(0, 200)
      if (seen.has(hash)) return false
      seen.add(hash)
      return true
    })

    // Analyze all regions in parallel
    const results = await Promise.allSettled(
      uniqueRegions.map((region) => analyzeRegion(groq, region, fileName))
    )

    const aiResults: RegionAIAnalysis[] = results.map((r, i) => {
      if (r.status === "fulfilled") return r.value
      // Fallback: forensic-only
      return {
        regionIndex: uniqueRegions[i].index,
        isSuspicious: uniqueRegions[i].forensicIntensity > 50,
        aiConfidence: 0,
        anomalyType: "other" as AnomalyType,
        explanation: "Forensic signals detected anomalies in this region",
      }
    })

    return NextResponse.json({
      results: aiResults,
      aiCallsMade: uniqueRegions.length,
      degraded: results.some((r) => r.status === "rejected"),
      processingMs: Date.now() - startMs,
    })
  } catch (error) {
    incrementMetric("regions.errors")
    console.error("Region analysis API error:", error instanceof Error ? error.message : error)
    return NextResponse.json(
      { results: [], aiCallsMade: 0, degraded: true, error: "Region analysis failed" },
      { status: 500 }
    )
  }
}

async function analyzeRegion(
  groq: OpenAI,
  region: AnalyzeRegionsRequest["regions"][number],
  fileName: string
): Promise<RegionAIAnalysis> {
  const systemPrompt = region.isDocument
    ? SYSTEM_PROMPT + DOCUMENT_ADDENDUM
    : SYSTEM_PROMPT

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REGION_TIMEOUT_MS)

  try {
    const response = await groq.chat.completions.create(
      {
        model: VISION_MODEL,
        max_tokens: 512,
        temperature: 0.1,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${region.cropBase64}`,
                },
              },
              {
                type: "text",
                text: `Analyze this cropped region from "${fileName}". Forensic signals: ${region.sourceSignals.join(", ")} (intensity: ${Math.round(region.forensicIntensity)}/100). Is this region suspicious?`,
              },
            ],
          },
        ],
      },
      { signal: controller.signal }
    )

    clearTimeout(timeout)

    const raw = response.choices[0]?.message?.content ?? ""
    const parsed = parseAndRepairJson<AIRegionResponse>(raw)

    if (parsed.data) {
      const data = parsed.data
      const anomalyType = VALID_ANOMALY_TYPES.has(data.anomalyType)
        ? (data.anomalyType as AnomalyType)
        : "other"

      return {
        regionIndex: region.index,
        isSuspicious: !!data.isSuspicious,
        aiConfidence: Math.max(0, Math.min(100, Number(data.aiConfidence) || 0)),
        anomalyType,
        explanation: typeof data.explanation === "string" ? data.explanation : "No explanation provided",
      }
    }

    // Parse failed — return degraded
    return {
      regionIndex: region.index,
      isSuspicious: false,
      aiConfidence: 0,
      anomalyType: "other",
      explanation: "AI response could not be parsed",
    }
  } catch (error) {
    clearTimeout(timeout)

    // Retry once on 429
    if (error instanceof Error && error.message.includes("429")) {
      await new Promise((r) => setTimeout(r, 1000))
      return analyzeRegion(groq, region, fileName)
    }

    throw error
  }
}
