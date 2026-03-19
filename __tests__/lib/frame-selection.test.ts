import { describe, it, expect } from "vitest"
import { selectFramesForExplanation, quickSimilarity } from "@/lib/frame-selection"

describe("selectFramesForExplanation", () => {
  const makeFrames = (n: number) => Array.from({ length: n }, (_, i) => `frame-${i}`)
  const makeTimestamps = (n: number) => Array.from({ length: n }, (_, i) => i * 0.5)

  it("returns empty array for empty frames", () => {
    const result = selectFramesForExplanation([], [], "fast")
    expect(result).toEqual([])
  })

  it("returns single frame for single-element input", () => {
    const result = selectFramesForExplanation(["f0"], [0], "fast")
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ base64: "f0", index: 0, timestamp: 0 })
  })

  it("fast mode returns 4 frames from 16", () => {
    const frames = makeFrames(16)
    const timestamps = makeTimestamps(16)
    const result = selectFramesForExplanation(frames, timestamps, "fast")
    expect(result).toHaveLength(4)
  })

  it("fast mode returns all frames if fewer than 4", () => {
    const frames = makeFrames(3)
    const timestamps = makeTimestamps(3)
    const result = selectFramesForExplanation(frames, timestamps, "fast")
    expect(result).toHaveLength(3)
  })

  it("deep mode returns 12 frames from 20", () => {
    const frames = makeFrames(20)
    const timestamps = makeTimestamps(20)
    const result = selectFramesForExplanation(frames, timestamps, "deep")
    expect(result).toHaveLength(12)
  })

  it("deep mode returns all frames if fewer than 12", () => {
    const frames = makeFrames(8)
    const timestamps = makeTimestamps(8)
    const result = selectFramesForExplanation(frames, timestamps, "deep")
    expect(result).toHaveLength(8)
  })

  it("results are sorted by index (temporal order)", () => {
    const frames = makeFrames(16)
    const timestamps = makeTimestamps(16)
    const scores = Array.from({ length: 16 }, (_, i) => (i === 15 ? 95 : 10))
    const result = selectFramesForExplanation(frames, timestamps, "fast", scores)
    for (let i = 1; i < result.length; i++) {
      expect(result[i].index).toBeGreaterThan(result[i - 1].index)
    }
  })

  it("fast mode swaps middle frames for high-scoring ones", () => {
    const frames = makeFrames(16)
    const timestamps = makeTimestamps(16)
    // Frame 5 and 13 have high scores
    const scores = Array.from({ length: 16 }, (_, i) =>
      i === 5 ? 90 : i === 13 ? 85 : 10
    )
    const result = selectFramesForExplanation(frames, timestamps, "fast", scores)
    const indices = result.map((r) => r.index)
    expect(indices).toContain(5)
    expect(indices).toContain(13)
  })

  it("deep mode ensures top-3 scoring frames are included", () => {
    const frames = makeFrames(20)
    const timestamps = makeTimestamps(20)
    // Frames 1, 3, 17 have highest scores
    const scores = Array.from({ length: 20 }, (_, i) =>
      i === 1 ? 95 : i === 3 ? 90 : i === 17 ? 85 : 10
    )
    const result = selectFramesForExplanation(frames, timestamps, "deep", scores)
    const indices = result.map((r) => r.index)
    expect(indices).toContain(1)
    expect(indices).toContain(3)
    expect(indices).toContain(17)
  })

  it("timestamps map correctly to frame indices", () => {
    const frames = makeFrames(8)
    const timestamps = [0, 1.5, 3.0, 4.5, 6.0, 7.5, 9.0, 10.5]
    const result = selectFramesForExplanation(frames, timestamps, "fast")
    for (const frame of result) {
      expect(frame.timestamp).toBe(timestamps[frame.index])
    }
  })

  it("handles mismatched scores length by ignoring scores", () => {
    const frames = makeFrames(8)
    const timestamps = makeTimestamps(8)
    const scores = [10, 20] // wrong length
    const result = selectFramesForExplanation(frames, timestamps, "fast", scores)
    expect(result).toHaveLength(4)
  })
})

describe("quickSimilarity", () => {
  it("returns 100 for identical strings", () => {
    const s = "a".repeat(3000)
    expect(quickSimilarity(s, s)).toBe(100)
  })

  it("returns 0 for completely different strings", () => {
    const a = "a".repeat(2000)
    const b = "b".repeat(2000)
    expect(quickSimilarity(a, b)).toBe(0)
  })

  it("returns 0 for empty strings", () => {
    expect(quickSimilarity("", "")).toBe(0)
  })

  it("returns partial similarity for partially matching strings", () => {
    const a = "a".repeat(1000) + "b".repeat(1000)
    const b = "a".repeat(1000) + "c".repeat(1000)
    const sim = quickSimilarity(a, b)
    expect(sim).toBe(50)
  })

  it("only compares first 2000 chars by default", () => {
    const shared = "x".repeat(2000)
    const a = shared + "aaa"
    const b = shared + "bbb"
    expect(quickSimilarity(a, b)).toBe(100)
  })
})
