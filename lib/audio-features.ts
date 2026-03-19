/**
 * Audio feature extraction using Web Audio API.
 * Extracts RMS energy, zero crossing rate, and spectral centroid per segment.
 */

export interface AudioSegmentFeatures {
  startTime: number
  endTime: number
  rmsEnergy: number
  zeroCrossingRate: number
  spectralCentroid: number
}

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext()
  }
  return audioCtx
}

/**
 * Extract audio features for each transcript segment.
 * Fetches video as blob to avoid CORS issues with decodeAudioData.
 *
 * @returns Empty array if audio < 2s or decoding fails (triggers clustering fallback)
 */
export async function extractAudioFeatures(
  videoUrl: string,
  segments: Array<{ start: number; end: number }>
): Promise<AudioSegmentFeatures[]> {
  if (!segments || segments.length === 0) return []

  try {
    // Fetch as blob for CORS safety
    const response = await fetch(videoUrl)
    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)

    const ctx = getAudioContext()
    const arrayBuffer = await (await fetch(blobUrl)).arrayBuffer()
    URL.revokeObjectURL(blobUrl)

    const audioBuffer = await ctx.decodeAudioData(arrayBuffer)

    // Audio duration guard
    if (audioBuffer.duration < 2) return []

    const channelData = audioBuffer.getChannelData(0) // mono
    const sampleRate = audioBuffer.sampleRate

    const features: AudioSegmentFeatures[] = []

    for (const seg of segments) {
      const startSample = Math.floor(seg.start * sampleRate)
      const endSample = Math.min(Math.floor(seg.end * sampleRate), channelData.length)

      if (endSample <= startSample || endSample - startSample < 256) {
        continue
      }

      const samples = channelData.slice(startSample, endSample)
      features.push({
        startTime: seg.start,
        endTime: seg.end,
        rmsEnergy: computeRMS(samples),
        zeroCrossingRate: computeZCR(samples),
        spectralCentroid: computeSpectralCentroid(samples, sampleRate),
      })
    }

    return features
  } catch {
    return []
  }
}

function computeRMS(samples: Float32Array): number {
  let sum = 0
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i]
  }
  return Math.sqrt(sum / samples.length)
}

function computeZCR(samples: Float32Array): number {
  let crossings = 0
  for (let i = 1; i < samples.length; i++) {
    if ((samples[i] >= 0 && samples[i - 1] < 0) || (samples[i] < 0 && samples[i - 1] >= 0)) {
      crossings++
    }
  }
  return crossings / samples.length
}

function computeSpectralCentroid(samples: Float32Array, sampleRate: number): number {
  // Simple DFT-based spectral centroid on a windowed segment
  const N = Math.min(2048, samples.length)
  const windowed = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    // Hann window
    windowed[i] = samples[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)))
  }

  // Compute magnitude spectrum (real DFT, first half)
  const halfN = Math.floor(N / 2)
  let weightedSum = 0
  let magnitudeSum = 0

  for (let k = 0; k < halfN; k++) {
    let real = 0
    let imag = 0
    for (let n = 0; n < N; n++) {
      const angle = (2 * Math.PI * k * n) / N
      real += windowed[n] * Math.cos(angle)
      imag -= windowed[n] * Math.sin(angle)
    }
    const magnitude = Math.sqrt(real * real + imag * imag)
    const frequency = (k * sampleRate) / N
    weightedSum += frequency * magnitude
    magnitudeSum += magnitude
  }

  return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0
}
