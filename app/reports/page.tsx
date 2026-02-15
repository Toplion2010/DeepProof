"use client"

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
import { FileVideo, Search, Download, Eye } from "lucide-react"
import Link from "next/link"

const mockReports = [
  {
    id: "RPT-0047",
    fileName: "press_conference_02.webm",
    date: "Feb 13, 2026",
    score: 73,
    status: "Deepfake Detected" as const,
    fileSize: "142.8 MB",
  },
  {
    id: "RPT-0046",
    fileName: "interview_ceo_q4.mp4",
    date: "Feb 12, 2026",
    score: 12,
    status: "Authentic" as const,
    fileSize: "98.3 MB",
  },
  {
    id: "RPT-0045",
    fileName: "news_segment_clip.mov",
    date: "Feb 11, 2026",
    score: 89,
    status: "Deepfake Detected" as const,
    fileSize: "210.1 MB",
  },
  {
    id: "RPT-0044",
    fileName: "product_demo_v3.mp4",
    date: "Feb 10, 2026",
    score: 8,
    status: "Authentic" as const,
    fileSize: "65.7 MB",
  },
  {
    id: "RPT-0043",
    fileName: "social_media_reel.mp4",
    date: "Feb 9, 2026",
    score: 54,
    status: "Inconclusive" as const,
    fileSize: "34.2 MB",
  },
  {
    id: "RPT-0042",
    fileName: "webinar_recording.webm",
    date: "Feb 8, 2026",
    score: 5,
    status: "Authentic" as const,
    fileSize: "312.0 MB",
  },
  {
    id: "RPT-0041",
    fileName: "surveillance_cam_03.mp4",
    date: "Feb 7, 2026",
    score: 67,
    status: "Deepfake Detected" as const,
    fileSize: "78.9 MB",
  },
  {
    id: "RPT-0040",
    fileName: "testimony_clip.mov",
    date: "Feb 6, 2026",
    score: 91,
    status: "Deepfake Detected" as const,
    fileSize: "156.4 MB",
  },
]

function getScoreColor(score: number) {
  if (score <= 30) return "text-green-400"
  if (score <= 60) return "text-yellow-400"
  return "text-red-400"
}

function getStatusBadge(status: "Authentic" | "Deepfake Detected" | "Inconclusive") {
  switch (status) {
    case "Authentic":
      return <Badge className="bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/10">{status}</Badge>
    case "Deepfake Detected":
      return <Badge className="bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/10">{status}</Badge>
    case "Inconclusive":
      return <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 hover:bg-yellow-500/10">{status}</Badge>
  }
}

export default function ReportsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <DeepProofHeader />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-8">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Analysis Reports</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Browse and export past deepfake analysis results
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search reports..."
              className="pl-9 bg-card border-border"
            />
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Total Reports", value: "47" },
            { label: "Deepfakes Found", value: "18" },
            { label: "Authentic", value: "24" },
            { label: "Inconclusive", value: "5" },
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
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Report ID</TableHead>
                <TableHead className="text-muted-foreground">File</TableHead>
                <TableHead className="text-muted-foreground">Date</TableHead>
                <TableHead className="text-muted-foreground">Score</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-right text-muted-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockReports.map((report) => (
                <TableRow key={report.id} className="border-border">
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {report.id}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileVideo className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{report.fileName}</p>
                        <p className="text-xs text-muted-foreground">{report.fileSize}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{report.date}</TableCell>
                  <TableCell>
                    <span className={`font-mono text-sm font-semibold ${getScoreColor(report.score)}`}>
                      {report.score}%
                    </span>
                  </TableCell>
                  <TableCell>{getStatusBadge(report.status)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href="/results"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                        aria-label="View report"
                      >
                        <Eye className="h-4 w-4" />
                      </Link>
                      <button
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                        aria-label="Download report"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
