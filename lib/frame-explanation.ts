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
