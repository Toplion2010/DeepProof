import { NextResponse } from "next/server"
import OpenAI from "openai"
import { parseAndRepairJson, validateAnalysisResponse } from "@/lib/json-repair"

interface ClaimSource {
  title: string
  url: string
  snippet: string
  score: number
}

interface SearchResult {
  sources: ClaimSource[]
  searchedAt: string
}

interface AnalyzeRequest {
  transcript: string
  fileName: string
  duration: string
  resolution: string
  language: string
  searchContext?: Record<string, SearchResult>
  visionFindings?: string[]
  forensicFindings?: string[]
  temporalFindings?: string[]
}

export async function POST(request: Request) {
  try {
    const groq = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    })

    const body: AnalyzeRequest = await request.json()
    const { transcript, fileName, duration, resolution, language, searchContext, visionFindings, forensicFindings, temporalFindings } = body

    if (!transcript || transcript.trim().length === 0) {
      return NextResponse.json(
        { error: "No transcript provided" },
        { status: 400 }
      )
    }

    // Build dynamic prompt sections
    let searchSection = ""
    if (searchContext && Object.keys(searchContext).length > 0) {
      const seenUrls = new Set<string>()
      const bullets: string[] = []
      for (const [claim, result] of Object.entries(searchContext)) {
        for (const source of result.sources) {
          if (seenUrls.has(source.url)) continue
          seenUrls.add(source.url)
          bullets.push(`- [${source.title}](${source.url}): ${source.snippet}`)
        }
      }
      if (bullets.length > 0) {
        searchSection = `\n\n## WEB SEARCH CONTEXT\nThe following web sources were found for claims in this transcript. Use them to verify or refute claims. Cite the URL as the source when relevant.\n${bullets.join("\n")}`
      }
    }

    let visionSection = ""
    if (visionFindings && visionFindings.length > 0) {
      visionSection = `\n\n## VISION ANALYSIS FINDINGS\nA separate vision AI observed the following visual anomalies in the video frames (for context only — your analysis is transcript-based):\n${visionFindings.map((f) => `- ${f}`).join("\n")}`
    }

    let forensicSection = ""
    if (forensicFindings && forensicFindings.length > 0) {
      forensicSection = `\n\n## FORENSIC ANALYSIS FINDINGS\nAutomated forensic analysis (Error Level Analysis and noise variance) detected the following:\n${forensicFindings.map((f) => `- ${f}`).join("\n")}`
    }

    let temporalSection = ""
    if (temporalFindings && temporalFindings.length > 0) {
      temporalSection = `\n\n## TEMPORAL CONSISTENCY FINDINGS\nFrame-by-frame temporal analysis detected the following:\n${temporalFindings.map((f) => `- ${f}`).join("\n")}`
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20_000)

    try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
      max_tokens: 2048,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a forensic content analyst evaluating video transcripts for factual accuracy.

IMPORTANT LIMITATIONS — be transparent about these:
- You are analyzing ONLY the transcript text. You have NOT seen the actual video frames.
- You cannot detect visual manipulation (face swaps, lip sync, etc.) from text alone.
- Your analysis covers factual accuracy and linguistic patterns only.
${searchContext ? "- You have web search results available to verify claims. Use them." : "- You do NOT have web access. Rely only on your training knowledge."}

Always respond with valid JSON only.`,
        },
        {
          role: "user",
          content: `Analyze this video transcript for factual accuracy and potential manipulation indicators.

**Video metadata:**
- File: ${fileName}
- Duration: ${duration}
- Resolution: ${resolution}
- Detected language: ${language}

**Transcript:**
${transcript}${searchSection}${visionSection}${forensicSection}${temporalSection}

**Think step-by-step:**
1. Read the entire transcript carefully
2. Classify each statement into one of the categories below
3. For verifiable claims only, assess factual accuracy${searchContext ? " using web search results" : ""}
4. Synthesize a final score based ONLY on verifiable claims

## CLAIM CLASSIFICATION (mandatory — use exactly one label per claim)

**"confirmed"** — A verifiable factual claim confirmed by authoritative knowledge${searchContext ? " or web sources" : ""}. Must contain specific facts (names, dates, numbers, events, organizations, locations). Cite your source${searchContext ? " (use the URL when from web search)" : ""}.

**"contradicted"** — A verifiable factual claim refuted by authoritative knowledge${searchContext ? " or web sources" : ""}. Cite your source${searchContext ? " (use the URL when from web search)" : ""}.

**"unconfirmed"** — A verifiable factual claim, but you lack sufficient knowledge to confirm or refute it. Explain what would be needed to verify.

**"opinion"** — A subjective statement, motivational phrase, value judgment, ethical advice, or personal preference. NOT verifiable — do not attempt verification.

