import { Video, AudioLines, Eye, AlertTriangle, Clock, Film, BarChart3, Users, Languages, MessageSquare, Info, Shield, Waves } from "lucide-react"

interface VideoAnalysisData {
  score: number
  framesAnalyzed: number
  facesDetected: number
  confidence: "low" | "medium" | "high"
  resolution: string
  fps: number
  degraded: boolean
  visionFindings?: string[]
  visionDegraded?: boolean
  forensicResult?: {
    elaScore: number
    elaFindings: string[]
    noiseScore: number
    noiseFindings: string[]
    framesAnalyzed: number
    degraded: boolean
  }
  temporalResult?: {
    consistencyScore: number
    findings: string[]
    framesInWindow: number
    degraded: boolean
  }
  frameExplanationCount?: number
}

interface AudioAnalysisData {
  score: number
  duration: string
  segmentCount: number
  speakerCount: number
  language: string
  degraded: boolean
  speakerConfidence?: "low" | "medium" | "high"
  speakerMethod?: "audio-features" | "pause-heuristic"
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

export function VideoAnalysisCard({ data }: { data: VideoAnalysisData }) {
  const label = getScoreLabel(data.score)

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/30">
          <Video className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-foreground">Video Analysis</h3>
          <p className="text-xs text-muted-foreground">Visual deepfake detection</p>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className={`font-mono text-lg font-bold ${label.className}`}>
            {data.score}%
          </span>
          {data.frameExplanationCount != null && data.frameExplanationCount > 0 && (
            <a href="#frame-explanations" className="text-[10px] text-primary hover:underline">
              {data.frameExplanationCount} frames explained
            </a>
          )}
        </div>
      </div>
      <div className="px-5 py-4">
        {/* Degraded banner */}
        {data.degraded && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
            <Info className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <p className="text-[11px] text-amber-500">
              Visual detection unavailable — score based on transcript analysis only
            </p>
          </div>
        )}

