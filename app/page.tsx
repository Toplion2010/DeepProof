import { DeepProofHeader } from "@/components/deepproof-header"
import { UploadZone } from "@/components/upload-zone"
import { StatsPanel } from "@/components/stats-panel"
import { RecentScans } from "@/components/recent-scans"
import { ThreatFeed } from "@/components/threat-feed"

export default function Page() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <DeepProofHeader />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-8">
        {/* Stats */}
        <StatsPanel />

        {/* Upload Section */}
        <section className="flex flex-col items-center">
          <div className="mb-6 text-center">
            <h2 className="text-xl font-semibold text-foreground">
              Upload Video for Analysis
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Submit a video file to run AI-powered deepfake forensic detection
            </p>
          </div>
          <UploadZone />
        </section>

        {/* Bottom Grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          <RecentScans />
          <ThreatFeed />
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
