"use client"

import { useState, useCallback } from "react"
import { FileText, Languages, Loader2, Mic, AlertCircle, Brain } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TranscriptSection } from "@/components/results/transcript-section"
import { transcribeVideo, type TranscriptionResult } from "@/lib/transcribe"
import type { ClaimStatus } from "@/components/results/fact-check-section"

type Status = "idle" | "transcribing" | "analyzing" | "done" | "error"

export interface AIAnalysisResult {
  overallScore: number
  explanation: string
  claims: Array<{
    text: string
    status: ClaimStatus
    source?: string
    detail: string
  }>
}

interface VideoTranscriptionProps {
  videoUrl: string | null
  fileName?: string
  duration?: string
  resolution?: string
  onAnalysisComplete?: (analysis: AIAnalysisResult, language: string) => void
}

export function VideoTranscription({
  videoUrl,
  fileName = "video.mp4",
  duration = "0:00",
  resolution = "unknown",
  onAnalysisComplete,
}: VideoTranscriptionProps) {
  const [status, setStatus] = useState<Status>("idle")
  const [progress, setProgress] = useState("")
  const [result, setResult] = useState<TranscriptionResult | null>(null)
  const [error, setError] = useState("")

  const handleTranscribe = useCallback(async () => {
    if (!videoUrl) return
    setStatus("transcribing")
    setError("")

    try {
      // Step 1: Transcribe with Whisper
      const transcription = await transcribeVideo(videoUrl, (msg) => {
        setProgress(msg)
      })
      setResult(transcription)

      // Step 2: Analyze with Claude
      setStatus("analyzing")
      setProgress("Analyzing transcript with Claude AI...")

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: transcription.fullText,
          fileName,
          duration,
          resolution,
          language: transcription.language,
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || `Analysis failed (${response.status})`)
      }

      const analysis: AIAnalysisResult = await response.json()
      onAnalysisComplete?.(analysis, transcription.language)
      setStatus("done")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Processing failed")
      setStatus("error")
    }
  }, [videoUrl, fileName, duration, resolution, onAnalysisComplete])

  // No video uploaded
  if (!videoUrl) {
    return null
  }

  // Show results
  if (status === "done" && result) {
    return (
      <div className="flex flex-col gap-4">
        {/* Language badge */}
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/30">
            <Languages className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">Detected Language</h3>
            <p className="text-xs text-muted-foreground">Identified by Whisper speech recognition model</p>
          </div>
          <span className="rounded-lg bg-primary/10 px-3 py-1.5 font-mono text-sm font-bold uppercase tracking-wider text-primary ring-1 ring-primary/30">
            {result.language}
          </span>
        </div>

        {/* Transcript */}
        <TranscriptSection entries={result.segments} />
      </div>
    )
  }

  // Idle / Processing / Error states
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/30">
          <FileText className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-foreground">Speech-to-Text Transcription</h3>
          <p className="text-xs text-muted-foreground">
            Extract spoken text and detect language using Whisper AI
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center px-5 py-10">
        {status === "idle" && (
          <>
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
              <Mic className="h-6 w-6 text-primary" />
            </div>
            <p className="mb-2 text-sm font-medium text-foreground">
              Ready to transcribe & analyze
            </p>
            <p className="mb-6 max-w-sm text-center text-xs text-muted-foreground">
              Whisper AI will transcribe the audio, then Claude AI will analyze the content for factual claims and credibility.
            </p>
            <Button
              onClick={handleTranscribe}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Mic className="mr-2 h-4 w-4" />
              Transcribe & Analyze
            </Button>
          </>
        )}

        {status === "transcribing" && (
          <>
            <Loader2 className="mb-4 h-10 w-10 animate-spin text-primary" />
            <p className="mb-1 text-sm font-medium text-foreground">
              Transcribing audio...
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {progress}
            </p>
          </>
        )}

        {status === "analyzing" && (
          <>
            <Brain className="mb-4 h-10 w-10 animate-pulse text-primary" />
            <p className="mb-1 text-sm font-medium text-foreground">
              Analyzing with Claude AI...
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {progress}
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 ring-1 ring-destructive/20">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <p className="mb-2 text-sm font-medium text-foreground">
              Processing failed
            </p>
            <p className="mb-6 max-w-sm text-center font-mono text-xs text-destructive">
              {error}
            </p>
            <Button
              variant="outline"
              onClick={handleTranscribe}
            >
              Try Again
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
