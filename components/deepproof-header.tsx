"use client"

import { ShieldCheck, Activity, Wifi } from "lucide-react"
import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

const navLinks = [
  { label: "Dashboard", href: "/" },
  { label: "Analysis", href: "/results" },
  { label: "Reports", href: "/reports" },
  { label: "Settings", href: "/settings" },
]

export function DeepProofHeader() {
  const [time, setTime] = useState("")
  const pathname = usePathname()

  useEffect(() => {
    const update = () => {
      const now = new Date()
      setTime(
        now.toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      )
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <header className="border-b border-border/60 bg-card/50 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/30">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse-glow rounded-full bg-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              DeepProof
            </h1>
            <p className="text-xs font-mono text-muted-foreground tracking-wider uppercase">
              Deepfake Detection System v2.4
            </p>
          </div>
        </div>

        <nav className="hidden items-center gap-6 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className={`text-sm font-medium transition-colors ${
                pathname === link.href
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-2 rounded-md bg-secondary px-3 py-1.5 font-mono text-xs text-muted-foreground sm:flex">
            <Activity className="h-3 w-3 text-primary" />
            <span>SYS ONLINE</span>
          </div>
          <div className="hidden items-center gap-2 rounded-md bg-secondary px-3 py-1.5 font-mono text-xs text-muted-foreground sm:flex">
            <Wifi className="h-3 w-3 text-primary" />
            <span>{time || "--:--:--"}</span>
          </div>
          <div className="h-8 w-8 rounded-full bg-primary/20 ring-1 ring-primary/40 flex items-center justify-center">
            <span className="text-xs font-semibold text-primary">OP</span>
          </div>
        </div>
      </div>
    </header>
  )
}


