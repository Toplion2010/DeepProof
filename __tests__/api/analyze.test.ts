import { describe, it, expect, vi, beforeEach } from "vitest"

const mockCreate = vi.fn()
vi.mock("openai", () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return { chat: { completions: { create: mockCreate } } }
    }),
  }
})

vi.mock("@/lib/json-repair", () => ({
  parseAndRepairJson: vi.fn((text: string) => {
    try {
      const data = JSON.parse(text)
      return { data, repaired: false, error: null }
    } catch {
      return { data: null, repaired: false, error: "Parse failed" }
    }
  }),
  validateAnalysisResponse: vi.fn((data: unknown) => {
    if (!data || typeof data !== "object") return false
    const obj = data as Record<string, unknown>
    return typeof obj.overallScore === "number" && typeof obj.explanation === "string" && Array.isArray(obj.claims)
  }),
}))

vi.stubEnv("GROQ_API_KEY", "test-key")

import { POST } from "@/app/api/analyze/route"

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

const validResponse = JSON.stringify({
  overallScore: 25,
  explanation: "Transcript analysis shows mostly confirmed claims.",
  claims: [
    { text: "The event was in 2024", status: "confirmed", source: "General knowledge", detail: "Confirmed." },
    { text: "He said it was great", status: "opinion", source: "N/A", detail: "Subjective statement." },
  ],
})

describe("POST /api/analyze", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should return 400 for empty transcript", async () => {
    const req = makeRequest({ transcript: "", fileName: "test.mp4", duration: "0:30", resolution: "1920x1080", language: "en" })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("should return valid analysis", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: validResponse } }],
    })

    const req = makeRequest({
      transcript: "The event was held in Berlin on March 5, 2024.",
      fileName: "test.mp4",
      duration: "0:30",
      resolution: "1920x1080",
      language: "en",
    })
    const res = await POST(req)
    const data = await res.json()
    expect(data.overallScore).toBe(25)
    expect(data.claims).toHaveLength(2)
    expect(data.degraded).toBe(false)
  })

  it("should return degraded fallback on invalid JSON", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "This is completely unparseable nonsense" } }],
    })

    const req = makeRequest({
      transcript: "Some transcript text here.",
      fileName: "test.mp4",
      duration: "0:30",
      resolution: "1920x1080",
      language: "en",
    })
    const res = await POST(req)
    const data = await res.json()
    expect(data.degraded).toBe(true)
    expect(data.overallScore).toBe(50)
    expect(data.claims).toEqual([])
  })

  it("should map unknown claim labels to unconfirmed", async () => {
    const responseWithBadLabels = JSON.stringify({
      overallScore: 30,
      explanation: "Analysis complete.",
      claims: [
        { text: "Claim A", status: "likely_true", source: "N/A", detail: "Unknown label." },
        { text: "Claim B", status: "partially_confirmed", source: "N/A", detail: "Unknown label." },
        { text: "Claim C", status: "confirmed", source: "Wikipedia", detail: "Valid label." },
      ],
    })

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: responseWithBadLabels } }],
    })

    const req = makeRequest({
      transcript: "Test transcript with claims.",
      fileName: "test.mp4",
      duration: "0:30",
      resolution: "1920x1080",
      language: "en",
    })
    const res = await POST(req)
    const data = await res.json()
    expect(data.claims[0].status).toBe("unconfirmed")
    expect(data.claims[1].status).toBe("unconfirmed")
    expect(data.claims[2].status).toBe("confirmed")
  })

  it("should accept searchContext and visionFindings", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: validResponse } }],
    })

    const req = makeRequest({
      transcript: "The WHO declared COVID-19 a pandemic.",
      fileName: "test.mp4",
      duration: "0:30",
      resolution: "1920x1080",
      language: "en",
      searchContext: {
        "The WHO declared COVID-19 a pandemic": {
          sources: [{ title: "WHO Timeline", url: "https://who.int/timeline", snippet: "March 11, 2020", score: 0.95 }],
          searchedAt: new Date().toISOString(),
        },
      },
      visionFindings: ["Slight edge distortion near jawline"],
    })

    const res = await POST(req)
    const data = await res.json()
    expect(data.degraded).toBe(false)

    // Verify the prompt included search context
    const promptContent = mockCreate.mock.calls[0][0].messages[1].content
    expect(promptContent).toContain("WEB SEARCH CONTEXT")
    expect(promptContent).toContain("VISION ANALYSIS FINDINGS")
    expect(promptContent).toContain("who.int/timeline")
    expect(promptContent).toContain("edge distortion")
  })
})
