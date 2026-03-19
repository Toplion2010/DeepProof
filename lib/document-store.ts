/**
 * Simple in-memory store for sharing the uploaded document file
 * between the documents page (upload) and the results page.
 * Works because Next.js client-side navigation preserves JS context.
 */

export interface UploadedDocumentInfo {
  file: File
  name: string
  size: number
  sizeFormatted: string
  type: "application/pdf" | "image/jpeg" | "image/png" | "image/webp"
  objectUrl: string
}

let stored: UploadedDocumentInfo | null = null

export function setUploadedDocument(file: File) {
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
    type: file.type as UploadedDocumentInfo["type"],
    objectUrl: URL.createObjectURL(file),
  }
}

export function getUploadedDocument(): UploadedDocumentInfo | null {
  return stored
}

export function clearUploadedDocument() {
  if (stored?.objectUrl) {
    URL.revokeObjectURL(stored.objectUrl)
  }
  stored = null
}
