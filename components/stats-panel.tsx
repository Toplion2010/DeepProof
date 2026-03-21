"use client"

import { useEffect, useState } from "react"
import { ScanSearch, ShieldCheck, AlertTriangle, Clock } from "lucide-react"
import { fetchRecentScans, type ScanRow } from "@/lib/scans"

export function StatsPanel() {
  const [scans, setScans] = useState<ScanRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchRecentScans().then((data) => {
      setScans(data)
      setLoading(false)
    })
  }, [])

  const total = scans.length
  const authentic = scans.filter((s) => s.status === "authentic").length
  const deepfakes = scans.filter((s) => s.status === "deepfake").length
  const durations = scans.map((s) => s.duration_ms).filter((d): d is number => d != null)
  const avgTime = durations.length > 0
    ? (durations.reduce((a, b) => a + b, 0) / durations.length / 1000).toFixed(1) + "s"
    : "--"

  const stats = [
    {
      label: "Total Scans",
      value: loading ? "--" : total.toLocaleString(),
      change: loading ? "" : total > 0 ? `${total} total` : "No scans yet",
      icon: ScanSearch,
    },
    {
      label: "Verified Authentic",
      value: loading ? "--" : authentic.toLocaleString(),
      change: loading ? "" : total > 0 ? `${((authentic / total) * 100).toFixed(1)}%` : "0%",
      icon: ShieldCheck,
    },
    {
      label: "Deepfakes Found",
      value: loading ? "--" : deepfakes.toLocaleString(),
      change: loading ? "" : total > 0 ? `${((deepfakes / total) * 100).toFixed(1)}%` : "0%",
      icon: AlertTriangle,
    },
    {
      label: "Avg. Analysis Time",
      value: loading ? "--" : avgTime,
      change: loading ? "" : durations.length > 0 ? `${durations.length} timed` : "No data",
      icon: Clock,
    },
  ]

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
