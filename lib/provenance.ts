export interface ProvenanceRecord {
  analysisVersion: string
  frameHashes: string[]
  timestamps: Record<string, string>
  modelsUsed: string[]
  searchSourceURLs: string[]
  degraded: string[]
  fallbackUsed: boolean
  pipelineDurationMs: number
  visionDurationMs: number
  searchDurationMs: number
  analysisDurationMs: number
  forensicDurationMs: number
  temporalDurationMs: number
  frameExplanationDurationMs: number
  frameExplanationMode: string | null
  scoreWeights: { visual: number; text: number } | null
  contentProfile: string | null
}

export function createProvenance(): ProvenanceRecord {
  return {
    analysisVersion: "3.0.0-phase3",
    frameHashes: [],
    timestamps: {},
    modelsUsed: [],
    searchSourceURLs: [],
    degraded: [],
    fallbackUsed: false,
    pipelineDurationMs: 0,
    visionDurationMs: 0,
    searchDurationMs: 0,
    analysisDurationMs: 0,
    forensicDurationMs: 0,
    temporalDurationMs: 0,
    frameExplanationDurationMs: 0,
    frameExplanationMode: null,
    scoreWeights: null,
    contentProfile: null,
  }
}

export function recordStep(provenance: ProvenanceRecord, step: string): void {
  provenance.timestamps[step] = new Date().toISOString()
}

export function addModel(provenance: ProvenanceRecord, modelId: string): void {
  if (!provenance.modelsUsed.includes(modelId)) {
    provenance.modelsUsed.push(modelId)
  }
}

export function recordDuration(
  provenance: ProvenanceRecord,
  field: "pipelineDurationMs" | "visionDurationMs" | "searchDurationMs" | "analysisDurationMs" | "forensicDurationMs" | "temporalDurationMs" | "frameExplanationDurationMs",
  ms: number
): void {
  provenance[field] = ms
}

export async function hashFrame(base64: string): Promise<string> {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}
