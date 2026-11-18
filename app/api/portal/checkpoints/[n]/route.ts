import { auditBestEffort } from "@/lib/audit";
import { getConfig } from "@/lib/config";
import { validateNote } from "@/lib/checkpoints";
import { clientIpHash, errorResponse, okResponse, readJson, tooManyRequests } from "@/lib/http";
import { requireMember } from "@/lib/portal-auth";
import { rateLimit } from "@/lib/rate-limit";
import { route } from "@/lib/route";
import { checkpointGate } from "@/lib/schedule";
import { insertRow, selectRows, updateRows } from "@/lib/supabase";

/**
 * POST /api/portal/checkpoints/{1|3} { note, commitSha? }
 * Checkpoints 1 and 3 are 200-word notes with a repository snapshot reference.
 * Checkpoint 2 is a live video check-in recorded by the OC. Accepted from T0
 * until the checkpoint instant; the team can edit the note until then.
 */
export const POST = route<{ n: string }>("portal-checkpoint", async (request, context) => {
  const auth = await requireMember(request);
  if (!auth.ok) return auth.response;
  const { member } = auth;

  const { n: rawN } = await context.params;
  if (rawN === "2") {
    return errorResponse(422, "Checkpoint 2 is a live video check-in, recorded by the OC.");
  }
  if (rawN !== "1" && rawN !== "3") return errorResponse(404, "Unknown checkpoint.");
  const n = Number(rawN) as 1 | 3;

  const limit = await rateLimit("portalWrite", clientIpHash(request));
  if (!limit.allowed) return tooManyRequests(limit.retryAfter);

  const gate = checkpointGate(getConfig(), n);
  if (!gate.open) return errorResponse(403, gate.message);

  const body = await readJson(request, 16 * 1024);
  if (!body.ok) return body.response;
  const input = (body.body ?? {}) as { note?: unknown; commitSha?: unknown };
  const checked = validateNote(input.note, input.commitSha);
  if (!checked.ok) return errorResponse(422, "Please fix the highlighted fields.", checked.fieldErrors);

  const row = {
    note: checked.note,
    word_count: checked.words,
    repo_sha: checked.sha,
    recorded_by: `member:${member.position}`,
    recorded_at: new Date().toISOString(),
  };
  const { rows } = await selectRows("checkpoints", {
    select: "n", team_id: `eq.${member.team.id}`, n: `eq.${n}`,
  });
  if (rows.length > 0) {
    await updateRows("checkpoints", { team_id: `eq.${member.team.id}`, n: `eq.${n}` }, row);
  } else {
    await insertRow("checkpoints", { team_id: member.team.id, n, ...row }, "n");
  }
  await auditBestEffort(`member:${member.team.code}/${member.position}`, "checkpoint_note", member.team.id, { n, words: checked.words });
  return okResponse({ n, wordCount: checked.words, recordedAt: row.recorded_at });
});
