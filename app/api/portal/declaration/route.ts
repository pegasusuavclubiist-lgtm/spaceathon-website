import { auditBestEffort } from "@/lib/audit";
import { getConfig } from "@/lib/config";
import { clientIpHash, errorResponse, okResponse, readJson, tooManyRequests } from "@/lib/http";
import { requireMember } from "@/lib/portal-auth";
import { rateLimit } from "@/lib/rate-limit";
import { route } from "@/lib/route";
import { pledgeGate, submissionGate } from "@/lib/schedule";
import { updateRows } from "@/lib/supabase";

/**
 * POST /api/portal/declaration { kind: "pledge" | "final", accepted: true }
 * Annex A: each member signs before T0 and again with the final submission.
 */
export const POST = route("portal-declaration", async (request) => {
  const auth = await requireMember(request);
  if (!auth.ok) return auth.response;
  const { member } = auth;

  const limit = await rateLimit("portalWrite", clientIpHash(request));
  if (!limit.allowed) return tooManyRequests(limit.retryAfter);

  const body = await readJson(request, 2048);
  if (!body.ok) return body.response;
  const input = (body.body ?? {}) as { kind?: unknown; accepted?: unknown };

  if (input.kind !== "pledge" && input.kind !== "final") {
    return errorResponse(422, "Choose which declaration you are signing.", { kind: "Use pledge or final." });
  }
  if (input.accepted !== true) {
    return errorResponse(422, "Tick the declaration to sign it.", { accepted: "You must accept the Integrity Declaration." });
  }

  const config = getConfig();
  const now = new Date();
  const patch: Record<string, unknown> = {};

  if (input.kind === "pledge") {
    const gate = pledgeGate(config, now);
    if (!gate.open) return errorResponse(403, gate.message);
    patch.pledge_signed_at = now.toISOString();
    patch.pledge_rulebook_sha256 = config.rulebookSha256;
  } else {
    const gate = submissionGate(config, member.team.graceGranted, now);
    if (!gate.open) return errorResponse(403, gate.message);
    patch.final_declaration_signed_at = now.toISOString();
  }

  await updateRows(
    "team_members",
    { team_id: `eq.${member.team.id}`, position: `eq.${member.position}` },
    patch,
  );
  await auditBestEffort(`member:${member.team.code}/${member.position}`, `declaration_${input.kind}`, member.team.id, {});
  return okResponse({ kind: input.kind, signedAt: now.toISOString() });
});
