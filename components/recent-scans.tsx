import { FileVideo, CheckCircle2, AlertTriangle, Clock } from "lucide-react"

const scans = [
  {
    name: "interview_clip_final.mp4",
    status: "authentic" as const,
    confidence: 98.2,
    duration: "3.1s",
    time: "2 min ago",
  },
  {
    name: "press_conference_02.webm",
    status: "deepfake" as const,
    confidence: 94.7,
    duration: "5.4s",
    time: "12 min ago",
  },
  {
    name: "social_media_repost.mov",
    status: "authentic" as const,
    confidence: 99.1,
    duration: "2.8s",
    time: "28 min ago",
  },
  {
    name: "news_broadcast_excerpt.mp4",
    status: "deepfake" as const,
    confidence: 87.3,
    duration: "7.2s",
    time: "1 hr ago",
  },
  {
    name: "testimony_recording.mp4",
    status: "authentic" as const,
    confidence: 96.5,
    duration: "4.0s",
    time: "2 hr ago",
  },
]

export function RecentScans() {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Recent Scans</h2>
          <p className="text-xs text-muted-foreground">Latest forensic analysis results</p>
        </div>
        <button className="text-xs font-medium text-primary hover:text-primary/80 transition-colors">
          View All
        </button>
      </div>
      <div className="divide-y divide-border">
        {scans.map((scan, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-secondary/40"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
              <FileVideo className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{scan.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="font-mono text-[10px] text-muted-foreground">
                  {scan.duration} &middot; {scan.time}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden font-mono text-xs text-muted-foreground sm:block">
                {scan.confidence}%
              </span>
              <StatusBadge status={scan.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: "authentic" | "deepfake" }) {
  if (status === "authentic") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-green-500/10 px-2.5 py-1 text-[11px] font-medium text-green-400 ring-1 ring-green-500/20">
        <CheckCircle2 className="h-3 w-3" />
        Authentic
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive ring-1 ring-destructive/20">
      <AlertTriangle className="h-3 w-3" />
      Deepfake
    </span>
  )
}
