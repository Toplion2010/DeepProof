export interface ExtractedFrames {
  frames: string[] // base64 JPEG strings (no data: prefix)
  frameCount: number
  qualityUsed: number
  totalPayloadKB: number
}

/** Wait for a seek to complete and the frame to be decoded (iOS Safari compat) */
async function seekAndWait(video: HTMLVideoElement, time: number): Promise<void> {
  video.currentTime = time
  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve()
  })
  // iOS Safari: onseeked fires before frame is decoded — wait for readyState.
  // Use setTimeout (not rAF — rAF doesn't fire for offscreen video on iOS).
  // Bail after 2s to avoid hanging forever.
  if (video.readyState < 2) {
    await new Promise<void>((resolve) => {
      const start = Date.now()
      const check = () => {
        if (video.readyState >= 2 || Date.now() - start > 2000) resolve()
        else setTimeout(check, 30)
      }
      check()
    })
  }
}

export async function extractFrames(
  videoUrl: string,
  maxWidth = 768,
  maxPayloadKB = 600
): Promise<ExtractedFrames> {
  const video = document.createElement("video")
  video.preload = "auto"
  video.muted = true
  video.playsInline = true
  if (!videoUrl.startsWith("blob:")) video.crossOrigin = "anonymous"

  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve()
    video.onerror = () => reject(new Error("Failed to load video for frame extraction"))
    video.src = videoUrl
  })

  const duration = video.duration
  const frameCount = getFrameCount(duration)
  const timestamps = getTimestamps(duration, frameCount)

  // Scale dimensions
  const scale = Math.min(1, maxWidth / video.videoWidth)
  const width = Math.round(video.videoWidth * scale)
  const height = Math.round(video.videoHeight * scale)

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")!

  // Try decreasing quality levels to stay under payload limit
  for (const quality of [0.8, 0.6, 0.4]) {
    const frames = await captureFrames(video, timestamps, ctx, canvas, width, height, quality)
    const totalKB = estimatePayloadKB(frames)
    if (totalKB <= maxPayloadKB) {
      return { frames, frameCount: frames.length, qualityUsed: quality, totalPayloadKB: Math.round(totalKB) }
    }
  }

  // Fallback: reduce frame count by half at lowest quality
  const reducedTimestamps = timestamps.filter((_, i) => i % 2 === 0)
  const frames = await captureFrames(video, reducedTimestamps, ctx, canvas, width, height, 0.4)
  return {
    frames,
    frameCount: frames.length,
    qualityUsed: 0.4,
    totalPayloadKB: Math.round(estimatePayloadKB(frames)),
  }
}

async function captureFrames(
  video: HTMLVideoElement,
  timestamps: number[],
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  quality: number
): Promise<string[]> {
  const frames: string[] = []
  for (const time of timestamps) {
    await seekAndWait(video, time)
    ctx.drawImage(video, 0, 0, width, height)
    const dataUrl = canvas.toDataURL("image/jpeg", quality)
    frames.push(dataUrl.split(",")[1])
  }
  return frames
}

function estimatePayloadKB(frames: string[]): number {
  const totalBytes = frames.reduce((sum, f) => sum + f.length * 0.75, 0)
  return totalBytes / 1024
}

function getFrameCount(durationSec: number): number {
  if (durationSec < 10) return 8
  if (durationSec <= 40) return 12
  return 16
}

export function getTimestamps(duration: number, count: number): number[] {
  const step = duration / (count + 1)
  return Array.from({ length: count }, (_, i) => step * (i + 1))
}

/**
 * Extract a sequence of consecutive frames around a center timestamp.
 * Used for temporal consistency analysis.
 */
export async function extractSequenceWindow(
  videoUrl: string,
  centerTime: number,
  count = 8,
  intervalMs = 125,
  maxWidth = 480
): Promise<string[]> {
  const video = document.createElement("video")
  video.preload = "auto"
  video.muted = true
  video.playsInline = true
  if (!videoUrl.startsWith("blob:")) video.crossOrigin = "anonymous"

  // Wait for metadata to ensure valid dimensions and duration
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Video load timed out")), 10_000)
    if (video.readyState >= 1) {
      clearTimeout(timeout)
      resolve()
    } else {
      video.onloadeddata = () => { clearTimeout(timeout); resolve() }
      video.onerror = () => { clearTimeout(timeout); reject(new Error("Failed to load video")) }
    }
    video.src = videoUrl
  })

  const duration = video.duration
  if (!Number.isFinite(duration) || duration < 0.5) return []

  // Clamp center time to valid bounds
  const clampedCenter = Math.max(0, Math.min(duration - 0.5, centerTime))
  const intervalSec = intervalMs / 1000

  // Generate timestamps around center
  const halfCount = Math.floor(count / 2)
  const timestamps: number[] = []
  for (let i = -halfCount; i < count - halfCount; i++) {
    const t = clampedCenter + i * intervalSec
    if (t >= 0 && t <= duration) {
      timestamps.push(t)
    }
  }

  if (timestamps.length < 2) return []

  // Scale dimensions
  const scale = Math.min(1, maxWidth / video.videoWidth)
  const width = Math.round(video.videoWidth * scale)
  const height = Math.round(video.videoHeight * scale)

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")!

  const frames: string[] = []
  for (const time of timestamps) {
    try {
      await seekAndWait(video, time)
      ctx.drawImage(video, 0, 0, width, height)
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7)
      frames.push(dataUrl.split(",")[1])
    } catch {
      // Skip corrupted frame, continue with rest
    }
  }

  // Cleanup canvas memory
  canvas.width = 0
  canvas.height = 0

  return frames
}
