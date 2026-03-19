import type { AnalysisMode } from "./frame-explanation"

export interface SelectedFrame {
  base64: string
  index: number
  timestamp: number
}

/**
 * Select frames for explanation analysis.
 * Fast mode: 4 evenly-spaced frames (swap 2 middle for highest-scoring if available).
 * Deep mode: up to 12 frames, ensuring top-3 scoring frames are included.
 */
export function selectFramesForExplanation(
  allFrames: string[],
  timestamps: number[],
  mode: AnalysisMode,
  perFrameScores?: number[]
): SelectedFrame[] {
  if (allFrames.length === 0) return []

  const targetCount = mode === "fast" ? 4 : 12
  const count = Math.min(targetCount, allFrames.length)

  // Start with evenly-spaced indices
  let indices = evenlySpacedIndices(allFrames.length, count)

  // Prioritize suspicious frames if scores are available
  if (perFrameScores && perFrameScores.length === allFrames.length) {
    indices = prioritizeSuspiciousFrames(indices, perFrameScores, mode)
  }

  // Sort by index for temporal order
  indices.sort((a, b) => a - b)

  return indices.map((i) => ({
    base64: allFrames[i],
    index: i,
    timestamp: i < timestamps.length ? timestamps[i] : 0,
  }))
}

/**
 * Resize a base64 JPEG frame to maxWidth=512 at quality=0.6.
 * Returns the resized base64 string (no data: prefix).
 * Falls back to quality=0.4 if result exceeds maxBytes.
 */
export async function resizeFrameForExplanation(
  base64: string,
  maxWidth = 512,
  maxBytes = 4 * 1024 * 1024
): Promise<string> {
  const img = new Image()
  img.crossOrigin = "anonymous"

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error("Failed to load frame for resize"))
    img.src = `data:image/jpeg;base64,${base64}`
  })

  const scale = Math.min(1, maxWidth / img.naturalWidth)
  const width = Math.round(img.naturalWidth * scale)
  const height = Math.round(img.naturalHeight * scale)

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")!
  ctx.drawImage(img, 0, 0, width, height)

  let result = canvas.toDataURL("image/jpeg", 0.6).split(",")[1]

  // If still too large, reduce quality further
  if (result.length * 0.75 > maxBytes) {
    result = canvas.toDataURL("image/jpeg", 0.4).split(",")[1]
  }

  // If STILL too large, reduce dimensions
  if (result.length * 0.75 > maxBytes) {
    canvas.width = Math.round(width * 0.75)
    canvas.height = Math.round(height * 0.75)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    result = canvas.toDataURL("image/jpeg", 0.4).split(",")[1]
  }

  // Cleanup
  canvas.width = 0
  canvas.height = 0

  return result
}

/**
 * Quick similarity check between two base64 frames.
 * Compares the first prefixLength characters of base64.
 * Returns 0-100 (100 = identical prefix).
 */
export function quickSimilarity(frameA: string, frameB: string, prefixLength = 2000): number {
  const a = frameA.slice(0, prefixLength)
  const b = frameB.slice(0, prefixLength)
  const len = Math.min(a.length, b.length)
  if (len === 0) return 0

  let matches = 0
  for (let i = 0; i < len; i++) {
    if (a[i] === b[i]) matches++
  }
  return Math.round((matches / len) * 100)
}

function evenlySpacedIndices(total: number, count: number): number[] {
  if (total <= count) return Array.from({ length: total }, (_, i) => i)
  const step = total / count
  return Array.from({ length: count }, (_, i) => Math.floor(i * step))
}

function prioritizeSuspiciousFrames(
  indices: number[],
  scores: number[],
  mode: AnalysisMode
): number[] {
  const selectedSet = new Set(indices)

  // Find highest-scoring frames not already selected
  const ranked = scores
    .map((score, idx) => ({ score, idx }))
    .filter(({ idx }) => !selectedSet.has(idx))
    .sort((a, b) => b.score - a.score)

  if (mode === "fast") {
    // Swap 2 middle positions for top suspicious frames
    const swapCount = Math.min(2, ranked.length)
    const middleStart = Math.floor(indices.length / 2) - 1
    for (let i = 0; i < swapCount; i++) {
      const swapIdx = Math.max(0, middleStart + i)
      if (swapIdx < indices.length) {
        indices[swapIdx] = ranked[i].idx
      }
    }
  } else {
    // Ensure top-3 scoring frames are included
    const swapCount = Math.min(3, ranked.length)
    for (let i = 0; i < swapCount; i++) {
      // Find the lowest-scoring selected frame to swap out
      let minScore = Infinity
      let minIdx = -1
      for (let j = 0; j < indices.length; j++) {
        const s = scores[indices[j]]
        if (s < minScore) {
          minScore = s
          minIdx = j
        }
      }
      if (minIdx >= 0 && ranked[i].score > minScore) {
        indices[minIdx] = ranked[i].idx
      }
    }
  }

  return indices
}
