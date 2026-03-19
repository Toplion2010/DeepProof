const counters: Record<string, number> = {
  "tavily.calls": 0,
  "tavily.errors": 0,
  "tavily.circuit_opens": 0,
  "cache.hits": 0,
  "cache.misses": 0,
  "vision.calls": 0,
  "vision.errors": 0,
  "frames.calls": 0,
  "frames.errors": 0,
  "pipeline.degraded_count": 0,
}

export function incrementMetric(name: string): void {
  if (name in counters) {
    counters[name]++
  } else {
    counters[name] = 1
  }
}

export function getMetrics(): Record<string, number> {
  return { ...counters }
}

export function logMetrics(): void {
  console.log("[DeepProof Metrics]", JSON.stringify(counters))
}
