/**
 * K-means speaker clustering based on audio features.
 * Tries k in {2,3,4}, picks best silhouette score.
 * Falls back to pause-heuristic if silhouette < 0.3.
 */

import type { AudioSegmentFeatures } from "./audio-features"

export interface SpeakerClusterResult {
  assignments: Array<{ segmentIndex: number; speaker: string }>
  speakerCount: number
  confidence: "low" | "medium" | "high"
  method: "audio-features" | "pause-heuristic"
  silhouetteScore: number
}

const MAX_ITERATIONS = 50
const MAX_RESTARTS = 3
const SILHOUETTE_THRESHOLD = 0.3
const CLUSTER_TIMEOUT_MS = 8_000

type FeatureVector = [number, number, number] // [rms, zcr, spectralCentroid]

function extractVectors(features: AudioSegmentFeatures[]): FeatureVector[] {
  return features.map((f) => [f.rmsEnergy, f.zeroCrossingRate, f.spectralCentroid])
}

function normalize(vectors: FeatureVector[]): { normalized: FeatureVector[]; means: number[]; stds: number[] } {
  const dims = 3
  const means = Array(dims).fill(0)
  const stds = Array(dims).fill(0)

  for (const v of vectors) {
    for (let d = 0; d < dims; d++) means[d] += v[d]
  }
  for (let d = 0; d < dims; d++) means[d] /= vectors.length

  for (const v of vectors) {
    for (let d = 0; d < dims; d++) stds[d] += (v[d] - means[d]) ** 2
  }
  for (let d = 0; d < dims; d++) stds[d] = Math.sqrt(stds[d] / vectors.length) || 1

  const normalized = vectors.map((v) =>
    v.map((val, d) => (val - means[d]) / stds[d]) as FeatureVector
  )

  return { normalized, means, stds }
}

function distance(a: FeatureVector, b: FeatureVector): number {
  return Math.sqrt(a.reduce((sum, val, i) => sum + (val - b[i]) ** 2, 0))
}

function kmeans(
  vectors: FeatureVector[],
  k: number,
  maxIterations: number
): { assignments: number[]; centroids: FeatureVector[] } {
  const n = vectors.length

  // Random initialization
  const indices = Array.from({ length: n }, (_, i) => i)
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]]
  }
  const centroids: FeatureVector[] = indices.slice(0, k).map((i) => [...vectors[i]] as FeatureVector)

  let assignments = new Array<number>(n).fill(0)

  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign
    const newAssignments = vectors.map((v) => {
      let minDist = Infinity
      let minIdx = 0
      for (let c = 0; c < k; c++) {
        const d = distance(v, centroids[c])
        if (d < minDist) { minDist = d; minIdx = c }
      }
      return minIdx
    })

    // Check convergence
    if (newAssignments.every((a, i) => a === assignments[i])) {
      assignments = newAssignments
      break
    }
    assignments = newAssignments

    // Update centroids
    for (let c = 0; c < k; c++) {
      const members = vectors.filter((_, i) => assignments[i] === c)
      if (members.length === 0) continue
      for (let d = 0; d < 3; d++) {
        centroids[c][d] = members.reduce((sum, v) => sum + v[d], 0) / members.length
      }
    }
  }

  return { assignments, centroids }
}

function silhouetteScore(vectors: FeatureVector[], assignments: number[], k: number): number {
  if (vectors.length < 2 || k < 2) return 0

  let totalSilhouette = 0

  for (let i = 0; i < vectors.length; i++) {
    const cluster = assignments[i]

    // a(i): mean distance to same cluster
    const sameCluster = vectors.filter((_, j) => j !== i && assignments[j] === cluster)
    const a = sameCluster.length > 0
      ? sameCluster.reduce((sum, v) => sum + distance(vectors[i], v), 0) / sameCluster.length
      : 0

    // b(i): min mean distance to other clusters
    let b = Infinity
    for (let c = 0; c < k; c++) {
      if (c === cluster) continue
      const otherCluster = vectors.filter((_, j) => assignments[j] === c)
      if (otherCluster.length === 0) continue
      const meanDist = otherCluster.reduce((sum, v) => sum + distance(vectors[i], v), 0) / otherCluster.length
      if (meanDist < b) b = meanDist
    }

    if (b === Infinity) b = 0
    const s = Math.max(a, b) > 0 ? (b - a) / Math.max(a, b) : 0
    totalSilhouette += s
  }

  return totalSilhouette / vectors.length
}

function createPauseHeuristicResult(segmentCount: number): SpeakerClusterResult {
  return {
    assignments: Array.from({ length: segmentCount }, (_, i) => ({
      segmentIndex: i,
      speaker: "Speaker 1",
    })),
    speakerCount: 1,
    confidence: "low",
    method: "pause-heuristic",
    silhouetteScore: 0,
  }
}

export function clusterSpeakers(
  features: AudioSegmentFeatures[],
  maxSpeakers = 4
): SpeakerClusterResult {
  // Empty features guard
  if (features.length === 0) {
    return createPauseHeuristicResult(0)
  }

  if (features.length < 2) {
    return createPauseHeuristicResult(features.length)
  }

  const vectors = extractVectors(features)
  const { normalized } = normalize(vectors)

  let bestResult: { assignments: number[]; silhouette: number; k: number } = {
    assignments: [],
    silhouette: -1,
    k: 1,
  }

  // Try k in {2, 3, 4}
  const maxK = Math.min(maxSpeakers, normalized.length, 4)
  for (let k = 2; k <= maxK; k++) {
    let bestForK = { assignments: new Array<number>(normalized.length).fill(0), silhouette: -1 }

    for (let restart = 0; restart < MAX_RESTARTS; restart++) {
      const { assignments } = kmeans(normalized, k, MAX_ITERATIONS)
      const score = silhouetteScore(normalized, assignments, k)
      if (score > bestForK.silhouette) {
        bestForK = { assignments, silhouette: score }
      }
    }

    if (bestForK.silhouette > bestResult.silhouette) {
      bestResult = { assignments: bestForK.assignments, silhouette: bestForK.silhouette, k }
    }
  }

  // Silhouette threshold check
  if (bestResult.silhouette < SILHOUETTE_THRESHOLD) {
    return createPauseHeuristicResult(features.length)
  }

  // Build assignments with speaker labels
  const assignments = bestResult.assignments.map((cluster, i) => ({
    segmentIndex: i,
    speaker: `Speaker ${cluster + 1}`,
  }))

  const confidence = bestResult.silhouette > 0.6 ? "high" : "medium"

  return {
    assignments,
    speakerCount: bestResult.k,
    confidence,
    method: "audio-features",
    silhouetteScore: bestResult.silhouette,
  }
}

/**
 * Run clustering with a timeout. Falls back to pause-heuristic on timeout.
 */
export async function clusterSpeakersWithTimeout(
  features: AudioSegmentFeatures[],
  maxSpeakers = 4
): Promise<SpeakerClusterResult> {
  return Promise.race([
    new Promise<SpeakerClusterResult>((resolve) => {
      resolve(clusterSpeakers(features, maxSpeakers))
    }),
    new Promise<SpeakerClusterResult>((resolve) => {
      setTimeout(() => resolve(createPauseHeuristicResult(features.length)), CLUSTER_TIMEOUT_MS)
    }),
  ])
}
