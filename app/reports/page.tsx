"use client"

import { useEffect, useState } from "react"
import { DeepProofHeader } from "@/components/deepproof-header"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { FileVideo, FileText, ImageIcon, Search, Loader2 } from "lucide-react"
import { fetchRecentScans, type ScanRow } from "@/lib/scans"

const fileTypeIcons: Record<string, typeof FileVideo> = {
  video: FileVideo,
  document: FileText,
  image: ImageIcon,
}

function getScoreColor(score: number) {
  if (score <= 30) return "text-green-400"
  if (score <= 60) return "text-yellow-400"
  return "text-red-400"
}

function getStatusBadge(status: "authentic" | "deepfake" | "inconclusive") {
  switch (status) {
    case "authentic":
      return <Badge className="bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/10">Authentic</Badge>
    case "deepfake":
      return <Badge className="bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/10">Deepfake Detected</Badge>
    case "inconclusive":
      return <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 hover:bg-yellow-500/10">Inconclusive</Badge>
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export default function ReportsPage() {
  const [scans, setScans] = useState<ScanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    fetchRecentScans().then((data) => {
      setScans(data)
      setLoading(false)
    })
  }, [])

  const filtered = searchQuery
    ? scans.filter((s) =>
        s.file_name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : scans

  const total = scans.length
  const deepfakes = scans.filter((s) => s.status === "deepfake").length
  const authentic = scans.filter((s) => s.status === "authentic").length
  const inconclusive = scans.filter((s) => s.status === "inconclusive").length

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <DeepProofHeader />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-8">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Analysis Reports</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Browse past deepfake analysis results
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search reports..."
              className="pl-9 bg-card border-border"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Total Reports", value: loading ? "--" : String(total) },
            { label: "Deepfakes Found", value: loading ? "--" : String(deepfakes) },
            { label: "Authentic", value: loading ? "--" : String(authentic) },
            { label: "Inconclusive", value: loading ? "--" : String(inconclusive) },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-border bg-card px-4 py-3"
            >
              <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                {stat.label}
              </p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Reports table */}
        <div className="rounded-xl border border-border bg-card">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-16">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading reports...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-muted-foreground">
                {searchQuery ? "No reports match your search" : "No analysis reports yet"}
              </p>
              {!searchQuery && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Run your first scan from the Dashboard to see results here
                </p>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">File</TableHead>
                  <TableHead className="text-muted-foreground">Type</TableHead>
                  <TableHead className="text-muted-foreground">Date</TableHead>
                  <TableHead className="text-muted-foreground">Score</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((scan) => {
                  const Icon = fileTypeIcons[scan.file_type] ?? FileVideo
                  return (
                    <TableRow key={scan.id} className="border-border">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <p className="text-sm font-medium text-foreground">{scan.file_name}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm capitalize text-muted-foreground">
                        {scan.file_type}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(scan.created_at)}
                      </TableCell>
                      <TableCell>
                        <span className={`font-mono text-sm font-semibold ${getScoreColor(scan.score)}`}>
                          {scan.score}%
                        </span>
                      </TableCell>
                      <TableCell>{getStatusBadge(scan.status)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Footer */}
        <footer className="border-t border-border pt-6 pb-4">
          <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              DeepProof &middot; Classification: Internal Use Only
            </p>
            <p className="font-mono text-[10px] text-muted-foreground">
              Engine v2.4.1 &middot; Models updated Feb 2026
            </p>
          </div>
        </footer>
      </main>
    </div>
  )
}
