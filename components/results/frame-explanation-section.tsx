"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, ImageIcon, Zap, Brain, AlertTriangle } from "lucide-react"
import type { FrameExplanationResult, FrameAnomaly, AnalysisMode } from "@/lib/frame-explanation"
import type { RegionAnalysisResult } from "@/lib/region-analysis"
import { RegionOverlay } from "./region-overlay"

interface FrameExplanationSectionProps {
  result: FrameExplanationResult | null
  frames: string[]
  loading: boolean
  onModeChange: (mode: AnalysisMode) => void
  currentMode: AnalysisMode
  regionAnalysis?: RegionAnalysisResult
}

function getSeverityColor(severity: number) {
  if (severity <= 30) return "bg-green-500/10 text-green-400 ring-green-500/20"
  if (severity <= 60) return "bg-amber-500/10 text-amber-400 ring-amber-500/20"
  return "bg-red-500/10 text-red-400 ring-red-500/20"
}

function getSeverityBarColor(severity: number) {
  if (severity <= 30) return "bg-green-500"
  if (severity <= 60) return "bg-amber-500"
  return "bg-red-500"
}

function getAnomalyCountColor(maxSeverity: number) {
  if (maxSeverity <= 30) return "bg-green-500/80"
  if (maxSeverity <= 60) return "bg-amber-500/80"
  return "bg-red-500/80"
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

export function FrameExplanationSection({
  result,
  frames,
  loading,
  onModeChange,
  currentMode,
  regionAnalysis,
}: FrameExplanationSectionProps) {
  if (!loading && !result) return null

  return (
    <div id="frame-explanations" className="rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/30">
          <ImageIcon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-foreground">Frame-by-Frame AI Analysis</h3>
          <p className="text-xs text-muted-foreground">Per-frame visual explanations</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Mode badge */}
          <span className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ring-1 ${
            currentMode === "deep"
              ? "bg-purple-500/10 text-purple-400 ring-purple-500/20"
              : "bg-primary/10 text-primary ring-primary/20"
          }`}>
            {currentMode === "deep" ? (
              <><Brain className="h-3 w-3" /> DeepThink</>
            ) : (
              <><Zap className="h-3 w-3" /> Fast</>
            )}
          </span>
          {/* Mode toggle */}
          <button
            onClick={() => onModeChange(currentMode === "fast" ? "deep" : "fast")}
            disabled={loading}
            className="rounded-md border border-border px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground disabled:opacity-50"
          >
            {currentMode === "fast" ? "Switch to Deep" : "Switch to Fast"}
          </button>
        </div>
      </div>

      <div className="p-5">
        {/* Degraded banner */}
        {result?.degraded && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <p className="text-[11px] text-amber-500">
              {result.error ?? "Frame explanations partially unavailable — showing available results."}
            </p>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !result && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: currentMode === "fast" ? 4 : 12 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-lg border border-border bg-secondary/30 p-3">
                <div className="aspect-video rounded-md bg-secondary mb-2" />
                <div className="h-3 w-3/4 rounded bg-secondary mb-1" />
                <div className="h-3 w-1/2 rounded bg-secondary" />
              </div>
            ))}
          </div>
        )}

        {/* Frame grid */}
        {result && result.frames.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {result.frames.map((explanation) => {
              const frameBase64 = frames[explanation.frameIndex]
              return (
                <FrameCard
                  key={explanation.frameIndex}
                  explanation={explanation}
                  base64={frameBase64}
                  regionAnalysis={regionAnalysis}
                />
              )
            })}
          </div>
        )}

        {/* No results */}
        {result && result.frames.length === 0 && !loading && (
          <p className="text-center text-sm text-muted-foreground py-8">
            No frame explanations available.
          </p>
        )}
      </div>

      {/* Footer disclaimer */}
      <div className="border-t border-border px-5 py-3">
        <p className="text-[10px] italic text-muted-foreground/60">
          Descriptions are AI-generated observations, not verdicts.
        </p>
      </div>
    </div>
  )
}

function FrameCard({
  explanation,
  base64,
  regionAnalysis,
}: {
  explanation: FrameExplanationResult["frames"][number]
  base64?: string
  regionAnalysis?: RegionAnalysisResult
}) {
  const [expanded, setExpanded] = useState(false)

  const maxSeverity = explanation.anomalies.length > 0
    ? Math.max(...explanation.anomalies.map((a) => a.severity))
    : 0

  return (
    <div id={`frame-explanation-${explanation.frameIndex}`} className="rounded-lg border border-border bg-secondary/20 overflow-hidden transition-all">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-secondary">
        {base64 && regionAnalysis && regionAnalysis.regions.length > 0 ? (
          <RegionOverlay
            imageSrc={`data:image/jpeg;base64,${base64}`}
            regions={regionAnalysis.regions}
          />
        ) : base64 ? (
          <img
            src={`data:image/jpeg;base64,${base64}`}
            alt={`Frame ${explanation.frameIndex}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
          </div>
        )}
        {/* Timestamp badge */}
        <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] font-medium text-white">
          {formatTimestamp(explanation.timestamp)}
        </span>
        {/* Anomaly count pill */}
        {explanation.anomalies.length > 0 && (
          <span className={`absolute right-2 top-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white ${getAnomalyCountColor(maxSeverity)}`}>
            {explanation.anomalies.length}
          </span>
        )}
      </div>

      {/* Summary + expand */}
      <div className="px-3 py-2">
        <p className="text-xs text-foreground leading-relaxed line-clamp-2">
          {explanation.summary}
        </p>

        {(explanation.description || explanation.anomalies.length > 0) && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-primary hover:text-primary/80"
          >
            {expanded ? (
              <><ChevronUp className="h-3 w-3" /> Less</>
            ) : (
              <><ChevronDown className="h-3 w-3" /> More</>
            )}
          </button>
        )}

        {/* Expanded content */}
        {expanded && (
          <div className="mt-2 space-y-2">
            {explanation.description && (
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {explanation.description}
              </p>
            )}

            {explanation.anomalies.length > 0 && (
              <div className="space-y-2">
                {explanation.anomalies.map((anomaly, i) => (
                  <AnomalyItem key={i} anomaly={anomaly} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function AnomalyItem({ anomaly }: { anomaly: FrameAnomaly }) {
  return (
    <div className="rounded-md border border-border bg-secondary/30 px-2.5 py-2">
      {/* Type badge */}
      <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ring-1 ${getSeverityColor(anomaly.severity)}`}>
        {anomaly.type}
      </span>

      {/* Severity + confidence bars */}
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        <div>
          <p className="text-[9px] text-muted-foreground">Severity</p>
          <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full ${getSeverityBarColor(anomaly.severity)}`}
              style={{ width: `${anomaly.severity}%` }}
            />
          </div>
        </div>
        <div>
          <p className="text-[9px] text-muted-foreground">Confidence</p>
          <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${anomaly.confidence}%` }}
            />
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="mt-1.5 text-[10px] text-foreground">{anomaly.description}</p>

      {/* Region */}
      {anomaly.region && (
        <p className="mt-0.5 text-[9px] italic text-muted-foreground">{anomaly.region}</p>
      )}
    </div>
  )
}
