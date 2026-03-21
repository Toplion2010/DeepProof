"use client"

import { useEffect, useState, useRef } from "react"
import { DeepProofHeader } from "@/components/deepproof-header"
import { ScoreGauge } from "@/components/results/score-gauge"
import { AnalysisExplanation } from "@/components/results/analysis-explanation"
import { VideoAnalysisCard, AudioAnalysisCard } from "@/components/results/analysis-cards"
import { TranscriptSection } from "@/components/results/transcript-section"
import { FactCheckSection } from "@/components/results/fact-check-section"
import type { ClaimStatus } from "@/components/results/fact-check-section"
import { ArrowLeft, Download, Share2, FileVideo, Info, HardDrive, Film, Clock, Ratio, Calendar, Loader2, Mic, Brain, Languages, CheckCircle2, AlertTriangle, RefreshCw, Eye, Calculator, Search, Sparkles, Shield, Waves, ImageIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { getUploadedFile, type UploadedFileInfo } from "@/lib/upload-store"
import { transcribeVideo, type TranscriptionResult } from "@/lib/transcribe"
import { extractFrames, extractSequenceWindow, getTimestamps, type ExtractedFrames } from "@/lib/extract-frames"
import { detectDeepfakeFrames, type FrameDetectionResult } from "@/lib/detect-deepfake"
import { createProvenance, recordStep, addModel, recordDuration, hashFrame, type ProvenanceRecord } from "@/lib/provenance"
import { computeContentProfile, type ContentProfile } from "@/lib/score-weights"
import { runForensicAnalysis, warmUpForensicWorker, type ForensicResult } from "@/lib/forensic-analysis"
import { computeTemporalConsistency, type TemporalAnalysisResult } from "@/lib/temporal-analysis"
import { extractAudioFeatures } from "@/lib/audio-features"
import { clusterSpeakersWithTimeout, type SpeakerClusterResult } from "@/lib/speaker-cluster"
import { logMetrics, incrementMetric } from "@/lib/metrics"
import { FrameExplanationSection } from "@/components/results/frame-explanation-section"
import { computeFrameExplanationModifier, type FrameExplanationResult, type AnalysisMode } from "@/lib/frame-explanation"
import { selectFramesForExplanation, resizeFrameForExplanation, quickSimilarity } from "@/lib/frame-selection"
import { saveScan } from "@/lib/scans"

interface VideoMetadata {
  duration: string
  durationSeconds: number
  resolution: string
  fps: number
  lastModified: string
}

interface AIAnalysisResult {
  overallScore: number
  explanation: string
  claims: Array<{
    text: string
    status: ClaimStatus
    source?: string
    detail: string
    webSources?: Array<{ title: string; url: string; snippet: string }>
  }>
  degraded?: boolean
}

interface VisionResult {
  findings: string[]
  modelId: string
  degraded: boolean
  error?: string
}

interface SearchResponse {
  results: Record<string, { sources: Array<{ title: string; url: string; snippet: string; score: number }>; searchedAt: string }>
  cached: number
  errors: number
  circuitOpen: boolean
  searchDisabled: boolean
}

type PipelineStep =
  | "loading"
  | "extracting-metadata"
  | "extracting-frames"
  | "transcribing"
  | "detecting-deepfakes"
  | "forensic-analysis"
  | "temporal-analysis"
  | "analyzing-vision"
  | "searching-claims"
  | "explaining-frames"
  | "analyzing"
  | "computing-score"
  | "done"
  | "error"

const STEP_LABELS: Record<PipelineStep, string> = {
  "loading": "Initializing...",
  "extracting-metadata": "Extracting video metadata...",
  "extracting-frames": "Extracting frames & transcribing audio...",
  "transcribing": "Transcribing audio with Whisper AI...",
  "detecting-deepfakes": "Running deepfake detection on frames...",
  "forensic-analysis": "Running forensic analysis (ELA + noise)...",
  "temporal-analysis": "Analyzing temporal consistency...",
  "analyzing-vision": "Vision AI analyzing frames & searching claims...",
  "searching-claims": "Searching web for claim verification...",
  "explaining-frames": "Generating per-frame AI explanations...",
  "analyzing": "Analyzing transcript with Llama 3.3 70B...",
  "computing-score": "Computing combined score...",
  "done": "Analysis complete",
  "error": "Analysis failed",
}

export default function ResultsPage() {
  const router = useRouter()
  const [uploadedFile, setUploadedFile] = useState<UploadedFileInfo | null>(null)
  const [videoMeta, setVideoMeta] = useState<VideoMetadata | null>(null)
  const [transcript, setTranscript] = useState<TranscriptionResult | null>(null)
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null)
  const [frameDetection, setFrameDetection] = useState<FrameDetectionResult | null>(null)
  const [combinedScore, setCombinedScore] = useState<number | null>(null)
  const [degradedComponents, setDegradedComponents] = useState<string[]>([])
  const [pipelineStep, setPipelineStep] = useState<PipelineStep>("loading")
  const [progressDetail, setProgressDetail] = useState("")
  const [visionFindings, setVisionFindings] = useState<string[]>([])
  const [visionDegraded, setVisionDegraded] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null)
  const [provenance, setProvenance] = useState<ProvenanceRecord | null>(null)
  const [errorMsg, setErrorMsg] = useState("")
  const [contentProfile, setContentProfile] = useState<ContentProfile | null>(null)
  const [forensicResult, setForensicResult] = useState<ForensicResult | null>(null)
  const [temporalResult, setTemporalResult] = useState<TemporalAnalysisResult | null>(null)
  const [speakerResult, setSpeakerResult] = useState<SpeakerClusterResult | null>(null)
  const [frameExplanations, setFrameExplanations] = useState<FrameExplanationResult | null>(null)
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("deep")
  const [frameExplanationLoading, setFrameExplanationLoading] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const pipelineStarted = useRef(false)
  const isRetrying = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const allFramesRef = useRef<string[]>([])
  const timestampsRef = useRef<number[]>([])
  const frameExplanationCacheRef = useRef<FrameExplanationResult | null>(null)

  // Run the full pipeline automatically on mount
  useEffect(() => {
    if (pipelineStarted.current) return
    pipelineStarted.current = true

    const file = getUploadedFile()
    if (!file) {
      router.replace("/")
      return
    }

    setUploadedFile(file)
    runPipeline(file)
  }, [router])

  async function runPipeline(file: UploadedFileInfo) {
    // Cancel any previous pipeline run
    if (abortControllerRef.current) abortControllerRef.current.abort()
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    const degraded: string[] = []
    const provenance = createProvenance()
    const pipelineStart = Date.now()
    recordStep(provenance, "start")

    try {
      // Step 1: Extract video metadata + warm up forensic worker
      setPipelineStep("extracting-metadata")
      setProgressDetail("Reading video properties...")
      warmUpForensicWorker()
      const meta = await extractVideoMetadata(file)
      setVideoMeta(meta)
      recordStep(provenance, "metadata")

      // Step 2: Extract frames + Transcribe — IN PARALLEL
      setPipelineStep("extracting-frames")
      setProgressDetail("Extracting frames and transcribing audio in parallel...")

      const [framesResult, transcriptionResult] = await Promise.allSettled([
        extractFrames(file.objectUrl),
        transcribeVideo(file.objectUrl, (msg) => setProgressDetail(msg)),
      ])
      recordStep(provenance, "frames-and-transcription")

      // Handle transcription result
      let transcription: TranscriptionResult | null = null
      if (transcriptionResult.status === "fulfilled") {
        transcription = transcriptionResult.value
        setTranscript(transcription)
        addModel(provenance, "whisper-large-v3-turbo")
        if (!transcription.fullText || transcription.fullText.trim().length === 0) {
          degraded.push("no-audio")
          transcription = null
        }
      } else {
        degraded.push("transcription")
        console.error("Transcription failed:", transcriptionResult.reason)
      }

      // Compute frame hashes for provenance
      let allFrames: string[] = []
      if (framesResult.status === "fulfilled" && framesResult.value.frames.length > 0) {
        allFrames = framesResult.value.frames
        allFramesRef.current = allFrames
        timestampsRef.current = getTimestamps(meta.durationSeconds, allFrames.length)
        try {
          provenance.frameHashes = await Promise.all(allFrames.map(hashFrame))
        } catch {
          // Non-critical — skip if hashing fails
        }
      }

      // Step 3: Run deepfake detector + forensic analysis on frames — IN PARALLEL
      let detection: FrameDetectionResult | null = null
      let forensic: ForensicResult | null = null
      if (allFrames.length > 0) {
        setPipelineStep("detecting-deepfakes")
        setProgressDetail("Running deepfake detection and forensic analysis...")

        const forensicStart = Date.now()
        const [detectionResult, forensicResult] = await Promise.allSettled([
          detectDeepfakeFrames(allFrames, (msg) => setProgressDetail(msg)),
          runForensicAnalysis(allFrames, (msg) => setProgressDetail(msg)),
        ])

        if (detectionResult.status === "fulfilled") {
          detection = detectionResult.value
          setFrameDetection(detection)
          addModel(provenance, detection.modelId)
          if (detection.degraded) degraded.push("visual-detector")
        } else {
          degraded.push("visual-detector")
        }

        if (forensicResult.status === "fulfilled" && !forensicResult.value.degraded) {
          forensic = forensicResult.value
          setForensicResult(forensic)
        } else {
          degraded.push("forensic")
        }
        recordDuration(provenance, "forensicDurationMs", Date.now() - forensicStart)
      } else {
        degraded.push("frame-extraction")
      }
      recordStep(provenance, "detection")

      // Step 3b: Conditional temporal analysis
      let temporal: TemporalAnalysisResult | null = null
      if (
        detection &&
        !detection.degraded &&
        detection.perFrameScores.some((s) => s > 50) &&
        meta.durationSeconds >= 1
      ) {
        setPipelineStep("temporal-analysis")
        setProgressDetail("Analyzing temporal consistency around suspicious frames...")
        const temporalStart = Date.now()

        try {
          // Find highest-scoring frame for center timestamp
          const highestIdx = detection.perFrameScores.reduce(
            (maxIdx, s, i, arr) => (s > arr[maxIdx] ? i : maxIdx), 0
          )
          const timestamps = getTimestamps(meta.durationSeconds, detection.framesAnalyzed)
          const centerTime = timestamps[highestIdx] ?? meta.durationSeconds / 2

          const sequenceFrames = await extractSequenceWindow(file.objectUrl, centerTime)
          if (sequenceFrames.length >= 2) {
            temporal = await computeTemporalConsistency(sequenceFrames, centerTime, (msg) => setProgressDetail(msg))
            if (temporal && !temporal.degraded) {
              setTemporalResult(temporal)
            } else {
              degraded.push("temporal")
            }
          } else {
            degraded.push("temporal")
          }
        } catch {
          degraded.push("temporal")
        }
        recordDuration(provenance, "temporalDurationMs", Date.now() - temporalStart)
      } else if (meta.durationSeconds < 1 && allFrames.length > 0) {
        degraded.push("temporal")
      }
      recordStep(provenance, "temporal")

      // Step 3c: Speaker clustering (uses audio features, runs in parallel with nothing — quick step)
      let speakerClustering: SpeakerClusterResult | null = null
      if (transcription && transcription.rawSegments && transcription.rawSegments.length > 0) {
        try {
          // Synthesize single segment if rawSegments is empty but text exists
          const segs = transcription.rawSegments.length > 0
            ? transcription.rawSegments
            : [{ start: 0, end: meta.durationSeconds, text: transcription.fullText }]

          const audioFeatures = await extractAudioFeatures(file.objectUrl, segs)
          if (audioFeatures.length > 0) {
            speakerClustering = await clusterSpeakersWithTimeout(audioFeatures)
            setSpeakerResult(speakerClustering)
          }
        } catch {
          // Non-critical — keep pause-heuristic
        }
      }
      recordStep(provenance, "speaker-clustering")

      // Step 4: Vision AI + Claim search — IN PARALLEL
      setPipelineStep("analyzing-vision")
      setProgressDetail("Vision AI analyzing frames & searching claims in parallel...")

      // Select 4 evenly-spaced frames for vision
      const visionFrames = selectEvenlySpaced(allFrames, 4)

      // Extract candidate claims for search
      const candidateClaims = transcription ? extractCandidateClaims(transcription.fullText) : []

      const visionStart = Date.now()
      const searchStart = Date.now()

      const [visionResult, searchResult] = await Promise.allSettled([
        visionFrames.length > 0
          ? fetch("/api/analyze-vision", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                frames: visionFrames,
                fileName: file.name,
                duration: meta.duration,
                consentGiven: true,
              }),
            }).then((r) => r.json() as Promise<VisionResult>)
          : Promise.resolve({ findings: [], modelId: "", degraded: true, error: "No frames" } as VisionResult),
        candidateClaims.length > 0
          ? fetch("/api/search", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ claims: candidateClaims }),
            }).then((r) => r.json() as Promise<SearchResponse>)
          : Promise.resolve({ results: {}, cached: 0, errors: 0, circuitOpen: false, searchDisabled: true } as SearchResponse),
      ])

      // Handle vision result
      let visionData: VisionResult = { findings: [], modelId: "", degraded: true }
      if (visionResult.status === "fulfilled") {
        visionData = visionResult.value
        if (visionData.modelId) addModel(provenance, visionData.modelId)
        setVisionFindings(visionData.findings)
        setVisionDegraded(visionData.degraded)
        if (visionData.degraded) degraded.push("vision")
      } else {
        degraded.push("vision")
        setVisionDegraded(true)
      }
      recordDuration(provenance, "visionDurationMs", Date.now() - visionStart)

      // Handle search result
      let searchData: SearchResponse = { results: {}, cached: 0, errors: 0, circuitOpen: false, searchDisabled: true }
      if (searchResult.status === "fulfilled") {
        searchData = searchResult.value
        setSearchResults(searchData)
        // Collect source URLs for provenance
        for (const result of Object.values(searchData.results)) {
          for (const source of result.sources) {
            if (!provenance.searchSourceURLs.includes(source.url)) {
              provenance.searchSourceURLs.push(source.url)
            }
          }
        }
      }
      recordDuration(provenance, "searchDurationMs", Date.now() - searchStart)
      recordStep(provenance, "vision-and-search")

      // Step 4b: Frame-by-frame AI explanations
      let frameExplResult: FrameExplanationResult | null = null
      if (allFrames.length > 0) {
        setPipelineStep("explaining-frames")
        setProgressDetail("Generating per-frame AI explanations...")
        setFrameExplanationLoading(true)
        const frameExplStart = Date.now()

        try {
          const selectedFrames = selectFramesForExplanation(
            allFrames,
            timestampsRef.current,
            "deep",
            detection?.perFrameScores
          )

          // Check low-memory devices
          const isLowMemory = typeof navigator !== "undefined" && "deviceMemory" in navigator && (navigator as { deviceMemory?: number }).deviceMemory !== undefined && (navigator as { deviceMemory?: number }).deviceMemory! <= 2
          const framesToUse = isLowMemory ? selectedFrames.slice(0, 3) : selectedFrames

          // Resize frames for API
          const resizedFrames = await Promise.all(
            framesToUse.map(async (f) => {
              try {
                const resized = await resizeFrameForExplanation(f.base64)
                return { ...f, base64: resized }
              } catch {
                return f
              }
            })
          )

          // Filter out invalid frames
          const validFrames = resizedFrames.filter((f) => f.base64 && f.base64.length > 0)

          if (validFrames.length > 0) {
            // Build forensic hints
            const forensicHintsData = forensic && !forensic.degraded
              ? validFrames.map((f) => ({
                  frameIndex: f.index,
                  elaScore: forensic.elaScore,
                  noiseScore: forensic.noiseScore,
                }))
              : undefined

            const frameExplResponse = await fetch("/api/analyze-frames", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                frames: validFrames.map((f) => ({
                  base64: f.base64,
                  index: f.index,
                  timestamp: f.timestamp,
                })),
                fileName: file.name,
                duration: meta.duration,
                mode: "deep",
                perFrameScores: detection?.perFrameScores,
                forensicHints: forensicHintsData,
              }),
            })

            frameExplResult = await frameExplResponse.json() as FrameExplanationResult
            if (frameExplResult.modelId) addModel(provenance, frameExplResult.modelId)
            setFrameExplanations(frameExplResult)
            frameExplanationCacheRef.current = frameExplResult
            if (frameExplResult.degraded) degraded.push("frame-explanations")
          }
        } catch (err) {
          console.error("Frame explanation failed:", err)
          degraded.push("frame-explanations")
        } finally {
          setFrameExplanationLoading(false)
          recordDuration(provenance, "frameExplanationDurationMs", Date.now() - frameExplStart)
        }
      }
      recordStep(provenance, "frame-explanations")

      // Step 5: LLM transcript analysis (if transcription succeeded)
      let analysis: AIAnalysisResult | null = null
      if (transcription) {
        setPipelineStep("analyzing")
        setProgressDetail("Llama 3.3 70B is evaluating claims and credibility...")
        const analysisStart = Date.now()

        const analyzeBody: Record<string, unknown> = {
          transcript: transcription.fullText,
          fileName: file.name,
          duration: meta.duration,
          resolution: meta.resolution,
          language: transcription.language,
        }

        // Include search context if available
        if (Object.keys(searchData.results).length > 0) {
          analyzeBody.searchContext = searchData.results
        }

        // Include vision findings if available
        if (visionData.findings.length > 0) {
          analyzeBody.visionFindings = visionData.findings
        }

        // Include forensic findings if available
        if (forensic && !forensic.degraded) {
          analyzeBody.forensicFindings = [...forensic.elaFindings, ...forensic.noiseFindings]
        }

        // Include temporal findings if available
        if (temporal && !temporal.degraded) {
          analyzeBody.temporalFindings = temporal.findings
        }

        // Include frame explanation findings if available
        if (frameExplResult && !frameExplResult.degraded && frameExplResult.frames.length > 0) {
          analyzeBody.frameExplanationFindings = frameExplResult.frames.map(
            (f) => `Frame ${f.frameIndex} (${f.timestamp.toFixed(1)}s): ${f.summary}`
          )
        }

        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(analyzeBody),
        })

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}))
          throw new Error(errData.error || `Analysis failed (${response.status})`)
        }

        analysis = await response.json()

        if (typeof analysis?.overallScore !== "number" || !analysis?.explanation) {
          throw new Error("AI returned an unexpected response format")
        }

        addModel(provenance, "llama-3.3-70b-versatile")
        setAiAnalysis(analysis)
        if (analysis.degraded) degraded.push("llm-analysis")
        recordDuration(provenance, "analysisDurationMs", Date.now() - analysisStart)
      }
      recordStep(provenance, "analysis")

      // Step 6: Compute combined score with content-aware weights
      setPipelineStep("computing-score")
      let rawVisualScore = detection && !detection.degraded ? detection.averageScore : 0
      let textScore = analysis?.overallScore ?? 0
      if (Number.isNaN(rawVisualScore)) rawVisualScore = 0
      if (Number.isNaN(textScore)) textScore = 0

      // Integrate forensic scores into visual score
      let elaScore = forensic && !forensic.degraded ? forensic.elaScore : 0
      let noiseScore = forensic && !forensic.degraded ? forensic.noiseScore : 0
      if (Number.isNaN(elaScore)) elaScore = 0
      if (Number.isNaN(noiseScore)) noiseScore = 0

      let visualScore = forensic && !forensic.degraded
        ? rawVisualScore * 0.85 + elaScore * 0.10 + noiseScore * 0.05
        : rawVisualScore

      // Apply temporal modifier (capped at +-5 points)
      if (temporal && !temporal.degraded) {
        let temporalModifier = temporal.consistencyScore * 0.05
        if (Number.isNaN(temporalModifier)) temporalModifier = 0
        visualScore += Math.max(-5, Math.min(5, temporalModifier))
      }

      // Apply frame explanation modifier — reduce score when vision LLM
      // finds only benign anomalies (e.g. compression artifacts)
      if (frameExplResult && !frameExplResult.degraded && frameExplResult.frames.length > 0) {
        visualScore += computeFrameExplanationModifier(frameExplResult)
      }
      visualScore = Math.max(0, Math.min(100, visualScore))

      const hasVisual = detection && !detection.degraded
      const hasText = !!analysis
      const hasAudio = !!transcription
      const hasFrames = allFrames.length > 0 && hasVisual

      const profile = computeContentProfile(
        detection?.facesDetected ?? 0,
        detection?.framesAnalyzed ?? 0,
        transcription?.fullText?.length,
        hasAudio,
        hasFrames
      )
      setContentProfile(profile)

      // Override weights if only one modality available
      const weights = hasVisual && hasText
        ? profile.weights
        : hasVisual
          ? { visual: 1, text: 0 }
          : { visual: 0, text: 1 }

      provenance.scoreWeights = weights
      provenance.contentProfile = profile.type

      const combined = Math.max(0, Math.min(100,
        Math.round(visualScore * weights.visual + textScore * weights.text)
      ))
      setCombinedScore(combined)

      provenance.degraded = degraded
      if (degraded.length > 0) {
        provenance.fallbackUsed = true
        incrementMetric("pipeline.degraded_count")
      }
      recordDuration(provenance, "pipelineDurationMs", Date.now() - pipelineStart)
      recordStep(provenance, "done")
      logMetrics()
      console.log("[DeepProof Provenance]", JSON.stringify(provenance))
      setProvenance(provenance)

      setDegradedComponents(degraded)

      await saveScan({
        fileName: file.name,
        fileType: "video",
        score: combined,
        durationMs: Date.now() - pipelineStart,
      })

      setPipelineStep("done")
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Pipeline failed")
      setDegradedComponents(degraded)
      setPipelineStep("error")
      pipelineStarted.current = false
      isRetrying.current = false
    }
  }

  async function retryAnalysis() {
    if (!uploadedFile || !transcript || !videoMeta) return
    if (isRetrying.current) return
    isRetrying.current = true

    setPipelineStep("analyzing")
    setProgressDetail("Retrying Llama 3.3 70B analysis...")
    setErrorMsg("")
    try {
      const analyzeBody: Record<string, unknown> = {
        transcript: transcript.fullText,
        fileName: uploadedFile.name,
        duration: videoMeta.duration,
        resolution: videoMeta.resolution,
        language: transcript.language,
      }

      if (searchResults?.results && Object.keys(searchResults.results).length > 0) {
        analyzeBody.searchContext = searchResults.results
      }

      if (visionFindings?.length > 0) {
        analyzeBody.visionFindings = visionFindings
      }

      // Include forensic findings if available
      if (forensicResult && !forensicResult.degraded) {
        analyzeBody.forensicFindings = [...forensicResult.elaFindings, ...forensicResult.noiseFindings]
      }

      // Include temporal findings if available
      if (temporalResult && !temporalResult.degraded) {
        analyzeBody.temporalFindings = temporalResult.findings
      }

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(analyzeBody),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || `Analysis failed (${response.status})`)
      }

      const analysis = await response.json()
      if (typeof analysis.overallScore !== "number" || !analysis.explanation) {
        throw new Error("AI returned an unexpected response format")
      }

      setAiAnalysis(analysis as AIAnalysisResult)

      // Recompute combined score with content-aware weights + forensic integration
      let rawVisualScore = frameDetection && !frameDetection.degraded ? frameDetection.averageScore : 0
      if (Number.isNaN(rawVisualScore)) rawVisualScore = 0
      let elaS = forensicResult && !forensicResult.degraded ? forensicResult.elaScore : 0
      let noiseS = forensicResult && !forensicResult.degraded ? forensicResult.noiseScore : 0
      if (Number.isNaN(elaS)) elaS = 0
      if (Number.isNaN(noiseS)) noiseS = 0
      let visualScore = forensicResult && !forensicResult.degraded
        ? rawVisualScore * 0.85 + elaS * 0.10 + noiseS * 0.05
        : rawVisualScore
      if (frameExplanations && !frameExplanations.degraded && frameExplanations.frames.length > 0) {
        visualScore += computeFrameExplanationModifier(frameExplanations)
      }
      visualScore = Math.max(0, Math.min(100, visualScore))
      const hasVisual = frameDetection && !frameDetection.degraded
      const weights = hasVisual && contentProfile
        ? contentProfile.weights
        : hasVisual
          ? { visual: 0.7, text: 0.3 }
          : { visual: 0, text: 1 }
      const combined = Math.max(0, Math.min(100,
        Math.round(visualScore * weights.visual + analysis.overallScore * weights.text)
      ))
      setCombinedScore(combined)

      await saveScan({
        fileName: uploadedFile.name,
        fileType: "video",
        score: combined,
      })

      setPipelineStep("done")
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Retry failed")
      setPipelineStep("error")
    } finally {
      isRetrying.current = false
    }
  }

  async function handleModeChange(newMode: AnalysisMode) {
    if (newMode === analysisMode) return
    setAnalysisMode(newMode)

    if (newMode === "fast" && frameExplanationCacheRef.current) {
      // Deep→Fast: filter cached deep results to 4 frames
      const cached = frameExplanationCacheRef.current
      const filtered: FrameExplanationResult = {
        ...cached,
        frames: cached.frames.slice(0, 4),
        mode: "fast",
      }
      setFrameExplanations(filtered)
      return
    }

    // Fast→Deep: fetch new results with 12 frames
    if (newMode === "deep" && allFramesRef.current.length > 0 && videoMeta) {
      setFrameExplanationLoading(true)
      try {
        const selectedFrames = selectFramesForExplanation(
          allFramesRef.current,
          timestampsRef.current,
          "deep",
          frameDetection?.perFrameScores
        )

        const resizedFrames = await Promise.all(
          selectedFrames.map(async (f) => {
            try {
              const resized = await resizeFrameForExplanation(f.base64)
              return { ...f, base64: resized }
            } catch {
              return f
            }
          })
        )

        const validFrames = resizedFrames.filter((f) => f.base64 && f.base64.length > 0)
        if (validFrames.length === 0) return

        const response = await fetch("/api/analyze-frames", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            frames: validFrames.map((f) => ({
              base64: f.base64,
              index: f.index,
              timestamp: f.timestamp,
            })),
            fileName: uploadedFile?.name ?? "",
            duration: videoMeta.duration,
            mode: "deep",
            perFrameScores: frameDetection?.perFrameScores,
          }),
        })

        const result = await response.json() as FrameExplanationResult
        setFrameExplanations(result)
        frameExplanationCacheRef.current = result
      } catch (err) {
        console.error("Deep mode frame explanation failed:", err)
      } finally {
        setFrameExplanationLoading(false)
      }
    }
  }

  const fileName = uploadedFile?.name ?? "Unknown file"
  const fileSize = uploadedFile?.sizeFormatted ?? "—"
  const fileType = uploadedFile?.type ?? "video/mp4"
  const fileExtension = fileType.split("/")[1]?.toUpperCase() ?? "VIDEO"
  const resolution = videoMeta?.resolution ?? "1920x1080"
  const duration = videoMeta?.duration ?? "0:00"

  const isPipelineRunning = pipelineStep !== "done" && pipelineStep !== "error"
  const displayScore = combinedScore ?? aiAnalysis?.overallScore ?? 0

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <DeepProofHeader />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-8">
        {/* Top bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Analysis Report</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <FileVideo className="h-3 w-3 text-muted-foreground" />
                <span className="font-mono text-xs text-muted-foreground">
                  {fileName}
                </span>
                <span className="text-muted-foreground/40">|</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {fileSize}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground">
              <Share2 className="h-3.5 w-3.5" />
              Share
            </button>
            <button className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground">
              <Download className="h-3.5 w-3.5" />
              Export PDF
            </button>
          </div>
        </div>

        {/* Pipeline Progress Banner */}
        {(isPipelineRunning || pipelineStep === "error") && (
          <PipelineBanner step={pipelineStep} detail={progressDetail} error={errorMsg} />
        )}

        {/* Degraded Mode Indicators */}
        {pipelineStep === "done" && degradedComponents.length > 0 && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-amber-500">Partial analysis: </span>
              {degradedComponents.includes("visual-detector") || degradedComponents.includes("frame-extraction")
                ? "Visual detection unavailable — score based on transcript analysis only. "
                : ""}
              {degradedComponents.includes("no-audio")
                ? "No audio track detected — transcript analysis skipped, score based on visual analysis only. "
                : degradedComponents.includes("transcription")
                ? "Transcription failed — score based on visual analysis only. "
                : ""}
              {degradedComponents.includes("llm-analysis")
                ? "LLM analysis returned a degraded result. "
                : ""}
              {degradedComponents.includes("vision")
                ? "Vision AI analysis unavailable. "
                : ""}
              {degradedComponents.includes("forensic")
                ? "Forensic analysis unavailable. "
                : ""}
              {degradedComponents.includes("temporal")
                ? "Temporal consistency analysis skipped. "
                : ""}
            </p>
          </div>
        )}

        {/* Uploaded Video Information */}
        {uploadedFile && (
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/30">
                <Info className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Uploaded Video Information</h3>
                <p className="text-xs text-muted-foreground">Details extracted from the submitted file</p>
              </div>
            </div>
            <div className="grid gap-6 p-5 lg:grid-cols-2">
              <div className="overflow-hidden rounded-lg border border-border bg-secondary/30">
                <video
                  ref={videoRef}
                  src={uploadedFile.objectUrl}
                  controls
                  className="w-full aspect-video bg-black"
                  preload="metadata"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 content-start">
                <FileDetailItem icon={FileVideo} label="File Name" value={fileName} span />
                <FileDetailItem icon={HardDrive} label="File Size" value={fileSize} />
                <FileDetailItem icon={Film} label="Format" value={fileExtension} />
                {videoMeta && (
                  <>
                    <FileDetailItem icon={Clock} label="Duration" value={videoMeta.duration} />
                    <FileDetailItem icon={Ratio} label="Resolution" value={videoMeta.resolution} />
                    <FileDetailItem icon={Calendar} label="Last Modified" value={videoMeta.lastModified} span />
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Detected Language */}
        {transcript && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/30">
              <Languages className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-foreground">Detected Language</h3>
              <p className="text-xs text-muted-foreground">Identified by Whisper speech recognition</p>
            </div>
            <span className="rounded-lg bg-primary/10 px-3 py-1.5 font-mono text-sm font-bold uppercase tracking-wider text-primary ring-1 ring-primary/30">
              {transcript.language}
            </span>
          </div>
        )}

        {/* AI Analysis Error / Retry */}
        {pipelineStep === "error" && !aiAnalysis && transcript && (
          <div className="flex items-center gap-4 rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">AI Analysis Failed</p>
              <p className="mt-0.5 font-mono text-xs text-destructive">{errorMsg}</p>
            </div>
            <button
              onClick={retryAnalysis}
              className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        )}

        {/* Score gauge + explanation — show after analysis completes */}
        {(aiAnalysis || frameDetection) && (
          <div className="grid items-start gap-6 lg:grid-cols-5">
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-card px-6 py-8 lg:col-span-2">
              <ScoreGauge score={displayScore} />
              {contentProfile && (
                <span className="rounded-md bg-secondary px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {contentProfile.type === "face-heavy" ? "Face-heavy (85/15)"
                    : contentProfile.type === "speech-heavy" ? "Speech-heavy (55/45)"
                    : contentProfile.type === "visual-only" ? "Visual-only (100/0)"
                    : contentProfile.type === "text-only" ? "Text-only (0/100)"
                    : "Balanced (70/30)"}
                </span>
              )}
            </div>
            <div className="lg:col-span-3">
              <AnalysisExplanation
                explanation={aiAnalysis?.explanation ?? "Analysis based on visual detection only."}
                modelVersion={`Llama 3.3 70B (Groq) + ViT Deepfake Detector${visionFindings.length > 0 ? " + Llama 3.2 11B Vision" : ""}`}
                timestamp={new Date().toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  timeZoneName: "short",
                })}
                analysisVersion={provenance?.analysisVersion}
              />
            </div>
          </div>
        )}

        {/* Video + Audio analysis cards */}
        {videoMeta && (
          <div className="grid gap-6 lg:grid-cols-2">
            <VideoAnalysisCard
              data={{
                score: frameDetection?.averageScore ?? 0,
                framesAnalyzed: frameDetection?.framesAnalyzed ?? 0,
                facesDetected: frameDetection?.facesDetected ?? 0,
                confidence: frameDetection?.confidence ?? "low",
                resolution,
                fps: videoMeta.fps,
                degraded: !frameDetection || frameDetection.degraded,
                visionFindings: visionFindings.length > 0 ? visionFindings : undefined,
                visionDegraded,
                forensicResult: forensicResult ?? undefined,
                temporalResult: temporalResult ? {
                  consistencyScore: temporalResult.consistencyScore,
                  findings: temporalResult.findings,
                  framesInWindow: temporalResult.framesInWindow,
                  degraded: temporalResult.degraded,
                } : undefined,
                frameExplanationCount: frameExplanations?.frames.length,
              }}
            />
            <AudioAnalysisCard
              data={{
                score: aiAnalysis?.overallScore ?? 0,
                duration,
                segmentCount: transcript?.segments.length ?? 0,
                speakerCount: speakerResult?.speakerCount ?? transcript?.diarization?.speakerCount ?? 1,
                language: transcript?.language ?? "unknown",
                degraded: !transcript,
                speakerConfidence: speakerResult?.confidence,
                speakerMethod: speakerResult?.method,
              }}
            />
          </div>
        )}

        {/* Frame-by-Frame AI Analysis */}
        {(frameExplanations || frameExplanationLoading) && (
          <FrameExplanationSection
            result={frameExplanations}
            frames={allFramesRef.current}
            loading={frameExplanationLoading}
            onModeChange={handleModeChange}
            currentMode={analysisMode}
          />
        )}

        {/* Transcript */}
        {transcript && transcript.segments.length > 0 && (
          <TranscriptSection entries={transcript.segments} language={transcript.language} />
        )}

        {/* Fact Check */}
        {aiAnalysis && aiAnalysis.claims.length > 0 && (
          <FactCheckSection claims={aiAnalysis.claims} />
        )}

        {/* Footer */}
        <footer className="border-t border-border pt-6 pb-4">
          <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              DeepProof &middot; Classification: Internal Use Only
            </p>
            <p className="font-mono text-[10px] text-muted-foreground">
              Pipeline v3.0.0-phase3 &middot; March 2026
            </p>
          </div>
        </footer>
      </main>
    </div>
  )
}

