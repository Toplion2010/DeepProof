#!/usr/bin/env node
/**
 * Bot: @deepproofbot
 *
 * Run this script once to register your Telegram webhook:
 *   node scripts/setup-telegram-webhook.mjs
 *
 * Required env vars: TELEGRAM_BOT_TOKEN, NEXT_PUBLIC_SITE_URL
 */

const token = process.env.TELEGRAM_BOT_TOKEN;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

if (!token || !siteUrl) {
  console.error("❌ Missing TELEGRAM_BOT_TOKEN or NEXT_PUBLIC_SITE_URL");
  process.exit(1);
}

const webhookUrl = `${siteUrl}/api/telegram`;

const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: webhookUrl }),
});

const data = await res.json();

if (data.ok) {
  console.log(`✅ Webhook registered: ${webhookUrl}`);
} else {
  console.error("❌ Failed to register webhook:", data);
}
