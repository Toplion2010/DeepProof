"use client"

import { useState } from "react"
import { Shield, Info, ArrowDown, Crosshair } from "lucide-react"
import type {
  ForensicSummary,
  RiskLevel,
  AnomalyPattern,
  SuspiciousFrame,
} from "@/lib/frame-explanation"
import type { RegionAnalysisResult } from "@/lib/region-analysis"
import { RegionOverlay } from "./region-overlay"
import { RegionDetailCard } from "./region-detail-card"

interface ForensicSummarySectionProps {
  summary: ForensicSummary
  frameImages?: Record<number, string>
  regionAnalysis?: RegionAnalysisResult
}

function getRiskColor(risk: RiskLevel) {
  if (risk === "low") return "bg-green-500/10 text-green-400 ring-green-500/20"
  if (risk === "medium") return "bg-amber-500/10 text-amber-400 ring-amber-500/20"
  return "bg-red-500/10 text-red-400 ring-red-500/20"
}

function getVerdictColor(verdict: ForensicSummary["verdict"]) {
  if (verdict === "no-suspicious-findings") return "bg-green-500/10 text-green-400 ring-green-500/20"
  if (verdict === "suspicious-findings") return "bg-amber-500/10 text-amber-400 ring-amber-500/20"
  return "bg-red-500/10 text-red-400 ring-red-500/20"
}

function getSeverityIndicator(severity: number) {
  if (severity >= 60) return { color: "bg-red-500", ring: "ring-red-500/30", label: "High" }
  if (severity >= 40) return { color: "bg-amber-500", ring: "ring-amber-500/30", label: "Med" }
  return { color: "bg-green-500", ring: "ring-green-500/30", label: "Low" }
}

function getPatternColor(pattern: AnomalyPattern) {
  if (pattern === "consistent") return "bg-amber-500/10 text-amber-400 ring-amber-500/20"
  if (pattern === "isolated") return "bg-secondary text-muted-foreground ring-border"
  return ""
}

function formatAnomalyType(type: string): string {
  return type.replace(/-/g, " ")
}

function scrollToFrame(frameIndex: number) {
  const el = document.getElementById(`frame-explanation-${frameIndex}`)
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    el.classList.add("ring-2", "ring-primary/50")
    setTimeout(() => el.classList.remove("ring-2", "ring-primary/50"), 2000)
  }
}