/** Progress banner showing the current pipeline step */
function PipelineBanner({
  step,
  detail,
  error,
}: {
  step: PipelineStep
  detail: string
  error: string
}) {
  const stepIcons: Record<PipelineStep, React.ReactNode> = {
    "loading": <Loader2 className="h-5 w-5 animate-spin text-primary" />,
    "extracting-metadata": <Film className="h-5 w-5 animate-pulse text-primary" />,
    "extracting-frames": <Film className="h-5 w-5 animate-pulse text-primary" />,
    "transcribing": <Mic className="h-5 w-5 animate-pulse text-primary" />,
    "detecting-deepfakes": <Eye className="h-5 w-5 animate-pulse text-primary" />,
    "forensic-analysis": <Shield className="h-5 w-5 animate-pulse text-primary" />,
    "temporal-analysis": <Waves className="h-5 w-5 animate-pulse text-primary" />,
    "analyzing-vision": <Sparkles className="h-5 w-5 animate-pulse text-primary" />,
    "searching-claims": <Search className="h-5 w-5 animate-pulse text-primary" />,
    "explaining-frames": <ImageIcon className="h-5 w-5 animate-pulse text-primary" />,
    "analyzing": <Brain className="h-5 w-5 animate-pulse text-primary" />,
    "computing-score": <Calculator className="h-5 w-5 animate-pulse text-primary" />,
    "done": <CheckCircle2 className="h-5 w-5 text-green-400" />,
    "error": <Info className="h-5 w-5 text-destructive" />,
  }

  const steps: PipelineStep[] = [
    "extracting-metadata",
    "extracting-frames",
    "detecting-deepfakes",
    "analyzing-vision",
    "explaining-frames",
    "analyzing",
    "computing-score",
  ]
  const stepDisplayNames: Record<string, string> = {
    "extracting-metadata": "Metadata",
    "extracting-frames": "Frames + STT",
    "detecting-deepfakes": "Detector + Forensic",
    "analyzing-vision": "Vision + Search",
    "explaining-frames": "Frame AI",
    "analyzing": "LLM Analysis",
    "computing-score": "Score",
  }
  const currentIdx = steps.indexOf(step)

  return (
    <div className={`rounded-xl border px-5 py-4 ${
      step === "error"
        ? "border-destructive/30 bg-destructive/5"
        : "border-primary/30 bg-primary/5"
    }`}>
      <div className="flex items-center gap-4">
        {stepIcons[step]}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {STEP_LABELS[step]}
          </p>
          {step === "error" ? (
            <p className="mt-0.5 font-mono text-xs text-destructive">{error}</p>
          ) : (
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">{detail}</p>
          )}
        </div>
      </div>

      {/* Step progress indicators */}
      {step !== "error" && (
        <div className="mt-3 flex items-center gap-2">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-wider ${
                i < currentIdx
                  ? "bg-green-500/10 text-green-400"
                  : i === currentIdx
                  ? "bg-primary/10 text-primary"
                  : "bg-secondary text-muted-foreground"
              }`}>
                {i < currentIdx ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : i === currentIdx ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : null}
                {stepDisplayNames[s] ?? s}
              </div>
              {i < steps.length - 1 && (
                <div className={`h-px w-6 ${i < currentIdx ? "bg-green-500/40" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FileDetailItem({
  icon: Icon,
  label,
  value,
  span,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  span?: boolean
}) {
  return (
    <div className={`flex items-center gap-3 rounded-lg bg-secondary/50 px-3 py-2.5 ${span ? "col-span-2" : ""}`}>
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="truncate font-mono text-sm font-semibold text-foreground">
          {value}
        </p>
      </div>
    </div>
  )
}

/** Select n evenly-spaced items from an array */
function selectEvenlySpaced<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items
  const step = items.length / n
  return Array.from({ length: n }, (_, i) => items[Math.floor(i * step)])
}

/** Extract candidate claims from transcript text for web search */
function extractCandidateClaims(text: string): string[] {
  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 10)
  const datePattern = /\b(19|20)\d{2}\b|january|february|march|april|may|june|july|august|september|october|november|december/i
  const numberPattern = /\d+/
  const namedEntityPattern = /[A-Z][a-z]+(?:\s[A-Z][a-z]+)+/
  const factualVerbPattern = /\b(is|was|were|are|declared|announced|reached|signed|launched|founded|discovered|reported|stated|confirmed)\b/i

  const scored = sentences.map((sentence) => {
    let score = 0
    if (numberPattern.test(sentence)) score++
    if (datePattern.test(sentence)) score++
    if (namedEntityPattern.test(sentence)) score++
    if (factualVerbPattern.test(sentence)) score++
    return { sentence, score }
  })

  scored.sort((a, b) => b.score - a.score)

  const candidates = scored.filter((s) => s.score > 0).slice(0, 5)
  if (candidates.length === 0) {
    return sentences.slice(0, 3).map((s) => s.slice(0, 200))
  }
  return candidates.map((c) => c.sentence.slice(0, 200))
}

/** Extract video metadata as a promise (10s timeout for corrupted videos) */
function extractVideoMetadata(file: UploadedFileInfo): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video")
    video.preload = "metadata"

    const timeout = setTimeout(() => {
      reject(new Error("Video metadata extraction timed out"))
    }, 10_000)

    video.onerror = () => {
      clearTimeout(timeout)
      reject(new Error("Failed to load video metadata"))
    }

    video.onloadedmetadata = () => {
      clearTimeout(timeout)
      const rawDuration = video.duration
      const durationSeconds = Number.isFinite(rawDuration) ? rawDuration : 0
      const mins = Math.floor(durationSeconds / 60)
      const secs = Math.floor(durationSeconds % 60)
      const duration = `${mins}:${secs.toString().padStart(2, "0")}`
      const resolution = `${video.videoWidth}x${video.videoHeight}`
      const fps = 30

      const lastMod = new Date(file.file.lastModified)
      const lastModified = lastMod.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })

      resolve({ duration, durationSeconds, resolution, fps, lastModified })
    }
    video.src = file.objectUrl
  })
}
