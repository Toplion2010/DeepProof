/**
 * Document analysis types and utilities
 */

import type { DocumentExtraction } from "@/lib/document-extract"

export type DocumentPipelineStep =
  | "idle"
  | "extracting"
  | "analyzing"
  | "scoring"
  | "complete"
  | "failed"

export type DocumentFindingType =
  | "suspicious-metadata"
  | "inconsistent-fonts"
  | "image-tampering"
  | "ocr-mismatch"
  | "compression-artifacts"
  | "missing-elements"
  | "layout-anomaly"
  | "text-inconsistency"
  | "authentic-signal"

export interface DocumentFinding {
  type: DocumentFindingType
  severity: "low" | "medium" | "high"
  description: string
  source: "vision" | "metadata" | "text-analysis" | "system"
}

export interface MetadataSignals {
  hasCreationDate: boolean
  hasModificationDate: boolean
  creationAfterModification: boolean
  producerIsKnown: boolean
  producerName: string
  metadataScore: number // 0–100
  flags: string[]
}

/**
 * Score threshold constants - single source of truth
 * Used by ScoreGauge, DocumentScoreCard, and explanation text
 */
export const DOCUMENT_SCORE_THRESHOLDS = {
  LIKELY_AUTHENTIC: 30, // score <= this → green / "Likely Authentic"
  UNCERTAIN: 60, // score <= this → amber / "Uncertain"
  // score > UNCERTAIN → red / "Likely Fraudulent"
} as const

/**
 * Compute metadata signals and score from extraction data
 * Pure function, deterministic, no network
 */
export function computeMetadataSignals(
  extraction: DocumentExtraction
): MetadataSignals {
  let base = 0
  const flags: string[] = []

  const hasCreationDate = !!extraction.pdfCreationDate
  const hasModificationDate = !!extraction.pdfModificationDate
  let creationAfterModification = false

  // Check if creation date is after modification date (impossible, very suspicious)
  if (hasCreationDate && hasModificationDate) {
    const creationTime = new Date(extraction.pdfCreationDate!).getTime()
    const modificationTime = new Date(extraction.pdfModificationDate!).getTime()

    if (!isNaN(creationTime) && !isNaN(modificationTime)) {
      if (creationTime > modificationTime) {
        base += 35
        flags.push("Creation date is after modification date")
        creationAfterModification = true
      }
    }
  }

  // Check producer name
  const producerName = extraction.pdfProducer || ""
  const producerIsKnown =
    producerName.length > 0 && producerName.toLowerCase() !== "unknown"

  if (!producerIsKnown) {
    base += 10
    flags.push("Unknown or missing PDF producer")
  }

  // Check for suspicious producer software
  const suspiciousProducers = ["paint", "gimp", "mspaint"]
  if (suspiciousProducers.some((name) => producerName.toLowerCase().includes(name))) {
    base += 20
    flags.push(`Suspicious PDF producer: ${producerName}`)
  }

  const metadataScore = Math.min(100, Math.max(0, base))

  return {
    hasCreationDate,
    hasModificationDate,
    creationAfterModification,
    producerIsKnown,
    producerName,
    metadataScore,
    flags,
  }
}
