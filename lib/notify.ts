import { getConfig } from "./config";

/**
 * Optional heads-up to the OC (Slack/Discord-compatible incoming webhook).
 * Text must contain no personal data or message bodies: ids and counts only.
 * Never throws and never delays a response for more than a few seconds.
 */
export async function notifyOc(text: string): Promise<void> {
  const { notifyWebhookUrl } = getConfig();
  if (!notifyWebhookUrl) return;
  try {
    await fetch(notifyWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, content: text }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* best effort */
  }
}
