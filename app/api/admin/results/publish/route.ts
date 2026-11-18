import { requireAdmin } from "@/lib/admin";
import { OC } from "@/lib/admin-routes";
import { audit } from "@/lib/audit";
import { errorResponse, okResponse, readJson } from "@/lib/http";
import { appendLedger } from "@/lib/ledger";
import { route } from "@/lib/route";
import { selectRows, updateRows } from "@/lib/supabase";

/**
 * POST /api/admin/results/publish { track, phase: "provisional" | "final" }
 * Provisional results open the appeal window at T+102. Final results need every
 * top-3 team's winner audit to have passed (9.4, 14.1).
 */
export const POST = route("admin-results-publish", async (request) => {
  const auth = await requireAdmin(request, OC);
  if (!auth.ok) return auth.response;
  const body = await readJson(request, 1024);
  if (!body.ok) return body.response;
  const input = (body.body ?? {}) as { track?: unknown; phase?: unknown };
  if (input.track !== "Beginner" && input.track !== "Advanced") return errorResponse(422, "Use Beginner or Advanced.", { track: "Invalid track." });
  if (input.phase !== "provisional" && input.phase !== "final") return errorResponse(422, "Use provisional or final.", { phase: "Invalid phase." });

  const { rows } = await selectRows<{ team_id: string; rank: number | null; audit_passed: boolean | null }>("results", {
    select: "team_id,rank,audit_passed", track: `eq.${input.track}`,
  });
  if (rows.length === 0) return errorResponse(409, "No stored results for this track. Compute with save first.");

  if (input.phase === "final") {
    const top3 = rows.filter((r) => r.rank != null && r.rank <= 3);
    const unaudited = top3.filter((r) => r.audit_passed !== true);
    if (unaudited.length) {
      return errorResponse(409, "Every top-3 team must pass the winner audit before final results.", {
        teams: unaudited.map((r) => r.team_id).join(", "),
      });
    }
  }
  await updateRows("results", { track: `eq.${input.track}` }, { phase: input.phase });
  await audit(auth.actor, "results_published", null, { track: input.track, phase: input.phase });
  await appendLedger("results_published", String(input.track), { phase: input.phase, actor: auth.actor, teams: rows.length });
  return okResponse({ track: input.track, phase: input.phase, teams: rows.length });
});
