import { errorResponse, okResponse } from "@/lib/http";
import { requireJudge } from "@/lib/judge-auth";
import { route } from "@/lib/route";
import { currentItems } from "@/lib/submission-service";
import { selectRows, signedDownloadUrl, SUBMISSIONS_BUCKET } from "@/lib/supabase";

/**
 * GET /api/judge/submissions/{teamCode}
 * Blind package for an assigned team: files by signed link, frozen manifest
 * hash, repository snapshot, and AI-usage analysis report.
 */
export const GET = route<{ code: string }>("judge-submission", async (request, context) => {
  const auth = await requireJudge(request, ["judge", "chair", "grand_jury"]);
  if (!auth.ok) return auth.response;
  const { code } = await context.params;
  if (!/^[BA]-\d{3}$/.test(code)) return errorResponse(404, "Submission not found.");

  const { rows: teams } = await selectRows<{ id: string; track: string; repo_url: string | null }>(
    "teams",
    {
      select: "id,track,repo_url",
      team_code: `eq.${code}`,
      disqualified: "eq.false",
    },
  );
  const team = teams[0];
  if (!team) return errorResponse(404, "Submission not found.");

  const stage = auth.judge.role === "grand_jury" ? 2 : 1;
  const [assigned, conflict] = await Promise.all([
    selectRows("judge_assignments", {
      select: "team_id",
      judge_id: `eq.${auth.judge.id}`,
      team_id: `eq.${team.id}`,
      stage: `eq.${stage}`,
    }),
    selectRows("judge_conflicts", {
      select: "team_id",
      judge_id: `eq.${auth.judge.id}`,
      team_id: `eq.${team.id}`,
    }),
  ]);
  if (assigned.rows.length === 0 || conflict.rows.length > 0) {
    return errorResponse(403, "This submission is not assigned to you.");
  }

  const { rows: manifest } = await selectRows<{
    manifest_sha256: string;
    payload: { repo: { url: string; commitSha: string } | null };
  }>("submission_manifests", {
    select: "manifest_sha256,payload",
    team_id: `eq.${team.id}`,
  });

  const items = await currentItems(team.id);
  const files = [];
  for (const i of items.filter((x) => stage === 2 || x.item !== "deck")) {
    files.push({
      item: i.item,
      sha256: i.sha256,
      size: i.size_bytes,
      contentType: i.content_type,
      url: await signedDownloadUrl(
        i.object_path,
        600,
        `${code}-${i.item}`,
        SUBMISSIONS_BUCKET,
      ),
    });
  }

  let aiUsage = null;
  try {
    const { rows: aiRows } = await selectRows<{
      overall_ai_percent: number;
      code_ai_percent: number | null;
      report_ai_percent: number | null;
      declared_ai_tools: string[];
      declared_ai_log_present: boolean;
      undeclared_ai_suspected: boolean;
      risk_level: "low" | "moderate" | "high";
      file_breakdown: unknown;
      signals: unknown;
      summary: string | null;
      analyzed_by: string;
      analyzed_at: string;
    }>("ai_usage_reports", {
      select: "*",
      team_id: `eq.${team.id}`,
    });
    const r = aiRows[0];
    if (r) {
      aiUsage = {
        teamCode: code,
        overallAiPercent: Number(r.overall_ai_percent),
        codeAiPercent: r.code_ai_percent != null ? Number(r.code_ai_percent) : null,
        reportAiPercent: r.report_ai_percent != null ? Number(r.report_ai_percent) : null,
        declaredAiTools: r.declared_ai_tools ?? [],
        declaredAiLogPresent: Boolean(r.declared_ai_log_present),
        undeclaredAiSuspected: Boolean(r.undeclared_ai_suspected),
        riskLevel: r.risk_level,
        fileBreakdown: Array.isArray(r.file_breakdown) ? r.file_breakdown : [],
        signals: Array.isArray(r.signals) ? r.signals : [],
        summary: r.summary ?? "",
        analyzedBy: r.analyzed_by,
        analyzedAt: r.analyzed_at,
      };
    }
  } catch {
    /* optional until migration 0003 */
  }

  return okResponse({
    teamCode: code,
    track: team.track,
    frozen: Boolean(manifest[0]),
    manifestSha256: manifest[0]?.manifest_sha256 ?? null,
    repo: manifest[0]?.payload.repo ?? (team.repo_url ? { url: team.repo_url, commitSha: "latest" } : null),
    files,
    aiUsage,
  });
});
