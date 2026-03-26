/**
 * Canvas cropping utility for extracting region crops from frames.
 */

import type { BoundingBox } from "./region-analysis"

/**
 * Crop a region from a base64 frame image.
 * @param frameBase64 - base64 string (without data: prefix)
 * @param box - normalized bounding box (0-1)
 * @param maxWidth - max output width (default 512)
 * @returns base64 JPEG string (without data: prefix)
 */
export async function cropRegion(
  frameBase64: string,
  box: BoundingBox,
  maxWidth = 512
): Promise<string> {
  const img = new Image()
  img.crossOrigin = "anonymous"

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error("Failed to load frame for crop"))
    img.src = `data:image/jpeg;base64,${frameBase64}`
  })

  // Convert normalized box to pixel coords
  const sx = Math.round(box.x * img.naturalWidth)
  const sy = Math.round(box.y * img.naturalHeight)
  const sw = Math.round(box.width * img.naturalWidth)
  const sh = Math.round(box.height * img.naturalHeight)

  if (sw < 1 || sh < 1) {
    throw new Error("Region too small to crop")
  }

  // Scale to maxWidth if needed
  const scale = Math.min(1, maxWidth / sw)
  const dw = Math.round(sw * scale)
  const dh = Math.round(sh * scale)

  const canvas = document.createElement("canvas")
  canvas.width = dw
  canvas.height = dh
  const ctx = canvas.getContext("2d")!
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh)

  const result = canvas.toDataURL("image/jpeg", 0.7).split(",")[1]

  // Cleanup
  canvas.width = 0
  canvas.height = 0

  return result
}
