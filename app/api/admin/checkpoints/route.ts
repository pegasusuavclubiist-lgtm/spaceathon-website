import { requireAdmin } from "@/lib/admin";
import { TECH } from "@/lib/admin-routes";
import { audit } from "@/lib/audit";
import { TEAM_ID_PATTERN } from "@/lib/college-id";
import { errorResponse, okResponse, readJson } from "@/lib/http";
import { route } from "@/lib/route";
import { insertRow, selectRows, updateRows } from "@/lib/supabase";

/**
 * POST /api/admin/checkpoints { teamId, presentPositions: [0,1,...] }
 * Records Checkpoint 2, the live 5-minute video check-in (6.4). It only counts
 * when every member was present.
 */
export const POST = route("admin-checkpoint2", async (request) => {
  const auth = await requireAdmin(request, TECH);
  if (!auth.ok) return auth.response;
  const body = await readJson(request, 2048);
  if (!body.ok) return body.response;
  const input = (body.body ?? {}) as { teamId?: unknown; presentPositions?: unknown };

  const teamId = String(input.teamId ?? "");
  const present = Array.isArray(input.presentPositions) ? input.presentPositions : null;
  if (!TEAM_ID_PATTERN.test(teamId) || !present || !present.every((p) => Number.isInteger(p) && p >= 0 && p <= 3)) {
    return errorResponse(422, "Send teamId and presentPositions (numbers 0-3).");
  }
  const { rows: members } = await selectRows("team_members", { select: "position", team_id: `eq.${teamId}` });
  if (members.length === 0) return errorResponse(404, "Team not found.");

  const positions = [...new Set(present as number[])].sort();
  const row = { present_positions: positions, recorded_by: auth.actor, recorded_at: new Date().toISOString() };
  const { rows: existing } = await selectRows("checkpoints", { select: "n", team_id: `eq.${teamId}`, n: "eq.2" });
  if (existing.length) await updateRows("checkpoints", { team_id: `eq.${teamId}`, n: "eq.2" }, row);
  else await insertRow("checkpoints", { team_id: teamId, n: 2, ...row }, "n");

  const complete = positions.length >= members.length;
  await audit(auth.actor, "checkpoint2_recorded", teamId, { present: positions.length, of: members.length });
  return okResponse({ teamId, present: positions.length, of: members.length, counts: complete });
});
