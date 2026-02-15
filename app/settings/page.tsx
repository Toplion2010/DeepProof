"use client"

import { DeepProofHeader } from "@/components/deepproof-header"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { User, Bell, SlidersHorizontal, Key } from "lucide-react"

export default function SettingsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <DeepProofHeader />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-8">
        {/* Page header */}
        <div>
          <h2 className="text-xl font-semibold text-foreground">Settings</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your account and analysis preferences
          </p>
        </div>

        {/* Profile section */}
        <section className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <User className="h-4 w-4" />
            </div>
            <h3 className="text-base font-semibold text-foreground">Profile</h3>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-muted-foreground">Full Name</Label>
              <Input id="name" defaultValue="Operator" className="bg-background border-border" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-muted-foreground">Email</Label>
              <Input id="email" type="email" defaultValue="operator@deepproof.ai" className="bg-background border-border" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org" className="text-muted-foreground">Organization</Label>
              <Input id="org" defaultValue="DeepProof Security" className="bg-background border-border" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role" className="text-muted-foreground">Role</Label>
              <Input id="role" defaultValue="Senior Analyst" className="bg-background border-border" />
            </div>
          </div>
        </section>

        {/* Notifications section */}
        <section className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Bell className="h-4 w-4" />
            </div>
            <h3 className="text-base font-semibold text-foreground">Notifications</h3>
          </div>
          <div className="space-y-5">
            {[
              { id: "email-alerts", label: "Email alerts", description: "Receive email when analysis completes", defaultChecked: true },
              { id: "deepfake-alerts", label: "Deepfake detection alerts", description: "Immediate notification when deepfake is detected", defaultChecked: true },
              { id: "weekly-digest", label: "Weekly digest", description: "Summary of all analyses from the past week", defaultChecked: false },
              { id: "threat-feed", label: "Threat feed updates", description: "Notifications for new threat intelligence", defaultChecked: true },
            ].map((item, i, arr) => (
              <div key={item.id}>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor={item.id} className="text-foreground">{item.label}</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                  </div>
                  <Switch id={item.id} defaultChecked={item.defaultChecked} />
                </div>
                {i < arr.length - 1 && <Separator className="mt-5" />}
              </div>
            ))}
          </div>
        </section>

        {/* Analysis Preferences section */}
        <section className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <SlidersHorizontal className="h-4 w-4" />
            </div>
            <h3 className="text-base font-semibold text-foreground">Analysis Preferences</h3>
          </div>
          <div className="space-y-5">
            {[
              { id: "auto-factcheck", label: "Auto fact-check", description: "Automatically run fact-checking on detected speech", defaultChecked: true },
              { id: "audio-analysis", label: "Audio analysis", description: "Include audio spectral analysis in reports", defaultChecked: true },
              { id: "transcript", label: "Generate transcript", description: "Automatically transcribe audio from uploaded videos", defaultChecked: true },
              { id: "high-res", label: "High-resolution mode", description: "Analyze at full resolution (slower but more accurate)", defaultChecked: false },
            ].map((item, i, arr) => (
              <div key={item.id}>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor={item.id} className="text-foreground">{item.label}</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                  </div>
                  <Switch id={item.id} defaultChecked={item.defaultChecked} />
                </div>
                {i < arr.length - 1 && <Separator className="mt-5" />}
              </div>
            ))}
          </div>
        </section>

        {/* API Keys section */}
        <section className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Key className="h-4 w-4" />
            </div>
            <h3 className="text-base font-semibold text-foreground">API Keys</h3>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api-key" className="text-muted-foreground">API Key</Label>
              <Input
                id="api-key"
                defaultValue="dp_sk_••••••••••••••••••••3f7a"
                readOnly
                className="bg-background border-border font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="webhook" className="text-muted-foreground">Webhook URL</Label>
              <Input
                id="webhook"
                placeholder="https://your-server.com/webhook"
                className="bg-background border-border"
              />
            </div>
          </div>
        </section>

        {/* Save button */}
        <div className="flex justify-end">
          <button className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            Save Changes
          </button>
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