**"unverifiable"** — A factual-type claim that cannot be verified (personal anecdotes, private experiences, claims without available evidence).

## VERIFIABILITY HEURISTICS

Mark as **verifiable** (→ confirmed/contradicted/unconfirmed) ONLY if:
- Contains proper nouns (specific people, organizations, places)
- Contains dates, years, or specific numbers/statistics
- Makes factual assertions about events, results, outcomes, or scientific facts

Mark as **opinion** if:
- Generic motivational phrases ("You're capable of incredible things", "Believe in yourself")
- Subjective expressions ("I think", "I believe", "it's good to…")
- Ethical/moral advice ("Be kind to yourself and others")
- Rhetorical questions or value judgments

Mark as **unverifiable** if:
- Personal anecdotes without evidence ("I was always the best student")
- Claims about private experiences that cannot be checked

## EXAMPLES

- "You're capable of incredible things" → opinion (motivational phrase)
- "Be kind to yourself and others" → opinion (ethical advice)
- "Stay positive and shine bright" → opinion (motivational)
- "Believe in your strength and potential" → opinion (motivational)
- "The event took place on March 5, 2024 in Berlin" → verifiable → confirmed/contradicted/unconfirmed
- "I was always the best student" → unverifiable (personal claim)

## OUTPUT FORMAT

Respond with ONLY valid JSON:
{
  "overallScore": <number 0-100>,
  "explanation": "<2-4 sentences. State clearly this is transcript-only analysis. If most claims are opinions, state that no verifiable factual claims were found.>",
  "claims": [
    {
      "text": "<exact or paraphrased claim>",
      "status": "<confirmed | contradicted | unconfirmed | opinion | unverifiable>",
      "source": "<URL from web search if available, knowledge source otherwise, or 'N/A' for opinion/unverifiable>",
      "detail": "<1-2 sentence explanation of WHY this label was assigned>"${searchContext ? `,
      "webSources": [{"title": "<source title>", "url": "<source URL>", "snippet": "<relevant excerpt>"}]` : ""}
    }
  ]
}

## SCORING GUIDELINES (follow strictly)

- 0-20: Authentic — verifiable claims confirmed, OR content is purely opinion/motivational with no factual claims to evaluate
- 20-40: Mostly credible — most verifiable claims check out, minor uncertainties
- 40-60: Mixed — some verifiable claims contradicted or suspicious
- 60-80: Suspicious — multiple verifiable claims contradicted, clear factual errors
- 80-100: Highly likely manipulated — major verifiable claims demonstrably false

## CRITICAL SCORING RULES

- **"opinion" and "unverifiable" claims do NOT affect the score** — they are neutral
- **If ALL claims are opinion/unverifiable** (e.g., motivational speech), score MUST be 10-20
- Only confirmed/contradicted/unconfirmed claims influence the score
- Start from assumption of authenticity (score ~15-25)
- "Unconfirmed" should NOT increase the score significantly
- Non-English content is NOT suspicious
- Extract 3-7 claims from the transcript
- Always return valid JSON`,
        },
      ],
    }, { signal: controller.signal })

    clearTimeout(timeout)

    const responseText = completion.choices[0]?.message?.content ?? ""
    const { data: analysis, repaired, error } = parseAndRepairJson<{
      overallScore: number
      explanation: string
      claims: Array<{ text: string; status: string; source?: string; detail: string; webSources?: Array<{ title: string; url: string; snippet: string }> }>
    }>(responseText)

    if (!analysis || !validateAnalysisResponse(analysis)) {
      console.warn("LLM response could not be parsed:", error)
      return NextResponse.json({
        overallScore: 50,
        explanation:
          "The AI analysis produced an unparseable response. This score is a neutral placeholder. Please retry.",
        claims: [],
        degraded: true,
      })
    }

    if (repaired) {
      console.warn("LLM response required JSON repair")
    }

    // Enforce valid claim labels
    const validStatuses = new Set(["confirmed", "contradicted", "unconfirmed", "opinion", "unverifiable"])
    for (const claim of analysis.claims) {
      if (!validStatuses.has(claim.status)) {
        claim.status = "unconfirmed"
      }
    }

    return NextResponse.json({ ...analysis, degraded: false })
    } catch (err) {
      clearTimeout(timeout)
      throw err
    }
  } catch (error) {
    console.error("Analysis API error:", error)
    const isAbort = error instanceof Error && error.name === "AbortError"
    if (isAbort) {
      return NextResponse.json({
        overallScore: 50,
        explanation: "Analysis timed out. This score is a neutral placeholder. Please retry.",
        claims: [],
        degraded: true,
      })
    }
    return NextResponse.json(
      { error: "Analysis failed. Check your GROQ_API_KEY in .env.local" },
      { status: 500 }
    )
  }
}
