import { requireAdmin } from "@/lib/admin";
import { TECH } from "@/lib/admin-routes";
import { audit } from "@/lib/audit";
import { getConfig } from "@/lib/config";
import { errorResponse, okResponse } from "@/lib/http";
import { appendLedger } from "@/lib/ledger";
import { route } from "@/lib/route";
import { getMilestones } from "@/lib/schedule";
import { packageStatus } from "@/lib/submission-service";
import { insertRow, selectRows } from "@/lib/supabase";

/**
 * POST /api/admin/submissions/close
 * Run after T+48 (and the grace window): freezes every team's package, computes
 * the SHA-256 manifest and writes it to the ledger (8.7). Already-frozen teams
 * are skipped, so the call is safe to repeat and a manifest can never change.
 */
export const POST = route("admin-close", async (request) => {
  const auth = await requireAdmin(request, TECH);
  if (!auth.ok) return auth.response;
  const m = getMilestones(getConfig());
  if (!m) return errorResponse(409, "The event schedule has not been set.");
  if (new Date() < m.graceEnds) return errorResponse(409, "The submission window (including grace) is still open.");

  const { rows: teams } = await selectRows<{ id: string; team_code: string; track: "Beginner" | "Advanced"; grace_granted: boolean }>(
    "teams", { select: "id,team_code,track,grace_granted", verification_status: "eq.verified", disqualified: "eq.false", team_code: "not.is.null" },
  );
  const { rows: done } = await selectRows<{ team_id: string }>("submission_manifests", { select: "team_id" });
  const frozen = new Set(done.map((d) => d.team_id));

  let created = 0;
  for (const t of teams) {
    if (frozen.has(t.id)) continue;
    const status = await packageStatus(
      { id: t.id, code: t.team_code, track: t.track, graceGranted: t.grace_granted },
      t.grace_granted ? m.graceEnds : m.hardClose,
    );
    if (!status.manifest) continue;
    await insertRow("submission_manifests", {
      team_id: t.id, manifest_sha256: status.manifest.sha256, payload: status.manifest.payload,
    }, "team_id");
    await appendLedger("submission_manifest", t.team_code, { sha256: status.manifest.sha256, missing: status.missing.length });
    created += 1;
  }
  await audit(auth.actor, "submissions_closed", null, { created, skipped: teams.length - created });
  return okResponse({ frozen: created, alreadyFrozen: teams.length - created });
});
