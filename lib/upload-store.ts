/**
 * Store for sharing the uploaded video file between the home page and results page.
 * Uses in-memory store with IndexedDB fallback for iOS Safari, which does
 * full page reloads on navigation and wipes JS context.
 *
 * Files are stored as ArrayBuffer + metadata in IDB (raw File objects
 * are not reliably supported across all browsers).
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

interface StoredFileData {
  buffer: ArrayBuffer
  name: string
  type: string
  size: number
  lastModified: number
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function persistToIDB(file: File): Promise<void> {
  try {
    const buffer = await file.arrayBuffer()
    const data: StoredFileData = {
      buffer,
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified,
    }
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.objectStore(STORE_NAME).put(data, FILE_KEY)
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
    const data = await new Promise<StoredFileData | null>((resolve, reject) => {
      req.onsuccess = () => {
        const result = req.result
        if (result && result.buffer instanceof ArrayBuffer) {
          resolve(result as StoredFileData)
        } else {
          resolve(null)
        }
      }
      req.onerror = () => reject(req.error)
    })
    db.close()
    if (!data) return null
    return new File([data.buffer], data.name, {
      type: data.type,
      lastModified: data.lastModified,
    })
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

/**
 * Store the file in memory AND persist to IndexedDB.
 * Returns a promise that resolves once IDB write is complete.
 * Call this early (e.g. when user clicks "Analyze") so the write
 * finishes before navigation happens.
 */
export async function setUploadedFile(file: File): Promise<void> {
  if (stored?.objectUrl) {
    URL.revokeObjectURL(stored.objectUrl)
  }
  stored = buildInfo(file)
  await persistToIDB(file)
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
