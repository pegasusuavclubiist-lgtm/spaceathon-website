import {
  analyzeSubmissionTexts,
  extractReadableText,
  type AnalyzedTextInput,
} from "@/lib/ai-detector";
import { audit } from "@/lib/audit";
import { errorResponse, okResponse, readJson } from "@/lib/http";
import { requireJudge } from "@/lib/judge-auth";
import { route } from "@/lib/route";
import { currentItems } from "@/lib/submission-service";
import {
  downloadObject,
  selectRows,
  SUBMISSIONS_BUCKET,
  upsertRow,
} from "@/lib/supabase";

/**
 * POST /api/judge/submissions/{teamCode}/ai-scan
 * Allows an assigned judge to trigger an on-demand AI usage scan on the team's
 * uploaded report plus optional pasted README / source code snippet.
 */
export const POST = route<{ code: string }>("judge-ai-scan", async (request, context) => {
  const auth = await requireJudge(request, ["judge", "chair", "grand_jury"]);
  if (!auth.ok) return auth.response;

  const { code } = await context.params;
  if (!/^[BA]-\d{3}$/.test(code)) return errorResponse(404, "Submission not found.");

  const { rows: teams } = await selectRows<{ id: string; track: string }>("teams", {
    select: "id,track",
    team_code: `eq.${code}`,
    disqualified: "eq.false",
  });
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

  const body = await readJson(request, 256 * 1024);
  const input = body.ok ? ((body.body ?? {}) as Record<string, unknown>) : {};

  const texts: AnalyzedTextInput[] = [];
  const items = await currentItems(team.id);
  const reportItem = items.find((i) => i.item === "report");
  if (reportItem && reportItem.size_bytes <= 15 * 1024 * 1024) {
    try {
      const bytes = await downloadObject(SUBMISSIONS_BUCKET, reportItem.object_path);
      const extracted = extractReadableText(bytes);
      if (extracted.trim().length > 20) {
        texts.push({ path: `${code}-report.pdf`, kind: "report", text: extracted });
      }
    } catch {
      /* ignore */
    }
  }

  if (typeof input.readmeText === "string" && input.readmeText.trim()) {
    texts.push({ path: "README.md", kind: "readme", text: input.readmeText });
  }
  if (typeof input.codeSnippet === "string" && input.codeSnippet.trim()) {
    texts.push({ path: "code-sample", kind: "code", text: input.codeSnippet });
  }

  const analysis = analyzeSubmissionTexts(texts);
  const now = new Date().toISOString();

  await upsertRow(
    "ai_usage_reports",
    {
      team_id: team.id,
      overall_ai_percent: analysis.overallAiPercent,
      code_ai_percent: analysis.codeAiPercent,
      report_ai_percent: analysis.reportAiPercent,
      declared_ai_tools: analysis.declaredAiTools,
      declared_ai_log_present: analysis.declaredAiLogPresent,
      undeclared_ai_suspected: analysis.undeclaredAiSuspected,
      risk_level: analysis.riskLevel,
      file_breakdown: analysis.fileBreakdown,
      signals: analysis.signals,
      summary: analysis.summary,
      analyzed_by: `judge:${auth.judge.id}`,
      analyzed_at: now,
    },
    "team_id",
    "team_id",
  );

  await audit(`judge:${auth.judge.id}`, "judge_ai_scan_run", code, {
    overallAiPercent: analysis.overallAiPercent,
    riskLevel: analysis.riskLevel,
  });

  return okResponse({
    teamCode: code,
    ...analysis,
    analyzedBy: `judge:${auth.judge.id}`,
    analyzedAt: now,
  });
});
