/**
 * Image analysis API route
 * POST /api/analyze-image
 *
 * Accepts image extraction data, runs Groq vision LLM analysis,
 * computes fraud probability and confidence scores, returns findings.
 */

import { OpenAI } from "openai"
import { parseAndRepairJson } from "@/lib/json-repair"
import { incrementMetric } from "@/lib/metrics"
import {
  computeImageMetadataSignals,
  type ImageFinding,
  type ImageFindingType,
} from "@/lib/image-analysis"

const VALID_FINDING_TYPES = new Set<ImageFindingType>([
  "ai-patterns",
  "compression-artifacts",
  "upsampling-traces",
  "metadata-inconsistency",
  "layout-anomaly",
  "authentic-signal",
])

const VALID_SEVERITIES = new Set(["low", "medium", "high"])

const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
const VISION_TIMEOUT_MS = 20_000

export interface AnalyzeImageRequest {
  imageBase64: string
  fileName: string
  fileHash: string
  consentGiven: boolean
  width: number
  height: number
  exifMetadata?: Record<string, string>
}

export interface ImageAnalysisResult {
  visionScore: number
  metadataScore: number
  finalFraudScore: number
  confidenceScore: number
  explanation: string
  findings: ImageFinding[]
  modelId: string
  analysisVersion: string
  degraded: boolean
  degradedReasons: string[]
  analyzedAt: string
}

interface ValidatedLLMOutput {
  fraudScore: number
  confidenceScore: number
  explanation: string
  findings: ImageFinding[]
  valid: boolean
}

/**
 * Validate and clamp LLM output
 */
function validateImageLLMOutput(raw: unknown): ValidatedLLMOutput {
  const rawObj = raw as Record<string, unknown>

  const fraudScore =
    typeof rawObj.fraudScore === "number"
      ? Math.min(100, Math.max(0, Math.round(rawObj.fraudScore)))
      : 50

  const confidenceScore =
    typeof rawObj.confidenceScore === "number"
      ? Math.min(100, Math.max(0, Math.round(rawObj.confidenceScore)))
      : 20

  const explanation =
    typeof rawObj.explanation === "string" && rawObj.explanation.trim().length > 0
      ? rawObj.explanation.trim()
      : "Model did not return a valid explanation."

  const findings: ImageFinding[] = Array.isArray(rawObj.findings)
    ? rawObj.findings
        .filter(
          (f: unknown) =>
            f &&
            typeof f === "object" &&
            "type" in f &&
            "severity" in f &&
            "description" in f &&
            VALID_FINDING_TYPES.has((f as Record<string, unknown>).type as ImageFindingType) &&
            VALID_SEVERITIES.has((f as Record<string, unknown>).severity as string) &&
            typeof (f as Record<string, unknown>).description === "string"
        )
        .map((f: unknown) => {
          const finding = f as Record<string, unknown>
          return {
            type: finding.type as ImageFindingType,
            severity: finding.severity as "low" | "medium" | "high",
            description: (finding.description as string).trim(),
            source: "vision" as const,
          }
        })
    : []

  const valid = typeof rawObj.fraudScore === "number" && Array.isArray(rawObj.findings)

  return { fraudScore, confidenceScore, explanation, findings, valid }
}

/**
 * Deduplicate findings by (type, description), keeping higher severity
 */
function deduplicateFindings(findings: ImageFinding[]): ImageFinding[] {
  const map = new Map<string, ImageFinding>()

  for (const finding of findings) {
    const key = `${finding.type}|${finding.description}`
    const existing = map.get(key)

    if (!existing) {
      map.set(key, { ...finding })
    } else {
      if (
        (finding.severity === "high" && existing.severity !== "high") ||
        (finding.severity === "medium" && existing.severity === "low")
      ) {
        map.set(key, { ...finding })
      }
    }
  }

  return Array.from(map.values())
}

