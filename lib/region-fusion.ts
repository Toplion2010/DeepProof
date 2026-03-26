/**
 * Region score fusion — combines AI confidence with forensic intensity,
 * region size, and cross-frame consistency into a final confidence score.
 */

import type { AnomalyType } from "./frame-explanation"
import type { BoundingBox, SuspiciousRegion } from "./region-analysis"
import type { RegionAIAnalysis } from "./region-analysis"
import type { MergedRegion } from "./region-proposal"

export function fuseRegionScores(
  mergedRegions: MergedRegion[],
  aiResults: RegionAIAnalysis[],
  totalFramesAnalyzed: number
): SuspiciousRegion[] {
  const aiMap = new Map<number, RegionAIAnalysis>()
  for (const ai of aiResults) {
    aiMap.set(ai.regionIndex, ai)
  }

  const results: SuspiciousRegion[] = []

  for (let i = 0; i < mergedRegions.length; i++) {
    const region = mergedRegions[i]
    const ai = aiMap.get(i)

    const rawAiConf = ai?.aiConfidence ?? 0
    const forensicIntensity = Math.min(100, region.combinedIntensity)

    // AI confidence calibration: compress low-confidence scores
    const calibratedAI = rawAiConf < 50 ? rawAiConf * 0.6 : rawAiConf

    // Size weight: penalize >40% of image
    const areaRatio = region.box.width * region.box.height
    const sizeWeight = Math.min(1, areaRatio * 10) * 100

    // Region consistency scaled to 0-100
    const consistencyScaled = region.regionConsistency * 100

    // Fusion formula
    let finalConfidence = calibratedAI * 0.45 +
      forensicIntensity * 0.25 +
      sizeWeight * 0.15 +
      consistencyScaled * 0.15

    // Disagreement handling
    if (rawAiConf < 30 && forensicIntensity > 60) {
      // AI low + forensic high → uncertain, use average
      finalConfidence = (calibratedAI + forensicIntensity) / 2
    } else if (rawAiConf > 70 && forensicIntensity < 20) {
      // AI high + forensic low → discount 30%
      finalConfidence *= 0.7
    }

    finalConfidence = Math.max(0, Math.min(100, Math.round(finalConfidence)))

    // Color class
    const colorClass: SuspiciousRegion["colorClass"] =
      finalConfidence > 70 ? "red" :
      finalConfidence >= 40 ? "orange" : "gray"

    results.push({
      id: i,
      box: region.box,
      finalConfidence,
      forensicIntensity,
      aiConfidence: rawAiConf,
      regionConsistency: region.regionConsistency,
      frameCount: region.frameCount,
      spatialVariance: region.spatialVariance,
      anomalyType: ai?.anomalyType ?? "other",
      explanation: ai?.explanation ?? "Forensic signals detected anomalies in this region",
      colorClass,
      sourceSignals: region.sourceSignals,
    })
  }

  // Sort by finalConfidence, keep top 3
  results.sort((a, b) => b.finalConfidence - a.finalConfidence)
  return results.slice(0, 3)
}
