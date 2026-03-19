interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export class TTLCache<T> {
  private store = new Map<string, CacheEntry<T>>()
  private hits = 0
  private misses = 0
  private maxEntries: number

  constructor(maxEntries = 1000) {
    this.maxEntries = maxEntries
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) {
      this.misses++
      return undefined
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      this.misses++
      return undefined
    }
    this.hits++
    return entry.value
  }

  set(key: string, value: T, ttlMs: number): void {
    if (this.store.size >= this.maxEntries) {
      this.evictOldest()
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs })
  }

  has(key: string): boolean {
    const entry = this.store.get(key)
    if (!entry) return false
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return false
    }
    return true
  }

  delete(key: string): boolean {
    return this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
    this.hits = 0
    this.misses = 0
  }

  stats(): { hits: number; misses: number; size: number } {
    return { hits: this.hits, misses: this.misses, size: this.store.size }
  }

  private evictOldest(): void {
    let oldestKey: string | null = null
    let oldestExpiry = Infinity
    for (const [key, entry] of this.store) {
      if (entry.expiresAt < oldestExpiry) {
        oldestExpiry = entry.expiresAt
        oldestKey = key
      }
    }
    if (oldestKey) this.store.delete(oldestKey)
  }
}

export async function normalizeForCacheKey(text: string): Promise<string> {
  const normalized = text.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim()
  const encoder = new TextEncoder()
  const data = encoder.encode(normalized)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}