export async function POST(request: Request) {
  try {
    const body: AnalyzeImageRequest = await request.json()

    // Validate consent
    if (!body.consentGiven) {
      return new Response(JSON.stringify({ error: "Consent not given" }), { status: 400 })
    }

    const degradedReasons: string[] = []
    let visionScore = 50
    let visionDegraded = false
    let visionFindings: ImageFinding[] = []
    let visionExplanation = ""
    let visionConfidence = 50

    // Step 1: Compute metadata signals (pure function)
    const metadataSignals = computeImageMetadataSignals(body.exifMetadata)
    const metadataScore = metadataSignals.metadataScore

    // Convert metadata flags to findings
    const metadataFindings: ImageFinding[] = metadataSignals.flags.map((flag) => ({
      type: "metadata-inconsistency" as ImageFindingType,
      severity: (metadataScore > 25 ? "medium" : "low") as "low" | "medium" | "high",
      description: flag,
      source: "metadata" as const,
    }))

    // Step 2: Vision LLM call
    const groq = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    })

    const visionAbort = new AbortController()
    const visionTimer = setTimeout(() => visionAbort.abort(), VISION_TIMEOUT_MS)

    const softwareLine = body.exifMetadata?.Software
      ? `EXIF Software: ${body.exifMetadata.Software}`
      : "EXIF Software: none"
    const cameraLine =
      body.exifMetadata?.Make || body.exifMetadata?.Model
        ? `EXIF Camera: ${[body.exifMetadata.Make, body.exifMetadata.Model].filter(Boolean).join(" ")}`
        : "EXIF Camera: none"

    try {
      const completion = await groq.chat.completions.create(
        {
          model: VISION_MODEL,
          max_tokens: 1024,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `You are an image forensics expert. Analyze this image for signs of AI generation or manipulation.

Look for:
- Unnatural textures or over-smoothed skin/surfaces
- Inconsistent lighting, shadows, or reflections
- Anatomical anomalies (hands, fingers, teeth, ears, hair)
- Edge artifacts or blending boundaries
- Repeated patterns or tiling artifacts
- Inconsistent depth of field or perspective
- Synthetic-looking backgrounds
- Text rendering anomalies (if text present)
- Compression inconsistencies suggesting compositing
- Upsampling artifacts or resolution inconsistencies

Image metadata:
- File: ${body.fileName}
- Dimensions: ${body.width}x${body.height}
- ${softwareLine}
- ${cameraLine}

Return ONLY valid JSON:
{
  "fraudScore": <0-100, where 0=definitely authentic, 100=definitely AI-generated>,
  "confidenceScore": <0-100, how confident you are in your assessment>,
  "explanation": "2-4 sentences explaining your assessment",
  "findings": [
    { "type": "<type>", "severity": "<low|medium|high>", "description": "..." }
  ]
}

Valid finding types: ai-patterns, compression-artifacts, upsampling-traces, metadata-inconsistency, layout-anomaly, authentic-signal

If no anomalies detected: return { "fraudScore": 10, "confidenceScore": 80, "explanation": "...", "findings": [{ "type": "authentic-signal", "severity": "low", "description": "No visual anomalies detected.", "source": "vision" }] }`,
                },
                {
                  type: "image_url",
                  image_url: { url: `data:image/jpeg;base64,${body.imageBase64}` },
                },
              ],
            },
          ],
        },
        { signal: visionAbort.signal }
      )

      clearTimeout(visionTimer)

      const content = completion.choices[0]?.message?.content
      if (content) {
        const parsed = parseAndRepairJson(content)
        const validated = validateImageLLMOutput(parsed.data)

        if (validated.valid) {
          visionScore = validated.fraudScore
          visionConfidence = validated.confidenceScore
          visionExplanation = validated.explanation
          visionFindings = validated.findings
        } else {
          degradedReasons.push("Vision analysis returned invalid output.")
          visionDegraded = true
        }
      }
    } catch (err) {
      clearTimeout(visionTimer)

      // Retry once on rate limit (429)
      if (err instanceof Error && err.message.includes("429")) {
        try {
          await new Promise((r) => setTimeout(r, 2000))
          const retryAbort = new AbortController()
          const retryTimer = setTimeout(() => retryAbort.abort(), VISION_TIMEOUT_MS)

          const retryCompletion = await groq.chat.completions.create(
            {
              model: VISION_MODEL,
              max_tokens: 1024,
              response_format: { type: "json_object" },
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: `Analyze this image for signs of AI generation. Return JSON with fraudScore (0-100), confidenceScore (0-100), explanation, and findings array. Valid finding types: ai-patterns, compression-artifacts, upsampling-traces, metadata-inconsistency, layout-anomaly, authentic-signal.`,
                    },
                    {
                      type: "image_url",
                      image_url: { url: `data:image/jpeg;base64,${body.imageBase64}` },
                    },
                  ],
                },
              ],
            },
            { signal: retryAbort.signal }
          )

          clearTimeout(retryTimer)

          const retryContent = retryCompletion.choices[0]?.message?.content
          if (retryContent) {
            const parsed = parseAndRepairJson(retryContent)
            const validated = validateImageLLMOutput(parsed.data)
            if (validated.valid) {
              visionScore = validated.fraudScore
              visionConfidence = validated.confidenceScore
              visionExplanation = validated.explanation
              visionFindings = validated.findings
            } else {
              degradedReasons.push("Vision analysis returned invalid output on retry.")
              visionDegraded = true
            }
          }
        } catch {
          degradedReasons.push("Vision analysis failed after rate limit retry.")
          visionDegraded = true
        }
      } else {
        const isAbort = err instanceof Error && err.name === "AbortError"
        degradedReasons.push(
          isAbort
            ? "Vision analysis timed out."
            : `Vision analysis failed: ${err instanceof Error ? err.message : "unknown error"}`
        )
        visionDegraded = true
      }
    }

    // Step 3: Merge and deduplicate findings
    let allFindings = [...visionFindings, ...metadataFindings]
    allFindings = deduplicateFindings(allFindings)

    // Inject fallback if no findings
    if (allFindings.length === 0) {
      allFindings.push({
        type: "authentic-signal",
        severity: "low",
        description: "No strong indicators of AI generation were detected.",
        source: "system",
      })
    }

    // Step 4: Compute final fraud score (vision 70%, metadata 30%)
    const finalFraudScore = Math.round(
      Math.min(100, Math.max(0, visionScore * 0.7 + metadataScore * 0.3))
    )

    // Step 5: Blend confidence score
    let confidence = visionConfidence
    if (body.width < 512 || body.height < 512) confidence -= 10
    if (!body.exifMetadata || Object.keys(body.exifMetadata).length === 0) confidence -= 10
    if (visionDegraded) confidence = Math.min(confidence, 60)
    confidence = Math.min(100, Math.max(0, Math.round(confidence)))

    // Fallback if completely failed
    const isDegraded = visionDegraded || degradedReasons.length > 0
    if (isDegraded && finalFraudScore === 0 && confidence === 0) {
      return buildResponse({
        visionScore: 50,
        metadataScore,
        finalFraudScore: 50,
        confidenceScore: 20,
        explanation: "Analysis could not be completed reliably.",
        findings: allFindings,
        degraded: true,
        degradedReasons: ["Analysis failed; result is a low-confidence estimate.", ...degradedReasons],
      })
    }

    const explanation = visionExplanation || "Image analysis could not produce a detailed explanation."

    incrementMetric("image.analysis.calls")

    return buildResponse({
      visionScore,
      metadataScore,
      finalFraudScore,
      confidenceScore: confidence,
      explanation,
      findings: allFindings,
      degraded: isDegraded,
      degradedReasons,
    })
  } catch (error) {
    console.error("Image analysis error:", error)
    incrementMetric("image.analysis.errors")
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return new Response(
      JSON.stringify({
        visionScore: 50,
        metadataScore: 0,
        finalFraudScore: 50,
        confidenceScore: 20,
        explanation: "Analysis failed due to an error.",
        findings: [],
        modelId: VISION_MODEL,
        analysisVersion: "image-1.0.0",
        degraded: true,
        degradedReasons: [`Analysis failed: ${errorMessage}`],
        analyzedAt: new Date().toISOString(),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}

function buildResponse(params: {
  visionScore: number
  metadataScore: number
  finalFraudScore: number
  confidenceScore: number
  explanation: string
  findings: ImageFinding[]
  degraded: boolean
  degradedReasons: string[]
}): Response {
  const result: ImageAnalysisResult = {
    ...params,
    modelId: VISION_MODEL,
    analysisVersion: "image-1.0.0",
    analyzedAt: new Date().toISOString(),
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}
