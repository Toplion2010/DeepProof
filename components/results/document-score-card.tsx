import { FileText, Info } from "lucide-react"

interface DocumentScoreCardProps {
  finalFraudScore: number
  visionScore: number
  contentScore: number
  metadataScore: number
  fileType: "pdf" | "image"
  pageCount: number
  confidence: "low" | "medium" | "high"
  fileHash: string
  metadataSignals?: {
    flags: string[]
  }
  degradedReasons?: string[]
}

function getBarColor(score: number) {
  if (score <= 30) return "bg-green-500"
  if (score <= 60) return "bg-amber-500"
  return "bg-red-500"
}

function getScoreLabel(score: number) {
  if (score <= 30) return { text: "Low Risk", className: "text-green-400" }
  if (score <= 60) return { text: "Medium Risk", className: "text-amber-400" }
  return { text: "High Risk", className: "text-red-400" }
}

export function DocumentScoreCard({
  finalFraudScore,
  visionScore,
  contentScore,
  metadataScore,
  fileType,
  pageCount,
  confidence,
  fileHash,
  metadataSignals,
  degradedReasons,
}: DocumentScoreCardProps) {
  const label = getScoreLabel(finalFraudScore)
  const hashPreview = fileHash.slice(0, 8).toUpperCase()

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/20 ring-1 ring-cyan-500/30">
          <FileText className="h-4 w-4 text-cyan-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-foreground">Document Analysis</h3>
          <p className="text-xs text-muted-foreground">Document integrity assessment</p>
        </div>
        <span className={`font-mono text-lg font-bold ${label.className}`}>
          {Math.round(finalFraudScore)}%
        </span>
      </div>
      <div className="px-5 py-4">
        {/* Degraded banner */}
        {degradedReasons && degradedReasons.length > 0 && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
            <div className="text-[11px] text-amber-500 space-y-0.5">
              {degradedReasons.map((reason, i) => (
                <p key={i}>{reason}</p>
              ))}
            </div>
          </div>
        )}

        {/* Score bar */}
        <div className="mb-5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Fraud probability</span>
            <span className={`text-xs font-medium ${label.className}`}>{label.text}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full transition-all duration-700 ${getBarColor(finalFraudScore)}`}
              style={{ width: `${finalFraudScore}%` }}
            />
          </div>
        </div>

        {/* Score breakdown sub-panel */}
        <div className="mb-5 rounded-lg border border-border bg-secondary/30 p-3">
          <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Score Breakdown
          </p>
          <div className="space-y-2">
            <ScoreBreakdownItem label="Vision Score" score={visionScore} />
            <ScoreBreakdownItem label="Content Score" score={contentScore} />
            <ScoreBreakdownItem label="Metadata Score" score={metadataScore} />
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <StatItem label="File Type" value={fileType.toUpperCase()} />
          <StatItem label="Pages" value={pageCount.toString()} />
          <StatItem label="Confidence" value={confidence.charAt(0).toUpperCase() + confidence.slice(1)} />
          <StatItem label="File Hash" value={hashPreview} />
        </div>

        {/* Metadata signals sub-panel */}
        {metadataSignals && metadataSignals.flags.length > 0 && (
          <div className="rounded-lg border border-border bg-secondary/30 px-4 py-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Metadata Signals
            </p>
            <ul className="space-y-1.5">
              {metadataSignals.flags.map((flag, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                  {flag}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

function ScoreBreakdownItem({ label, score }: { label: string; score: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <span className={`text-xs font-medium ${getScoreLabel(score).className}`}>
          {Math.round(score)}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full rounded-full ${getBarColor(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  )
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary/50 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="font-mono text-sm font-semibold text-foreground">
        {value}
      </p>
    </div>
  )
}
