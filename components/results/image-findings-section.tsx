import { Scale, AlertCircle, CheckCircle2, AlertTriangle } from "lucide-react"
import type { ImageFinding } from "@/lib/image-analysis"

interface ImageFindingsSectionProps {
  findings: ImageFinding[]
}

function getSeverityConfig(severity: "low" | "medium" | "high") {
  switch (severity) {
    case "low":
      return {
        bgClass: "bg-green-500/10",
        textClass: "text-green-400",
        ringClass: "ring-green-500/25",
        label: "Low",
      }
    case "medium":
      return {
        bgClass: "bg-amber-500/10",
        textClass: "text-amber-400",
        ringClass: "ring-amber-500/25",
        label: "Medium",
      }
    case "high":
      return {
        bgClass: "bg-red-500/10",
        textClass: "text-red-400",
        ringClass: "ring-red-500/25",
        label: "High",
      }
  }
}

function getFindingIcon(finding: ImageFinding) {
  if (finding.type === "authentic-signal") {
    return <CheckCircle2 className="h-4 w-4" />
  }

  switch (finding.severity) {
    case "high":
      return <AlertCircle className="h-4 w-4" />
    case "medium":
      return <AlertTriangle className="h-4 w-4" />
    default:
      return <AlertTriangle className="h-4 w-4" />
  }
}

function getSourceLabel(source: "vision" | "metadata" | "system"): string {
  switch (source) {
    case "vision":
      return "Vision Model"
    case "metadata":
      return "Metadata"
    case "system":
      return "System"
  }
}

export function ImageFindingsSection({ findings }: ImageFindingsSectionProps) {
  const highCount = findings.filter((f) => f.severity === "high" && f.type !== "authentic-signal").length
  const mediumCount = findings.filter((f) => f.severity === "medium" && f.type !== "authentic-signal").length
  const lowCount = findings.filter((f) => f.severity === "low" && f.type !== "authentic-signal").length
  const authenticCount = findings.filter((f) => f.type === "authentic-signal").length

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/30">
            <Scale className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Image Forensic Findings</h3>
            <p className="text-xs text-muted-foreground">
              Detected anomalies and authenticity signals
            </p>
          </div>
        </div>

        {/* Summary counts */}
        <div className="hidden flex-wrap items-center gap-2 sm:flex">
          {highCount > 0 && <SummaryPill count={highCount} label="High" color="red" />}
          {mediumCount > 0 && <SummaryPill count={mediumCount} label="Medium" color="amber" />}
          {lowCount > 0 && <SummaryPill count={lowCount} label="Low" color="green" />}
          {authenticCount > 0 && <SummaryPill count={authenticCount} label="Authentic" color="blue" />}
        </div>
      </div>

      <div className="divide-y divide-border/50">
        {findings.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-muted-foreground">No findings detected</p>
          </div>
        ) : (
          findings.map((finding, i) => {
            const config = finding.type === "authentic-signal"
              ? {
                  bgClass: "bg-blue-500/10",
                  textClass: "text-blue-400",
                  ringClass: "ring-blue-500/25",
                  label: "Authentic",
                }
              : getSeverityConfig(finding.severity)

            return (
              <div
                key={i}
                className={`flex gap-4 px-5 py-4 transition-colors`}
              >
                <div
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ${config.bgClass} ${config.textClass} ${config.ringClass}`}
                >
                  {getFindingIcon(finding)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-relaxed text-foreground">
                    {finding.description}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${config.bgClass} ${config.textClass} ${config.ringClass}`}
                    >
                      {config.label}
                    </span>
                    <span className="rounded-md bg-secondary px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {getSourceLabel(finding.source)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function SummaryPill({
  count,
  label,
  color,
}: {
  count: number
  label: string
  color: "green" | "red" | "amber" | "blue"
}) {
  const colorMap = {
    green: "bg-green-500/10 text-green-400",
    red: "bg-red-500/10 text-red-400",
    amber: "bg-amber-500/10 text-amber-400",
    blue: "bg-blue-500/10 text-blue-400",
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] font-medium ${colorMap[color]}`}
    >
      {count} {label}
    </span>
  )
}
