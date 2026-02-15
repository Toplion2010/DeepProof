"use client"

import { useEffect, useState, useRef } from "react"
import { ShieldCheck } from "lucide-react"

interface AnalyzingScannerProps {
  fileName: string
  onComplete: () => void
}

const PHASES = [
  { label: "INITIALIZING NEURAL ENGINES", range: [0, 8] },
  { label: "EXTRACTING VIDEO FRAMES", range: [8, 22] },
  { label: "RUNNING FACE DETECTION MODEL", range: [22, 38] },
  { label: "ANALYZING TEMPORAL CONSISTENCY", range: [38, 52] },
  { label: "SPECTRAL AUDIO DECOMPOSITION", range: [52, 65] },
  { label: "CROSS-REFERENCING GAN SIGNATURES", range: [65, 78] },
  { label: "COMPILING FORENSIC REPORT", range: [78, 92] },
  { label: "FINALIZING ANALYSIS", range: [92, 100] },
] as const

function getPhase(progress: number) {
  for (const phase of PHASES) {
    if (progress >= phase.range[0] && progress < phase.range[1]) return phase.label
  }
  return PHASES[PHASES.length - 1].label
}

const DATA_LINES = [
  "0x4F2A :: face_mesh_delta > 0.034",
  "freq_band[3-6kHz] anomaly :: p=0.0021",
  "GAN_sig :: StyleGAN3 match 0.87",
  "temporal_jitter :: frames 847-912",
  "lip_sync_offset :: avg 47ms",
  "shadow_vector :: inconsistency @f1204",
  "chroma_sub :: artifacts detected",
  "neural_hash :: 0xDEAD4F2A1B3C",
  "audio_clone_prob :: 0.72",
  "blink_rate :: 4.1/min (low)",
  "skin_texture :: freq domain anomaly",
  "eye_reflection :: asymmetric @f334",
  "compression_artifact :: double_encode",
  "motion_vector :: discontinuity @t14.2s",
  "spectral_centroid :: shift detected",
  "phoneme_align :: drift > threshold",
]

