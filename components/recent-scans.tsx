"use client"

import { useEffect, useState } from "react"
import { FileVideo, FileText, ImageIcon, CheckCircle2, AlertTriangle, Clock, HelpCircle } from "lucide-react"
import Link from "next/link"
import { fetchRecentScans, type ScanRow } from "@/lib/scans"

const fileTypeIcons = {
  video: FileVideo,
  document: FileText,
  image: ImageIcon,
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hr ago`
  const diffDays = Math.floor(diffHr / 24)
  return `${diffDays}d ago`
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "--"
  return `${(ms / 1000).toFixed(1)}s`
}

export function RecentScans() {
  const [scans, setScans] = useState<ScanRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchRecentScans(5).then((data) => {
      setScans(data)
      setLoading(false)
    })
  }, [])

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Community Scans</h2>
          <p className="text-xs text-muted-foreground">Latest scans from all users</p>
        </div>
        <Link
          href="/reports"
          className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          View All
        </Link>
      </div>
      <div className="divide-y divide-border">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5">
              <div className="h-9 w-9 rounded-lg bg-secondary animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 rounded bg-secondary animate-pulse" />
                <div className="h-3 w-24 rounded bg-secondary animate-pulse" />
              </div>
              <div className="h-6 w-20 rounded bg-secondary animate-pulse" />
            </div>
          ))
        ) : scans.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-muted-foreground">No scans yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Upload a video, document, or image to get started
            </p>
          </div>
        ) : (
          scans.map((scan) => {
            const Icon = fileTypeIcons[scan.file_type] ?? FileVideo
            return (
              <div
                key={scan.id}
                className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-secondary/40"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{scan.file_name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {formatDuration(scan.duration_ms)} &middot; {formatRelativeTime(scan.created_at)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="hidden font-mono text-xs text-muted-foreground sm:block">
                    {scan.score}%
                  </span>
                  <StatusBadge status={scan.status} />
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: "authentic" | "deepfake" | "inconclusive" }) {
  if (status === "authentic") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-green-500/10 px-2.5 py-1 text-[11px] font-medium text-green-400 ring-1 ring-green-500/20">
        <CheckCircle2 className="h-3 w-3" />
        Authentic
      </span>
    )
  }
  if (status === "inconclusive") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-yellow-500/10 px-2.5 py-1 text-[11px] font-medium text-yellow-400 ring-1 ring-yellow-500/20">
        <HelpCircle className="h-3 w-3" />
        Inconclusive
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
