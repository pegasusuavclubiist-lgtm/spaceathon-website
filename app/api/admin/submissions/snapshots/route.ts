import { requireAdmin } from "@/lib/admin";
import { TECH } from "@/lib/admin-routes";
import { audit } from "@/lib/audit";
import { TEAM_ID_PATTERN } from "@/lib/college-id";
import { errorResponse, okResponse, readJson } from "@/lib/http";
import { route } from "@/lib/route";
import { insertRow, selectRows, updateRows } from "@/lib/supabase";

/**
 * POST /api/admin/submissions/snapshots
 * { snapshots: [{ teamId, repoUrl, commitSha, facts: { hasReadme, hasEnvFile, hasDockerfile } }] }
 * Imported by the Technical Committee's repository tooling at hard close (8.2):
 * the latest commit of each provisioned repository and what the snapshot contains.
 * This service does not talk to the Git host itself.
 */
export const POST = route("admin-snapshots", async (request) => {
  const auth = await requireAdmin(request, TECH);
  if (!auth.ok) return auth.response;
  const body = await readJson(request, 256 * 1024);
  if (!body.ok) return body.response;
  const list = (body.body as { snapshots?: unknown })?.snapshots;
  if (!Array.isArray(list) || list.length === 0 || list.length > 500) return errorResponse(422, "Send 1 to 500 snapshots.");

  const saved: string[] = [];
  const rejected: { teamId: string; reason: string }[] = [];
  for (const raw of list as Record<string, unknown>[]) {
    const teamId = String(raw.teamId ?? "");
    const sha = String(raw.commitSha ?? "");
    const url = String(raw.repoUrl ?? "");
    if (!TEAM_ID_PATTERN.test(teamId) || !/^[0-9a-f]{7,40}$/i.test(sha) || !/^https:\/\/\S+$/.test(url)) {
      rejected.push({ teamId, reason: "invalid teamId, commitSha or repoUrl" });
      continue;
    }
    const facts = {
      hasReadme: raw.facts && (raw.facts as Record<string, unknown>).hasReadme === true,
      hasEnvFile: raw.facts && (raw.facts as Record<string, unknown>).hasEnvFile === true,
      hasDockerfile: raw.facts && (raw.facts as Record<string, unknown>).hasDockerfile === true,
    };
    const row = { repo_url: url, commit_sha: sha.toLowerCase(), facts, recorded_by: auth.actor, recorded_at: new Date().toISOString() };
    const { rows } = await selectRows("repo_snapshots", { select: "team_id", team_id: `eq.${teamId}` });
    if (rows.length) await updateRows("repo_snapshots", { team_id: `eq.${teamId}` }, row);
    else await insertRow("repo_snapshots", { team_id: teamId, ...row }, "team_id");
    saved.push(teamId);
  }
  await audit(auth.actor, "repo_snapshots_imported", null, { saved: saved.length, rejected: rejected.length });
  return okResponse({ saved: saved.length, rejected });
});
