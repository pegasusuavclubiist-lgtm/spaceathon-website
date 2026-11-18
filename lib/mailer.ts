/**
 * Transactional email through a Resend-compatible HTTP API (RESEND_API_KEY and
 * MAIL_FROM). Dependency-free. Returns false (never throws) when mail is not
 * configured or fails, so callers can fall back to a manual hand-over.
 */

import { getConfig } from "./config";

export function mailConfigured(): boolean {
  const { resendApiKey, mailFrom } = getConfig();
  return Boolean(resendApiKey && mailFrom);
}

export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  const { resendApiKey, mailFrom } = getConfig();
  if (!resendApiKey || !mailFrom) return false;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: mailFrom, to: [to], subject, text }),
      signal: AbortSignal.timeout(8000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
