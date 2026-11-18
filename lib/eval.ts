/**
 * Calls the organiser-side scoring service for the Advanced benchmark (12.1).
 * Labels and the private split never leave that service; this repo only sends
 * a short-lived download link for the predictions file and receives scores.
 *
 *   POST EVAL_SERVICE_URL   Authorization: Bearer EVAL_SERVICE_TOKEN
 *   { "submissionId": "pred_…", "downloadUrl": "https://…" }
 *   -> { "public": 0.83, "private": 0.80 }   (higher is better; negate lower-is-better metrics)
 */

import { getConfig } from "./config";

export interface EvalScores {
  publicScore: number;
  privateScore: number;
}

export async function scorePredictions(submissionId: string, downloadUrl: string): Promise<EvalScores | null> {
  const { evalServiceUrl, evalServiceToken } = getConfig();
  if (!evalServiceUrl) return null;
  try {
    const response = await fetch(evalServiceUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(evalServiceToken ? { Authorization: `Bearer ${evalServiceToken}` } : {}),
      },
      body: JSON.stringify({ submissionId, downloadUrl }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { public?: unknown; private?: unknown };
    if (typeof body.public !== "number" || typeof body.private !== "number") return null;
    if (!Number.isFinite(body.public) || !Number.isFinite(body.private)) return null;
    return { publicScore: body.public, privateScore: body.private };
  } catch {
    return null;
  }
}

/** 12.2: at most 5 uploads per rolling 12 hours. Returns seconds to wait, or 0 if allowed. */
export const PREDICTION_CAP = 5;
export const PREDICTION_WINDOW_MS = 12 * 60 * 60 * 1000;

export function predictionWait(uploadTimes: readonly Date[], now = new Date()): number {
  const recent = uploadTimes
    .filter((t) => now.getTime() - t.getTime() < PREDICTION_WINDOW_MS)
    .sort((a, b) => a.getTime() - b.getTime());
  if (recent.length < PREDICTION_CAP) return 0;
  // The oldest of the last five frees a slot when it leaves the window.
  const blocking = recent[recent.length - PREDICTION_CAP];
  return Math.max(1, Math.ceil((blocking.getTime() + PREDICTION_WINDOW_MS - now.getTime()) / 1000));
}
