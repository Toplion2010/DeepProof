/**
 * Pure forensic analysis algorithms — no DOM dependencies.
 * These operate on raw pixel data (Uint8ClampedArray in RGBA format)
 * and can be imported by both the Web Worker and tests.
 */

export interface ELAResult {
  score: number // 0-100, higher = more suspicious
  maxRegionalDeviation: number
  meanDeviation: number
}

export interface NoiseResult {
  score: number // 0-100, higher = more suspicious (uniform noise = GAN)
  varianceOfVariance: number
}

export interface TemporalDiffResult {
  diffScores: number[]
  cv: number // coefficient of variation
  anomalyIndices: number[]
  consistencyScore: number // 0-100
}

/**
 * Error Level Analysis (ELA) on raw pixel data.
 *
 * Compares original pixels against re-compressed pixels.
 * High localized deviation relative to mean = potential manipulation.
 *
 * @param original - Original RGBA pixel data
 * @param recompressed - Re-compressed RGBA pixel data (e.g. JPEG quality 0.75)
 * @param width - Image width
 * @param height - Image height
 * @param regionSize - Size of grid regions for regional analysis (default 16)
 */
export function computeELA(
  original: Uint8ClampedArray,
  recompressed: Uint8ClampedArray,
  width: number,
  height: number,
  regionSize = 16
): ELAResult {
  if (original.length !== recompressed.length || original.length === 0) {
    return { score: 0, maxRegionalDeviation: 0, meanDeviation: 0 }
  }

  const pixelCount = width * height
  let totalDiff = 0

  // Per-pixel RGB diff (ignore alpha)
  const diffs = new Float32Array(pixelCount)
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4
    const dr = Math.abs(original[idx] - recompressed[idx])
    const dg = Math.abs(original[idx + 1] - recompressed[idx + 1])
    const db = Math.abs(original[idx + 2] - recompressed[idx + 2])
    const avg = (dr + dg + db) / 3
    diffs[i] = avg
    totalDiff += avg
  }

  const meanDeviation = totalDiff / pixelCount
  if (meanDeviation < 0.0001) {
    return { score: 0, maxRegionalDeviation: 0, meanDeviation: 0 }
  }

  // Compute regional averages
  const regionsX = Math.ceil(width / regionSize)
  const regionsY = Math.ceil(height / regionSize)
  let maxRegionalDeviation = 0

  for (let ry = 0; ry < regionsY; ry++) {
    for (let rx = 0; rx < regionsX; rx++) {
      let regionSum = 0
      let regionCount = 0
      const startX = rx * regionSize
      const startY = ry * regionSize
      const endX = Math.min(startX + regionSize, width)
      const endY = Math.min(startY + regionSize, height)

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          regionSum += diffs[y * width + x]
          regionCount++
        }
      }

      if (regionCount > 0) {
        const regionAvg = regionSum / regionCount
        const deviation = Math.abs(regionAvg - meanDeviation) / meanDeviation
        if (deviation > maxRegionalDeviation) {
          maxRegionalDeviation = deviation
        }
      }
    }
  }

  // Normalize to 0-100: deviation of 2x mean → score ~65, 4x → ~100
  const score = Math.max(0, Math.min(100, maxRegionalDeviation * 25))

  return { score, maxRegionalDeviation, meanDeviation }
}

/**
 * Noise variance analysis on raw pixel data.
 *
 * Applies 3x3 Laplacian convolution, then computes variance of regional noise.
 * GAN-generated content has uniform noise → low variance-of-variance → suspicious.
 *
 * @param pixels - RGBA pixel data
 * @param width - Image width
 * @param height - Image height
 * @param regionSize - Size of grid regions (default 32)
 */
