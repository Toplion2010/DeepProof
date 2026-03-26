"use client"

import { ShieldCheck, Activity, Wifi, LogOut } from "lucide-react"
import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import type { User as SupabaseUser } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/client"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const navLinks = [
  { label: "Dashboard", href: "/" },
  { label: "Documents", href: "/documents" },
  { label: "Images", href: "/images" },
  { label: "Reports", href: "/reports" },
]

function getUserInitials(email: string): string {
  return email.slice(0, 2).toUpperCase()
}

export function DeepProofHeader() {
  const [time, setTime] = useState("")
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const pathname = usePathname()
  const router = useRouter()

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

  useEffect(() => {
    const supabase = createClient()
    if (!supabase) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setUser(session?.user ?? null)
    )
    return () => subscription.unsubscribe()
  }, [])

  async function handleSignOut() {
    const supabase = createClient()
    if (!supabase) return
    await supabase.auth.signOut()
    router.push("/auth/login")
    router.refresh()
  }

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
                pathname === link.href ||
                (link.href !== "/" && pathname.startsWith(link.href))
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
            <span suppressHydrationWarning>{time || "--:--:--"}</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-8 w-8 rounded-full bg-primary/20 ring-1 ring-primary/40 flex items-center justify-center transition-colors hover:bg-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/50">
                <span className="text-xs font-semibold text-primary">
                  {user?.email ? getUserInitials(user.email) : "??"}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">
                    {user?.email ? getUserInitials(user.email) : "User"}
                  </p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user?.email ?? ""}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}


