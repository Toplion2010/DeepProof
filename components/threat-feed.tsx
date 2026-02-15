import { AlertTriangle, TrendingUp, Eye, Fingerprint } from "lucide-react"

const threats = [
  {
    icon: AlertTriangle,
    title: "GAN-based face swap detected",
    desc: "StyleGAN3 artifact pattern identified",
    severity: "high" as const,
    time: "5m",
  },
  {
    icon: Eye,
    title: "Temporal inconsistency flagged",
    desc: "Frame blending anomaly at 00:12-00:14",
    severity: "medium" as const,
    time: "18m",
  },
  {
    icon: Fingerprint,
    title: "Audio-visual desync",
    desc: "Lip movement mismatch confidence: 91%",
    severity: "high" as const,
    time: "34m",
  },
  {
    icon: TrendingUp,
    title: "New manipulation pattern",
    desc: "Diffusion model artifacts cataloged",
    severity: "low" as const,
    time: "1h",
  },
]

const severityColors = {
  high: "bg-destructive/10 text-destructive ring-destructive/20",
  medium: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
  low: "bg-primary/10 text-primary ring-primary/20",
}

export function ThreatFeed() {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Threat Intelligence</h2>
          <p className="text-xs text-muted-foreground">Real-time detection alerts</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1 text-[10px] font-medium text-destructive ring-1 ring-destructive/20">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" />
          LIVE
        </span>
      </div>
      <div className="divide-y divide-border">
        {threats.map((t, i) => (
          <div key={i} className="flex items-start gap-3 px-5 py-3.5">
            <div
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ${
                severityColors[t.severity]
              }`}
            >
              <t.icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{t.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t.desc}</p>
            </div>
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{t.time}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
