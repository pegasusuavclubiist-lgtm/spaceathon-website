import { requireAdmin } from "@/lib/admin";
import { JUDGING } from "@/lib/admin-routes";
import {
  analyzeSubmissionTexts,
  extractReadableText,
  type AnalyzedTextInput,
} from "@/lib/ai-detector";
import { audit } from "@/lib/audit";
import { TEAM_ID_PATTERN } from "@/lib/college-id";
import { errorResponse, okResponse, readJson } from "@/lib/http";
import { route } from "@/lib/route";
import { currentItems } from "@/lib/submission-service";
import {
  downloadObject,
  selectRows,
  SUBMISSIONS_BUCKET,
  upsertRow,
} from "@/lib/supabase";
import { cleanLine, cleanMultiline } from "@/lib/validation";

interface AiReportRow {
  team_id: string;
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
  teams?: { team_code: string | null; team_name: string; track: string };
}

function formatReport(row: AiReportRow) {
  return {
    teamId: row.team_id,
    teamCode: row.teams?.team_code ?? undefined,
    teamName: row.teams?.team_name ?? undefined,
    track: row.teams?.track ?? undefined,
    overallAiPercent: Number(row.overall_ai_percent),
    codeAiPercent: row.code_ai_percent != null ? Number(row.code_ai_percent) : null,
    reportAiPercent: row.report_ai_percent != null ? Number(row.report_ai_percent) : null,
    declaredAiTools: row.declared_ai_tools ?? [],
    declaredAiLogPresent: Boolean(row.declared_ai_log_present),
    undeclaredAiSuspected: Boolean(row.undeclared_ai_suspected),
    riskLevel: row.risk_level,
    fileBreakdown: Array.isArray(row.file_breakdown) ? row.file_breakdown : [],
    signals: Array.isArray(row.signals) ? row.signals : [],
    summary: row.summary ?? "",
    analyzedBy: row.analyzed_by,
    analyzedAt: row.analyzed_at,
  };
}

/** GET /api/admin/ai-analysis — list all AI usage reports. */
export const GET = route("admin-ai-analysis-list", async (request) => {
  const auth = await requireAdmin(request, JUDGING);
  if (!auth.ok) return auth.response;

  const { rows } = await selectRows<AiReportRow>("ai_usage_reports", {
    select:
      "team_id,overall_ai_percent,code_ai_percent,report_ai_percent,declared_ai_tools," +
      "declared_ai_log_present,undeclared_ai_suspected,risk_level,file_breakdown,signals," +
      "summary,analyzed_by,analyzed_at,teams(team_code,team_name,track)",
    order: "analyzed_at.desc",
  });

  return okResponse({ reports: rows.map(formatReport) });
});

/**
 * POST /api/admin/ai-analysis
 * Mode 1 (auto scan): { teamId, mode?: "auto", codeSnippet?: string, readmeText?: string, reportText?: string }
 * Mode 2 (manual/external detector): {
 *   teamId, mode: "manual", overallAiPercent, codeAiPercent?, reportAiPercent?,
 *   declaredAiTools?: string[], declaredAiLogPresent?: boolean,
 *   undeclaredAiSuspected?: boolean, riskLevel?: "low"|"moderate"|"high", summary?: string
 * }
 */
