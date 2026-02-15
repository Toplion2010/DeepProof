# DeepProof

AI-powered deepfake detection and forensic analysis platform.

## Overview

DeepProof is a web application that analyzes video content for signs of AI-generated manipulation. Upload a video file and receive a comprehensive forensic report including:

- **Deepfake Detection Score** -- AI confidence rating on media authenticity
- **Forensic Analysis** -- Frame-level anomaly detection and artifact identification
- **Fact-Checking** -- Cross-references claims in video transcripts against known sources
- **Video Transcription** -- Automated speech-to-text with translation support
- **Threat Intelligence Feed** -- Real-time tracking of emerging deepfake trends
- **Reports Dashboard** -- Historical scan results and analytics

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Language:** TypeScript
- **Styling:** Tailwind CSS, Radix UI, shadcn/ui
- **AI/ML:** OpenAI, Anthropic Claude, Google Gemini, Hugging Face Transformers
- **Charts:** Recharts

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
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
```

## Deployment

This project is deployed on [Vercel](https://vercel.com). Every push to `main` triggers an automatic deployment.
