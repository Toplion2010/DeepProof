"use client"

import { useEffect, useState } from "react"

interface ScoreGaugeProps {
  score: number
}

function getScoreColor(score: number) {
  if (score <= 30) return { stroke: "#22c55e", glow: "rgba(34,197,94,0.3)", label: "text-green-400" }
  if (score <= 60) return { stroke: "#f59e0b", glow: "rgba(245,158,11,0.3)", label: "text-amber-400" }
  return { stroke: "#ef4444", glow: "rgba(239,68,68,0.3)", label: "text-red-400" }
}

function getVerdict(score: number) {
  if (score <= 30) return "Likely Authentic"
  if (score <= 60) return "Uncertain"
  return "Likely AI Generated"
}

function getVerdictStyle(score: number) {
  if (score <= 30) return "bg-green-500/10 text-green-400 ring-green-500/25"
  if (score <= 60) return "bg-amber-500/10 text-amber-400 ring-amber-500/25"
  return "bg-red-500/10 text-red-400 ring-red-500/25"
}

export function ScoreGauge({ score }: ScoreGaugeProps) {
  const [animatedScore, setAnimatedScore] = useState(0)
  const color = getScoreColor(score)

  useEffect(() => {
    let frame: number
    const duration = 1200
    const start = performance.now()

    function animate(now: number) {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setAnimatedScore(Math.round(eased * score))
      if (progress < 1) frame = requestAnimationFrame(animate)
    }

    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [score])

  const currentColor = getScoreColor(animatedScore)

  const radius = 90
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (animatedScore / 100) * circumference

  return (
    <div className="flex flex-col items-center gap-6">
      {/* SVG Gauge */}
      <div className="relative flex h-60 w-60 items-center justify-center">
        <svg
          className="h-full w-full -rotate-90"
          viewBox="0 0 200 200"
          aria-label={`Deepfake probability score: ${score}%`}
          role="img"
        >
          {/* Background track */}
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke="hsl(215 20% 14%)"
            strokeWidth="8"
          />
          {/* Glow filter */}
          <defs>
            <filter id="gauge-glow">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Score arc */}
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke={currentColor.stroke}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            filter="url(#gauge-glow)"
            className="transition-all duration-100"
          />
          {/* Tick marks */}
          {Array.from({ length: 40 }).map((_, i) => {
            const angle = (i / 40) * 360
            const rad = (angle * Math.PI) / 180
            const inner = 76
            const outer = 80
            return (
              <line
                key={i}
                x1={100 + inner * Math.cos(rad)}
                y1={100 + inner * Math.sin(rad)}
                x2={100 + outer * Math.cos(rad)}
                y2={100 + outer * Math.sin(rad)}
                stroke="hsl(215 20% 20%)"
                strokeWidth={i % 10 === 0 ? "1.5" : "0.5"}
              />
            )
          })}
        </svg>

        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-5xl font-bold tabular-nums tracking-tight ${currentColor.label}`}>
            {animatedScore}
          </span>
          <span className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Deepfake Score
          </span>
        </div>
      </div>

      {/* Verdict badge */}
      <div
        className={`inline-flex items-center gap-2 rounded-lg px-5 py-2.5 font-semibold text-sm ring-1 ${getVerdictStyle(score)}`}
      >
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: color.stroke }}
        />
        {getVerdict(score)}
      </div>
    </div>
  )
}
