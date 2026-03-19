import { describe, it, expect, vi, beforeEach } from "vitest"

// We need to test the circuit breaker and caching logic.
// Since these are module-level state in route.ts, we test through the POST handler.

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// Mock cache
vi.mock("@/lib/cache", () => {
  const store = new Map<string, unknown>()
  class MockTTLCache {
    get(key: string) { return store.get(key) }
    set(key: string, value: unknown) { store.set(key, value) }
    stats() { return { hits: 0, misses: 0, size: store.size } }
  }
  return {
    TTLCache: MockTTLCache,
    normalizeForCacheKey: vi.fn(async (text: string) => `hash_${text.toLowerCase().replace(/\s+/g, "_")}`),
  }
})

// Mock metrics
vi.mock("@/lib/metrics", () => ({
  incrementMetric: vi.fn(),
}))

describe("POST /api/search", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset module to reset circuit breaker state
    vi.resetModules()
  })

  it("should return searchDisabled when TAVILY_API_KEY is not set", async () => {
    vi.stubEnv("TAVILY_API_KEY", "")
    const { POST } = await import("@/app/api/search/route")

    const req = new Request("http://localhost/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claims: ["test claim"] }),
    })

    const res = await POST(req)
    const data = await res.json()
    expect(data.searchDisabled).toBe(true)
  })

  it("should return empty results for empty claims array", async () => {
    vi.stubEnv("TAVILY_API_KEY", "test-key")
    const { POST } = await import("@/app/api/search/route")

    const req = new Request("http://localhost/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claims: [] }),
    })

    const res = await POST(req)
    const data = await res.json()
    expect(data.results).toEqual({})
    expect(data.searchDisabled).toBe(false)
  })

  it("should limit claims to 5", async () => {
    vi.stubEnv("TAVILY_API_KEY", "test-key")

    // Mock successful fetch for Tavily
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ title: "Test", url: "https://example.com", content: "Test content", score: 0.9 }] }),
    })

    const { POST } = await import("@/app/api/search/route")

    const claims = Array.from({ length: 8 }, (_, i) => `Claim ${i}`)
    const req = new Request("http://localhost/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claims }),
    })

    const res = await POST(req)
    const data = await res.json()
    // Should have at most 5 results
    expect(Object.keys(data.results).length).toBeLessThanOrEqual(5)
  })

  it("should truncate snippets to 300 chars", async () => {
    vi.stubEnv("TAVILY_API_KEY", "test-key")

    const longContent = "x".repeat(500)
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ title: "Test", url: "https://example.com", content: longContent, score: 0.9 }] }),
    })

    const { POST } = await import("@/app/api/search/route")

    const req = new Request("http://localhost/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claims: ["test claim"] }),
    })

    const res = await POST(req)
    const data = await res.json()
    const firstResult = Object.values(data.results)[0] as { sources: Array<{ snippet: string }> }
    expect(firstResult.sources[0].snippet.length).toBeLessThanOrEqual(300)
  })
})
