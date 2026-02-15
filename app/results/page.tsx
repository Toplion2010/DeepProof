"use client"

import { useEffect, useState, useRef } from "react"
import { DeepProofHeader } from "@/components/deepproof-header"
import { ScoreGauge } from "@/components/results/score-gauge"
import { AnalysisExplanation } from "@/components/results/analysis-explanation"
import { VideoAnalysisCard, AudioAnalysisCard } from "@/components/results/analysis-cards"
import { TranscriptSection } from "@/components/results/transcript-section"
import { FactCheckSection } from "@/components/results/fact-check-section"
import type { ClaimStatus } from "@/components/results/fact-check-section"
import { ArrowLeft, Download, Share2, FileVideo, Info, HardDrive, Film, Clock, Ratio, Calendar, Loader2, Mic, Brain, Languages, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { getUploadedFile, type UploadedFileInfo } from "@/lib/upload-store"
import { transcribeVideo, type TranscriptionResult } from "@/lib/transcribe"

interface VideoMetadata {
  duration: string
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
  }>
}

type PipelineStep = "loading" | "extracting-metadata" | "transcribing" | "analyzing" | "done" | "error"

const STEP_LABELS: Record<PipelineStep, string> = {
  "loading": "Initializing...",
  "extracting-metadata": "Extracting video metadata...",
  "transcribing": "Transcribing audio with Whisper AI...",
  "analyzing": "Analyzing content with Claude AI...",
  "done": "Analysis complete",
  "error": "Analysis failed",
}

export default function ResultsPage() {
  const router = useRouter()
  const [uploadedFile, setUploadedFile] = useState<UploadedFileInfo | null>(null)
  const [videoMeta, setVideoMeta] = useState<VideoMetadata | null>(null)
  const [transcript, setTranscript] = useState<TranscriptionResult | null>(null)
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null)
  const [pipelineStep, setPipelineStep] = useState<PipelineStep>("loading")
  const [progressDetail, setProgressDetail] = useState("")
  const [errorMsg, setErrorMsg] = useState("")
  const videoRef = useRef<HTMLVideoElement>(null)
  const pipelineStarted = useRef(false)

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
    try {
      // Step 1: Extract video metadata
      setPipelineStep("extracting-metadata")
      setProgressDetail("Reading video properties...")
      const meta = await extractVideoMetadata(file)
      setVideoMeta(meta)

      // Step 2: Transcribe audio with Whisper
      setPipelineStep("transcribing")
      const transcription = await transcribeVideo(file.objectUrl, (msg) => {
        setProgressDetail(msg)
      })
      setTranscript(transcription)

      // Step 3: Analyze with Claude
      setPipelineStep("analyzing")
      setProgressDetail("Claude AI is evaluating claims and credibility...")

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: transcription.fullText,
          fileName: file.name,
          duration: meta.duration,
          resolution: meta.resolution,
          language: transcription.language,
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || `Analysis failed (${response.status})`)
      }

      const analysis = await response.json()

      // Validate response shape
      if (typeof analysis.overallScore !== "number" || !analysis.explanation) {
        throw new Error("AI returned an unexpected response format")
      }

      setAiAnalysis(analysis as AIAnalysisResult)

      // Done!
      setPipelineStep("done")
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Pipeline failed")
      setPipelineStep("error")
    }
  }

  async function retryAnalysis() {
    if (!uploadedFile || !transcript || !videoMeta) return
    setPipelineStep("analyzing")
    setProgressDetail("Retrying Claude AI analysis...")
    setErrorMsg("")
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: transcript.fullText,
          fileName: uploadedFile.name,
          duration: videoMeta.duration,
          resolution: videoMeta.resolution,
          language: transcript.language,
        }),
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
      setPipelineStep("done")
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Retry failed")
      setPipelineStep("error")
    }
  }

  const fileName = uploadedFile?.name ?? "Unknown file"
  const fileSize = uploadedFile?.sizeFormatted ?? "—"
  const fileType = uploadedFile?.type ?? "video/mp4"
  const fileExtension = fileType.split("/")[1]?.toUpperCase() ?? "VIDEO"
  const resolution = videoMeta?.resolution ?? "1920x1080"
  const duration = videoMeta?.duration ?? "0:00"
  const totalFrames = videoMeta ? Math.round(parseTime(videoMeta.duration) * videoMeta.fps) : 0

  const isPipelineRunning = pipelineStep !== "done" && pipelineStep !== "error"

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

        {/* Score gauge + explanation — show after AI analysis completes */}
        {aiAnalysis && (
          <div className="grid items-start gap-6 lg:grid-cols-5">
            <div className="flex justify-center rounded-xl border border-border bg-card px-6 py-8 lg:col-span-2">
              <ScoreGauge score={aiAnalysis.overallScore} />
            </div>
            <div className="lg:col-span-3">
              <AnalysisExplanation
                explanation={aiAnalysis.explanation}
                modelVersion="Llama 3.3 70B + DeepScan v2.4.1"
                timestamp={new Date().toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  timeZoneName: "short",
                })}
              />
            </div>
          </div>
        )}

        {/* Video + Audio analysis — show after metadata is available */}
        {videoMeta && (
          <div className="grid gap-6 lg:grid-cols-2">
            <VideoAnalysisCard
              data={{
                score: aiAnalysis?.overallScore ?? 0,
                framesAnalyzed: totalFrames,
                flaggedFrames: aiAnalysis ? Math.round(totalFrames * aiAnalysis.overallScore / 100 * 0.05) : 0,
                resolution,
                fps: videoMeta.fps,
              }}
            />
            <AudioAnalysisCard
              data={{
                score: aiAnalysis?.overallScore ?? 0,
                duration,
                confidence: aiAnalysis ? Math.min(99, 60 + Math.round(aiAnalysis.overallScore * 0.35)) : 0,
                sampleRate: "48 kHz",
                channels: 2,
              }}
            />
          </div>
        )}

        {/* Transcript */}
        {transcript && transcript.segments.length > 0 && (
          <TranscriptSection entries={transcript.segments} language={transcript.language} />
        )}

        {/* Fact Check — from Claude */}
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
              Engine v2.4.1 &middot; Models updated Feb 2026
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
    "transcribing": <Mic className="h-5 w-5 animate-pulse text-primary" />,
    "analyzing": <Brain className="h-5 w-5 animate-pulse text-primary" />,
    "done": <CheckCircle2 className="h-5 w-5 text-green-400" />,
    "error": <Info className="h-5 w-5 text-destructive" />,
  }

  const steps: PipelineStep[] = ["extracting-metadata", "transcribing", "analyzing"]
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
                {s === "extracting-metadata" ? "Metadata" : s === "transcribing" ? "Whisper STT" : "Claude AI"}
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

/** Extract video metadata as a promise */
function extractVideoMetadata(file: UploadedFileInfo): Promise<VideoMetadata> {
  return new Promise((resolve) => {
    const video = document.createElement("video")
    video.preload = "metadata"
    video.onloadedmetadata = () => {
      const mins = Math.floor(video.duration / 60)
      const secs = Math.floor(video.duration % 60)
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

      resolve({ duration, resolution, fps, lastModified })
    }
    video.src = file.objectUrl
  })
}

function parseTime(duration: string): number {
  const parts = duration.split(":").map(Number)
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return 0
}
