/**
 * Simple in-memory store for sharing the uploaded video file
 * between the home page (upload) and the results page.
 * Works because Next.js client-side navigation preserves JS context.
 */

export interface UploadedFileInfo {
  file: File
  name: string
  size: number
  sizeFormatted: string
  type: string
  objectUrl: string
}

let stored: UploadedFileInfo | null = null

export function setUploadedFile(file: File) {
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
    type: file.type,
    objectUrl: URL.createObjectURL(file),
  }
}

export function getUploadedFile(): UploadedFileInfo | null {
  return stored
}

export function clearUploadedFile() {
  if (stored?.objectUrl) {
    URL.revokeObjectURL(stored.objectUrl)
  }
  stored = null
}