function FrameCard({
  frame,
  imageBase64,
}: {
  frame: SuspiciousFrame
  imageBase64?: string
}) {
  const [hovering, setHovering] = useState(false)
  const sev = getSeverityIndicator(frame.severity)

  return (
    <button
      onClick={() => scrollToFrame(frame.frameIndex)}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className="relative flex flex-col items-center gap-1.5 rounded-lg border border-border bg-secondary/30 px-3 py-2.5 transition-colors hover:border-primary/30 hover:bg-secondary/50 cursor-pointer"
    >
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${sev.color}`} />
        <span className="text-xs font-semibold text-foreground">Frame {frame.frameIndex}</span>
      </div>
      <span className="text-[10px] text-muted-foreground">{frame.timestamp.toFixed(1)}s</span>
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] text-muted-foreground">sev: {Math.round(frame.severity)}</span>
        <span className="text-[9px] text-muted-foreground/50">|</span>
        <span className="text-[9px] text-muted-foreground">conf: {Math.round(frame.confidence)}</span>
      </div>
      <div className="flex items-center gap-1 text-[9px] text-primary">
        <ArrowDown className="h-2.5 w-2.5" />
        <span>View</span>
      </div>

      {/* Hover preview */}
      {hovering && imageBase64 && (
        <div className="absolute -bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-md border border-border bg-card p-1 shadow-lg">
          <img
            src={`data:image/jpeg;base64,${imageBase64}`}
            alt={`Frame ${frame.frameIndex} preview`}
            className="h-24 w-auto rounded"
          />
        </div>
      )}
    </button>
  )
}

export function ForensicSummarySection({ summary, frameImages, regionAnalysis }: ForensicSummarySectionProps) {
  const [selectedRegionId, setSelectedRegionId] = useState<number | undefined>(undefined)
  const {
    verdict,
    verdictLabel,
    riskLevel,
    overallConfidence,
    confidenceExplanation,
    anomalyPattern,
    dominantAnomalyType,
    dominantTypeRatio,
    topFrames,
    reasons,
    narrativeSummary,
    framesAnalyzed,
    framesWithAnomalies,
  } = summary

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/30">
          <Shield className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Forensic Summary</h3>
          <p className="text-xs text-muted-foreground">Evidence-based visual findings</p>
        </div>
      </div>

      <div className="space-y-4 px-5 py-4">
        {/* Verdict + Risk + Confidence row */}
        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-semibold ring-1 ${getVerdictColor(verdict)}`}>
            {verdictLabel}
          </span>
          <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ring-1 ${getRiskColor(riskLevel)}`}>
            {riskLevel} risk
          </span>
          <span className="group relative inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            Confidence: <span className="font-semibold text-foreground">{overallConfidence}%</span>
            <Info className="h-3 w-3 text-muted-foreground/50" />
            <span className="pointer-events-none absolute -top-8 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md bg-popover px-2.5 py-1 text-[10px] text-popover-foreground opacity-0 shadow-md ring-1 ring-border transition-opacity group-hover:opacity-100">
              {confidenceExplanation}
            </span>
          </span>
        </div>

        {/* Coverage */}
        <p className="text-xs text-muted-foreground">
          Analyzed <span className="font-medium text-foreground">{framesAnalyzed}</span> frames
          {framesWithAnomalies > 0 && (
            <> — <span className="font-medium text-foreground">{framesWithAnomalies}</span> with anomalies</>
          )}
        </p>

        {/* Top suspicious frames */}
        {topFrames.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Top Suspicious Frames
            </p>
            <div className="flex flex-wrap gap-3">
              {topFrames.map((frame) => (
                <FrameCard
                  key={frame.frameIndex}
                  frame={frame}
                  imageBase64={frameImages?.[frame.frameIndex]}
                />
              ))}
            </div>
          </div>
        )}

        {/* AI-Detected Suspicious Regions */}
        {regionAnalysis && regionAnalysis.regions.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Crosshair className="h-3.5 w-3.5 text-primary" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                AI-Detected Suspicious Regions
              </p>
            </div>

            {/* Region overlay on most suspicious frame */}
            {(() => {
              const bestFrameIdx = regionAnalysis.regions[0]?.box
                ? topFrames[0]?.frameIndex
                : undefined
              const bestFrameBase64 = bestFrameIdx !== undefined
                ? frameImages?.[bestFrameIdx]
                : undefined
              if (bestFrameBase64) {
                return (
                  <div className="mb-3">
                    <RegionOverlay
                      imageSrc={`data:image/jpeg;base64,${bestFrameBase64}`}
                      regions={regionAnalysis.regions}
                      selectedRegionId={selectedRegionId}
                      onRegionClick={(r) => setSelectedRegionId(
                        selectedRegionId === r.id ? undefined : r.id
                      )}
                    />
                  </div>
                )
              }
              return null
            })()}

            {/* Region detail cards */}
            <div className="space-y-2">
              {regionAnalysis.regions.map((region) => (
                <RegionDetailCard
                  key={region.id}
                  region={region}
                  isSelected={selectedRegionId === region.id}
                  onClick={() => setSelectedRegionId(
                    selectedRegionId === region.id ? undefined : region.id
                  )}
                />
              ))}
            </div>

            {/* Multi-frame note */}
            {regionAnalysis.regions.some((r) => r.frameCount > 1) && (
              <p className="mt-2 text-[10px] italic text-muted-foreground">
                Regions appearing across multiple frames indicate systematic patterns rather than isolated noise.
              </p>
            )}
          </div>
        )}

        {/* Pattern badge */}
        {anomalyPattern !== "none" && (
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${getPatternColor(anomalyPattern)}`}>
              {anomalyPattern}
            </span>
            {dominantAnomalyType && dominantTypeRatio >= 0.5 && (
              <span className="text-[11px] text-muted-foreground">
                dominant type: <span className="font-medium text-foreground">{formatAnomalyType(dominantAnomalyType)}</span>
              </span>
            )}
          </div>
        )}

        {/* Reasons */}
        {reasons.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Main Reasons
            </p>
            <ul className="space-y-1">
              {reasons.map((reason, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-secondary-foreground">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Narrative summary */}
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Summary
          </p>
          <p className="text-sm leading-relaxed text-secondary-foreground">
            {narrativeSummary}
          </p>
        </div>
      </div>
    </div>
  )
}
