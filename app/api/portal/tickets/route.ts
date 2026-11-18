import { getConfig } from "@/lib/config";
import { clientIpHash, errorResponse, okResponse, readJson, tooManyRequests } from "@/lib/http";
import { notifyOc } from "@/lib/notify";
import { requireMember } from "@/lib/portal-auth";
import { rateLimit } from "@/lib/rate-limit";
import { route } from "@/lib/route";
import { getMilestones } from "@/lib/schedule";
import { newId } from "@/lib/security";
import { insertRow, updateRows } from "@/lib/supabase";
import { cleanLine, cleanMultiline } from "@/lib/validation";

/**
 * POST /api/portal/tickets { kind: "general" | "upload_failure", subject, body }
 * Support ticket (6.2, 6.9). An upload-failure ticket raised during the
 * submission window earns the 10-minute technical grace at -5 points (8.3).
 */
export const POST = route("portal-ticket", async (request) => {
  const auth = await requireMember(request);
  if (!auth.ok) return auth.response;
  const { member } = auth;

  const limit = await rateLimit("ticket", clientIpHash(request));
  if (!limit.allowed) return tooManyRequests(limit.retryAfter);

  const body = await readJson(request, 8 * 1024);
  if (!body.ok) return body.response;
  const input = (body.body ?? {}) as { kind?: unknown; subject?: unknown; body?: unknown };

  const kind = input.kind === "upload_failure" ? "upload_failure" : "general";
  const subject = cleanLine(input.subject).slice(0, 120);
  const text = cleanMultiline(input.body).slice(0, 3000);
  const fieldErrors: Record<string, string> = {};
  if (!subject) fieldErrors.subject = "Add a subject.";
  if (!text) fieldErrors.body = "Describe the problem.";
  if (Object.keys(fieldErrors).length) return errorResponse(422, "Please fix the highlighted fields.", fieldErrors);

  const now = new Date();
  const m = getMilestones(getConfig());
  const id = newId("tkt");
  await insertRow("support_tickets", {
    id, team_id: member.team.id, member_pos: member.position, kind, subject, body: text,
  }, "id");

  let graceGranted = false;
  if (kind === "upload_failure" && m && now >= m.submitOpens && now < m.hardClose) {
    await updateRows("teams", { id: `eq.${member.team.id}` }, { grace_granted: true });
    graceGranted = true;
  }
  await notifyOc(`Support ticket ${id} (${kind}) from team ${member.team.code}.`);
  return okResponse({ id, graceGranted }, 201);
});