export const POST = route("admin-ai-analysis-run", async (request) => {
  const auth = await requireAdmin(request, JUDGING);
  if (!auth.ok) return auth.response;

  const body = await readJson(request, 512 * 1024);
  if (!body.ok) return body.response;
  const input = (body.body ?? {}) as Record<string, unknown>;

  const teamId = String(input.teamId ?? "");
  if (!TEAM_ID_PATTERN.test(teamId)) {
    return errorResponse(422, "Provide a valid teamId.");
  }

  const { rows: teams } = await selectRows<{
    id: string;
    team_code: string | null;
    team_name: string;
    track: string;
  }>("teams", {
    select: "id,team_code,team_name,track",
    id: `eq.${teamId}`,
  });
  if (!teams[0]) return errorResponse(404, "Team not found.");

  const now = new Date().toISOString();

  if (input.mode === "manual") {
    const overall = Number(input.overallAiPercent);
    if (!Number.isFinite(overall) || overall < 0 || overall > 100) {
      return errorResponse(422, "overallAiPercent must be between 0 and 100.");
    }
    const codePct =
      input.codeAiPercent !== undefined && input.codeAiPercent !== null && input.codeAiPercent !== ""
        ? Number(input.codeAiPercent)
        : null;
    const reportPct =
      input.reportAiPercent !== undefined && input.reportAiPercent !== null && input.reportAiPercent !== ""
        ? Number(input.reportAiPercent)
        : null;
    const declaredAiTools = Array.isArray(input.declaredAiTools)
      ? input.declaredAiTools.map((t) => cleanLine(t)).filter(Boolean)
      : typeof input.declaredAiTools === "string"
        ? input.declaredAiTools
            .split(",")
            .map((t) => cleanLine(t))
            .filter(Boolean)
        : [];
    const declaredAiLogPresent = Boolean(input.declaredAiLogPresent);
    const undeclaredAiSuspected = Boolean(input.undeclaredAiSuspected);
    const riskLevel =
      input.riskLevel === "low" || input.riskLevel === "moderate" || input.riskLevel === "high"
        ? input.riskLevel
        : undeclaredAiSuspected || overall >= 65
          ? "high"
          : overall >= 30
            ? "moderate"
            : "low";
    const summary = cleanMultiline(input.summary).slice(0, 1000) || `Recorded ${overall}% estimated AI usage.`;

    const saved = await upsertRow<AiReportRow>(
      "ai_usage_reports",
      {
        team_id: teamId,
        overall_ai_percent: overall,
        code_ai_percent: codePct,
        report_ai_percent: reportPct,
        declared_ai_tools: declaredAiTools,
        declared_ai_log_present: declaredAiLogPresent,
        undeclared_ai_suspected: undeclaredAiSuspected,
        risk_level: riskLevel,
        file_breakdown: Array.isArray(input.fileBreakdown) ? input.fileBreakdown : [],
        signals: Array.isArray(input.signals)
          ? input.signals
          : [`Manual / external audit recorded by ${auth.actor}`],
        summary,
        analyzed_by: auth.actor,
        analyzed_at: now,
      },
      "team_id",
      "*",
    );

    await audit(auth.actor, "ai_usage_recorded", teamId, {
      overallAiPercent: overall,
      riskLevel,
      undeclaredAiSuspected,
    });

    return okResponse(formatReport({ ...saved, teams: teams[0] }), 201);
  }

  // Auto scan: pull uploaded report from storage + any provided text snippets
  const texts: AnalyzedTextInput[] = [];
  const items = await currentItems(teamId);
  const reportItem = items.find((i) => i.item === "report");
  if (reportItem && reportItem.size_bytes <= 15 * 1024 * 1024) {
    try {
      const bytes = await downloadObject(SUBMISSIONS_BUCKET, reportItem.object_path);
      const extracted = extractReadableText(bytes);
      if (extracted.trim().length > 20) {
        texts.push({ path: "submission/report.pdf", kind: "report", text: extracted });
      }
    } catch {
      /* ignore unreadable binary */
    }
  }

  if (typeof input.readmeText === "string" && input.readmeText.trim()) {
    texts.push({ path: "README.md", kind: "readme", text: input.readmeText });
  }
  if (typeof input.reportText === "string" && input.reportText.trim()) {
    texts.push({ path: "report-excerpt.txt", kind: "report", text: input.reportText });
  }
  if (typeof input.codeSnippet === "string" && input.codeSnippet.trim()) {
    texts.push({ path: "repository-code-sample", kind: "code", text: input.codeSnippet });
  }

  const analysis = analyzeSubmissionTexts(texts);
  const saved = await upsertRow<AiReportRow>(
    "ai_usage_reports",
    {
      team_id: teamId,
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
      analyzed_by: auth.actor,
      analyzed_at: now,
    },
    "team_id",
    "*",
  );

  await audit(auth.actor, "ai_usage_scanned", teamId, {
    overallAiPercent: analysis.overallAiPercent,
    riskLevel: analysis.riskLevel,
    files: texts.length,
  });

  return okResponse(formatReport({ ...saved, teams: teams[0] }), 201);
});
