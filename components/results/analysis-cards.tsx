import { Video, AudioLines, Eye, AlertTriangle, Clock, Film, BarChart3, Waves } from "lucide-react"

interface VideoAnalysisData {
  score: number
  framesAnalyzed: number
  flaggedFrames: number
  resolution: string
  fps: number
}

interface AudioAnalysisData {
  score: number
  duration: string
  confidence: number
  sampleRate: string
  channels: number
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
          <p className="text-xs text-muted-foreground">Frame-by-frame forensic scan</p>
        </div>
        <span className={`font-mono text-lg font-bold ${label.className}`}>
          {data.score}%
        </span>
      </div>
      <div className="px-5 py-4">
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
          <StatItem
            icon={AlertTriangle}
            label="Flagged Frames"
            value={data.flaggedFrames.toString()}
            highlight={data.flaggedFrames > 0}
          />
          <StatItem icon={Eye} label="Resolution" value={data.resolution} />
          <StatItem icon={BarChart3} label="Frame Rate" value={`${data.fps} FPS`} />
        </div>
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
          <h3 className="text-sm font-semibold text-foreground">Audio Analysis</h3>
          <p className="text-xs text-muted-foreground">Spectral voice verification</p>
        </div>
        <span className={`font-mono text-lg font-bold ${label.className}`}>
          {data.score}%
        </span>
      </div>
      <div className="px-5 py-4">
        {/* Score bar */}
        <div className="mb-5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Synthesis probability</span>
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
          <StatItem icon={BarChart3} label="Confidence" value={`${data.confidence}%`} />
          <StatItem icon={Waves} label="Sample Rate" value={data.sampleRate} />
          <StatItem icon={AudioLines} label="Channels" value={data.channels === 1 ? "Mono" : "Stereo"} />
        </div>
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
