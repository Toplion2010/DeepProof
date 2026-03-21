/**
 * Store for sharing the uploaded video file between the home page and results page.
 * Uses in-memory store with IndexedDB fallback for iOS Safari, which may
 * do a full page reload on navigation and wipe JS context.
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

const DB_NAME = "deepproof-uploads"
const STORE_NAME = "files"
const FILE_KEY = "current-upload"

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function persistToIDB(file: File): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.objectStore(STORE_NAME).put(file, FILE_KEY)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // IndexedDB unavailable — fall back to memory-only
  }
}

async function loadFromIDB(): Promise<File | null> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, "readonly")
    const req = tx.objectStore(STORE_NAME).get(FILE_KEY)
    const file = await new Promise<File | null>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result instanceof File ? req.result : null)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return file
  } catch {
    return null
  }
}

async function clearIDB(): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.objectStore(STORE_NAME).delete(FILE_KEY)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // ignore
  }
}

const formatSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function buildInfo(file: File): UploadedFileInfo {
  return {
    file,
    name: file.name,
    size: file.size,
    sizeFormatted: formatSize(file.size),
    type: file.type,
    objectUrl: URL.createObjectURL(file),
  }
}

export function setUploadedFile(file: File) {
  if (stored?.objectUrl) {
    URL.revokeObjectURL(stored.objectUrl)
  }
  stored = buildInfo(file)
  // Persist to IndexedDB in background (for iOS Safari)
  persistToIDB(file)
}

export function getUploadedFile(): UploadedFileInfo | null {
  return stored
}

/**
 * Async getter that falls back to IndexedDB if memory store is empty.
 * Use this on the results page to recover from iOS Safari full-page reloads.
 */
export async function getUploadedFileAsync(): Promise<UploadedFileInfo | null> {
  if (stored) return stored
  const file = await loadFromIDB()
  if (!file) return null
  stored = buildInfo(file)
  return stored
}

export function clearUploadedFile() {
  if (stored?.objectUrl) {
    URL.revokeObjectURL(stored.objectUrl)
  }
  stored = null
  clearIDB()
}