export function AnalyzingScanner({ fileName, onComplete }: AnalyzingScannerProps) {
  const [progress, setProgress] = useState(0)
  const [visibleLines, setVisibleLines] = useState<string[]>([])
  const lineIndexRef = useRef(0)
  const logContainerRef = useRef<HTMLDivElement>(null)

  // Progress timer
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          return 100
        }
        // Variable speed: slow at start, faster in middle, slow at end
        const speed =
          prev < 10 ? 0.3 + Math.random() * 0.4 :
          prev < 85 ? 0.6 + Math.random() * 1.2 :
          0.15 + Math.random() * 0.3
        return Math.min(prev + speed, 100)
      })
    }, 80)
    return () => clearInterval(interval)
  }, [])

  // Data stream lines
  useEffect(() => {
    const interval = setInterval(() => {
      setVisibleLines((prev) => {
        const line = DATA_LINES[lineIndexRef.current % DATA_LINES.length]
        lineIndexRef.current++
        const next = [...prev, line]
        return next.length > 12 ? next.slice(-12) : next
      })
    }, 400)
    return () => clearInterval(interval)
  }, [])

  // Auto-scroll log
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [visibleLines])

  // Complete callback
  useEffect(() => {
    if (progress >= 100) {
      const timeout = setTimeout(onComplete, 1200)
      return () => clearTimeout(timeout)
    }
  }, [progress, onComplete])

  const phase = getPhase(progress)
  const isComplete = progress >= 100

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      {/* Animated background grid */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Hex grid pattern */}
        <svg className="absolute inset-0 h-full w-full animate-hex-glow" aria-hidden="true">
          <defs>
            <pattern id="hex-grid" width="60" height="52" patternUnits="userSpaceOnUse">
              <path
                d="M30 0 L60 15 L60 37 L30 52 L0 37 L0 15 Z"
                fill="none"
                stroke="hsl(192 90% 50%)"
                strokeWidth="0.3"
                opacity="0.15"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hex-grid)" />
        </svg>

        {/* Pulsing rings */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/20 animate-ring-pulse"
              style={{
                width: `${300 + i * 120}px`,
                height: `${300 + i * 120}px`,
                animationDelay: `${i * 0.7}s`,
              }}
            />
          ))}
        </div>

        {/* Horizontal scan line */}
        <div
          className="absolute left-0 right-0 h-px animate-scan-line"
          style={{
            background: "linear-gradient(90deg, transparent 0%, hsl(192 90% 50% / 0.4) 30%, hsl(192 90% 50% / 0.8) 50%, hsl(192 90% 50% / 0.4) 70%, transparent 100%)",
            boxShadow: "0 0 20px 2px hsl(192 90% 50% / 0.3)",
          }}
        />
      </div>

      {/* Main content */}
      <div className="relative z-10 flex w-full max-w-2xl flex-col items-center gap-8 px-6">
        {/* Central radar/scanner element */}
        <div className="relative flex h-52 w-52 items-center justify-center">
          {/* Rotating radar sweep */}
          <svg className="absolute inset-0 h-full w-full animate-radar-sweep" viewBox="0 0 200 200" aria-hidden="true">
            <defs>
              <linearGradient id="sweep-grad" gradientUnits="userSpaceOnUse" x1="100" y1="100" x2="100" y2="0">
                <stop offset="0%" stopColor="hsl(192 90% 50%)" stopOpacity="0" />
                <stop offset="100%" stopColor="hsl(192 90% 50%)" stopOpacity="0.4" />
              </linearGradient>
            </defs>
            <path
              d="M100 100 L100 0 A100 100 0 0 1 170.7 29.3 Z"
              fill="url(#sweep-grad)"
            />
          </svg>

          {/* Concentric circles */}
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 200 200" aria-hidden="true">
            {[30, 55, 80].map((r) => (
              <circle
                key={r}
                cx="100"
                cy="100"
                r={r}
                fill="none"
                stroke="hsl(192 90% 50%)"
                strokeWidth="0.5"
                opacity="0.15"
              />
            ))}
            {/* Crosshairs */}
            <line x1="100" y1="10" x2="100" y2="190" stroke="hsl(192 90% 50%)" strokeWidth="0.4" opacity="0.12" />
            <line x1="10" y1="100" x2="190" y2="100" stroke="hsl(192 90% 50%)" strokeWidth="0.4" opacity="0.12" />
          </svg>

          {/* Center shield icon */}
          <div className={`relative flex h-20 w-20 items-center justify-center rounded-2xl transition-all duration-700 ${
            isComplete
              ? "bg-green-500/15 ring-2 ring-green-500/40"
              : "bg-primary/10 ring-2 ring-primary/30"
          }`}>
            <ShieldCheck className={`h-9 w-9 transition-colors duration-700 ${isComplete ? "text-green-400" : "text-primary"}`} />
            {!isComplete && (
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary animate-pulse-glow" />
            )}
          </div>

          {/* Scattered detection points */}
          {!isComplete && (
            <DetectionDots progress={progress} />
          )}
        </div>

        {/* Status text */}
        <div className="flex flex-col items-center gap-3 text-center">
          <h2 className={`text-xl font-semibold tracking-tight transition-colors duration-500 ${
            isComplete ? "text-green-400" : "text-foreground"
          }`}>
            {isComplete ? "Analysis Complete" : "Analyzing Video"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isComplete
              ? "Forensic report ready for review"
              : "Detecting AI manipulation signals"
            }
          </p>

          {/* File name */}
          <div className="mt-1 flex items-center gap-2 rounded-md bg-secondary/60 px-3 py-1.5">
            <div className={`h-1.5 w-1.5 rounded-full ${isComplete ? "bg-green-400" : "bg-primary animate-pulse-glow"}`} />
            <span className="font-mono text-xs text-muted-foreground">{fileName}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full max-w-md">
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
            {/* Glow behind progress */}
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-200"
              style={{
                width: `${Math.min(progress, 100)}%`,
                background: isComplete
                  ? "linear-gradient(90deg, #22c55e, #4ade80)"
                  : "linear-gradient(90deg, hsl(200 80% 40%), hsl(192 90% 50%), hsl(185 85% 55%))",
                boxShadow: isComplete
                  ? "0 0 12px rgba(34,197,94,0.5)"
                  : "0 0 12px hsl(192 90% 50% / 0.5)",
              }}
            />
            {/* Animated shimmer overlay */}
            {!isComplete && progress < 100 && (
              <div
                className="absolute inset-y-0 left-0 overflow-hidden rounded-full"
                style={{ width: `${Math.min(progress, 100)}%` }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)",
                    animation: "shimmer 1.5s infinite",
                  }}
                />
              </div>
            )}
          </div>

          {/* Phase label + percentage */}
          <div className="mt-3 flex items-center justify-between">
            <span
              key={phase}
              className="animate-phase-in font-mono text-[10px] uppercase tracking-widest text-primary"
            >
              {phase}
            </span>
            <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
              {Math.round(Math.min(progress, 100))}%
            </span>
          </div>
        </div>

        {/* Data stream log */}
        <div className="w-full max-w-md">
          <div className="mb-2 flex items-center gap-2">
            <div className={`h-1.5 w-1.5 rounded-full ${isComplete ? "bg-green-400" : "bg-primary animate-pulse-glow"}`} />
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Forensic Log
            </span>
          </div>
          <div
            ref={logContainerRef}
            className="h-36 overflow-hidden rounded-lg border border-border bg-card/80 p-3"
          >
            {visibleLines.map((line, i) => (
              <div
                key={`${line}-${i}`}
                className="animate-phase-in font-mono text-[11px] leading-6 text-muted-foreground"
                style={{ animationDelay: `${i * 20}ms` }}
              >
                <span className="text-primary/60">{">"}</span>{" "}
                <span className={i === visibleLines.length - 1 ? "text-primary" : ""}>{line}</span>
              </div>
            ))}
            {/* Blinking cursor */}
            {!isComplete && (
              <span className="inline-block h-3 w-1.5 animate-pulse-glow bg-primary/70" />
            )}
          </div>
        </div>
      </div>

      {/* Shimmer keyframe (injected via style) */}
      <style jsx>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  )
}

/** Small animated dots that appear at random positions within the radar circle */
function DetectionDots({ progress }: { progress: number }) {
  const [dots, setDots] = useState<Array<{ id: number; x: number; y: number; delay: number }>>([])

  useEffect(() => {
    if (progress < 15) return
    const count = Math.min(Math.floor((progress - 15) / 8), 8)
    setDots((prev) => {
      if (prev.length >= count) return prev
      const newDots = []
      for (let i = prev.length; i < count; i++) {
        const angle = Math.random() * Math.PI * 2
        const dist = 30 + Math.random() * 50
        newDots.push({
          id: i,
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist,
          delay: Math.random() * 0.5,
        })
      }
      return [...prev, ...newDots]
    })
  }, [progress])

  return (
    <>
      {dots.map((dot) => (
        <span
          key={dot.id}
          className="absolute h-1.5 w-1.5 rounded-full bg-primary animate-pulse-glow"
          style={{
            left: `calc(50% + ${dot.x}px)`,
            top: `calc(50% + ${dot.y}px)`,
            animationDelay: `${dot.delay}s`,
          }}
        />
      ))}
    </>
  )
}
