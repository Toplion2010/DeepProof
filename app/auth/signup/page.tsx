"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ShieldCheck, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function SignUpPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (password !== confirmPassword) {
      toast.error("Passwords do not match")
      return
    }

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters")
      return
    }

    setLoading(true)

    const supabase = createClient()
    if (!supabase) { toast.error("Authentication is not configured"); setLoading(false); return }
    const { error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }

    router.push("/")
    router.refresh()
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="relative flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/30">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-primary" />
        </div>
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            DeepProof
          </h1>
          <p className="mt-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Deepfake Detection System
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-1 text-lg font-semibold text-foreground">
          Create Account
        </h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Register to start detecting deepfakes
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="operator@deepproof.ai"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">Minimum 8 characters</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <Input
              id="confirm-password"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Create Account
          </Button>
        </form>
      </div>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/auth/login"
          className="font-medium text-primary hover:text-primary/80 transition-colors"
        >
          Sign in
        </Link>
      </p>
    </div>
  )
}
