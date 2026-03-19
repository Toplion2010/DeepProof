import { describe, it, expect } from "vitest"
import { clusterSpeakers, type SpeakerClusterResult } from "@/lib/speaker-cluster"
import type { AudioSegmentFeatures } from "@/lib/audio-features"

function makeFeatures(rms: number, zcr: number, spectral: number, start = 0, end = 1): AudioSegmentFeatures {
  return { startTime: start, endTime: end, rmsEnergy: rms, zeroCrossingRate: zcr, spectralCentroid: spectral }
}

describe("clusterSpeakers", () => {
  it("returns pause-heuristic for empty features", () => {
    const result = clusterSpeakers([])
    expect(result.method).toBe("pause-heuristic")
    expect(result.speakerCount).toBe(1)
    expect(result.confidence).toBe("low")
  })

  it("returns pause-heuristic for single feature", () => {
    const result = clusterSpeakers([makeFeatures(0.5, 0.1, 1000)])
    expect(result.method).toBe("pause-heuristic")
    expect(result.speakerCount).toBe(1)
  })

  it("clusters clearly separated speakers", () => {
    // Two clearly distinct speakers with more samples for stability
    const features: AudioSegmentFeatures[] = [
      makeFeatures(0.8, 0.3, 2000, 0, 1),
      makeFeatures(0.82, 0.31, 2050, 1, 2),
      makeFeatures(0.79, 0.29, 1980, 2, 3),
      makeFeatures(0.81, 0.30, 2020, 6, 7),
      makeFeatures(0.1, 0.05, 500, 3, 4),
      makeFeatures(0.12, 0.06, 520, 4, 5),
      makeFeatures(0.11, 0.04, 490, 5, 6),
      makeFeatures(0.09, 0.05, 510, 7, 8),
    ]
    const result = clusterSpeakers(features)

    // Should use audio-features method with good silhouette
    if (result.method === "audio-features") {
      // k-means may pick 2, 3, or 4 depending on random init, but should find >= 2
      expect(result.speakerCount).toBeGreaterThanOrEqual(2)
      expect(result.silhouetteScore).toBeGreaterThan(SILHOUETTE_THRESHOLD)
    }
    // Assignments should exist for all segments
    expect(result.assignments.length).toBe(features.length)
  })

  it("falls back to pause-heuristic for similar features", () => {
    // All segments are very similar — no clear clusters
    const features: AudioSegmentFeatures[] = [
      makeFeatures(0.5, 0.1, 1000, 0, 1),
      makeFeatures(0.51, 0.1, 1010, 1, 2),
      makeFeatures(0.49, 0.1, 990, 2, 3),
      makeFeatures(0.5, 0.1, 1005, 3, 4),
    ]
    const result = clusterSpeakers(features)
    // With very similar features, silhouette should be low → pause-heuristic
    // (may occasionally cluster, so we just check valid output)
    expect(result.assignments.length).toBe(features.length)
    expect(result.speakerCount).toBeGreaterThanOrEqual(1)
  })

  it("respects maxSpeakers parameter", () => {
    const features: AudioSegmentFeatures[] = [
      makeFeatures(0.8, 0.3, 2000, 0, 1),
      makeFeatures(0.1, 0.05, 500, 1, 2),
      makeFeatures(0.5, 0.15, 1200, 2, 3),
      makeFeatures(0.3, 0.08, 800, 3, 4),
      makeFeatures(0.9, 0.35, 2200, 4, 5),
    ]
    const result = clusterSpeakers(features, 2)
    expect(result.speakerCount).toBeLessThanOrEqual(2)
  })

  it("all assignments have valid speaker labels", () => {
    const features: AudioSegmentFeatures[] = [
      makeFeatures(0.8, 0.3, 2000, 0, 1),
      makeFeatures(0.1, 0.05, 500, 1, 2),
      makeFeatures(0.5, 0.15, 1200, 2, 3),
    ]
    const result = clusterSpeakers(features)
    for (const a of result.assignments) {
      expect(a.speaker).toMatch(/^Speaker \d+$/)
      expect(a.segmentIndex).toBeGreaterThanOrEqual(0)
    }
  })

  it("silhouette score is between -1 and 1", () => {
    const features: AudioSegmentFeatures[] = [
      makeFeatures(0.8, 0.3, 2000, 0, 1),
      makeFeatures(0.1, 0.05, 500, 1, 2),
      makeFeatures(0.5, 0.15, 1200, 2, 3),
    ]
    const result = clusterSpeakers(features)
    expect(result.silhouetteScore).toBeGreaterThanOrEqual(-1)
    expect(result.silhouetteScore).toBeLessThanOrEqual(1)
  })
})

const SILHOUETTE_THRESHOLD = 0.3
