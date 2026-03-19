import { pipeline, type ImageClassificationPipeline } from "@huggingface/transformers"

export interface FrameDetectionResult {
  perFrameScores: number[]
  averageScore: number
  facesDetected: number
  confidence: "low" | "medium" | "high"
  framesAnalyzed: number
  modelId: string
  degraded: boolean
  error?: string
}

const MODEL_ID = "onnx-community/Deep-Fake-Detector-v2-Model-ONNX"

let classifierPromise: Promise<ImageClassificationPipeline> | null = null

function getClassifier(): Promise<ImageClassificationPipeline> {
  if (!classifierPromise) {
    classifierPromise = pipeline("image-classification", MODEL_ID, {
      dtype: "q8",
    }) as Promise<ImageClassificationPipeline>
  }
  return classifierPromise
}

export async function detectDeepfakeFrames(
  base64Frames: string[],
  onProgress?: (msg: string) => void
): Promise<FrameDetectionResult> {
  try {
    onProgress?.("Loading deepfake detection model...")
    const classifier = await getClassifier()
    onProgress?.("Model loaded. Analyzing frames...")

    const perFrameScores: number[] = []
    let facesDetected = 0

    for (let i = 0; i < base64Frames.length; i++) {
      onProgress?.(`Analyzing frame ${i + 1}/${base64Frames.length}...`)

      const imageUrl = `data:image/jpeg;base64,${base64Frames[i]}`

      try {
        const results = await classifier(imageUrl)
        const resultArray = Array.isArray(results) ? results : [results]

        // Find the "Deepfake" or "Fake" label score
        const fakeResult = resultArray.find(
          (r: { label: string }) =>
            r.label.toLowerCase().includes("fake") ||
            r.label.toLowerCase().includes("deepfake")
        )
        const fakeScore = fakeResult
          ? Math.round((fakeResult as { score: number }).score * 100)
          : 0
        perFrameScores.push(fakeScore)

        // If model classified with confidence > 30%, a face was likely present
        const maxScore = Math.max(
          ...resultArray.map((r: { score: number }) => r.score)
        )
        if (maxScore > 0.3) facesDetected++
      } catch {
        perFrameScores.push(50) // neutral score for failed frame
      }
    }

    const averageScore =
      perFrameScores.length > 0
        ? Math.round(
            perFrameScores.reduce((a, b) => a + b, 0) / perFrameScores.length
          )
        : 0

    const confidence: "low" | "medium" | "high" =
      averageScore < 30 || averageScore > 70
        ? "high"
        : averageScore < 40 || averageScore > 60
          ? "medium"
          : "low"

    return {
      perFrameScores,
      averageScore,
      facesDetected,
      confidence,
      framesAnalyzed: perFrameScores.length,
      modelId: MODEL_ID,
      degraded: false,
    }
  } catch (error) {
    console.error("Deepfake detector failed:", error)
    return {
      perFrameScores: [],
      averageScore: 0,
      facesDetected: 0,
      confidence: "low",
      framesAnalyzed: 0,
      modelId: MODEL_ID,
      degraded: true,
      error: error instanceof Error ? error.message : "Detector failed",
    }
  }
}
