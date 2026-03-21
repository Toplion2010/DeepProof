"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { DeepProofHeader } from "@/components/deepproof-header"
import { ScoreGauge } from "@/components/results/score-gauge"
import { AnalysisExplanation } from "@/components/results/analysis-explanation"
import { DocumentScoreCard } from "@/components/results/document-score-card"
import { DocumentFindingsSection } from "@/components/results/document-findings-section"
import { ArrowLeft, FileText, Loader2 } from "lucide-react"
import Link from "next/link"
import { getUploadedDocument, clearUploadedDocument } from "@/lib/document-store"
import { extractDocument, type DocumentExtraction } from "@/lib/document-extract"
import { computeMetadataSignals, type DocumentFinding, type DocumentPipelineStep } from "@/lib/document-analysis"
import { saveScan } from "@/lib/scans"

interface DocumentAnalysisResult {
  finalFraudScore: number
  visionScore: number
  contentScore: number
  metadataScore: number
  explanation: string
  findings: DocumentFinding[]
  degradedReasons?: string[]
}

const STEP_LABELS: Record<DocumentPipelineStep, string> = {
  "idle": "Ready",
  "extracting": "Extracting document content...",
  "analyzing": "Analyzing with vision and content models...",
  "scoring": "Computing fraud probability score...",
  "complete": "Analysis complete",
  "failed": "Analysis failed",
}

export default function DocumentResultsPage() {
  const router = useRouter()
  const [uploadedDocument, setUploadedDocument] = useState<Awaited<ReturnType<typeof getUploadedDocument>> | null>(null)
  const [step, setStep] = useState<DocumentPipelineStep>("idle")
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<DocumentAnalysisResult | null>(null)
  const [extraction, setExtraction] = useState<DocumentExtraction | null>(null)

  useEffect(() => {
    const doc = getUploadedDocument()
    if (!doc) {
      router.push("/documents")
      return
    }
    setUploadedDocument(doc)
  }, [router])

  useEffect(() => {
    if (!uploadedDocument) return

    let mounted = true

    async function runAnalysis() {
      const analysisStart = Date.now()
      try {
        setStep("extracting")
        setError(null)

        // Step 1: Extract document
        const extracted = await extractDocument(uploadedDocument.file)
        if (!mounted) return
        setExtraction(extracted)

        setStep("analyzing")

        // Step 2: Call analyze API
        const apiResponse = await fetch("/api/analyze-document", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            extractedText: extracted.extractedText,
            firstPageImage: extracted.firstPageImage,
            fileName: uploadedDocument.name,
            fileType: extracted.fileType,
            pageCount: extracted.pageCount,
            pdfCreationDate: extracted.pdfCreationDate,
            pdfModificationDate: extracted.pdfModificationDate,
            pdfProducer: extracted.pdfProducer,
            pdfCreator: extracted.pdfCreator,
            fileHash: extracted.fileHash,
            consentGiven: true,
          }),
        })

        if (!mounted) return

        if (!apiResponse.ok) {
          const errorData = await apiResponse.json().catch(() => ({}))
          throw new Error(errorData.error || `API error: ${apiResponse.status}`)
        }

        const apiResult = await apiResponse.json()

        setStep("scoring")

        // Step 3: Compute metadata signals
        const metadataSignals = computeMetadataSignals(extracted)

        // Step 4: Combine all scores
        const finalScore = Math.round(
          (apiResult.visionScore || 0) * 0.6 +
          (apiResult.contentScore || 0) * 0.3 +
          (metadataSignals.metadataScore || 0) * 0.1
        )

        if (!mounted) return

        setResult({
          finalFraudScore: finalScore,
          visionScore: apiResult.visionScore || 0,
          contentScore: apiResult.contentScore || 0,
          metadataScore: metadataSignals.metadataScore || 0,
          explanation: apiResult.explanation || "",
          findings: apiResult.findings || [],
          degradedReasons: apiResult.degradedReasons || [],
        })

        await saveScan({
          fileName: uploadedDocument.name,
          fileType: "document",
          score: finalScore,
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
  }, [uploadedDocument])

  if (!uploadedDocument) {
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
        {/* Back button and file info */}
        <div className="flex items-center justify-between">
          <Link
            href="/documents"
            className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Upload
          </Link>
        </div>

        {/* File info header */}
        {uploadedDocument && extraction && (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/30">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground truncate">{uploadedDocument.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {uploadedDocument.type.toUpperCase()} &middot; {uploadedDocument.sizeFormatted} &middot; {extraction.fileType === "pdf" ? `${extraction.pageCount} page(s)` : "Image"} &middot; Hash: {extraction.fileHash.slice(0, 8).toUpperCase()}
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
                    step === "extracting" ? 20 :
                    step === "analyzing" ? 50 :
                    step === "scoring" ? 80 :
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
                clearUploadedDocument()
                router.push("/documents")
              }}
              className="mt-3 text-xs text-red-400 hover:text-red-300 underline"
            >
              Try another document
            </button>
          </div>
        )}

        {/* Results */}
        {step === "complete" && result && extraction && (
          <>
            {/* Score Gauge + Explanation side-by-side (like video module) */}
            <div className="grid items-start gap-6 lg:grid-cols-5">
              <div className="lg:col-span-2 flex justify-center">
                <ScoreGauge score={result.finalFraudScore} />
              </div>
              <div className="lg:col-span-3">
                <AnalysisExplanation
                  explanation={result.explanation}
                  modelVersion="Groq Llama 3.3 70B"
                  timestamp={new Date().toLocaleString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  analysisVersion="doc-1.0.0"
                />
              </div>
            </div>

            {/* Document Score Card */}
            <DocumentScoreCard
              finalFraudScore={result.finalFraudScore}
              visionScore={result.visionScore}
              contentScore={result.contentScore}
              metadataScore={result.metadataScore}
              fileType={extraction.fileType}
              pageCount={extraction.pageCount}
              confidence={
                result.finalFraudScore <= 30 ? "low" :
                result.finalFraudScore <= 60 ? "medium" :
                "high"
              }
              fileHash={extraction.fileHash}
              metadataSignals={
                extraction.fileType === "pdf"
                  ? {
                      flags: [
                        extraction.pdfCreationDate && `Created: ${extraction.pdfCreationDate}`,
                        extraction.pdfModificationDate && `Modified: ${extraction.pdfModificationDate}`,
                        extraction.pdfProducer && `Producer: ${extraction.pdfProducer}`,
                      ].filter(Boolean) as string[],
                    }
                  : undefined
              }
              degradedReasons={result.degradedReasons}
            />

            {/* Findings Section */}
            <DocumentFindingsSection findings={result.findings} />

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
