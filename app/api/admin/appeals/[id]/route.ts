import { requireAdmin } from "@/lib/admin";
import { OC } from "@/lib/admin-routes";
import { audit } from "@/lib/audit";
import { getConfig } from "@/lib/config";
import { errorResponse, okResponse, readJson } from "@/lib/http";
import { appendLedger } from "@/lib/ledger";
import { route } from "@/lib/route";
import { getMilestones } from "@/lib/schedule";
import { updateRows } from "@/lib/supabase";
import { cleanMultiline } from "@/lib/validation";

/**
 * PATCH /api/admin/appeals/{id} { status: "upheld" | "rejected", note }
 * Decided by three Grievance Committee members who took no part in scoring the
 * track, by T+138 (15.3). Scores are never re-judged (15.2); an upheld appeal is
 * corrected through the Moderator's score-correction route.
 */
export const PATCH = route<{ id: string }>("admin-appeal-decide", async (request, context) => {
  const auth = await requireAdmin(request, OC);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!/^app_[0-9a-f]{20}$/.test(id)) return errorResponse(404, "Appeal not found.");
  const body = await readJson(request, 4096);
  if (!body.ok) return body.response;
  const input = (body.body ?? {}) as { status?: unknown; note?: unknown };
  if (input.status !== "upheld" && input.status !== "rejected") return errorResponse(422, "Use upheld or rejected.", { status: "Invalid status." });
  const note = cleanMultiline(input.note).slice(0, 2000);
  if (!note) return errorResponse(422, "Record the reasoning.", { note: "Required." });

  const n = await updateRows("appeals", { id: `eq.${id}` }, {
    status: input.status, decision_note: note, decided_by: auth.actor, decided_at: new Date().toISOString(),
  });
  if (n === 0) return errorResponse(404, "Appeal not found.");
  const m = getMilestones(getConfig());
  await audit(auth.actor, "appeal_decided", id, { status: input.status });
  await appendLedger("appeal_decided", id, { status: input.status, actor: auth.actor });
  return okResponse({ id, status: input.status, afterDeadline: m ? new Date() > m.grievanceDecideBy : false });
});
