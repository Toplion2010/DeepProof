"use client"

import { useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Upload, ImageIcon, X, ShieldAlert, CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { setUploadedImage } from "@/lib/image-store"

type UploadState = "idle" | "dragging" | "uploading" | "complete"

interface SelectedFile {
  file: File
  name: string
  size: string
  type: string
}

export function ImageUploadZone() {
  const router = useRouter()
  const [state, setState] = useState<UploadState>("idle")
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  const acceptedTypes = ["image/jpeg", "image/png", "image/webp"]

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const handleFile = useCallback((file: File) => {
    if (!acceptedTypes.includes(file.type)) return
    const typeLabel = file.type.split("/")[1].toUpperCase()
    setSelectedFile({
      file,
      name: file.name,
      size: formatSize(file.size),
      type: typeLabel,
    })
    setState("idle")
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setState("idle")
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setState("dragging")
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setState("idle")
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const handleAnalyze = () => {
    if (!selectedFile) return
    setState("uploading")
    setUploadedImage(selectedFile.file)
    router.push("/images/results")
  }

  const handleReset = () => {
    setState("idle")
    setSelectedFile(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Upload Dropzone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => state === "idle" && !selectedFile && inputRef.current?.click()}
        className={`group relative cursor-pointer overflow-hidden rounded-xl border-2 border-dashed transition-all duration-300 ${
          state === "dragging"
            ? "border-primary bg-primary/5 scale-[1.02]"
            : state === "uploading"
            ? "border-primary/40 bg-card"
            : state === "complete"
            ? "border-green-500/40 bg-card"
            : selectedFile
            ? "border-border bg-card cursor-default"
            : "border-border hover:border-primary/50 hover:bg-card/80 animate-border-glow"
        }`}
      >
        {/* Scan line effect for uploading state */}
        {state === "uploading" && (
          <div className="pointer-events-none absolute left-0 right-0 h-px bg-primary/60 animate-scan-line" />
        )}

        <div className="relative z-10 flex flex-col items-center justify-center px-6 py-16">
          {state === "complete" ? (
            <CompleteView fileName={selectedFile?.name ?? ""} onReset={handleReset} />
          ) : selectedFile && state !== "uploading" ? (
            <FileSelectedView file={selectedFile} onRemove={handleReset} onAnalyze={handleAnalyze} />
          ) : state === "uploading" ? (
            <UploadingView />
          ) : (
            <IdleView isDragging={state === "dragging"} />
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp"
          onChange={handleInputChange}
          className="hidden"
          aria-label="Upload image file"
        />
      </div>

      {/* Supported formats */}
      <div className="mt-4 flex items-center justify-center gap-3">
        {["JPEG", "PNG", "WebP"].map((fmt) => (
          <span
            key={fmt}
            className="rounded bg-secondary px-2.5 py-1 font-mono text-[10px] tracking-wider text-muted-foreground"
          >
            {fmt}
          </span>
        ))}
        <span className="text-xs text-muted-foreground">
          {"Max 25MB"}
        </span>
      </div>
    </div>
  )
}

function IdleView({ isDragging }: { isDragging: boolean }) {
  return (
    <>
      <div
        className={`mb-6 flex h-16 w-16 items-center justify-center rounded-2xl transition-all duration-300 ${
          isDragging
            ? "bg-primary/20 ring-2 ring-primary/40 scale-110"
            : "bg-secondary ring-1 ring-border group-hover:ring-primary/30"
        }`}
      >
        <Upload
          className={`h-7 w-7 transition-colors ${
            isDragging ? "text-primary" : "text-muted-foreground group-hover:text-primary"
          }`}
        />
      </div>
      <p className="mb-2 text-base font-medium text-foreground">
        {isDragging ? "Release to upload" : "Drop your image here"}
      </p>
      <p className="mb-6 text-sm text-muted-foreground">
        or click to browse files from your device
      </p>
      <Button
        variant="outline"
        size="sm"
        className="border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
      >
        <ImageIcon className="mr-2 h-4 w-4" />
        Select Image
      </Button>
    </>
  )
}

function FileSelectedView({
  file,
  onRemove,
  onAnalyze,
}: {
  file: SelectedFile
  onRemove: () => void
  onAnalyze: () => void
}) {
  const [consentGiven, setConsentGiven] = useState(false)

  return (
    <>
      <div className="mb-4 flex w-full max-w-md items-center gap-4 rounded-lg bg-secondary/60 p-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/30">
          <ImageIcon className="h-6 w-6 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {file.type} &middot; {file.size}
          </p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          aria-label="Remove file"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Consent notice */}
      <div className="mb-4 w-full max-w-md rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={consentGiven}
            onChange={(e) => setConsentGiven(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
          />
          <span className="text-xs text-muted-foreground leading-relaxed">
            I consent to send this image to Groq AI for authenticity analysis. No data is stored after processing.
          </span>
        </label>
      </div>

      <Button
        onClick={(e) => {
          e.stopPropagation()
          onAnalyze()
        }}
        disabled={!consentGiven}
        className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        <ShieldAlert className="mr-2 h-4 w-4" />
        Begin Authenticity Analysis
      </Button>
    </>
  )
}

function UploadingView() {
  return (
    <>
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-2 ring-primary/40">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
      <p className="mb-2 text-base font-medium text-foreground">
        Analyzing Image
      </p>
      <p className="text-sm text-muted-foreground">
        Processing image and running authenticity checks...
      </p>
    </>
  )
}

function CompleteView({ fileName, onReset }: { fileName: string; onReset: () => void }) {
  return (
    <>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10 ring-2 ring-green-500/30">
        <CheckCircle2 className="h-7 w-7 text-green-400" />
      </div>
      <p className="mb-1 text-base font-medium text-foreground">Analysis Complete</p>
      <p className="mb-6 font-mono text-xs text-muted-foreground">{fileName}</p>
      <Button
        variant="outline"
        size="sm"
        onClick={(e) => {
          e.stopPropagation()
          onReset()
        }}
      >
        New Analysis
      </Button>
    </>
  )
}
