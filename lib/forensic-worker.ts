/**
 * Web Worker for forensic analysis operations.
 * Runs ELA, noise analysis, and temporal consistency off the main thread.
 * Uses OffscreenCanvas where available, signals fallback otherwise.
 */

import { computeELA, computeNoiseVariance, computeTemporalDiff } from "./forensic-algorithms"

type MessageType = "ela" | "noise" | "temporal" | "init"

interface WorkerMessage {
  type: MessageType
  id: number
  frames: string[] // base64 image data (with data: prefix)
  width?: number
  height?: number
}

// Check OffscreenCanvas availability
const hasOffscreenCanvas = typeof OffscreenCanvas !== "undefined"

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { type, id, frames } = e.data

  // Init message — used for warm-up
  if (type === "init") {
    self.postMessage({ id, type: "init", fallback: !hasOffscreenCanvas })
    return
  }

  // Validate message type
  if (type !== "ela" && type !== "noise" && type !== "temporal") {
    return // silently ignore unknown types
  }

  if (!hasOffscreenCanvas) {
    self.postMessage({ id, type, fallback: true })
    return
  }

  try {
    if (type === "ela") {
      await handleELA(id, frames)
    } else if (type === "noise") {
      await handleNoise(id, frames)
    } else if (type === "temporal") {
      await handleTemporal(id, frames)
    }
  } catch (err) {
    self.postMessage({
      id,
      type,
      error: err instanceof Error ? err.message : "Worker error",
    })
  }
}

async function loadImage(base64: string): Promise<ImageBitmap | null> {
  try {
    const response = await fetch(base64)
    const blob = await response.blob()
    return await createImageBitmap(blob)
  } catch {
    return null
  }
}

function getPixels(bitmap: ImageBitmap, targetWidth?: number): { pixels: Uint8ClampedArray; width: number; height: number } {
  const scale = targetWidth ? Math.min(1, targetWidth / bitmap.width) : 1
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext("2d")!
  ctx.drawImage(bitmap, 0, 0, width, height)
  const imageData = ctx.getImageData(0, 0, width, height)

  // Cleanup
  canvas.width = 0
  canvas.height = 0

  return { pixels: imageData.data, width, height }
}

function recompressPixels(bitmap: ImageBitmap, width: number, height: number, quality: number): Uint8ClampedArray {
  // Draw to canvas → export as JPEG blob → redraw → get pixels
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext("2d")!
  ctx.drawImage(bitmap, 0, 0, width, height)

  // We can't do sync blob conversion in OffscreenCanvas easily,
  // so we re-export at reduced quality by drawing with lower quality canvas
  // Simulate JPEG compression by quantizing pixel values
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data

  // Simulate JPEG compression artifacts: quantize to steps based on quality
  const step = Math.max(1, Math.round((1 - quality) * 16))
  const result = new Uint8ClampedArray(data.length)
  for (let i = 0; i < data.length; i += 4) {
    result[i] = Math.round(data[i] / step) * step
    result[i + 1] = Math.round(data[i + 1] / step) * step
    result[i + 2] = Math.round(data[i + 2] / step) * step
    result[i + 3] = data[i + 3]
  }

  canvas.width = 0
  canvas.height = 0

  return result
}

async function handleELA(id: number, frames: string[]) {
  const results: Array<{ score: number; maxRegionalDeviation: number; meanDeviation: number }> = []

  for (const frame of frames) {
    const bitmap = await loadImage(frame)
    if (!bitmap || bitmap.width < 200) {
      if (bitmap) bitmap.close()
      continue
    }

    const { pixels, width, height } = getPixels(bitmap, 720)
    const recompressed = recompressPixels(bitmap, width, height, 0.75)
    bitmap.close()

    results.push(computeELA(pixels, recompressed, width, height))
  }

  const avgScore = results.length > 0
    ? results.reduce((a, r) => a + r.score, 0) / results.length
    : 0

  self.postMessage({
    id,
    type: "ela",
    elaScore: Math.max(0, Math.min(100, avgScore)),
    framesAnalyzed: results.length,
    perFrameResults: results,
  })
}

async function handleNoise(id: number, frames: string[]) {
  const results: Array<{ score: number; varianceOfVariance: number }> = []

  for (const frame of frames) {
    const bitmap = await loadImage(frame)
    if (!bitmap || bitmap.width < 200) {
      if (bitmap) bitmap.close()
      continue
    }

    const { pixels, width, height } = getPixels(bitmap, 720)
    bitmap.close()

    results.push(computeNoiseVariance(pixels, width, height))
  }

  const avgScore = results.length > 0
    ? results.reduce((a, r) => a + r.score, 0) / results.length
    : 0

  self.postMessage({
    id,
    type: "noise",
    noiseScore: Math.max(0, Math.min(100, avgScore)),
    framesAnalyzed: results.length,
    perFrameResults: results,
  })
}

async function handleTemporal(id: number, frames: string[]) {
  const pixelArrays: Uint8ClampedArray[] = []
  let frameWidth = 0
  let frameHeight = 0

  for (const frame of frames) {
    const bitmap = await loadImage(frame)
    if (!bitmap || bitmap.width < 200) {
      if (bitmap) bitmap.close()
      continue
    }

    const { pixels, width, height } = getPixels(bitmap, 480)
    bitmap.close()

    if (frameWidth === 0) {
      frameWidth = width
      frameHeight = height
    } else if (width !== frameWidth || height !== frameHeight) {
      // Skip frames with different dimensions
      continue
    }

    pixelArrays.push(pixels)
  }

  const result = computeTemporalDiff(pixelArrays, frameWidth, frameHeight)

  self.postMessage({
    id,
    type: "temporal",
    consistencyScore: Math.max(0, Math.min(100, result.consistencyScore)),
    cv: result.cv,
    anomalyIndices: result.anomalyIndices,
    framesAnalyzed: pixelArrays.length,
    diffScores: result.diffScores,
  })
}
