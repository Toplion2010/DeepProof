/**
 * Document analysis API route
 * POST /api/analyze-document
 *
 * Accepts document extraction data, runs Groq vision + content analysis,
 * computes fraud probability and confidence scores, returns findings.
 */

import { OpenAI } from "openai"
import { parseAndRepairJson } from "@/lib/json-repair"
import { incrementMetric } from "@/lib/metrics"
import type { DocumentFinding, DocumentFindingType } from "@/lib/document-analysis"

const VALID_FINDING_TYPES = new Set<DocumentFindingType>([
  "suspicious-metadata",
  "inconsistent-fonts",
  "image-tampering",
  "ocr-mismatch",
  "compression-artifacts",
  "missing-elements",
  "layout-anomaly",
  "text-inconsistency",
  "authentic-signal",
])

const VALID_SEVERITIES = new Set(["low", "medium", "high"])

export interface AnalyzeDocumentRequest {
  extractedText: string
  firstPageImage: string
  fileName: string
  fileType: "pdf" | "image"
  pageCount: number
  pdfCreationDate?: string
  pdfModificationDate?: string
  pdfProducer?: string
  pdfCreator?: string
  fileHash: string
  consentGiven: boolean
}

export interface DocumentAnalysisResult {
  visionScore: number
  contentScore: number
  metadataScore: number
  finalFraudScore: number
  confidenceScore: number
  explanation: string
  findings: DocumentFinding[]
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
  findings: DocumentFinding[]
  valid: boolean
}

/**
 * Validate and clamp LLM output
 */
function validateDocumentLLMOutput(raw: unknown): ValidatedLLMOutput {
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

  const findings: DocumentFinding[] = Array.isArray(rawObj.findings)
    ? rawObj.findings
        .filter(
          (f: unknown) =>
            f &&
            typeof f === "object" &&
            "type" in f &&
            "severity" in f &&
            "description" in f &&
            VALID_FINDING_TYPES.has((f as any).type) &&
            VALID_SEVERITIES.has((f as any).severity) &&
            typeof (f as any).description === "string"
        )
        .map((f: any) => ({
          type: f.type as DocumentFindingType,
          severity: f.severity as "low" | "medium" | "high",
          description: f.description.trim(),
          source: f.source === "vision" || f.source === "metadata" ? f.source : "text-analysis",
        }))
    : []

  const valid = typeof rawObj.fraudScore === "number" && Array.isArray(rawObj.findings)

  return { fraudScore, confidenceScore, explanation, findings, valid }
}

/**
 * Compute metadata score from request fields
 */
function computeMetadataScore(req: AnalyzeDocumentRequest): number {
  let base = 0

  if (req.pdfCreationDate && req.pdfModificationDate) {
    const creationTime = new Date(req.pdfCreationDate).getTime()
    const modificationTime = new Date(req.pdfModificationDate).getTime()

    if (!isNaN(creationTime) && !isNaN(modificationTime) && creationTime > modificationTime) {
      base += 35
    }
  }

  if (!req.pdfProducer || req.pdfProducer === "unknown") {
    base += 10
  }

  if (
    req.pdfProducer &&
    ["paint", "gimp", "mspaint"].some((name) =>
      req.pdfProducer!.toLowerCase().includes(name)
    )
  ) {
    base += 20
  }

  return Math.min(100, Math.max(0, base))
}

/**
 * Deduplicate findings by (type, description), merging sources
 */
