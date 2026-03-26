export type AnalysisMode = "fast" | "deep"

export type AnomalyType =
  | "blending-artifact"
  | "unnatural-edge"
  | "lighting-inconsistency"
  | "compression-artifact"
  | "blur-ghosting"
  | "scale-inconsistency"
  | "physically-implausible"
  | "texture-anomaly"
  | "color-mismatch"
  | "other"

export interface FrameAnomaly {
  type: AnomalyType
  severity: number
  confidence: number
  description: string
  region?: string
}

export interface FrameExplanation {
  frameIndex: number
  timestamp: number
  summary: string
  description: string
  anomalies: FrameAnomaly[]
}

export interface FrameExplanationResult {
  frames: FrameExplanation[]
  modelId: string
  mode: AnalysisMode
  degraded: boolean
  error?: string
  processingMs: number
}

const BENIGN_TYPES: ReadonlySet<AnomalyType> = new Set(["compression-artifact"])

/**
 * Computes a score modifier (-20 to +10) based on frame explanation findings.
 * Reduces the visual score when the vision LLM finds only benign anomalies
 * (e.g. compression artifacts), and increases it when genuine deepfake
 * indicators are present.
 */
export function computeFrameExplanationModifier(result: FrameExplanationResult): number {
  if (result.degraded || result.frames.length === 0) return 0

  const suspicious = result.frames.flatMap((f) =>
    f.anomalies.filter((a) => !BENIGN_TYPES.has(a.type))
  )

  if (suspicious.length === 0) return -20

  const totalWeight = suspicious.reduce((sum, a) => sum + a.confidence, 0)
  const weightedAvg = totalWeight > 0
    ? suspicious.reduce((sum, a) => sum + a.severity * (a.confidence / 100), 0) / suspicious.length
    : 0

  if (weightedAvg < 30) return -10
  if (weightedAvg <= 60) return 0
  return 10
}

// ---------------------------------------------------------------------------
// Forensic Summary — structured aggregation of frame-level findings
// ---------------------------------------------------------------------------

export type ForensicVerdict = "no-suspicious-findings" | "suspicious-findings" | "likely-manipulated"
export type RiskLevel = "low" | "medium" | "high"
export type AnomalyPattern = "none" | "isolated" | "consistent"

export interface SuspiciousFrame {
  frameIndex: number
  timestamp: number
  topAnomaly: string
  anomalyType: AnomalyType
  severity: number
  confidence: number
}

export interface ForensicSummary {
  verdict: ForensicVerdict
  verdictLabel: string
  riskLevel: RiskLevel
  overallConfidence: number
  confidenceExplanation: string
  anomalyPattern: AnomalyPattern
  dominantAnomalyType: AnomalyType | null
  dominantTypeRatio: number
  suspiciousFrames: SuspiciousFrame[]
  topFrames: SuspiciousFrame[]
  reasons: string[]
  narrativeSummary: string
  temporalNote: string | null
  framesAnalyzed: number
  framesWithAnomalies: number
}

interface ForensicSummaryInput {
  frameExplanations: FrameExplanationResult | null
  forensicResult: {
    elaScore: number
    elaFindings: string[]
    noiseScore: number
    noiseFindings: string[]
    degraded: boolean
  } | null
  temporalResult: {
    consistencyScore: number
    anomalyFrameIndices: number[]
    findings: string[]
    degraded: boolean
  } | null
  combinedScore: number
  perFrameScores?: number[]
  framesAnalyzed?: number
  regionAnalysis?: {
    regions: Array<{
      finalConfidence: number
      anomalyType: AnomalyType
      explanation: string
      frameCount: number
      sourceSignals: string[]
    }>
    degraded: boolean
  } | null
}

const VERDICT_LABELS: Record<ForensicVerdict, string> = {
  "no-suspicious-findings": "No suspicious findings detected",
  "suspicious-findings": "Suspicious findings detected",
  "likely-manipulated": "Likely manipulated",
}

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value))
}

function formatAnomalyType(type: AnomalyType): string {
  return type.replace(/-/g, " ")
}

