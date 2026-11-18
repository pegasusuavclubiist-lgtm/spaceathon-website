import { getConfig } from "@/lib/config";
import { okResponse } from "@/lib/http";
import { requireMember } from "@/lib/portal-auth";
import { route } from "@/lib/route";
import { getMilestones, submissionGate } from "@/lib/schedule";
import { ITEM_RULES, packageStatus } from "@/lib/submission-service";
import { selectRows } from "@/lib/supabase";

/**
 * GET /api/portal/submission
 * The team's package as it stands (Annex D checklist), the manifest preview and,
 * after hard close, the frozen SHA-256 manifest of the evaluated version (8.7).
 */
export const GET = route("portal-submission", async (request) => {
  const auth = await requireMember(request);
  if (!auth.ok) return auth.response;
  const { team } = auth.member;
  const config = getConfig();
  const m = getMilestones(config);

  const status = await packageStatus(team);
  const gate = submissionGate(config, team.graceGranted);
  const { rows: frozen } = await selectRows<{ manifest_sha256: string; payload: unknown; created_at: string }>(
    "submission_manifests",
    { select: "manifest_sha256,payload,created_at", team_id: `eq.${team.id}` },
  );

  return okResponse({
    window: {
      open: gate.open,
      message: gate.open ? null : gate.message,
      opensAt: m?.submitOpens.toISOString() ?? null,
      closesAt: m?.hardClose.toISOString() ?? null,
      graceGranted: team.graceGranted,
    },
    rules: Object.fromEntries(
      Object.entries(ITEM_RULES).map(([k, v]) => [k, { maxBytes: v.maxBytes, contentTypes: v.contentTypes, label: v.label }]),
    ),
    items: status.items,
    missing: status.missing,
    declarations: { signed: status.membersSigned, required: status.memberCount },
    manifestPreview: status.manifest?.sha256 ?? null,
    frozenManifest: frozen[0]
      ? { sha256: frozen[0].manifest_sha256, createdAt: frozen[0].created_at }
      : null,
  });
});
