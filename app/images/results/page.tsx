"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { DeepProofHeader } from "@/components/deepproof-header"
import { ScoreGauge } from "@/components/results/score-gauge"
import { AnalysisExplanation } from "@/components/results/analysis-explanation"
import { ImageScoreCard } from "@/components/results/image-score-card"
import { ImageFindingsSection } from "@/components/results/image-findings-section"
import { ArrowLeft, ImageIcon, Loader2 } from "lucide-react"
import Link from "next/link"
import {
  getUploadedImage,
  clearUploadedImage,
  type UploadedImageInfo,
} from "@/lib/image-store"
import { extractImage, type ImageExtraction } from "@/lib/image-extract"
import {
  computeImageMetadataSignals,
  type ImageFinding,
  type ImagePipelineStep,
} from "@/lib/image-analysis"
import { saveScan } from "@/lib/scans"

interface ImageAnalysisResult {
  finalFraudScore: number
  visionScore: number
  metadataScore: number
  confidenceScore: number
  explanation: string
  findings: ImageFinding[]
  degradedReasons?: string[]
}

const STEP_LABELS: Record<ImagePipelineStep, string> = {
  idle: "Ready",
  extracting: "Processing image...",
  analyzing: "Analyzing with vision AI model...",
  scoring: "Computing authenticity score...",
  complete: "Analysis complete",
  failed: "Analysis failed",
}

export default function ImageResultsPage() {
  const router = useRouter()
  const [uploadedImage, setUploadedImage] = useState<UploadedImageInfo | null>(null)
  const [step, setStep] = useState<ImagePipelineStep>("idle")
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImageAnalysisResult | null>(null)
  const [extraction, setExtraction] = useState<ImageExtraction | null>(null)

  useEffect(() => {
    const img = getUploadedImage()
    if (!img) {
      router.push("/images")
      return
    }
    setUploadedImage(img)
  }, [router])

  useEffect(() => {
    if (!uploadedImage) return

    let mounted = true

    async function runAnalysis() {
      const analysisStart = Date.now()
      try {
        setStep("extracting")
        setError(null)

        // Step 1: Extract image
        const extracted = await extractImage(uploadedImage.file)
        if (!mounted) return
        setExtraction(extracted)

        setStep("analyzing")

        // Step 2: Call analyze API
        const apiResponse = await fetch("/api/analyze-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64: extracted.imageBase64,
            fileName: uploadedImage.name,
            fileHash: extracted.fileHash,
            consentGiven: true,
            width: extracted.width,
            height: extracted.height,
            exifMetadata: extracted.exifMetadata,
          }),
        })

        if (!mounted) return

        if (!apiResponse.ok) {
          const errorData = await apiResponse.json().catch(() => ({}))
          throw new Error(errorData.error || `API error: ${apiResponse.status}`)
        }

        const apiResult = await apiResponse.json()

        setStep("scoring")

        // Step 3: Compute metadata signals client-side (for display)
        const metadataSignals = computeImageMetadataSignals(extracted.exifMetadata)

        if (!mounted) return

        setResult({
          finalFraudScore: apiResult.finalFraudScore ?? 50,
          visionScore: apiResult.visionScore ?? 0,
          metadataScore: apiResult.metadataScore ?? metadataSignals.metadataScore,
          confidenceScore: apiResult.confidenceScore ?? 20,
          explanation: apiResult.explanation || "",
          findings: apiResult.findings || [],
          degradedReasons: apiResult.degradedReasons || [],
        })

        await saveScan({
          fileName: uploadedImage.name,
          fileType: "image",
          score: apiResult.finalFraudScore ?? 50,
          durationMs: Date.now() - analysisStart,
        })

        setStep("complete")
      } catch (err) {
        if (!mounted) return
        setError(err instanceof Error ? err.message : "Unknown error occurred")
        setStep("failed")
      }
    }

    runAnalysis()

    return () => {
      mounted = false
    }
  }, [uploadedImage])

  if (!uploadedImage) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <DeepProofHeader />
        <main className="flex-1" />
      </div>
    )
  }

  const isLoading = step !== "complete" && step !== "failed"
  const isError = step === "failed"

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <DeepProofHeader />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-8">
        {/* Back button */}
        <div className="flex items-center justify-between">
          <Link
            href="/images"
            className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Upload
          </Link>
        </div>

        {/* File info header */}
        {uploadedImage && extraction && (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/30">
                <ImageIcon className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground truncate">{uploadedImage.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {uploadedImage.type.split("/")[1].toUpperCase()} &middot; {uploadedImage.sizeFormatted} &middot; {extraction.width}x{extraction.height} &middot; Hash: {extraction.fileHash.slice(0, 8).toUpperCase()}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Progress bar and status */}
        {isLoading && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <p className="text-sm font-medium text-foreground">
                {STEP_LABELS[step]}
              </p>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{
                  width: `${
                    step === "extracting" ? 25 :
                    step === "analyzing" ? 60 :
                    step === "scoring" ? 85 :
                    0
                  }%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Error state */}
        {isError && error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
            <p className="text-sm text-red-400">
              <strong>Analysis failed:</strong> {error}
            </p>
            <button
              onClick={() => {
                clearUploadedImage()
                router.push("/images")
              }}
              className="mt-3 text-xs text-red-400 hover:text-red-300 underline"
            >
              Try another image
            </button>
          </div>
        )}

        {/* Results */}
        {step === "complete" && result && extraction && (
          <>
            {/* Score Gauge + Explanation */}
            <div className="grid items-start gap-6 lg:grid-cols-5">
              <div className="lg:col-span-2 flex justify-center">
                <ScoreGauge score={result.finalFraudScore} />
              </div>
              <div className="lg:col-span-3">
                <AnalysisExplanation
                  explanation={result.explanation}
                  modelVersion="Groq Llama 4 Scout"
                  timestamp={new Date().toLocaleString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  analysisVersion="image-1.0.0"
                />
              </div>
            </div>

            {/* Image Score Card */}
            <ImageScoreCard
              finalFraudScore={result.finalFraudScore}
              visionScore={result.visionScore}
              metadataScore={result.metadataScore}
              confidence={
                result.confidenceScore >= 70 ? "high" :
                result.confidenceScore >= 40 ? "medium" :
                "low"
              }
              width={extraction.width}
              height={extraction.height}
              fileHash={extraction.fileHash}
              metadataSignals={
                extraction.exifMetadata
                  ? {
                      flags: computeImageMetadataSignals(extraction.exifMetadata).flags,
                    }
                  : { flags: ["No EXIF metadata found (common in AI-generated images)"] }
              }
              degradedReasons={result.degradedReasons}
            />

            {/* Findings Section */}
            <ImageFindingsSection findings={result.findings} />

            {/* Image Preview */}
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Analyzed Image
              </p>
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={uploadedImage.objectUrl}
                  alt={uploadedImage.name}
                  className="max-h-[400px] rounded-lg border border-border object-contain"
                />
              </div>
            </div>

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
          </>
        )}
      </main>
    </div>
  )
}
