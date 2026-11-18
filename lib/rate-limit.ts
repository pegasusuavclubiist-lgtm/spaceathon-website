import { rpc } from "./supabase";

export interface RateLimitResult {
  allowed: boolean;
  retryAfter: number;
}

/** Per-scope limits (docs/api-contract.md suggests 10 / 20 per IP per hour). */
export const RATE_LIMITS = {
  register: { limit: 10, windowSeconds: 3600 },
  contact: { limit: 20, windowSeconds: 3600 },
  upload: { limit: 60, windowSeconds: 3600 },
  adminFailure: { limit: 10, windowSeconds: 900 },
  portalFailure: { limit: 20, windowSeconds: 900 },
  portalWrite: { limit: 120, windowSeconds: 3600 },
  ticket: { limit: 10, windowSeconds: 3600 },
} as const;

export async function rateLimit(
  scope: keyof typeof RATE_LIMITS,
  ipHash: string,
): Promise<RateLimitResult> {
  const { limit, windowSeconds } = RATE_LIMITS[scope];
  try {
    const result = await rpc<{ allowed: boolean; retry_after: number }>(
      "rate_limit_hit",
      { p_key: `${scope}:${ipHash}`, p_limit: limit, p_window_seconds: windowSeconds },
    );
    return { allowed: result.allowed, retryAfter: result.retry_after };
  } catch (error) {
    // Fail open: a limiter outage must not block legitimate registrations.
    console.error(
      `[rate-limit:${scope}]`,
      error instanceof Error ? error.message : "unknown error",
    );
    return { allowed: true, retryAfter: 0 };
  }
}
