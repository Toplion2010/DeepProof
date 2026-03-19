/**
 * Simple in-memory store for sharing the uploaded image file
 * between the images page (upload) and the results page.
 * Works because Next.js client-side navigation preserves JS context.
 */

export interface UploadedImageInfo {
  file: File
  name: string
  size: number
  sizeFormatted: string
  type: "image/jpeg" | "image/png" | "image/webp"
  objectUrl: string
}

let stored: UploadedImageInfo | null = null

export function setUploadedImage(file: File) {
  // Revoke previous object URL if any
  if (stored?.objectUrl) {
    URL.revokeObjectURL(stored.objectUrl)
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  stored = {
    file,
    name: file.name,
    size: file.size,
    sizeFormatted: formatSize(file.size),
    type: file.type as UploadedImageInfo["type"],
    objectUrl: URL.createObjectURL(file),
  }
}

export function getUploadedImage(): UploadedImageInfo | null {
  return stored
}

export function clearUploadedImage() {
  if (stored?.objectUrl) {
    URL.revokeObjectURL(stored.objectUrl)
  }
  stored = null
}
