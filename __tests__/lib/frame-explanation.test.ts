import { describe, it, expect } from "vitest"
import { computeFrameExplanationModifier, type FrameExplanationResult } from "@/lib/frame-explanation"

function makeResult(
  frames: FrameExplanationResult["frames"],
  overrides?: Partial<FrameExplanationResult>
): FrameExplanationResult {
  return {
    frames,
    modelId: "test",
    mode: "fast",
    degraded: false,
    processingMs: 100,
    ...overrides,
  }
}

describe("computeFrameExplanationModifier", () => {
  it("returns 0 for degraded result", () => {
    const result = makeResult(
      [{ frameIndex: 0, timestamp: 0, summary: "", description: "", anomalies: [] }],
      { degraded: true }
    )
    expect(computeFrameExplanationModifier(result)).toBe(0)
  })

  it("returns 0 for empty frames", () => {
    const result = makeResult([])
    expect(computeFrameExplanationModifier(result)).toBe(0)
  })

  it("returns -20 when all anomalies are compression artifacts", () => {
    const result = makeResult([
      {
        frameIndex: 0, timestamp: 0, summary: "", description: "",
        anomalies: [
          { type: "compression-artifact", severity: 30, confidence: 80, description: "minor" },
        ],
      },
      {
        frameIndex: 1, timestamp: 1, summary: "", description: "",
        anomalies: [
          { type: "compression-artifact", severity: 20, confidence: 70, description: "edge" },
        ],
      },
    ])
    expect(computeFrameExplanationModifier(result)).toBe(-20)
  })

  it("returns -20 when no anomalies at all", () => {
    const result = makeResult([
      { frameIndex: 0, timestamp: 0, summary: "", description: "", anomalies: [] },
    ])
    expect(computeFrameExplanationModifier(result)).toBe(-20)
  })

  it("returns -10 for low-severity suspicious anomalies", () => {
    const result = makeResult([
      {
        frameIndex: 0, timestamp: 0, summary: "", description: "",
        anomalies: [
          { type: "blending-artifact", severity: 20, confidence: 50, description: "slight" },
        ],
      },
    ])
    expect(computeFrameExplanationModifier(result)).toBe(-10)
  })

  it("returns 0 for moderate suspicious anomalies", () => {
    const result = makeResult([
      {
        frameIndex: 0, timestamp: 0, summary: "", description: "",
        anomalies: [
          { type: "unnatural-edge", severity: 50, confidence: 80, description: "edges" },
        ],
      },
    ])
    expect(computeFrameExplanationModifier(result)).toBe(0)
  })

  it("returns +10 for high-severity suspicious anomalies", () => {
    const result = makeResult([
      {
        frameIndex: 0, timestamp: 0, summary: "", description: "",
        anomalies: [
          { type: "blending-artifact", severity: 85, confidence: 90, description: "clear blending" },
          { type: "unnatural-edge", severity: 75, confidence: 85, description: "sharp edges" },
        ],
      },
    ])
    expect(computeFrameExplanationModifier(result)).toBe(10)
  })

  it("ignores compression artifacts when computing suspicious average", () => {
    const result = makeResult([
      {
        frameIndex: 0, timestamp: 0, summary: "", description: "",
        anomalies: [
          { type: "compression-artifact", severity: 90, confidence: 95, description: "heavy" },
          { type: "blending-artifact", severity: 15, confidence: 40, description: "slight" },
        ],
      },
    ])
    // Only the blending-artifact counts: severity 15 * confidence 0.4 = 6.0 → < 30 → -10
    expect(computeFrameExplanationModifier(result)).toBe(-10)
  })
})
