/**
 * Temporal consistency analysis — sequence window approach.
 * Delegates pixel-level diff computation to the shared forensic worker.
 */

export interface TemporalAnalysisResult {
  consistencyScore: number // 0-100, higher = more suspicious
  anomalyFrameIndices: number[]
  findings: string[]
  windowCenterTime: number
  framesInWindow: number
  degraded: boolean
}

const TEMPORAL_TIMEOUT_MS = 10_000
const MAX_TEMPORAL_FRAMES = 8
const MAX_TEMPORAL_FRAMES_FALLBACK = 4

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

function ensureDataPrefix(frame: string): string {
  if (frame.startsWith("data:")) return frame
  return `data:image/jpeg;base64,${frame}`
}

function sendToWorker(frames: string[]): Promise<Record<string, unknown>> {
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
    w.postMessage({ type: "temporal", id, frames })
  })
}

function enqueueWorkerTask<T>(fn: () => Promise<T>): Promise<T> {
  const task = pendingTask.then(fn, fn)
  pendingTask = task.then(() => {}, () => {})
  return task
}

function generateFindings(score: number, anomalyCount: number, framesAnalyzed: number): string[] {
  const findings: string[] = []

  if (score > 70) {
    findings.push("High temporal inconsistency detected — significant frame-to-frame variations suggest potential manipulation")
  } else if (score > 40) {
    findings.push("Moderate temporal inconsistency — some frame transitions show unusual variation")
  } else if (score > 20) {
    findings.push("Mild temporal variation detected — mostly consistent frame transitions")
  } else {
    findings.push("Temporal consistency is normal — smooth frame-to-frame transitions")
  }

  if (anomalyCount > 0) {
    findings.push(`${anomalyCount} anomalous frame transition${anomalyCount > 1 ? "s" : ""} detected in ${framesAnalyzed}-frame window`)
  }

  return findings
}

export async function computeTemporalConsistency(
  frames: string[],
  centerTime: number,
  onProgress?: (msg: string) => void
): Promise<TemporalAnalysisResult> {
  const degradedResult: TemporalAnalysisResult = {
    consistencyScore: 0,
    anomalyFrameIndices: [],
    findings: [],
    windowCenterTime: centerTime,
    framesInWindow: 0,
    degraded: true,
  }

  if (!frames || frames.length < 2) return degradedResult

  // Limit frame count
  const maxFrames = workerFallback ? MAX_TEMPORAL_FRAMES_FALLBACK : MAX_TEMPORAL_FRAMES
  const sampled = frames.length > maxFrames
    ? frames.slice(0, maxFrames)
    : frames

  const prepared = sampled
    .filter((f) => f && f.length > 20)
    .map(ensureDataPrefix)

  if (prepared.length < 2) return degradedResult

  onProgress?.("Analyzing temporal consistency...")

  try {
    const result = await Promise.race([
      enqueueWorkerTask(() => sendToWorker(prepared)),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Temporal analysis timed out")), TEMPORAL_TIMEOUT_MS)
      ),
    ])

    const consistencyScore = typeof result.consistencyScore === "number" && !Number.isNaN(result.consistencyScore)
      ? Math.max(0, Math.min(100, result.consistencyScore as number))
      : 0

    const anomalyIndices = Array.isArray(result.anomalyIndices)
      ? (result.anomalyIndices as number[])
      : []

    const framesAnalyzed = typeof result.framesAnalyzed === "number"
      ? (result.framesAnalyzed as number)
      : prepared.length

    return {
      consistencyScore,
      anomalyFrameIndices: anomalyIndices,
      findings: generateFindings(consistencyScore, anomalyIndices.length, framesAnalyzed),
      windowCenterTime: centerTime,
      framesInWindow: framesAnalyzed,
      degraded: false,
    }
  } catch {
    return degradedResult
  }
}
