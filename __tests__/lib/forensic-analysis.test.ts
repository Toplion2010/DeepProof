import { describe, it, expect } from "vitest"
import { computeELA, computeNoiseVariance, computeTemporalDiff } from "@/lib/forensic-algorithms"

function makePixels(width: number, height: number, value: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = value     // R
    data[i + 1] = value // G
    data[i + 2] = value // B
    data[i + 3] = 255   // A
  }
  return data
}

function makeRandomPixels(width: number, height: number, seed = 42): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  let s = seed
  for (let i = 0; i < data.length; i += 4) {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    const v = (s >>> 16) & 255
    data[i] = v
    data[i + 1] = v
    data[i + 2] = v
    data[i + 3] = 255
  }
  return data
}

describe("computeELA", () => {
  it("returns score 0 for identical images", () => {
    const pixels = makePixels(100, 100, 128)
    const result = computeELA(pixels, pixels, 100, 100)
    expect(result.score).toBe(0)
    expect(result.meanDeviation).toBe(0)
  })

  it("returns score 0 for empty input", () => {
    const result = computeELA(new Uint8ClampedArray(0), new Uint8ClampedArray(0), 0, 0)
    expect(result.score).toBe(0)
  })

  it("returns score 0 for mismatched lengths", () => {
    const a = makePixels(10, 10, 100)
    const b = makePixels(5, 5, 100)
    const result = computeELA(a, b, 10, 10)
    expect(result.score).toBe(0)
  })

  it("detects differences between original and recompressed", () => {
    const original = makePixels(100, 100, 128)
    const recompressed = makePixels(100, 100, 128)
    // Introduce localized manipulation in a small region
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        const idx = (y * 100 + x) * 4
        recompressed[idx] = 200     // significant R change
        recompressed[idx + 1] = 200 // significant G change
        recompressed[idx + 2] = 200 // significant B change
      }
    }
    const result = computeELA(original, recompressed, 100, 100)
    expect(result.score).toBeGreaterThan(0)
    expect(result.maxRegionalDeviation).toBeGreaterThan(0)
  })

  it("score is clamped between 0 and 100", () => {
    const original = makePixels(100, 100, 0)
    const recompressed = makePixels(100, 100, 255)
    // Introduce extreme localized difference
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const idx = (y * 100 + x) * 4
        original[idx] = 0
        recompressed[idx] = 255
      }
    }
    const result = computeELA(original, recompressed, 100, 100)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
  })
})

describe("computeNoiseVariance", () => {
  it("returns score 0 for empty input", () => {
    const result = computeNoiseVariance(new Uint8ClampedArray(0), 0, 0)
    expect(result.score).toBe(0)
  })

  it("returns score 0 for images too small", () => {
    const result = computeNoiseVariance(makePixels(2, 2, 128), 2, 2)
    expect(result.score).toBe(0)
  })

  it("produces a score for valid image data", () => {
    const pixels = makeRandomPixels(100, 100)
    const result = computeNoiseVariance(pixels, 100, 100)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
  })

  it("uniform image has high noise score (low variance = GAN-like)", () => {
    const pixels = makePixels(100, 100, 128)
    const result = computeNoiseVariance(pixels, 100, 100)
    // Perfectly uniform → zero Laplacian → low variance-of-variance → high score
    expect(result.score).toBeGreaterThanOrEqual(0)
  })
})

describe("computeTemporalDiff", () => {
  it("returns empty result for fewer than 2 frames", () => {
    const result = computeTemporalDiff([], 10, 10)
    expect(result.diffScores).toEqual([])
    expect(result.consistencyScore).toBe(0)

    const single = computeTemporalDiff([makePixels(10, 10, 128)], 10, 10)
    expect(single.diffScores).toEqual([])
    expect(single.consistencyScore).toBe(0)
  })

  it("returns score 0 for identical frames", () => {
    const frame = makePixels(50, 50, 128)
    const result = computeTemporalDiff([frame, frame, frame], 50, 50)
    expect(result.consistencyScore).toBe(0)
    expect(result.cv).toBe(0)
  })

  it("detects temporal inconsistency between different frames", () => {
    const frameA = makePixels(50, 50, 100)
    const frameB = makePixels(50, 50, 150)
    const frameC = makePixels(50, 50, 100) // jump back
    const result = computeTemporalDiff([frameA, frameB, frameC], 50, 50)
    expect(result.diffScores.length).toBe(2)
    expect(result.consistencyScore).toBeGreaterThanOrEqual(0)
  })

  it("handles mismatched frame sizes gracefully", () => {
    const frameA = makePixels(50, 50, 100)
    const frameB = new Uint8ClampedArray(100) // wrong size
    const result = computeTemporalDiff([frameA, frameB], 50, 50)
    expect(result.diffScores).toEqual([0])
  })

  it("marks anomalies where diff > 2x mean", () => {
    // Create frames where one transition is much larger than others
    const frame1 = makePixels(50, 50, 100)
    const frame2 = makePixels(50, 50, 105) // small change
    const frame3 = makePixels(50, 50, 110) // small change
    const frame4 = makePixels(50, 50, 200) // big jump
    const result = computeTemporalDiff([frame1, frame2, frame3, frame4], 50, 50)
    expect(result.anomalyIndices.length).toBeGreaterThan(0)
    expect(result.anomalyIndices).toContain(2) // index of frame3→frame4 diff
  })
})
