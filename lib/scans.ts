export interface ScanRow {
  id: string
  file_name: string
  file_type: "video" | "document" | "image"
  score: number
  status: "authentic" | "deepfake" | "inconclusive"
  duration_ms: number | null
  created_at: string
}

export async function saveScan(params: {
  fileName: string
  fileType: "video" | "document" | "image"
  score: number
  durationMs?: number
}): Promise<ScanRow | null> {
  try {
    const res = await fetch("/api/scans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    })
    if (!res.ok) return null
    const { scan } = await res.json()
    return scan ?? null
  } catch (err) {
    console.error("Failed to save scan:", err)
    return null
  }
}

export async function fetchRecentScans(limit = 10): Promise<ScanRow[]> {
  try {
    const res = await fetch(`/api/scans?limit=${limit}`)
    if (!res.ok) return []
    const { scans } = await res.json()
    return scans ?? []
  } catch (err) {
    console.error("Failed to fetch scans:", err)
    return []
  }
}
