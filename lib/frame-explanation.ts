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
