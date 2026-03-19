import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock OpenAI
const mockCreate = vi.fn()
vi.mock("openai", () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return { chat: { completions: { create: mockCreate } } }
    }),
  }
})

// Mock metrics
vi.mock("@/lib/metrics", () => ({
  incrementMetric: vi.fn(),
}))

// Mock json-repair
vi.mock("@/lib/json-repair", () => ({
  parseAndRepairJson: vi.fn((text: string) => {
    try {
      const data = JSON.parse(text)
      return { data, repaired: false, error: null }
    } catch {
      return { data: null, repaired: false, error: "Parse failed" }
    }
  }),
}))

// Set env before importing the route
vi.stubEnv("GROQ_API_KEY", "test-key")

import { POST } from "@/app/api/analyze-vision/route"

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/analyze-vision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/analyze-vision", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should reject requests without consent", async () => {
    const req = makeRequest({ frames: ["abc"], consentGiven: false, fileName: "test.mp4", duration: "0:30" })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain("consent")
  })

  it("should return degraded when no frames provided", async () => {
    const req = makeRequest({ frames: [], consentGiven: true, fileName: "test.mp4", duration: "0:30" })
    const res = await POST(req)
    const data = await res.json()
    expect(data.degraded).toBe(true)
    expect(data.findings).toEqual([])
  })

  it("should return findings from vision model", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '["Lighting inconsistency on left side", "Edge distortion near jaw"]' } }],
    })

    const req = makeRequest({
      frames: ["frame1base64", "frame2base64"],
      consentGiven: true,
      fileName: "test.mp4",
      duration: "0:30",
    })
    const res = await POST(req)
    const data = await res.json()
    expect(data.degraded).toBe(false)
    expect(data.findings).toHaveLength(2)
    expect(data.findings[0]).toContain("Lighting")
  })

  it("should select max 4 frames from larger set", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "[]" } }],
    })

    const frames = Array.from({ length: 10 }, (_, i) => `frame${i}`)
    const req = makeRequest({
      frames,
      consentGiven: true,
      fileName: "test.mp4",
      duration: "1:00",
    })
    await POST(req)

    // Check that the create call received content with 4 images (+ 1 text)
    const callArgs = mockCreate.mock.calls[0][0]
    const userContent = callArgs.messages[1].content
    const imageItems = userContent.filter((item: { type: string }) => item.type === "image_url")
    expect(imageItems).toHaveLength(4)
  })

  it("should return degraded on invalid JSON from model", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "This is not JSON at all" } }],
    })

    const req = makeRequest({
      frames: ["frame1"],
      consentGiven: true,
      fileName: "test.mp4",
      duration: "0:30",
    })
    const res = await POST(req)
    const data = await res.json()
    expect(data.degraded).toBe(true)
    expect(data.findings).toEqual([])
  })
})
