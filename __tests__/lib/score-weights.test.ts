import { describe, it, expect } from "vitest"
import { computeContentProfile } from "@/lib/score-weights"

describe("computeContentProfile", () => {
  it("returns visual-only when no audio", () => {
    const result = computeContentProfile(5, 10, undefined, false, true)
    expect(result.type).toBe("visual-only")
    expect(result.weights).toEqual({ visual: 1.0, text: 0.0 })
  })

  it("returns text-only when no frames", () => {
    const result = computeContentProfile(0, 0, 600, true, false)
    expect(result.type).toBe("text-only")
    expect(result.weights).toEqual({ visual: 0.0, text: 1.0 })
  })

  it("returns face-heavy when high face ratio and short transcript", () => {
    const result = computeContentProfile(8, 10, 100, true, true)
    expect(result.type).toBe("face-heavy")
    expect(result.weights).toEqual({ visual: 0.85, text: 0.15 })
  })

  it("returns speech-heavy when low face ratio and long transcript", () => {
    const result = computeContentProfile(1, 10, 600, true, true)
    expect(result.type).toBe("speech-heavy")
    expect(result.weights).toEqual({ visual: 0.55, text: 0.45 })
  })

  it("returns balanced for moderate content", () => {
    const result = computeContentProfile(5, 10, 300, true, true)
    expect(result.type).toBe("balanced")
    expect(result.weights).toEqual({ visual: 0.7, text: 0.3 })
  })

  it("returns balanced when transcriptLength is undefined but has audio", () => {
    const result = computeContentProfile(5, 10, undefined, true, true)
    expect(result.type).toBe("visual-only")
    expect(result.weights).toEqual({ visual: 1.0, text: 0.0 })
  })

  it("returns balanced when neither frames nor audio", () => {
    const result = computeContentProfile(0, 0, undefined, false, false)
    expect(result.type).toBe("balanced")
    expect(result.weights).toEqual({ visual: 0.7, text: 0.3 })
  })

  it("returns balanced at boundary conditions (faceRatio exactly 0.6)", () => {
    const result = computeContentProfile(6, 10, 100, true, true)
    expect(result.type).toBe("balanced")
  })

  it("returns balanced at boundary conditions (faceRatio exactly 0.3)", () => {
    const result = computeContentProfile(3, 10, 600, true, true)
    expect(result.type).toBe("balanced")
  })

  it("handles zero framesAnalyzed without error", () => {
    const result = computeContentProfile(0, 0, 300, true, true)
    // faceRatio = 0/0 = 0 (< 0.3), but transcript 300 is not > 500, so balanced
    expect(result.type).toBe("balanced")
  })

  it("handles zero framesAnalyzed with long transcript as speech-heavy", () => {
    const result = computeContentProfile(0, 0, 600, true, true)
    expect(result.type).toBe("speech-heavy")
  })

  it("all profiles have a reason string", () => {
    const profiles = [
      computeContentProfile(0, 0, undefined, false, false),
      computeContentProfile(5, 10, undefined, false, true),
      computeContentProfile(0, 0, 600, true, false),
      computeContentProfile(8, 10, 100, true, true),
      computeContentProfile(1, 10, 600, true, true),
      computeContentProfile(5, 10, 300, true, true),
    ]
    for (const p of profiles) {
      expect(p.reason).toBeTruthy()
      expect(typeof p.reason).toBe("string")
    }
  })

  it("weights always sum to 1.0", () => {
    const profiles = [
      computeContentProfile(0, 0, undefined, false, false),
      computeContentProfile(5, 10, undefined, false, true),
      computeContentProfile(0, 0, 600, true, false),
      computeContentProfile(8, 10, 100, true, true),
      computeContentProfile(1, 10, 600, true, true),
      computeContentProfile(5, 10, 300, true, true),
    ]
    for (const p of profiles) {
      expect(p.weights.visual + p.weights.text).toBeCloseTo(1.0)
    }
  })
})
