export interface ContentProfile {
  type: "face-heavy" | "speech-heavy" | "balanced" | "visual-only" | "text-only"
  weights: { visual: number; text: number }
  reason: string
}

export function computeContentProfile(
  facesDetected: number,
  framesAnalyzed: number,
  transcriptLength: number | undefined,
  hasAudio: boolean,
  hasFrames: boolean
): ContentProfile {
  if (!hasFrames && !hasAudio) {
    return { type: "balanced", weights: { visual: 0.6, text: 0.4 }, reason: "No frames or audio available" }
  }

  if (!hasAudio || transcriptLength === undefined) {
    return { type: "visual-only", weights: { visual: 1.0, text: 0.0 }, reason: "No audio track detected" }
  }

  if (!hasFrames) {
    return { type: "text-only", weights: { visual: 0.0, text: 1.0 }, reason: "No video frames available" }
  }

  const faceRatio = framesAnalyzed > 0 ? facesDetected / framesAnalyzed : 0

  if (faceRatio > 0.6 && transcriptLength < 200) {
    return { type: "face-heavy", weights: { visual: 0.7, text: 0.3 }, reason: "High face presence with minimal speech" }
  }

  if (faceRatio < 0.3 && transcriptLength > 500) {
    return { type: "speech-heavy", weights: { visual: 0.4, text: 0.6 }, reason: "Low face presence with extensive speech" }
  }

  return { type: "balanced", weights: { visual: 0.6, text: 0.4 }, reason: "Balanced visual and audio content" }
}
