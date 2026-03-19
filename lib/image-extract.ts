/**
 * Client-side image extraction: resize, compress to base64 JPEG,
 * compute SHA-256 hash, and parse basic EXIF metadata.
 * No external dependencies — uses browser APIs only.
 */

export interface ImageExtraction {
  imageBase64: string // base64 JPEG, no data: prefix
  width: number
  height: number
  fileHash: string // SHA-256 hex
  exifMetadata?: Record<string, string>
}

const MAX_WIDTH = 1600
const JPEG_QUALITY = 0.75
const JPEG_QUALITY_FALLBACK = 0.5
const MAX_BASE64_BYTES = 4 * 1024 * 1024 // 4MB
const TIMEOUT_MS = 15_000

/**
 * Extract and process an image file for analysis.
 */
export async function extractImage(file: File): Promise<ImageExtraction> {
  const result = await Promise.race([
    doExtract(file),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Image extraction timed out")), TIMEOUT_MS)
    ),
  ])
  return result
}

async function doExtract(file: File): Promise<ImageExtraction> {
  // Step 1: Hash the raw file bytes
  const arrayBuffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const fileHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")

  // Step 2: Parse EXIF metadata (JPEG only)
  let exifMetadata: Record<string, string> | undefined
  if (file.type === "image/jpeg") {
    try {
      exifMetadata = parseExif(new Uint8Array(arrayBuffer))
    } catch {
      // Non-critical: if EXIF parsing fails, continue without it
      exifMetadata = undefined
    }
  }

  // Step 3: Load image into canvas and resize
  const { imageBase64, width, height } = await loadAndResize(file)

  return { imageBase64, width, height, fileHash, exifMetadata }
}

async function loadAndResize(
  file: File
): Promise<{ imageBase64: string; width: number; height: number }> {
  const url = URL.createObjectURL(file)

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.crossOrigin = "anonymous"
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error("Failed to load image"))
      image.src = url
    })

    let { naturalWidth: w, naturalHeight: h } = img

    // Resize if wider than MAX_WIDTH
    if (w > MAX_WIDTH) {
      const ratio = MAX_WIDTH / w
      w = MAX_WIDTH
      h = Math.round(h * ratio)
    }

    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h

    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Canvas context unavailable")
    ctx.drawImage(img, 0, 0, w, h)

    // Export to base64 JPEG
    let dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY)
    let base64 = dataUrl.split(",")[1]

    // If too large, fall back to lower quality
    if (base64.length > MAX_BASE64_BYTES) {
      dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY_FALLBACK)
      base64 = dataUrl.split(",")[1]
    }

    // Clean up
    canvas.width = 0
    canvas.height = 0

    return { imageBase64: base64, width: w, height: h }
  } finally {
    URL.revokeObjectURL(url)
  }
}

// ─── Lightweight EXIF parser (JPEG IFD0 only) ──────────────────────────

const EXIF_TAGS: Record<number, string> = {
  0x010f: "Make",
  0x0110: "Model",
  0x0131: "Software",
  0x9003: "DateTimeOriginal",
  0x9004: "DateTimeDigitized",
  0x010e: "ImageDescription",
}

function parseExif(data: Uint8Array): Record<string, string> | undefined {
  // Must start with JPEG SOI marker
  if (data[0] !== 0xff || data[1] !== 0xd8) return undefined

  let offset = 2
  const result: Record<string, string> = {}

  // Scan for APP1 marker (EXIF)
  while (offset < data.length - 4) {
    if (data[offset] !== 0xff) break

    const marker = data[offset + 1]
    const segmentLength = (data[offset + 2] << 8) | data[offset + 3]

    // APP1 = 0xE1
    if (marker === 0xe1) {
      // Check for "Exif\0\0" header
      const exifHeader = String.fromCharCode(
        data[offset + 4],
        data[offset + 5],
        data[offset + 6],
        data[offset + 7]
      )
      if (exifHeader !== "Exif") {
        offset += 2 + segmentLength
        continue
      }

      const tiffOffset = offset + 10 // Skip marker(2) + length(2) + "Exif\0\0"(6)
      const view = new DataView(data.buffer, data.byteOffset + tiffOffset)

      // Determine byte order
      const byteOrder = view.getUint16(0)
      const littleEndian = byteOrder === 0x4949 // "II"

      // Verify TIFF magic number
      if (view.getUint16(2, littleEndian) !== 0x002a) return undefined

      // Get IFD0 offset
      const ifd0Offset = view.getUint32(4, littleEndian)

      // Parse IFD0 entries
      parseIFD(view, ifd0Offset, littleEndian, result)

      // Check for EXIF sub-IFD
      const exifIFDOffset = findTagValue(view, ifd0Offset, littleEndian, 0x8769)
      if (exifIFDOffset !== undefined) {
        parseIFD(view, exifIFDOffset, littleEndian, result)
      }

      if (Object.keys(result).length > 0) return result
      return undefined
    }

    // Skip to next segment
    offset += 2 + segmentLength
  }

  return undefined
}

function parseIFD(
  view: DataView,
  ifdOffset: number,
  littleEndian: boolean,
  result: Record<string, string>
) {
  try {
    const entryCount = view.getUint16(ifdOffset, littleEndian)

    for (let i = 0; i < entryCount; i++) {
      const entryOffset = ifdOffset + 2 + i * 12
      if (entryOffset + 12 > view.byteLength) break

      const tag = view.getUint16(entryOffset, littleEndian)
      const tagName = EXIF_TAGS[tag]
      if (!tagName) continue

      const type = view.getUint16(entryOffset + 2, littleEndian)
      const count = view.getUint32(entryOffset + 4, littleEndian)

      // We only care about ASCII strings (type 2)
      if (type !== 2) continue

      let valueOffset: number
      if (count <= 4) {
        valueOffset = entryOffset + 8
      } else {
        valueOffset = view.getUint32(entryOffset + 8, littleEndian)
      }

      if (valueOffset + count > view.byteLength) continue

      // Read ASCII string
      let str = ""
      for (let j = 0; j < count - 1; j++) {
        // count includes null terminator
        str += String.fromCharCode(view.getUint8(valueOffset + j))
      }

      if (str.trim()) {
        result[tagName] = str.trim()
      }
    }
  } catch {
    // Parsing failure is non-critical
  }
}

function findTagValue(
  view: DataView,
  ifdOffset: number,
  littleEndian: boolean,
  targetTag: number
): number | undefined {
  try {
    const entryCount = view.getUint16(ifdOffset, littleEndian)

    for (let i = 0; i < entryCount; i++) {
      const entryOffset = ifdOffset + 2 + i * 12
      if (entryOffset + 12 > view.byteLength) break

      const tag = view.getUint16(entryOffset, littleEndian)
      if (tag === targetTag) {
        const type = view.getUint16(entryOffset + 2, littleEndian)
        // LONG (type 4) or SHORT (type 3)
        if (type === 4) {
          return view.getUint32(entryOffset + 8, littleEndian)
        } else if (type === 3) {
          return view.getUint16(entryOffset + 8, littleEndian)
        }
      }
    }
  } catch {
    // Non-critical
  }
  return undefined
}
