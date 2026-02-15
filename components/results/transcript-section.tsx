"use client"

import { useState } from "react"
import { FileText, ChevronDown, Languages, Loader2 } from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

interface TranscriptEntry {
  timestamp: string
  speaker: string
  text: string
}

interface TranscriptSectionProps {
  entries: TranscriptEntry[]
  language?: string
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  ar: "Arabic",
  hi: "Hindi",
  tr: "Turkish",
  pl: "Polish",
  nl: "Dutch",
  sv: "Swedish",
  da: "Danish",
  fi: "Finnish",
  no: "Norwegian",
  uk: "Ukrainian",
  cs: "Czech",
  ro: "Romanian",
  hu: "Hungarian",
  el: "Greek",
  he: "Hebrew",
  th: "Thai",
  vi: "Vietnamese",
  id: "Indonesian",
  ms: "Malay",
  az: "Azerbaijani",
}

function getLanguageName(code: string): string {
  return LANGUAGE_NAMES[code.toLowerCase()] ?? code.toUpperCase()
}

export function TranscriptSection({ entries, language }: TranscriptSectionProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [translatedEntries, setTranslatedEntries] = useState<TranscriptEntry[] | null>(null)
  const [isTranslating, setIsTranslating] = useState(false)
  const [showTranslated, setShowTranslated] = useState(false)
  const [translateError, setTranslateError] = useState("")

  const isEnglish = language?.toLowerCase() === "en"
  const displayEntries = showTranslated && translatedEntries ? translatedEntries : entries
  const langName = language ? getLanguageName(language) : null

  async function handleTranslate() {
    if (translatedEntries) {
      setShowTranslated(!showTranslated)
      return
    }

    setIsTranslating(true)
    setTranslateError("")

    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segments: entries,
          sourceLanguage: language ?? "unknown",
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || `Translation failed (${response.status})`)
      }

      const data = await response.json()
      setTranslatedEntries(data.segments)
      setShowTranslated(true)
    } catch (err) {
      setTranslateError(err instanceof Error ? err.message : "Translation failed")
    } finally {
      setIsTranslating(false)
    }
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-xl border border-border bg-card">
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between px-5 py-4 transition-colors hover:bg-secondary/30">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/30">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-semibold text-foreground">
                  Transcript
                </h3>
                <p className="text-xs text-muted-foreground">
                  {entries.length} segments extracted
                  {langName && ` \u00b7 ${langName}`}
                  {showTranslated && " \u00b7 Translated to English"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {isOpen ? "Collapse" : "Expand"}
              </span>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-border">
            {/* Translate button bar */}
            {!isEnglish && language && language !== "unknown" && (
              <div className="flex items-center justify-between border-b border-border/50 px-5 py-2.5">
                <div className="flex items-center gap-2">
                  <Languages className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {showTranslated
                      ? "Showing English translation"
                      : `Original language: ${langName}`}
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleTranslate()
                  }}
                  disabled={isTranslating}
                  className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
                >
                  {isTranslating ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Translating...
                    </>
                  ) : showTranslated ? (
                    <>
                      <Languages className="h-3 w-3" />
                      Show Original
                    </>
                  ) : (
                    <>
                      <Languages className="h-3 w-3" />
                      Translate to English
                    </>
                  )}
                </button>
              </div>
            )}

            {translateError && (
              <div className="border-b border-border/50 px-5 py-2">
                <p className="text-xs text-destructive">{translateError}</p>
              </div>
            )}

            <div className="max-h-80 overflow-y-auto">
              {displayEntries.map((entry, i) => (
                <div
                  key={i}
                  className={`flex gap-4 px-5 py-3 ${
                    i !== displayEntries.length - 1 ? "border-b border-border/50" : ""
                  }`}
                >
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-primary">
                    {entry.timestamp}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {entry.speaker}
                    </span>
                    <p className="mt-0.5 text-sm leading-relaxed text-secondary-foreground">
                      {entry.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
