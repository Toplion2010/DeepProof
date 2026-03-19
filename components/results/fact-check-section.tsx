import { CheckCircle2, XCircle, HelpCircle, Scale, MessageCircle, ShieldQuestion, ExternalLink } from "lucide-react"

export type ClaimStatus = "confirmed" | "contradicted" | "unconfirmed" | "opinion" | "unverifiable"

interface WebSource {
  title: string
  url: string
  snippet: string
}

interface Claim {
  text: string
  status: ClaimStatus
  source?: string
  detail?: string
  webSources?: WebSource[]
}

interface FactCheckSectionProps {
  claims: Claim[]
}

const statusConfig: Record<
  ClaimStatus,
  {
    icon: React.ComponentType<{ className?: string }>
    label: string
    containerClass: string
    iconClass: string
    badgeClass: string
  }
> = {
  confirmed: {
    icon: CheckCircle2,
    label: "Confirmed",
    containerClass: "border-green-500/20 hover:border-green-500/40",
    iconClass: "text-green-400 bg-green-500/10 ring-green-500/25",
    badgeClass: "bg-green-500/10 text-green-400 ring-green-500/25",
  },
  contradicted: {
    icon: XCircle,
    label: "Contradicted",
    containerClass: "border-red-500/20 hover:border-red-500/40",
    iconClass: "text-red-400 bg-red-500/10 ring-red-500/25",
    badgeClass: "bg-red-500/10 text-red-400 ring-red-500/25",
  },
  unconfirmed: {
    icon: HelpCircle,
    label: "Unconfirmed",
    containerClass: "border-amber-500/20 hover:border-amber-500/40",
    iconClass: "text-amber-400 bg-amber-500/10 ring-amber-500/25",
    badgeClass: "bg-amber-500/10 text-amber-400 ring-amber-500/25",
  },
  opinion: {
    icon: MessageCircle,
    label: "Opinion",
    containerClass: "border-blue-500/20 hover:border-blue-500/40",
    iconClass: "text-blue-400 bg-blue-500/10 ring-blue-500/25",
    badgeClass: "bg-blue-500/10 text-blue-400 ring-blue-500/25",
  },
  unverifiable: {
    icon: ShieldQuestion,
    label: "Unverifiable",
    containerClass: "border-purple-500/20 hover:border-purple-500/40",
    iconClass: "text-purple-400 bg-purple-500/10 ring-purple-500/25",
    badgeClass: "bg-purple-500/10 text-purple-400 ring-purple-500/25",
  },
}

export function FactCheckSection({ claims }: FactCheckSectionProps) {
  const confirmed = claims.filter((c) => c.status === "confirmed").length
  const contradicted = claims.filter((c) => c.status === "contradicted").length
  const unconfirmed = claims.filter((c) => c.status === "unconfirmed").length
  const opinion = claims.filter((c) => c.status === "opinion").length
  const unverifiable = claims.filter((c) => c.status === "unverifiable").length

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/30">
            <Scale className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Fact Check</h3>
            <p className="text-xs text-muted-foreground">
              Claims extracted and classified
            </p>
          </div>
        </div>

        {/* Summary counts */}
        <div className="hidden flex-wrap items-center gap-2 sm:flex">
          {confirmed > 0 && <SummaryPill count={confirmed} label="Confirmed" color="green" />}
          {contradicted > 0 && <SummaryPill count={contradicted} label="Contradicted" color="red" />}
          {unconfirmed > 0 && <SummaryPill count={unconfirmed} label="Unconfirmed" color="amber" />}
          {opinion > 0 && <SummaryPill count={opinion} label="Opinion" color="blue" />}
          {unverifiable > 0 && <SummaryPill count={unverifiable} label="Unverifiable" color="purple" />}
        </div>
      </div>

      <div className="divide-y divide-border/50">
        {claims.map((claim, i) => {
          const config = statusConfig[claim.status] ?? statusConfig.unconfirmed
          const Icon = config.icon

          return (
            <div
              key={i}
              className={`flex gap-4 px-5 py-4 transition-colors ${config.containerClass}`}
            >
              <div
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ${config.iconClass}`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-relaxed text-foreground">
                  {claim.text}
                </p>
                {claim.detail && (
                  <p className="mt-1 text-xs text-muted-foreground">{claim.detail}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${config.badgeClass}`}
                  >
                    <Icon className="h-2.5 w-2.5" />
                    {config.label}
                  </span>
                  {claim.source && claim.source !== "N/A" && (
                    <SourceDisplay source={claim.source} />
                  )}
                </div>
                {claim.webSources && claim.webSources.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {claim.webSources.map((ws, j) => (
                      <a
                        key={j}
                        href={ws.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-2 rounded-md bg-secondary/50 px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      >
                        <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <span className="font-medium text-foreground">{ws.title}</span>
                          {ws.snippet && (
                            <p className="mt-0.5 line-clamp-2 text-muted-foreground">{ws.snippet}</p>
                          )}
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const URL_REGEX = /https?:\/\/[^\s)]+/

function SourceDisplay({ source }: { source: string }) {
  const match = source.match(URL_REGEX)
  if (match) {
    return (
      <a
        href={match[0]}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 font-mono text-[10px] text-primary transition-colors hover:bg-primary/10"
      >
        <ExternalLink className="h-2.5 w-2.5" />
        Source
      </a>
    )
  }
  return (
    <span className="rounded-md bg-secondary px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
      Source: {source}
    </span>
  )
}

function SummaryPill({
  count,
  label,
  color,
}: {
  count: number
  label: string
  color: "green" | "red" | "amber" | "blue" | "purple"
}) {
  const colorMap = {
    green: "bg-green-500/10 text-green-400",
    red: "bg-red-500/10 text-red-400",
    amber: "bg-amber-500/10 text-amber-400",
    blue: "bg-blue-500/10 text-blue-400",
    purple: "bg-purple-500/10 text-purple-400",
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] font-medium ${colorMap[color]}`}
    >
      {count} {label}
    </span>
  )
}
