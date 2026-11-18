import { requireAdmin } from "@/lib/admin";
import { JUDGING, OC } from "@/lib/admin-routes";
import { audit } from "@/lib/audit";
import { TEAM_ID_PATTERN } from "@/lib/college-id";
import { errorResponse, okResponse, readJson } from "@/lib/http";
import { route } from "@/lib/route";
import { newId, newPortalToken, sha256Hex } from "@/lib/security";
import { insertRow, selectRows } from "@/lib/supabase";
import { cleanLine } from "@/lib/validation";

const ROLES = ["judge", "chair", "moderator", "grand_jury"];

/** GET /api/admin/judges: judges and their load (keys are never shown again). */
export const GET = route("admin-judges", async (request) => {
  const auth = await requireAdmin(request, JUDGING);
  if (!auth.ok) return auth.response;
  const { rows } = await selectRows("judges", { select: "id,name,role,tracks,active,created_at", order: "created_at.asc" });
  return okResponse({ judges: rows });
});

/**
 * POST /api/admin/judges { name, role, tracks, conflicts?: [{ teamId, reason }] }
 * Creates a judge and returns their key once. Declared conflicts of interest
 * (Annex B) recuse the judge from those teams automatically (10.2).
 */
export const POST = route("admin-judge-create", async (request) => {
  const auth = await requireAdmin(request, OC);
  if (!auth.ok) return auth.response;
  const body = await readJson(request, 16 * 1024);
  if (!body.ok) return body.response;
  const input = (body.body ?? {}) as Record<string, unknown>;

  const name = cleanLine(input.name).slice(0, 80);
  const role = String(input.role ?? "");
  const tracks = Array.isArray(input.tracks) ? (input.tracks as unknown[]).map(String) : [];
  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "Enter a name.";
  if (!ROLES.includes(role)) fieldErrors.role = `Use one of ${ROLES.join(", ")}.`;
  if (role !== "grand_jury" && (tracks.length === 0 || !tracks.every((t) => t === "Beginner" || t === "Advanced"))) {
    fieldErrors.tracks = "Choose Beginner, Advanced or both.";
  }
  if (Object.keys(fieldErrors).length) return errorResponse(422, "Please fix the highlighted fields.", fieldErrors);

  const id = newId("jdg");
  const key = newPortalToken("kmj");
  await insertRow("judges", { id, name, role, tracks, token_hash: sha256Hex(key) }, "id");

  const conflicts = Array.isArray(input.conflicts) ? (input.conflicts as { teamId?: unknown; reason?: unknown }[]) : [];
  for (const c of conflicts) {
    const teamId = String(c.teamId ?? "");
    if (TEAM_ID_PATTERN.test(teamId)) {
      await insertRow("judge_conflicts", { judge_id: id, team_id: teamId, reason: cleanLine(c.reason).slice(0, 200) || null }, "judge_id");
    }
  }
  await audit(auth.actor, "judge_created", id, { role, conflicts: conflicts.length });
  return okResponse({ id, name, role, key }, 201);
});

/** PUT /api/admin/judges { judgeId, teamId, reason }: declare a conflict of interest after creation. */
export const PUT = route("admin-judge-conflict", async (request) => {
  const auth = await requireAdmin(request, JUDGING);
  if (!auth.ok) return auth.response;
  const body = await readJson(request, 2048);
  if (!body.ok) return body.response;
  const input = (body.body ?? {}) as Record<string, unknown>;
  const judgeId = String(input.judgeId ?? "");
  const teamId = String(input.teamId ?? "");
  if (!/^jdg_[0-9a-f]{20}$/.test(judgeId) || !TEAM_ID_PATTERN.test(teamId)) return errorResponse(422, "Send judgeId and teamId.");
  await insertRow("judge_conflicts", { judge_id: judgeId, team_id: teamId, reason: cleanLine(input.reason).slice(0, 200) || null }, "judge_id");
  await audit(auth.actor, "judge_conflict_declared", judgeId, { teamId });
  return okResponse({ judgeId, teamId });
});