export function computeForensicSummary(input: ForensicSummaryInput): ForensicSummary {
  const {
    frameExplanations,
    forensicResult,
    temporalResult,
    combinedScore,
    framesAnalyzed: framesAnalyzedInput,
    regionAnalysis,
  } = input

  const totalFrames = framesAnalyzedInput
    ?? frameExplanations?.frames.length
    ?? 0

  // 1. Identify suspicious frames
  const suspiciousFrames: SuspiciousFrame[] = []

  if (frameExplanations && !frameExplanations.degraded) {
    for (const frame of frameExplanations.frames) {
      const qualifying = frame.anomalies.filter(
        (a) => !BENIGN_TYPES.has(a.type) && a.severity >= 40 && a.confidence >= 50
      )
      if (qualifying.length === 0) continue

      const top = qualifying.reduce((best, a) =>
        a.severity > best.severity ? a : best
      )
      suspiciousFrames.push({
        frameIndex: frame.frameIndex,
        timestamp: frame.timestamp,
        topAnomaly: top.description,
        anomalyType: top.type,
        severity: top.severity,
        confidence: top.confidence,
      })
    }
  }

  suspiciousFrames.sort((a, b) => b.severity - a.severity)
  const S = suspiciousFrames.length
  const topFrames = suspiciousFrames.slice(0, Math.min(S, 3))

  // 2. Pattern detection
  const typeFrameCounts = new Map<AnomalyType, Set<number>>()
  if (frameExplanations && !frameExplanations.degraded) {
    for (const frame of frameExplanations.frames) {
      const qualifying = frame.anomalies.filter(
        (a) => !BENIGN_TYPES.has(a.type) && a.severity >= 40 && a.confidence >= 50
      )
      for (const a of qualifying) {
        if (!typeFrameCounts.has(a.type)) typeFrameCounts.set(a.type, new Set())
        typeFrameCounts.get(a.type)!.add(frame.frameIndex)
      }
    }
  }

  let maxFrameCount = 0
  let dominantAnomalyType: AnomalyType | null = null
  for (const [type, frameSet] of typeFrameCounts) {
    if (frameSet.size > maxFrameCount) {
      maxFrameCount = frameSet.size
      dominantAnomalyType = type
    }
  }
  const dominantTypeRatio = S > 0 ? maxFrameCount / S : 0
  const hasRepeatedAnomalies = [...typeFrameCounts.values()].some((s) => s.size >= 2)

  // Temporal clustering — proportion-based
  const frameIndices = suspiciousFrames.map((f) => f.frameIndex).sort((a, b) => a - b)
  const gaps = frameIndices.slice(1).map((v, i) => v - frameIndices[i])
  const closeGaps = gaps.filter((g) => g <= 2).length
  const clustered = gaps.length > 0 && closeGaps / gaps.length >= 0.6

  let anomalyPattern: AnomalyPattern = "none"
  if (S > 0) {
    anomalyPattern = hasRepeatedAnomalies || clustered ? "consistent" : "isolated"
  }

  // 3. Verdict
  const elaScore = forensicResult && !forensicResult.degraded ? forensicResult.elaScore : 0
  const noiseScore = forensicResult && !forensicResult.degraded ? forensicResult.noiseScore : 0
  const temporalScore = temporalResult && !temporalResult.degraded ? temporalResult.consistencyScore : 0
  const forensicDegraded = !forensicResult || forensicResult.degraded
  const temporalDegraded = !temporalResult || temporalResult.degraded

  const avgSev = S > 0
    ? suspiciousFrames.reduce((sum, f) => sum + f.severity, 0) / S
    : 0

  let verdict: ForensicVerdict

  const isClean =
    S === 0 &&
    combinedScore <= 30 &&
    (elaScore <= 30 || forensicDegraded) &&
    (temporalScore <= 30 || temporalDegraded)

  const isLikelyManipulated =
    ((S >= 3 && avgSev >= 60) || combinedScore >= 70) ||
    (anomalyPattern === "consistent" && S >= 2)

  if (isClean) {
    verdict = "no-suspicious-findings"
  } else if (isLikelyManipulated) {
    // Safeguard: don't claim "likely manipulated" with fewer than 2 suspicious frames
    verdict = S < 2 ? "suspicious-findings" : "likely-manipulated"
  } else if (S > 0 || combinedScore > 30) {
    verdict = "suspicious-findings"
  } else {
    verdict = "no-suspicious-findings"
  }

  const riskLevel: RiskLevel =
    verdict === "likely-manipulated" ? "high"
      : verdict === "suspicious-findings" ? "medium"
        : "low"

  // 4. Overall confidence — severity-weighted
  const totalSevWeight = suspiciousFrames.reduce((sum, f) => sum + f.severity, 0)
  const weightedFrameConf = totalSevWeight > 0
    ? suspiciousFrames.reduce((sum, f) => sum + f.confidence * (f.severity / totalSevWeight), 0)
    : 0

  const patternBonus = anomalyPattern === "consistent" && dominantTypeRatio >= 0.5 ? 10 : 0
  const forensicSignal = !forensicDegraded ? (elaScore + noiseScore) / 2 : 0

  const overallConfidence = clamp(0, 100, Math.round(
    weightedFrameConf * 0.4 +
    combinedScore * 0.3 +
    patternBonus * 0.15 +
    forensicSignal * 0.15
  ))

  const confParts: string[] = []
  if (weightedFrameConf > 0) confParts.push("frame anomaly severity")
  if (patternBonus > 0) confParts.push("consistent anomaly patterns")
  if (!forensicDegraded) confParts.push("forensic signals (ELA/noise)")
  confParts.push("overall detection score")
  const confidenceExplanation = "Based on " + confParts.join(", ")

  // 5. Temporal note
  let temporalNote: string | null = null
  if (temporalResult && !temporalResult.degraded) {
    if (temporalResult.consistencyScore > 30) {
      temporalNote = "Temporal inconsistencies between frames suggest unstable generation, frame interpolation artifacts, or splicing"
    } else if (temporalResult.anomalyFrameIndices.length > 0) {
      temporalNote = `Frame-to-frame transitions show anomalous jumps at ${temporalResult.anomalyFrameIndices.length} points`
    }
  }

  // 5b. Region-based verdict upgrade
  const regionHighConf = regionAnalysis && !regionAnalysis.degraded
    ? regionAnalysis.regions.filter((r) => r.finalConfidence > 70)
    : []
  if (regionHighConf.length >= 2 && verdict === "suspicious-findings" && S >= 2) {
    verdict = "likely-manipulated"
  }

  // 6. Reasons
  const reasons: string[] = []
  for (const frame of suspiciousFrames.slice(0, 5)) {
    reasons.push(`Frame ${frame.frameIndex} (${frame.timestamp.toFixed(1)}s): ${frame.topAnomaly}`)
  }
  if (!forensicDegraded && elaScore > 30) {
    reasons.push(`Forensic: ELA detects recompression artifacts (score: ${Math.round(elaScore)})`)
  }
  if (!temporalDegraded && temporalScore > 30) {
    reasons.push(`Temporal: Frame transitions show inconsistencies (score: ${Math.round(temporalScore)})`)
  }
  // Add region reasons
  if (regionAnalysis && !regionAnalysis.degraded && regionAnalysis.regions.length > 0) {
    const regionDescs = regionAnalysis.regions
      .slice(0, 3)
      .map((r) => `${formatAnomalyType(r.anomalyType)} (${r.finalConfidence}% confidence)`)
    reasons.push(`AI detected suspicious regions: ${regionDescs.join(", ")}`)
  }

  // 7. Narrative
  let narrativeSummary: string
  const dominantLabel = dominantAnomalyType ? formatAnomalyType(dominantAnomalyType) : ""
  const topReason = reasons[0] ?? ""

  if (S === 0) {
    narrativeSummary = `Analyzed ${totalFrames} frames. No consistent anomalies detected. Forensic checks (ELA, noise variance) and temporal consistency analysis did not reveal manipulation indicators.`
  } else if (S === 1) {
    const supportingEvidence = temporalNote ?? "No supporting temporal or forensic evidence was found."
    narrativeSummary = `Analyzed ${totalFrames} frames, 1 showing anomalies. A single-frame anomaly was detected (${suspiciousFrames[0].topAnomaly}), which alone may not indicate manipulation. ${supportingEvidence}.`
  } else if (anomalyPattern === "isolated") {
    narrativeSummary = `Analyzed ${totalFrames} frames, ${S} showing anomalies. Findings appear isolated rather than systematic. ${topReason}. While anomalies were detected, they do not form a consistent pattern and may also be caused by compression or environmental factors.${temporalNote ? ` ${temporalNote}.` : ""}`
  } else if (verdict === "likely-manipulated") {
    const frameList = suspiciousFrames.slice(0, 3).map((f) => `Frame ${f.frameIndex}`).join(", ")
    const forensicCtx = !forensicDegraded && elaScore > 30
      ? ` Forensic analysis (ELA score: ${Math.round(elaScore)}) corroborates visual findings.`
      : ""
    const regionCtx = regionHighConf.length > 0
      ? ` AI region analysis identified ${regionHighConf.length} high-confidence suspicious area${regionHighConf.length > 1 ? "s" : ""}.`
      : ""
    narrativeSummary = `Analyzed ${totalFrames} frames, ${S} showing significant and consistent anomalies indicating likely manipulation. ${dominantLabel.charAt(0).toUpperCase() + dominantLabel.slice(1)} anomalies appear across ${frameList}, forming a coherent pattern.${temporalNote ? ` ${temporalNote}.` : ""}${forensicCtx}${regionCtx}`
  } else {
    // Consistent but suspicious (not yet "likely manipulated")
    const majorityText = dominantTypeRatio >= 0.5 ? "a majority of" : "multiple"
    narrativeSummary = `Analyzed ${totalFrames} frames, ${S} showing anomalies. Repeated anomalies of type ${dominantLabel} detected across ${majorityText} flagged frames, suggesting manipulation patterns rather than isolated artifacts. ${reasons.slice(0, 2).join(". ")}.${temporalNote ? ` ${temporalNote}.` : ""} While consistent anomalies increase suspicion, environmental and compression factors cannot be fully ruled out.`
  }

  return {
    verdict,
    verdictLabel: VERDICT_LABELS[verdict],
    riskLevel,
    overallConfidence,
    confidenceExplanation,
    anomalyPattern,
    dominantAnomalyType,
    dominantTypeRatio,
    suspiciousFrames,
    topFrames,
    reasons,
    narrativeSummary,
    temporalNote,
    framesAnalyzed: totalFrames,
    framesWithAnomalies: S,
  }
}
