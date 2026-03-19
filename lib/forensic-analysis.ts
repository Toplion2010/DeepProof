/**
 * Main-thread wrapper for forensic analysis.
 * Manages worker lifecycle, task queue, timeouts, and fallback.
 */

export interface ForensicResult {
  elaScore: number
  elaFindings: string[]
  noiseScore: number
  noiseFindings: string[]
  framesAnalyzed: number
  degraded: boolean
}

const FORENSIC_TIMEOUT_MS = 12_000
const MAX_FRAMES = 12
const MAX_FRAMES_FALLBACK = 4
const MAX_FRAMES_LOW_MEMORY = 6
const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024 // 10MB

let worker: Worker | null = null
let workerFallback = false
let messageId = 0
let pendingTask: Promise<void> = Promise.resolve()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./forensic-worker.ts", import.meta.url))
    worker.onerror = () => {
      worker?.terminate()
      worker = null
    }
  }
  return worker
}

/** Warm up the worker (call during pipeline init) */
export function warmUpForensicWorker(): void {
  try {
    const w = getWorker()
    w.postMessage({ type: "init", id: messageId++, frames: [] })
  } catch {
    // Non-critical
  }
}

/** Terminate and reset the worker */
export function terminateForensicWorker(): void {
  if (worker) {
    worker.terminate()
    worker = null
  }
}

function getMaxFrames(): number {
  if (workerFallback) return MAX_FRAMES_FALLBACK
  const deviceMemory = (navigator as { deviceMemory?: number }).deviceMemory
  if (deviceMemory !== undefined && deviceMemory <= 2) return MAX_FRAMES_LOW_MEMORY
  return MAX_FRAMES
}

function estimatePayloadSize(frames: string[]): number {
  return frames.reduce((sum, f) => sum + f.length, 0)
}

function sampleFrames(frames: string[], max: number): string[] {
  if (frames.length <= max) return frames
  const step = frames.length / max
  return Array.from({ length: max }, (_, i) => frames[Math.floor(i * step)])
}

function ensureDataPrefix(frame: string): string {
  if (frame.startsWith("data:")) return frame
  return `data:image/jpeg;base64,${frame}`
}

function isValidBase64Image(frame: string): boolean {
  if (!frame || frame.length < 20) return false
  // Check if it starts with data: prefix or is raw base64
  if (frame.startsWith("data:image/")) return true
  // Check if it looks like base64
  return /^[A-Za-z0-9+/]/.test(frame)
}

function sendToWorker(type: "ela" | "noise" | "temporal", frames: string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const id = messageId++
    const w = getWorker()

    const onMessage = (e: MessageEvent) => {
      if (e.data?.id !== id) return
      w.removeEventListener("message", onMessage)
      w.removeEventListener("error", onError)

      if (e.data.fallback) {
        workerFallback = true
        reject(new Error("fallback"))
        return
      }
      if (e.data.error) {
        reject(new Error(e.data.error))
        return
      }
      if (typeof e.data !== "object") {
        reject(new Error("Invalid worker response"))
        return
      }
      resolve(e.data as Record<string, unknown>)
    }

    const onError = () => {
      w.removeEventListener("message", onMessage)
      w.removeEventListener("error", onError)
      worker?.terminate()
      worker = null
      reject(new Error("Worker crashed"))
    }

    w.addEventListener("message", onMessage)
    w.addEventListener("error", onError)
    w.postMessage({ type, id, frames })
  })
}

/** Serialize tasks through the worker — no overlapping calls */
function enqueueWorkerTask<T>(fn: () => Promise<T>): Promise<T> {
  const task = pendingTask.then(fn, fn)
  pendingTask = task.then(() => {}, () => {})
  return task
}

function generateELAFindings(score: number): string[] {
  const findings: string[] = []
  if (score > 70) findings.push("High ELA deviation detected — regions show significant recompression artifacts inconsistent with natural images")
  else if (score > 40) findings.push("Moderate ELA deviation — some regions show potential manipulation artifacts")
  else if (score > 20) findings.push("Mild ELA variation — minor recompression differences detected")
  else findings.push("ELA analysis shows consistent compression levels across the image")
  return findings
}

function generateNoiseFindings(score: number): string[] {
  const findings: string[] = []
  if (score > 70) findings.push("Highly uniform noise pattern detected — consistent with GAN-generated content")
  else if (score > 40) findings.push("Moderately uniform noise — some regions show artificial noise characteristics")
  else if (score > 20) findings.push("Mild noise uniformity — mostly natural noise variation")
  else findings.push("Natural noise variation detected — consistent with camera-captured content")
  return findings
}

export async function runForensicAnalysis(
  frames: string[],
  onProgress?: (msg: string) => void
): Promise<ForensicResult> {
  const degradedResult: ForensicResult = {
    elaScore: 0,
    elaFindings: [],
    noiseScore: 0,
    noiseFindings: [],
    framesAnalyzed: 0,
    degraded: true,
  }

  // Empty frame guard
  if (!frames || frames.length === 0) return degradedResult

  // Validate and filter frames
  const validFrames = frames.filter(isValidBase64Image)
  if (validFrames.length === 0) return degradedResult

  // Sample down to max frame count
  const maxFrames = getMaxFrames()
  let sampled = sampleFrames(validFrames, maxFrames)

  // Add data: prefix for worker image loading
  sampled = sampled.map(ensureDataPrefix)

  // Check payload size
  if (estimatePayloadSize(sampled) > MAX_PAYLOAD_BYTES) {
    sampled = sampleFrames(sampled, Math.max(2, Math.floor(sampled.length / 2)))
  }

  onProgress?.("Running error level analysis...")

  try {
    const result = await Promise.race([
      runWorkerAnalysis(sampled, onProgress),
      new Promise<ForensicResult>((_, reject) =>
        setTimeout(() => reject(new Error("Forensic analysis timed out")), FORENSIC_TIMEOUT_MS)
      ),
    ])
    return result
  } catch {
    return degradedResult
  }
}

async function runWorkerAnalysis(
  frames: string[],
  onProgress?: (msg: string) => void
): Promise<ForensicResult> {
  // Run ELA
  onProgress?.("Running error level analysis...")
  const elaResult = await enqueueWorkerTask(() => sendToWorker("ela", frames))

  // Validate ELA response
  const elaScore = typeof elaResult.elaScore === "number" && !Number.isNaN(elaResult.elaScore)
    ? Math.max(0, Math.min(100, elaResult.elaScore as number))
    : 0

  // Run noise analysis
  onProgress?.("Running noise variance analysis...")
  const noiseResult = await enqueueWorkerTask(() => sendToWorker("noise", frames))

  // Validate noise response
  const noiseScore = typeof noiseResult.noiseScore === "number" && !Number.isNaN(noiseResult.noiseScore)
    ? Math.max(0, Math.min(100, noiseResult.noiseScore as number))
    : 0

  const framesAnalyzed = Math.max(
    typeof elaResult.framesAnalyzed === "number" ? elaResult.framesAnalyzed as number : 0,
    typeof noiseResult.framesAnalyzed === "number" ? noiseResult.framesAnalyzed as number : 0
  )

  return {
    elaScore,
    elaFindings: generateELAFindings(elaScore),
    noiseScore,
    noiseFindings: generateNoiseFindings(noiseScore),
    framesAnalyzed,
    degraded: false,
  }
}
