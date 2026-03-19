import { NextResponse } from "next/server"
import { TTLCache, normalizeForCacheKey } from "@/lib/cache"
import { incrementMetric } from "@/lib/metrics"

interface SearchRequest {
  claims: string[]
}

interface ClaimSource {
  title: string
  url: string
  snippet: string
  score: number
}

interface ClaimSearchResult {
  sources: ClaimSource[]
  searchedAt: string
}

interface SearchResponse {
  results: Record<string, ClaimSearchResult>
  cached: number
  errors: number
  circuitOpen: boolean
  searchDisabled: boolean
}

const TTL_24H = 24 * 60 * 60 * 1000
const cache = new TTLCache<ClaimSearchResult>(1000)

// Circuit breaker state
let consecutiveFailures = 0
let circuitOpenUntil = 0
const CIRCUIT_THRESHOLD = 3
const CIRCUIT_COOLDOWN_MS = 5 * 60 * 1000

export async function POST(request: Request) {
  if (!process.env.TAVILY_API_KEY) {
    return NextResponse.json({
      results: {},
      cached: 0,
      errors: 0,
      circuitOpen: false,
      searchDisabled: true,
    } satisfies SearchResponse)
  }

  try {
    const body: SearchRequest = await request.json()
    const claims = (body.claims ?? []).slice(0, 5)

    if (claims.length === 0) {
      return NextResponse.json({
        results: {},
        cached: 0,
        errors: 0,
        circuitOpen: false,
        searchDisabled: false,
      } satisfies SearchResponse)
    }

    // Check circuit breaker
    if (Date.now() < circuitOpenUntil) {
      return NextResponse.json({
        results: {},
        cached: 0,
        errors: 0,
        circuitOpen: true,
        searchDisabled: false,
      } satisfies SearchResponse)
    }

    const results: Record<string, ClaimSearchResult> = {}
    let cachedCount = 0
    let errorCount = 0

    const searchPromises = claims.map(async (claim) => {
      const trimmed = claim.slice(0, 200)
      const cacheKey = await normalizeForCacheKey(trimmed)

      // Check cache
      const cached = cache.get(cacheKey)
      if (cached) {
        incrementMetric("cache.hits")
        cachedCount++
        results[trimmed] = cached
        return
      }
      incrementMetric("cache.misses")

      // Search with retry
      try {
        const result = await searchWithRetry(trimmed)
        consecutiveFailures = 0
        cache.set(cacheKey, result, TTL_24H)
        results[trimmed] = result
      } catch {
        errorCount++
        consecutiveFailures++
        incrementMetric("tavily.errors")
        if (consecutiveFailures >= CIRCUIT_THRESHOLD) {
          circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS
          incrementMetric("tavily.circuit_opens")
        }
      }
    })

    await Promise.allSettled(searchPromises)

    return NextResponse.json({
      results,
      cached: cachedCount,
      errors: errorCount,
      circuitOpen: Date.now() < circuitOpenUntil,
      searchDisabled: false,
    } satisfies SearchResponse)
  } catch (error) {
    console.error("Search API error:", error)
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    )
  }
}

async function searchWithRetry(query: string, retries = 1): Promise<ClaimSearchResult> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await searchTavily(query)
    } catch (err) {
      if (attempt === retries) throw err
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
  throw new Error("Search exhausted retries")
}

async function searchTavily(query: string): Promise<ClaimSearchResult> {
  incrementMetric("tavily.calls")

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        search_depth: "basic",
        max_results: 3,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      throw new Error(`Tavily API error: ${response.status}`)
    }

    const data = await response.json()
    const sources: ClaimSource[] = (data.results ?? []).map(
      (r: { title?: string; url?: string; content?: string; score?: number }) => ({
        title: r.title ?? "",
        url: r.url ?? "",
        snippet: (r.content ?? "").slice(0, 300),
        score: r.score ?? 0,
      })
    )

    return { sources, searchedAt: new Date().toISOString() }
  } catch (err) {
    clearTimeout(timeout)
    throw err
  }
}
