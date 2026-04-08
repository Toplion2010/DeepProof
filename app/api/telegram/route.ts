import { NextRequest, NextResponse } from "next/server";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const WEBSITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://deepproof-liart.vercel.app";

const API_BASE = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

async function sendMessage(
  chatId: number,
  text: string,
  options: Record<string, unknown> = {}
) {
  await fetch(`${API_BASE}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", ...options }),
  });
}

async function sendPhoto(
  chatId: number,
  photo: string,
  caption: string,
  options: Record<string, unknown> = {}
) {
  await fetch(`${API_BASE}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, photo, caption, parse_mode: "HTML", ...options }),
  });
}

function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🔍 How It Works", callback_data: "how_it_works" },
        { text: "📊 Features", callback_data: "features" },
      ],
      [
        { text: "📁 Supported Files", callback_data: "file_types" },
        { text: "🧠 AI Pipeline", callback_data: "pipeline" },
      ],
      [
        { text: "🌐 Open DeepProof", url: WEBSITE_URL },
      ],
    ],
  };
}

function backKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "⬅️ Back to Menu", callback_data: "menu" }],
      [{ text: "🌐 Open DeepProof", url: WEBSITE_URL }],
    ],
  };
}

const MESSAGES = {
  welcome: (name: string) => `👋 Welcome to <b>DeepProof</b>, ${name}!

DeepProof is an <b>AI-powered deepfake detection and forensic analysis platform</b>. We help you verify whether videos, images, and documents have been manipulated or AI-generated.

In a world full of misinformation, DeepProof gives you the tools to <b>find the truth</b>.

Use the buttons below to learn more 👇`,

  how_it_works: `🔍 <b>How DeepProof Works</b>

It's simple — just 3 steps:

<b>1. Upload</b>
Upload a video, image, or document you want to verify.

<b>2. Analyze</b>
Our AI pipeline runs a full forensic scan:
• ViT-based deepfake detection on every frame
• Error Level Analysis (ELA) &amp; noise analysis
• Audio transcription and fact-checking
• Temporal consistency checks between frames

<b>3. Get Your Report</b>
Receive a detailed forensic report with:
• Authenticity score (0–100%)
• Frame-by-frame breakdown
• Transcript and fact-check results
• Shareable report link`,

  features: `📊 <b>DeepProof Features</b>

🤖 <b>Deepfake Detection</b>
AI confidence rating using ViT model + forensic algorithms

🎬 <b>Frame-by-Frame Analysis</b>
DeepThink mode analyzes up to 12 frames with per-frame anomaly explanations

🔬 <b>Forensic Analysis</b>
Error Level Analysis, noise variance, and temporal consistency checks

📝 <b>Fact-Checking</b>
Cross-references claims in video transcripts against known sources

🎙️ <b>Video Transcription</b>
Automated speech-to-text via Groq Whisper with speaker diarization

👥 <b>Community Scans</b>
See what other users are scanning in real-time

📁 <b>Reports Dashboard</b>
View your full scan history and analytics`,

  file_types: `📁 <b>Supported File Types</b>

🎥 <b>Videos</b>
MP4, MOV, AVI, WebM and more
• Full frame extraction and analysis
• Audio transcription included

🖼️ <b>Images</b>
JPG, PNG, WebP and more
• ELA and noise analysis
• AI visual inspection

📄 <b>Documents</b>
PDF and text documents
• Content analysis
• Claim fact-checking

<i>Tip: Videos get the most comprehensive analysis — including transcription, fact-checking, and frame-by-frame breakdown.</i>`,

  pipeline: `🧠 <b>DeepProof AI Pipeline</b>

Here's what happens behind the scenes when you upload a file:

<b>Step 1 — Frame Extraction</b>
Key frames are extracted from your video for analysis.

<b>Step 2 — ViT Deepfake Detection</b>
Deep-Fake-Detector-v2 ONNX model runs on each frame.

<b>Step 3 — Forensic Analysis</b>
Error Level Analysis (ELA) and noise analysis via Web Worker.

<b>Step 4 — Temporal Consistency</b>
Inter-frame anomalies are detected.

<b>Step 5 — DeepThink Explanations</b>
Vision LLM (Llama 3.2) analyzes frames for visual anomalies.

<b>Step 6 — Audio Transcription</b>
Audio extracted and transcribed with Groq Whisper.

<b>Step 7 — LLM Analysis</b>
Llama 3.3 evaluates transcript credibility with forensic context.

<b>Step 8 — Score Computation</b>
Weighted authenticity score combining all signals.`,
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Handle regular messages
    if (body.message) {
      const msg = body.message;
      const chatId: number = msg.chat.id;
      const text: string = msg.text || "";
      const firstName: string = msg.from?.first_name || "there";

      if (text === "/start" || text === "/help") {
        await sendMessage(chatId, MESSAGES.welcome(firstName), {
          reply_markup: mainMenuKeyboard(),
        });
      } else if (text === "/features") {
        await sendMessage(chatId, MESSAGES.features, {
          reply_markup: backKeyboard(),
        });
      } else if (text === "/howitworks") {
        await sendMessage(chatId, MESSAGES.how_it_works, {
          reply_markup: backKeyboard(),
        });
      } else {
        await sendMessage(
          chatId,
          `I'm the DeepProof assistant! Use /start to see the menu or visit <a href="${WEBSITE_URL}">DeepProof</a> to start analyzing media.`,
          { reply_markup: mainMenuKeyboard() }
        );
      }
    }

    // Handle inline button callbacks
    if (body.callback_query) {
      const query = body.callback_query;
      const chatId: number = query.message.chat.id;
      const data: string = query.data;

      // Acknowledge the callback
      await fetch(`${API_BASE}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: query.id }),
      });

      if (data === "menu") {
        const firstName = query.from?.first_name || "there";
        await sendMessage(chatId, MESSAGES.welcome(firstName), {
          reply_markup: mainMenuKeyboard(),
        });
      } else if (data === "how_it_works") {
        await sendMessage(chatId, MESSAGES.how_it_works, {
          reply_markup: backKeyboard(),
        });
      } else if (data === "features") {
        await sendMessage(chatId, MESSAGES.features, {
          reply_markup: backKeyboard(),
        });
      } else if (data === "file_types") {
        await sendMessage(chatId, MESSAGES.file_types, {
          reply_markup: backKeyboard(),
        });
      } else if (data === "pipeline") {
        await sendMessage(chatId, MESSAGES.pipeline, {
          reply_markup: backKeyboard(),
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Telegram webhook error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
