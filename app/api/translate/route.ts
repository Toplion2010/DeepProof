import { NextResponse } from "next/server"
import OpenAI from "openai"

interface TranslateRequest {
  segments: Array<{ timestamp: string; speaker: string; text: string }>
  sourceLanguage: string
}

export async function POST(request: Request) {
  try {
    const groq = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    })

    const body: TranslateRequest = await request.json()
    const { segments, sourceLanguage } = body

    if (!segments || segments.length === 0) {
      return NextResponse.json(
        { error: "No segments provided" },
        { status: 400 }
      )
    }

    // Build a numbered list of texts for batch translation
    const numberedTexts = segments
      .map((seg, i) => `[${i}] ${seg.text}`)
      .join("\n")

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a professional translator. Always respond with valid JSON only.",
        },
        {
          role: "user",
          content: `Translate the following numbered text segments from ${sourceLanguage} to English.
Keep each translation on its corresponding index. Return JSON in this exact format:
{
  "translations": ["translated text for [0]", "translated text for [1]", ...]
}

Segments to translate:
${numberedTexts}`,
        },
      ],
    })

    const responseText = completion.choices[0]?.message?.content ?? ""
    const cleaned = responseText.replace(/```json\s*|```\s*/g, "").trim()
    const parsed = JSON.parse(cleaned)

    if (!Array.isArray(parsed.translations)) {
      return NextResponse.json(
        { error: "AI response missing translations array" },
        { status: 502 }
      )
    }

    // Build translated segments preserving timestamps and speakers
    const translatedSegments = segments.map((seg, i) => ({
      timestamp: seg.timestamp,
      speaker: seg.speaker,
      text: parsed.translations[i] ?? seg.text,
    }))

    return NextResponse.json({ segments: translatedSegments })
  } catch (error) {
    console.error("Translation API error:", error)

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Failed to parse AI translation response" },
        { status: 502 }
      )
    }

    return NextResponse.json(
      { error: "Translation failed" },
      { status: 500 }
    )
  }
}
