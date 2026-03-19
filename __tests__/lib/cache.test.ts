import { describe, it, expect, vi, beforeEach } from "vitest"
import { TTLCache, normalizeForCacheKey } from "@/lib/cache"

describe("TTLCache", () => {
  let cache: TTLCache<string>

  beforeEach(() => {
    cache = new TTLCache<string>()
  })

  it("should store and retrieve values", () => {
    cache.set("key1", "value1", 60_000)
    expect(cache.get("key1")).toBe("value1")
  })

  it("should return undefined for missing keys", () => {
    expect(cache.get("nonexistent")).toBeUndefined()
  })

  it("should expire entries after TTL", () => {
    vi.useFakeTimers()
    cache.set("key1", "value1", 1000)
    expect(cache.get("key1")).toBe("value1")

    vi.advanceTimersByTime(1001)
    expect(cache.get("key1")).toBeUndefined()
    vi.useRealTimers()
  })

  it("should track hits and misses", () => {
    cache.set("key1", "value1", 60_000)
    cache.get("key1") // hit
    cache.get("key2") // miss

    const stats = cache.stats()
    expect(stats.hits).toBe(1)
    expect(stats.misses).toBe(1)
    expect(stats.size).toBe(1)
  })

  it("should report has() correctly", () => {
    cache.set("key1", "value1", 60_000)
    expect(cache.has("key1")).toBe(true)
    expect(cache.has("key2")).toBe(false)
  })

  it("should delete entries", () => {
    cache.set("key1", "value1", 60_000)
    expect(cache.delete("key1")).toBe(true)
    expect(cache.get("key1")).toBeUndefined()
  })

  it("should clear all entries", () => {
    cache.set("key1", "value1", 60_000)
    cache.set("key2", "value2", 60_000)
    cache.clear()
    expect(cache.stats().size).toBe(0)
  })

  it("should evict oldest entry when maxEntries exceeded", () => {
    vi.useFakeTimers()
    const smallCache = new TTLCache<string>(2)
    smallCache.set("oldest", "a", 60_000)
    vi.advanceTimersByTime(1)
    smallCache.set("newer", "b", 60_000)
    vi.advanceTimersByTime(1)
    smallCache.set("newest", "c", 60_000)

    // "oldest" should have been evicted
    expect(smallCache.get("oldest")).toBeUndefined()
    expect(smallCache.get("newer")).toBe("b")
    expect(smallCache.get("newest")).toBe("c")
    vi.useRealTimers()
  })

  it("should evict expired entry over valid one on overflow", () => {
    vi.useFakeTimers()
    const smallCache = new TTLCache<string>(2)
    smallCache.set("will-expire", "a", 100)
    vi.advanceTimersByTime(1)
    smallCache.set("valid", "b", 60_000)
    vi.advanceTimersByTime(200) // first entry expired

    smallCache.set("new", "c", 60_000)
    expect(smallCache.get("valid")).toBe("b")
    expect(smallCache.get("new")).toBe("c")
    vi.useRealTimers()
  })
})

describe("normalizeForCacheKey", () => {
  it("should normalize text to consistent hash", async () => {
    const hash1 = await normalizeForCacheKey("Hello, World!")
    const hash2 = await normalizeForCacheKey("hello world")
    expect(hash1).toBe(hash2)
  })

  it("should strip punctuation and produce consistent hashes", async () => {
    const hash1 = await normalizeForCacheKey("test! string?")
    const hash2 = await normalizeForCacheKey("test string")
    expect(hash1).toBe(hash2)
  })

  it("should collapse whitespace", async () => {
    const hash1 = await normalizeForCacheKey("  hello   world  ")
    const hash2 = await normalizeForCacheKey("hello world")
    expect(hash1).toBe(hash2)
  })

  it("should return a 64-char hex string (SHA-256)", async () => {
    const hash = await normalizeForCacheKey("test")
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })
})
