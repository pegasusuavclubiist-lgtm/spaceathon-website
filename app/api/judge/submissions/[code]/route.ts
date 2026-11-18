import { errorResponse, okResponse } from "@/lib/http";
import { requireJudge } from "@/lib/judge-auth";
import { route } from "@/lib/route";
import { currentItems } from "@/lib/submission-service";
import { selectRows, signedDownloadUrl, SUBMISSIONS_BUCKET } from "@/lib/supabase";

/**
 * GET /api/judge/submissions/{teamCode}
 * Blind package for an assigned team: files by signed link and the frozen
 * manifest hash. No team, member or institute names are returned (8.8, 10.4).
 */
export const GET = route<{ code: string }>("judge-submission", async (request, context) => {
  const auth = await requireJudge(request, ["judge", "chair"]);
  if (!auth.ok) return auth.response;
  const { code } = await context.params;
  if (!/^[BA]-\d{3}$/.test(code)) return errorResponse(404, "Submission not found.");

  const { rows: teams } = await selectRows<{ id: string; track: string }>("teams", {
    select: "id,track", team_code: `eq.${code}`, disqualified: "eq.false",
  });
  const team = teams[0];
  if (!team) return errorResponse(404, "Submission not found.");

  const [assigned, conflict] = await Promise.all([
    selectRows("judge_assignments", { select: "team_id", judge_id: `eq.${auth.judge.id}`, team_id: `eq.${team.id}`, stage: "eq.1" }),
    selectRows("judge_conflicts", { select: "team_id", judge_id: `eq.${auth.judge.id}`, team_id: `eq.${team.id}` }),
  ]);
  if (assigned.rows.length === 0 || conflict.rows.length > 0) return errorResponse(403, "This submission is not assigned to you.");

  const { rows: manifest } = await selectRows<{ manifest_sha256: string; payload: { repo: { url: string; commitSha: string } | null } }>(
    "submission_manifests", { select: "manifest_sha256,payload", team_id: `eq.${team.id}` },
  );
  if (!manifest[0]) return errorResponse(409, "This submission has not been frozen yet.");

  const items = await currentItems(team.id);
  const files = [];
  for (const i of items.filter((x) => x.item !== "deck")) {
    files.push({
      item: i.item,
      sha256: i.sha256,
      size: i.size_bytes,
      contentType: i.content_type,
      url: await signedDownloadUrl(i.object_path, 600, `${code}-${i.item}`, SUBMISSIONS_BUCKET),
    });
  }
  return okResponse({
    teamCode: code,
    track: team.track,
    manifestSha256: manifest[0].manifest_sha256,
    repo: manifest[0].payload.repo,
    files,
  });
});