        {/* Score bar */}
        <div className="mb-5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Manipulation probability</span>
            <span className={`text-xs font-medium ${label.className}`}>{label.text}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full transition-all duration-700 ${getBarColor(data.score)}`}
              style={{ width: `${data.score}%` }}
            />
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-4">
          <StatItem icon={Film} label="Frames Analyzed" value={data.framesAnalyzed.toLocaleString()} />
          <StatItem icon={Eye} label="Faces Detected" value={data.facesDetected.toString()} />
          <StatItem icon={BarChart3} label="Confidence" value={data.confidence.charAt(0).toUpperCase() + data.confidence.slice(1)} />
          <StatItem icon={AlertTriangle} label="Resolution" value={data.resolution} />
        </div>

        {/* Vision AI Observations */}
        {data.visionFindings && data.visionFindings.length > 0 && (
          <div className="mt-4 rounded-lg border border-border bg-secondary/30 px-4 py-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Vision AI Observations
            </p>
            <ul className="space-y-1.5">
              {data.visionFindings.map((finding, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                  {finding}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[10px] italic text-muted-foreground/60">
              Vision AI describes visual anomalies only — it does not determine whether the video is fake.
            </p>
          </div>
        )}
        {data.visionDegraded && !data.visionFindings?.length && (
          <p className="mt-3 text-[10px] text-amber-500 italic">
            Vision AI analysis unavailable
          </p>
        )}

        {/* Forensic Analysis */}
        {data.forensicResult && !data.forensicResult.degraded && (
          <div className="mt-4 rounded-lg border border-border bg-secondary/30 px-4 py-3">
            <div className="mb-2 flex items-center gap-2">
              <Shield className="h-3.5 w-3.5 text-primary" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Forensic Analysis
              </p>
            </div>
            <div className="mb-2 grid grid-cols-2 gap-2">
              <div className="rounded-md bg-secondary/50 px-2.5 py-1.5">
                <p className="text-[10px] text-muted-foreground">ELA Score</p>
                <p className={`font-mono text-sm font-bold ${data.forensicResult.elaScore > 50 ? "text-red-400" : data.forensicResult.elaScore > 25 ? "text-amber-400" : "text-green-400"}`}>
                  {Math.round(data.forensicResult.elaScore)}%
                </p>
              </div>
              <div className="rounded-md bg-secondary/50 px-2.5 py-1.5">
                <p className="text-[10px] text-muted-foreground">Noise Score</p>
                <p className={`font-mono text-sm font-bold ${data.forensicResult.noiseScore > 50 ? "text-red-400" : data.forensicResult.noiseScore > 25 ? "text-amber-400" : "text-green-400"}`}>
                  {Math.round(data.forensicResult.noiseScore)}%
                </p>
              </div>
            </div>
            <ul className="space-y-1">
              {[...data.forensicResult.elaFindings, ...data.forensicResult.noiseFindings].map((finding, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                  {finding}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Temporal Consistency */}
        {data.temporalResult && !data.temporalResult.degraded && (
          <div className="mt-4 rounded-lg border border-border bg-secondary/30 px-4 py-3">
            <div className="mb-2 flex items-center gap-2">
              <Waves className="h-3.5 w-3.5 text-primary" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Temporal Consistency
              </p>
            </div>
            <div className="mb-2">
              <div className="rounded-md bg-secondary/50 px-2.5 py-1.5 inline-block">
                <p className="text-[10px] text-muted-foreground">Consistency Score</p>
                <p className={`font-mono text-sm font-bold ${data.temporalResult.consistencyScore > 50 ? "text-red-400" : data.temporalResult.consistencyScore > 25 ? "text-amber-400" : "text-green-400"}`}>
                  {Math.round(data.temporalResult.consistencyScore)}%
                </p>
              </div>
            </div>
            <ul className="space-y-1">
              {data.temporalResult.findings.map((finding, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                  {finding}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

export function AudioAnalysisCard({ data }: { data: AudioAnalysisData }) {
  const label = getScoreLabel(data.score)

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/30">
          <AudioLines className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-foreground">Audio & Transcript Analysis</h3>
          <p className="text-xs text-muted-foreground">Transcript-based factual analysis</p>
        </div>
        <span className={`font-mono text-lg font-bold ${label.className}`}>
          {data.score}%
        </span>
      </div>
      <div className="px-5 py-4">
        {/* Degraded banner */}
        {data.degraded && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
            <Info className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <p className="text-[11px] text-amber-500">
              Transcription unavailable — score based on visual analysis only
            </p>
          </div>
        )}

        {/* Score bar */}
        <div className="mb-5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Factual inconsistency score</span>
            <span className={`text-xs font-medium ${label.className}`}>{label.text}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full transition-all duration-700 ${getBarColor(data.score)}`}
              style={{ width: `${data.score}%` }}
            />
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-4">
          <StatItem icon={Clock} label="Duration" value={data.duration} />
          <StatItem icon={MessageSquare} label="Segments" value={data.segmentCount.toString()} />
          <StatItem icon={Users} label="Speakers" value={data.speakerCount.toString()} />
          <StatItem icon={Languages} label="Language" value={data.language.toUpperCase()} />
        </div>

        {/* Speaker confidence badge */}
        {data.speakerConfidence && data.speakerMethod === "audio-features" ? (
          <div className="mt-4 flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Speaker Detection
            </span>
            <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${
              data.speakerConfidence === "high" ? "bg-green-500/10 text-green-400"
                : data.speakerConfidence === "medium" ? "bg-amber-500/10 text-amber-400"
                : "bg-secondary text-muted-foreground"
            }`}>
              {data.speakerConfidence} confidence
            </span>
          </div>
        ) : (
          <p className="mt-4 text-[10px] text-muted-foreground/60 italic">
            Speaker detection: pause-heuristic (basic)
          </p>
        )}
      </div>
    </div>
  )
}

function StatItem({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-secondary/50 px-3 py-2.5">
      <Icon
        className={`h-4 w-4 shrink-0 ${
          highlight ? "text-red-400" : "text-muted-foreground"
        }`}
      />
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p
          className={`font-mono text-sm font-semibold ${
            highlight ? "text-red-400" : "text-foreground"
          }`}
        >
          {value}
        </p>
      </div>
    </div>
  )
}
