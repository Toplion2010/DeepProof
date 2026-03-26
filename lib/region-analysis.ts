/**
 * Core types for region-based suspicious area detection.
 */

import type { AnomalyType } from "./frame-explanation"

export interface BoundingBox {
  x: number      // normalized 0-1
  y: number
  width: number
  height: number
}

export interface ForensicRegion {
  box: BoundingBox
  elaIntensity: number
  noiseIntensity: number
  edgeIntensity: number
  combinedIntensity: number
  pixelCount: number
  sourceSignals: string[]
}

export interface RegionAIAnalysis {
  regionIndex: number
  isSuspicious: boolean
  aiConfidence: number
  anomalyType: AnomalyType
  explanation: string
}

export interface SuspiciousRegion {
  id: number
  box: BoundingBox
  finalConfidence: number
  forensicIntensity: number
  aiConfidence: number
  regionConsistency: number
  frameCount: number
  spatialVariance: number
  anomalyType: AnomalyType
  explanation: string
  cropBase64?: string
  colorClass: "red" | "orange" | "gray"
  sourceSignals: string[]
}

export interface RegionAnalysisResult {
  regions: SuspiciousRegion[]
  allProposals: number
  framesAnalyzed: number
  aiCallsMade: number
  processingMs: number
  degraded: boolean
}
