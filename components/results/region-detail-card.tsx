"use client"

import type { SuspiciousRegion } from "@/lib/region-analysis"

interface RegionDetailCardProps {
  region: SuspiciousRegion
  isSelected?: boolean
  onClick?: () => void
}

function getConfidenceBarColor(confidence: number) {
  if (confidence > 70) return "bg-red-500"
  if (confidence >= 40) return "bg-amber-500"
  return "bg-green-500"
}

function formatAnomalyType(type: string): string {
  return type.replace(/-/g, " ")
}

const SIGNAL_LABELS: Record<string, string> = {
  ela: "ELA",
  noise: "Noise",
  edge: "Edge",
}

export function RegionDetailCard({ region, isSelected, onClick }: RegionDetailCardProps) {
  const colorBorder = {
    red: "border-red-500/30",
    orange: "border-amber-500/30",
    gray: "border-border",
  }

  const colorBadge = {
    red: "bg-red-500/10 text-red-400 ring-red-500/20",
    orange: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
    gray: "bg-secondary text-muted-foreground ring-border",
  }

  return (
    <button
      onClick={onClick}
      className={`flex gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-secondary/50 ${
        isSelected ? "ring-2 ring-primary/50 " : ""
      }${colorBorder[region.colorClass]}`}
    >
      {/* Crop thumbnail */}
      {region.cropBase64 && (
        <div className="shrink-0">
          <img
            src={`data:image/jpeg;base64,${region.cropBase64}`}
            alt={`Region ${region.id + 1}`}
            className="h-16 w-16 rounded object-cover"
          />
        </div>
      )}

      {/* Details */}
      <div className="min-w-0 flex-1 space-y-1.5">
        {/* Header: anomaly type + confidence */}
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ring-1 ${colorBadge[region.colorClass]}`}>
            {formatAnomalyType(region.anomalyType)}
          </span>
          <span className="text-[10px] font-semibold text-foreground">
            {region.finalConfidence}%
          </span>
        </div>

        {/* Confidence bar */}
        <div>
          <div className="flex items-center justify-between text-[9px] text-muted-foreground">
            <span>Confidence</span>
            <span>Forensic: {Math.round(region.forensicIntensity)}</span>
          </div>
          <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full ${getConfidenceBarColor(region.finalConfidence)}`}
              style={{ width: `${region.finalConfidence}%` }}
            />
          </div>
        </div>

        {/* Explanation */}
        <p className="text-[10px] text-secondary-foreground line-clamp-2">
          {region.explanation}
        </p>

        {/* Source signals + consistency */}
        <div className="flex items-center gap-2">
          {region.sourceSignals.map((s) => (
            <span key={s} className="rounded bg-secondary px-1 py-0.5 text-[8px] font-medium text-muted-foreground">
              {SIGNAL_LABELS[s] ?? s}
            </span>
          ))}
          {region.frameCount > 1 && (
            <span className="text-[8px] text-muted-foreground">
              {region.frameCount} frames
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
