/**
 * Image analysis types and utilities
 */

export type ImagePipelineStep =
  | "idle"
  | "extracting"
  | "analyzing"
  | "scoring"
  | "complete"
  | "failed"

export type ImageFindingType =
  | "ai-patterns"
  | "compression-artifacts"
  | "upsampling-traces"
  | "metadata-inconsistency"
  | "layout-anomaly"
  | "authentic-signal"

export interface ImageFinding {
  type: ImageFindingType
  severity: "low" | "medium" | "high"
  description: string
  source: "vision" | "metadata" | "system"
}

export interface MetadataSignals {
  hasExif: boolean
  editorDetected: boolean
  editorName: string
  metadataScore: number // 0–100
  flags: string[]
}

/**
 * Score threshold constants
 */
export const IMAGE_SCORE_THRESHOLDS = {
  LIKELY_AUTHENTIC: 30,
  UNCERTAIN: 60,
} as const

const AI_TOOLS = ["dall-e", "dalle", "midjourney", "stable diffusion", "comfyui", "automatic1111", "novelai", "leonardo"]
const SUSPICIOUS_EDITORS = ["paint", "gimp", "mspaint"]

/**
 * Compute metadata signals and score from EXIF data.
 * Pure function, deterministic, no network.
 */
export function computeImageMetadataSignals(
  exifData?: Record<string, string>,
): MetadataSignals {
  let base = 0
  const flags: string[] = []
  let editorDetected = false
  let editorName = ""

  if (!exifData || Object.keys(exifData).length === 0) {
    base += 15
    flags.push("No EXIF metadata found (common in AI-generated images)")

    return {
      hasExif: false,
      editorDetected: false,
      editorName: "",
      metadataScore: Math.min(100, Math.max(0, base)),
      flags,
    }
  }

  const software = (exifData.Software || "").toLowerCase()
  const make = exifData.Make || ""
  const model = exifData.Model || ""
  const dateTimeOriginal = exifData.DateTimeOriginal || ""

  // Check for AI generation tools
  if (software && AI_TOOLS.some((tool) => software.includes(tool))) {
    base += 30
    editorDetected = true
    editorName = exifData.Software || ""
    flags.push(`AI generation software detected: ${editorName}`)
  }

  // Check for suspicious image editors
  if (software && SUSPICIOUS_EDITORS.some((name) => software.includes(name))) {
    base += 10
    editorDetected = true
    editorName = editorName || exifData.Software || ""
    flags.push(`Image editing software detected: ${exifData.Software}`)
  }

  // Missing original capture timestamp
  if (!dateTimeOriginal) {
    base += 5
    flags.push("Missing original capture timestamp")
  }

  // Software present but no camera info
  if (software && !make && !model) {
    base += 10
    flags.push("Software metadata without camera information")
  }

  return {
    hasExif: true,
    editorDetected,
    editorName,
    metadataScore: Math.min(100, Math.max(0, base)),
    flags,
  }
}
