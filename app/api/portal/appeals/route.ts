import { auditBestEffort } from "@/lib/audit";
import { getConfig } from "@/lib/config";
import { errorResponse, okResponse, readJson } from "@/lib/http";
import { notifyOc } from "@/lib/notify";
import { requireMember } from "@/lib/portal-auth";
import { route } from "@/lib/route";
import { appealGate } from "@/lib/schedule";
import { newId } from "@/lib/security";
import { insertRow, selectRows } from "@/lib/supabase";
import { cleanMultiline } from "@/lib/validation";

const APPEAL_GROUNDS = [
  "arithmetic_error", "misapplied_rule", "undeclared_conflict", "procedural_irregularity",
] as const;

/** GET /api/portal/appeals: my team's appeal, if any. */
export const GET = route("portal-appeal-get", async (request) => {
  const auth = await requireMember(request);
  if (!auth.ok) return auth.response;
  const { rows } = await selectRows<{
    id: string; ground: string; description: string; status: string; decision_note: string | null; created_at: string;
  }>("appeals", {
    select: "id,ground,description,status,decision_note,created_at",
    team_id: `eq.${auth.member.team.id}`,
  });
  return okResponse({ appeal: rows[0] ?? null });
});

/**
 * POST /api/portal/appeals { ground, description }
 * One appeal per team, filed by the team leader between T+102 and T+126 (15.1).
 * Disagreement with a judge's subjective assessment is not a valid ground (15.2).
 */
export const POST = route("portal-appeal", async (request) => {
  const auth = await requireMember(request, { leaderOnly: true });
  if (!auth.ok) return auth.response;
  const { member } = auth;

  const gate = appealGate(getConfig());
  if (!gate.open) return errorResponse(403, gate.message);

  const body = await readJson(request, 8 * 1024);
  if (!body.ok) return body.response;
  const input = (body.body ?? {}) as { ground?: unknown; description?: unknown };

  const fieldErrors: Record<string, string> = {};
  if (typeof input.ground !== "string" || !(APPEAL_GROUNDS as readonly string[]).includes(input.ground)) {
    fieldErrors.ground = "Choose a valid ground. Disagreeing with a judge's assessment is not one.";
  }
  const description = cleanMultiline(input.description).slice(0, 3000);
  if (description.length < 30) fieldErrors.description = "Explain the error in at least a few sentences.";
  if (Object.keys(fieldErrors).length) return errorResponse(422, "Please fix the highlighted fields.", fieldErrors);

  const { rows } = await selectRows("appeals", { select: "id", team_id: `eq.${member.team.id}` });
  if (rows.length > 0) return errorResponse(409, "Your team has already filed its one appeal.");

  const id = newId("app");
  await insertRow("appeals", { id, team_id: member.team.id, ground: input.ground, description }, "id");
  await auditBestEffort(`member:${member.team.code}/${member.position}`, "appeal_filed", member.team.id, { id, ground: input.ground });
  await notifyOc(`Appeal ${id} filed by team ${member.team.code}.`);
  return okResponse({ id, status: "open" }, 201);
});
