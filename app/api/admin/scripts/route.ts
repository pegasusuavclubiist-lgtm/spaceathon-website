import { requireAdmin } from "@/lib/admin";
import { TECH } from "@/lib/admin-routes";
import { audit } from "@/lib/audit";
import { TEAM_ID_PATTERN } from "@/lib/college-id";
import { errorResponse, okResponse, readJson } from "@/lib/http";
import { appendLedger } from "@/lib/ledger";
import { route } from "@/lib/route";
import { benchmarkPoints, requirementsPoints } from "@/lib/scoring";
import { insertRow, selectRows, updateRows } from "@/lib/supabase";

const NUM_FIELDS = [
  "requirementsWorking", "requirementsTotal", "benchmarkPrivate", "benchmarkBaseline", "benchmarkReference",
] as const;
const COLUMN: Record<string, string> = {
  requirementsWorking: "requirements_working", requirementsTotal: "requirements_total",
  benchmarkPrivate: "benchmark_private", benchmarkBaseline: "benchmark_baseline", benchmarkReference: "benchmark_reference",
};

/**
 * POST /api/admin/scripts { teamId, requirementsWorking?, requirementsTotal?,
 *   benchmarkPrivate?, benchmarkBaseline?, benchmarkReference?, cleanRunOk? }
 * Records the script-scored inputs computed by the Technical Committee (10.4):
 * the Beginner requirements checklist and the Advanced private-split benchmark.
 */
export const POST = route("admin-scripts", async (request) => {
  const auth = await requireAdmin(request, TECH);
  if (!auth.ok) return auth.response;
  const body = await readJson(request, 4096);
  if (!body.ok) return body.response;
  const input = (body.body ?? {}) as Record<string, unknown>;
  const teamId = String(input.teamId ?? "");
  if (!TEAM_ID_PATTERN.test(teamId)) return errorResponse(404, "Team not found.");

  const row: Record<string, unknown> = { recorded_by: auth.actor, recorded_at: new Date().toISOString() };
  for (const f of NUM_FIELDS) {
    if (input[f] === undefined) continue;
    const v = Number(input[f]);
    if (!Number.isFinite(v)) return errorResponse(422, `${f} must be a number.`, { [f]: "Not a number." });
    row[COLUMN[f]] = v;
  }
  if (input.cleanRunOk !== undefined) {
    if (typeof input.cleanRunOk !== "boolean") return errorResponse(422, "cleanRunOk must be true or false.");
    row.clean_run_ok = input.cleanRunOk;
  }

  const { rows } = await selectRows("script_scores", { select: "team_id", team_id: `eq.${teamId}` });
  if (rows.length) await updateRows("script_scores", { team_id: `eq.${teamId}` }, row);
  else await insertRow("script_scores", { team_id: teamId, ...row }, "team_id");

  await audit(auth.actor, "script_scores_recorded", teamId, {});
  await appendLedger("script_scores", teamId, { actor: auth.actor, fields: Object.keys(row).filter((k) => k !== "recorded_by" && k !== "recorded_at") });
  return okResponse({
    teamId,
    requirementsPoints: row.requirements_working != null && row.requirements_total != null
      ? requirementsPoints(Number(row.requirements_working), Number(row.requirements_total)) : null,
    benchmarkPoints: row.benchmark_private != null && row.benchmark_baseline != null && row.benchmark_reference != null
      ? benchmarkPoints(Number(row.benchmark_private), Number(row.benchmark_baseline), Number(row.benchmark_reference)) : null,
  });
});
