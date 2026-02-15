import { NextResponse } from "next/server"
import OpenAI from "openai"

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
})

interface AnalyzeRequest {
  transcript: string
  fileName: string
  duration: string
  resolution: string
  language: string
}

export async function POST(request: Request) {
  try {
    const body: AnalyzeRequest = await request.json()
    const { transcript, fileName, duration, resolution, language } = body

    if (!transcript || transcript.trim().length === 0) {
      return NextResponse.json(
        { error: "No transcript provided" },
        { status: 400 }
      )
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 2048,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are an impartial forensic content analyst. You evaluate video transcripts for factual accuracy. You do NOT assume content is fake or manipulated by default — most videos are authentic. Always respond with valid JSON only.",
        },
        {
          role: "user",
          content: `Analyze the following video transcript for factual accuracy.

**Video metadata:**
- File: ${fileName}
- Duration: ${duration}
- Resolution: ${resolution}
- Detected language: ${language}

**Transcript:**
${transcript}

Respond with ONLY valid JSON in this exact format:
{
  "overallScore": <number 0-100>,
  "explanation": "<2-4 sentence analysis summary. Reference specific claims. Explain your reasoning.>",
  "claims": [
    {
      "text": "<exact or paraphrased claim from the transcript>",
      "status": "<confirmed | contradicted | unconfirmed>",
      "source": "<knowledge base or source used to evaluate>",
      "detail": "<1-2 sentence explanation>"
    }
  ]
}

**Scoring guidelines (follow these strictly):**
- 0-20: Content is clearly authentic — claims are verifiable and confirmed, language is natural
- 20-40: Mostly credible — most claims check out, minor uncertainties
- 40-60: Mixed signals — some claims are contradicted or unverifiable, but not conclusive
- 60-80: Suspicious — multiple contradicted claims, clear factual errors, or misleading framing
- 80-100: Highly likely manipulated — major claims are demonstrably false or fabricated

**Important rules:**
- Start from the assumption that the video is authentic (score ~15-25) and only increase the score if you find specific evidence of falsehood or manipulation
- "Unconfirmed" claims should NOT increase the score significantly — being unable to verify something does not mean it is fake
- Casual speech, opinions, and subjective statements are NOT evidence of manipulation
- Non-English content is NOT suspicious — evaluate the actual claims regardless of language
- Low resolution or short duration are NOT indicators of manipulation
- Extract 3-7 factual claims from the transcript
- Always return valid JSON`,
        },
      ],
    })

    const responseText = completion.choices[0]?.message?.content ?? ""

    // Parse the JSON response
    const cleaned = responseText.replace(/```json\s*|```\s*/g, "").trim()
    const analysis = JSON.parse(cleaned)

    if (typeof analysis.overallScore !== "number" || !analysis.explanation || !Array.isArray(analysis.claims)) {
      return NextResponse.json(
        { error: "AI response missing required fields (overallScore, explanation, claims)" },
        { status: 502 }
      )
    }

    return NextResponse.json(analysis)
  } catch (error) {
    console.error("Analysis API error:", error)

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 502 }
      )
    }

    return NextResponse.json(
      { error: "Analysis failed. Check your GROQ_API_KEY in .env.local" },
      { status: 500 }
    )
  }
}
