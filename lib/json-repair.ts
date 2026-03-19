export interface JsonRepairResult<T> {
  data: T | null
  repaired: boolean
  error?: string
}

export function parseAndRepairJson<T>(raw: string): JsonRepairResult<T> {
  const trimmed = raw.trim()

  // Step 1: Direct parse
  try {
    return { data: JSON.parse(trimmed) as T, repaired: false }
  } catch {}

  // Step 2: Strip markdown code fences
  let cleaned = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()

  try {
    return { data: JSON.parse(cleaned) as T, repaired: true }
  } catch {}

  // Step 3: Fix trailing commas before } or ]
  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1")

  try {
    return { data: JSON.parse(cleaned) as T, repaired: true }
  } catch {}

  // Step 4: Extract JSON object/array from surrounding text
  const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
  if (jsonMatch) {
    try {
      const extracted = jsonMatch[1].replace(/,\s*([}\]])/g, "$1")
      return { data: JSON.parse(extracted) as T, repaired: true }
    } catch {}
  }

  return { data: null, repaired: false, error: "Failed to parse or repair JSON" }
}

export function validateAnalysisResponse(
  data: unknown
): data is {
  overallScore: number
  explanation: string
  claims: Array<{ text: string; status: string; detail: string }>
} {
  if (!data || typeof data !== "object") return false
  const obj = data as Record<string, unknown>
  return (
    typeof obj.overallScore === "number" &&
    obj.overallScore >= 0 &&
    obj.overallScore <= 100 &&
    typeof obj.explanation === "string" &&
    Array.isArray(obj.claims)
  )
}
