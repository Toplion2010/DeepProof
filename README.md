# DeepProof

AI-powered deepfake detection and forensic analysis platform.

## Overview

DeepProof is a web application that analyzes video, image, and document content for signs of AI-generated manipulation. Upload a file and receive a comprehensive forensic report including:

- **Deepfake Detection Score** -- AI confidence rating on media authenticity using ViT-based detection, forensic algorithms (ELA, noise analysis), and vision LLM verification
- **Frame-by-Frame Analysis** -- DeepThink mode analyzes 12 frames with per-frame anomaly detection and AI explanations
- **Forensic Analysis** -- Error Level Analysis, noise variance, and temporal consistency checks
- **Fact-Checking** -- Cross-references claims in video transcripts against known sources via web search
- **Video Transcription** -- Automated speech-to-text via Groq Whisper with speaker diarization
- **Community Scans** -- See what others are scanning in real-time
- **Reports Dashboard** -- Historical scan results and analytics

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Language:** TypeScript
- **Styling:** Tailwind CSS, Radix UI, shadcn/ui
- **AI/ML:** Groq (Whisper, Llama 3.3 70B, Llama 3.2 11B Vision), Hugging Face ViT
- **Database:** Supabase (PostgreSQL + Auth)
- **Deployment:** Vercel

## Pipeline (v3.0.0-phase3)

1. **Frame Extraction** -- Extracts and selects key frames from uploaded video
2. **ViT Deepfake Detection** -- Runs Deep-Fake-Detector-v2 ONNX model on each frame
3. **Forensic Analysis** -- ELA + noise analysis via Web Worker
4. **Temporal Consistency** -- Detects inter-frame anomalies
5. **DeepThink Frame Explanations** -- Vision LLM analyzes 12 frames for visual anomalies (switchable to Fast/4 frames)
6. **Audio Transcription** -- Extracts audio via ffmpeg, transcribes with Whisper
7. **LLM Analysis** -- Llama 3.3 evaluates transcript credibility with forensic and vision context
8. **Score Computation** -- Content-aware weighted combination (video-dominant: 70/30 default)

## Getting Started

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp .env.local.example .env.local
# Add your API keys to .env.local

# Run the development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Environment Variables

Create a `.env.local` file with the following keys:

```
GROQ_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
TAVILY_API_KEY=          # optional, for web search fact-checking
```

## Deployment

This project is deployed on [Vercel](https://vercel.com). Every push to `main` triggers an automatic deployment.