export function computeNoiseVariance(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  regionSize = 32
): NoiseResult {
  if (pixels.length === 0 || width < 3 || height < 3) {
    return { score: 0, varianceOfVariance: 0 }
  }

  // Convert to grayscale
  const gray = new Float32Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4
    gray[i] = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2]
  }

  // 3x3 Laplacian convolution: [0,-1,0],[-1,4,-1],[0,-1,0]
  const laplacian = new Float32Array((width - 2) * (height - 2))
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const center = gray[y * width + x]
      const top = gray[(y - 1) * width + x]
      const bottom = gray[(y + 1) * width + x]
      const left = gray[y * width + (x - 1)]
      const right = gray[y * width + (x + 1)]
      laplacian[(y - 1) * (width - 2) + (x - 1)] = Math.abs(4 * center - top - bottom - left - right)
    }
  }

  // Compute variance per region
  const lw = width - 2
  const lh = height - 2
  const regionsX = Math.ceil(lw / regionSize)
  const regionsY = Math.ceil(lh / regionSize)
  const regionVariances: number[] = []

  for (let ry = 0; ry < regionsY; ry++) {
    for (let rx = 0; rx < regionsX; rx++) {
      const startX = rx * regionSize
      const startY = ry * regionSize
      const endX = Math.min(startX + regionSize, lw)
      const endY = Math.min(startY + regionSize, lh)

      let sum = 0
      let sumSq = 0
      let count = 0

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const val = laplacian[y * lw + x]
          sum += val
          sumSq += val * val
          count++
        }
      }

      if (count > 1) {
        const mean = sum / count
        const variance = sumSq / count - mean * mean
        regionVariances.push(Math.max(0, variance))
      }
    }
  }

  if (regionVariances.length < 2) {
    return { score: 0, varianceOfVariance: 0 }
  }

  // Variance of the regional variances
  const meanVar = regionVariances.reduce((a, b) => a + b, 0) / regionVariances.length
  const varOfVar = regionVariances.reduce((a, v) => a + (v - meanVar) ** 2, 0) / regionVariances.length

  // Low variance-of-variance → uniform noise → suspicious (GAN)
  // Normalize: very uniform (varOfVar < 10) → score ~80-100
  // Natural variation (varOfVar > 500) → score ~0-20
  const normalizedVoV = Math.max(0, Math.min(1, 1 - varOfVar / 500))
  const score = Math.max(0, Math.min(100, normalizedVoV * 100))

  return { score, varianceOfVariance: varOfVar }
}

/**
 * Temporal consistency analysis between consecutive frames.
 *
 * Computes pixel-level diffs between adjacent frames and analyzes
 * the coefficient of variation to detect temporal inconsistencies.
 *
 * @param frames - Array of RGBA pixel data for consecutive frames (same dimensions)
 * @param width - Frame width
 * @param height - Frame height
 */
export function computeTemporalDiff(
  frames: Uint8ClampedArray[],
  width: number,
  height: number
): TemporalDiffResult {
  const empty: TemporalDiffResult = { diffScores: [], cv: 0, anomalyIndices: [], consistencyScore: 0 }

  if (frames.length < 2) return empty

  const pixelCount = width * height
  const diffScores: number[] = []

  // Compute diff between each pair of adjacent frames
  for (let f = 0; f < frames.length - 1; f++) {
    const frameA = frames[f]
    const frameB = frames[f + 1]
    if (frameA.length !== frameB.length || frameA.length !== pixelCount * 4) {
      diffScores.push(0)
      continue
    }

    let totalDiff = 0
    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 4
      const dr = Math.abs(frameA[idx] - frameB[idx])
      const dg = Math.abs(frameA[idx + 1] - frameB[idx + 1])
      const db = Math.abs(frameA[idx + 2] - frameB[idx + 2])
      totalDiff += (dr + dg + db) / 3
    }

    diffScores.push(totalDiff / pixelCount)
  }

  if (diffScores.length === 0) return empty

  // Mean diff
  const meanDiff = diffScores.reduce((a, b) => a + b, 0) / diffScores.length

  // Guard: near-zero mean → stable sequence
  if (meanDiff < 0.0001) {
    return { diffScores, cv: 0, anomalyIndices: [], consistencyScore: 0 }
  }

  // Standard deviation
  const variance = diffScores.reduce((a, d) => a + (d - meanDiff) ** 2, 0) / diffScores.length
  const stddev = Math.sqrt(variance)
  const cv = stddev / meanDiff

  // Anomaly detection: diff > 2x mean
  const anomalyIndices = diffScores
    .map((d, i) => (d > meanDiff * 2 ? i : -1))
    .filter((i) => i >= 0)

  // CV > 0.5 = temporally inconsistent → high score
  const consistencyScore = Math.max(0, Math.min(100, cv * 100))

  return { diffScores, cv, anomalyIndices, consistencyScore }
}