function deduplicateFindings(findings: DocumentFinding[]): DocumentFinding[] {
  const map = new Map<string, DocumentFinding>()

  for (const finding of findings) {
    const key = `${finding.type}|${finding.description}`
    const existing = map.get(key)

    if (!existing) {
      map.set(key, { ...finding })
    } else {
      // Keep higher severity
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

/**
 * Blend confidence score based on signals and degradation
 */
function blendConfidenceScore(
  rawConfidence: number,
  visionScore: number,
  contentScore: number,
  visionDegraded: boolean,
  contentDegraded: boolean,
  degraded: boolean
): number {
  let confidence = rawConfidence

  // Penalize signal divergence
  const signalDivergence = Math.abs(visionScore - contentScore)
  if (signalDivergence > 40) {
    confidence -= 15
  } else if (signalDivergence > 20) {
    confidence -= 8
  }

  // Penalize degradation
  if (visionDegraded) confidence -= 15
  if (contentDegraded) confidence -= 15

  // Hard cap when degraded
  if (degraded) {
    confidence = Math.min(confidence, 60)
  }

  return Math.min(100, Math.max(0, Math.round(confidence)))
}

export async function POST(request: Request) {
  try {
    const body: AnalyzeDocumentRequest = await request.json()

    // Validate consent
    if (!body.consentGiven) {
      return new Response(JSON.stringify({ error: "Consent not given" }), { status: 400 })
    }

    const degradedReasons: string[] = []
    let visionScore = 50
    let contentScore = 0
    let visionDegraded = false
    let contentDegraded = false
    let visionFindings: DocumentFinding[] = []
    let contentExplanation = ""
    let contentConfidence = 50
    let contentFindingsArray: DocumentFinding[] = []

    // Compute metadata score (pure function)
    const metadataScore = computeMetadataScore(body)

    // Truncate extracted text
    let truncatedText = body.extractedText
    if (truncatedText.length > 25000) {
      truncatedText = truncatedText.substring(0, 25000) + " [Content truncated for analysis]"
    }

    // Instantiate Groq client
    const groq = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    })

    // Create per-call abort controllers
    const visionAbort = new AbortController()
    const contentAbort = new AbortController()
    const globalAbort = new AbortController()

    // Global timeout: 25 seconds
    const globalTimer = setTimeout(() => globalAbort.abort(), 25000)

    try {
      // Call 1: Vision analysis (skip if no image)
      const visionPromise = (async () => {
        if (!body.firstPageImage) {
          visionScore = 50
          degradedReasons.push("No renderable page image; vision analysis skipped.")
          visionDegraded = true
          return
        }

        const visionTimer = setTimeout(() => visionAbort.abort(), 18000)

        try {
          const response = await groq.chat.completions.create({
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            max_tokens: 1024,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "user",
                content: `You are a document forensics expert. Examine this document page for signs of tampering or forgery.

Look for: inconsistent font sizes or weights, pixel-level blending artifacts at text boundaries, copy-paste regions (visible as rectangular brightness differences), misaligned borders, signature/seal anomalies, unusual blank patches, unexpected compression artifacts.

DOCUMENT IMAGE: [image data provided]

Return ONLY valid JSON:
{
  "visionScore": <0-100>,
  "findings": [
    { "type": "<type>", "severity": "<low|medium|high>", "description": "...", "source": "vision" }
  ]
}

Valid types: suspicious-metadata, inconsistent-fonts, image-tampering, ocr-mismatch, compression-artifacts, missing-elements, layout-anomaly, text-inconsistency, authentic-signal

If no anomalies: return { "visionScore": 10, "findings": [{ "type": "authentic-signal", "severity": "low", "description": "No visual anomalies detected.", "source": "vision" }] }`,
              },
            ],
          })

          const content = response.choices[0].message.content
          if (content) {
            const parsed = parseAndRepairJson(content)
            const validated = validateDocumentLLMOutput(parsed)

            if (validated.valid) {
              visionScore = validated.fraudScore
              visionFindings = validated.findings
            } else {
              degradedReasons.push("Vision analysis returned invalid output.")
              visionDegraded = true
            }
          }
        } catch (error) {
          if (visionAbort.signal.aborted) {
            degradedReasons.push("Vision analysis timed out.")
          } else {
            degradedReasons.push(`Vision analysis failed: ${error instanceof Error ? error.message : "unknown error"}`)
          }
          visionDegraded = true
        } finally {
          clearTimeout(visionTimer)
        }
      })()

      // Call 2: Content analysis (skip if no text)
      const contentPromise = (async () => {
        if (!truncatedText) {
          contentScore = 0
          return
        }

        const contentTimer = setTimeout(() => contentAbort.abort(), 20000)

        try {
          const response = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            max_tokens: 1024,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "user",
                content: `You are a document authenticity analyst. Analyze the extracted text and metadata for fraud indicators.

Text content:
${truncatedText}

Metadata:
- Creation date: ${body.pdfCreationDate || "unknown"}
- Modification date: ${body.pdfModificationDate || "unknown"}
- Producer: ${body.pdfProducer || "unknown"}
- Creator: ${body.pdfCreator || "unknown"}

Check for: impossible dates, inconsistent entity names, unusual language patterns, missing legal elements, numerical inconsistencies, unexpected language switches.

Provide a fraudScore (0–100), confidenceScore (0–100), explanation (2–4 sentences), and findings array.

Return ONLY valid JSON:
{
  "fraudScore": <0-100>,
  "confidenceScore": <0-100>,
  "explanation": "...",
  "findings": [
    { "type": "<type>", "severity": "<low|medium|high>", "description": "...", "source": "text-analysis" }
  ]
}

Valid types: suspicious-metadata, inconsistent-fonts, image-tampering, ocr-mismatch, compression-artifacts, missing-elements, layout-anomaly, text-inconsistency, authentic-signal`,
              },
            ],
          })

          const content = response.choices[0].message.content
          if (content) {
            const parsed = parseAndRepairJson(content)
            const validated = validateDocumentLLMOutput(parsed)

            if (validated.valid) {
              contentScore = validated.fraudScore
              contentExplanation = validated.explanation
              contentConfidence = validated.confidenceScore
              contentFindingsArray = validated.findings
            } else {
              degradedReasons.push("Content analysis returned invalid output.")
              contentDegraded = true
            }
          }
        } catch (error) {
          if (contentAbort.signal.aborted) {
            degradedReasons.push("Content analysis timed out.")
          } else {
            degradedReasons.push(
              `Content analysis failed: ${error instanceof Error ? error.message : "unknown error"}`
            )
          }
          contentDegraded = true
        } finally {
          clearTimeout(contentTimer)
        }
      })()

      // Wait for both to complete
      await Promise.allSettled([visionPromise, contentPromise])

      if (globalAbort.signal.aborted && degradedReasons.length === 0) {
        degradedReasons.push("Analysis exceeded time limit.")
      }
    } finally {
      clearTimeout(globalTimer)
    }

    // Merge and deduplicate findings
    let allFindings = [...visionFindings, ...contentFindingsArray]
    allFindings = deduplicateFindings(allFindings)

    // Guard: inject fallback if no findings
    if (allFindings.length === 0) {
      allFindings.push({
        type: "authentic-signal",
        severity: "low",
        description: "No strong indicators of manipulation were detected.",
        source: "system",
      })
    }

    // Determine weights by file type
    let weights: { metadata: number; vision: number; content: number }
    if (body.fileType === "image") {
      weights = { metadata: 0, vision: 1, content: 0 }
    } else if (truncatedText) {
      // PDF with text
      weights = { metadata: 0.15, vision: 0.45, content: 0.4 }
    } else {
      // PDF image-only
      weights = { metadata: 0.2, vision: 0.8, content: 0 }
    }

    // Compute final fraud score
    let finalFraudScore = Math.round(
      metadataScore * weights.metadata +
        visionScore * weights.vision +
        contentScore * weights.content
    )

    // Detect low-signal state
    const lowSignal =
      Math.abs(visionScore - 50) < 10 && Math.abs(contentScore - 50) < 10
    if (lowSignal) {
      degradedReasons.push("Insufficient strong signals detected; result is uncertain.")
    }

    const isDegraded = visionDegraded || contentDegraded || lowSignal

    // Blend confidence score
    let rawConfidence = contentConfidence || 50
    let finalConfidence = blendConfidenceScore(
      rawConfidence,
      visionScore,
      contentScore,
      visionDegraded,
      contentDegraded,
      isDegraded
    )

    // Fallback if completely failed
    if (degradedReasons.length > 0 && finalFraudScore === 0 && finalConfidence === 0) {
      finalFraudScore = 50
      finalConfidence = 20
      if (!degradedReasons.includes("Analysis failed; result is a low-confidence estimate.")) {
        degradedReasons.unshift("Analysis failed; result is a low-confidence estimate.")
      }
    }

    // Use vision explanation if content not available
    const explanation = contentExplanation || "Document analysis could not be completed."

    incrementMetric("document.analysis.calls")

    const result: DocumentAnalysisResult = {
      visionScore,
      contentScore,
      metadataScore,
      finalFraudScore,
      confidenceScore: finalConfidence,
      explanation,
      findings: allFindings,
      modelId: "groq-llama-vision+llama3.3",
      analysisVersion: "doc-1.0.0",
      degraded: isDegraded,
      degradedReasons,
      analyzedAt: new Date().toISOString(),
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("Document analysis error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return new Response(
      JSON.stringify({
        visionScore: 50,
        contentScore: 50,
        metadataScore: 0,
        finalFraudScore: 50,
        confidenceScore: 20,
        explanation: "Analysis failed due to an error.",
        findings: [],
        modelId: "groq-llama-vision+llama3.3",
        analysisVersion: "doc-1.0.0",
        degraded: true,
        degradedReasons: [`Analysis failed: ${errorMessage}`],
        analyzedAt: new Date().toISOString(),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
