import { ScanSearch, ShieldCheck, AlertTriangle, Clock } from "lucide-react"

const stats = [
  {
    label: "Scans Today",
    value: "1,284",
    change: "+12%",
    icon: ScanSearch,
  },
  {
    label: "Verified Authentic",
    value: "1,091",
    change: "85.0%",
    icon: ShieldCheck,
  },
  {
    label: "Deepfakes Found",
    value: "193",
    change: "15.0%",
    icon: AlertTriangle,
  },
  {
    label: "Avg. Analysis Time",
    value: "4.2s",
    change: "-8%",
    icon: Clock,
  },
]

export function StatsPanel() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {stat.label}
            </span>
            <stat.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <p className="text-2xl font-semibold tracking-tight text-foreground">
            {stat.value}
          </p>
          <p className="mt-1 font-mono text-xs text-primary">{stat.change}</p>
        </div>
      ))}
    </div>
  )
}
