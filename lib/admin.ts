/**
 * OC (admin) API authentication.
 *
 * Two ways to authenticate, both `Authorization: Bearer <token>`:
 *  - ADMIN_TOKENS: named tokens with a role (oc, technical, moderator, chair).
 *    The actor is the token's name; roles limit what a token may do.
 *  - ADMIN_API_TOKEN (legacy): one shared token acting as role "oc", with the
 *    actor name taken from the mandatory `X-Admin-Actor` header.
 *
 * `oc` may call everything. This is still static-token auth: the rulebook
 * (Section 9) asks for multi-factor organiser login, which needs an identity
 * provider in front of these routes before the event.
 */

import { getConfig, type AdminRole } from "./config";
import { clientIpHash, errorResponse, notConfigured, tooManyRequests } from "./http";
import { rateLimit } from "./rate-limit";
import { safeEqual } from "./security";

export type AdminAuth =
  | { ok: true; actor: string; role: AdminRole }
  | { ok: false; response: Response };

export async function requireAdmin(
  request: Request,
  allowed: readonly AdminRole[] = ["oc", "technical", "moderator", "chair"],
): Promise<AdminAuth> {
  const { adminToken, adminTokens } = getConfig();
  if (!adminToken && adminTokens.length === 0) return { ok: false, response: notConfigured() };

  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  let actor = "";
  let role: AdminRole | null = null;
  if (presented) {
    // Compare against every candidate so timing does not reveal which matched.
    for (const entry of adminTokens) {
      if (safeEqual(presented, entry.token)) {
        actor = entry.actor;
        role = entry.role;
      }
    }
    if (!role && adminToken && safeEqual(presented, adminToken)) {
      role = "oc";
      actor = (request.headers.get("x-admin-actor") ?? "").trim();
      if (!/^[\w .@(),'-]{2,60}$/.test(actor)) {
        return {
          ok: false,
          response: errorResponse(400, "Send your name in the X-Admin-Actor header (2-60 characters)."),
        };
      }
    }
  }

  if (!role) {
    // Only failures count towards the brute-force limit.
    const limit = await rateLimit("adminFailure", clientIpHash(request));
    if (!limit.allowed) return { ok: false, response: tooManyRequests(limit.retryAfter) };
    return { ok: false, response: errorResponse(401, "Authentication required.") };
  }

  if (role !== "oc" && !allowed.includes(role)) {
    return { ok: false, response: errorResponse(403, "Your role cannot do this.") };
  }
  return { ok: true, actor, role };
}
