import { getConfig } from "@/lib/config";
import { errorResponse, okResponse } from "@/lib/http";
import { requireMember } from "@/lib/portal-auth";
import { route } from "@/lib/route";
import { problemsGate } from "@/lib/schedule";
import { teamSeedHex } from "@/lib/security";
import { selectRows } from "@/lib/supabase";

/**
 * GET /api/portal/problems
 * Statements and datasets for the member's track, released to everyone at T0
 * (5.7) and only to members who signed the pledge. The `seed` is the team's
 * own variant seed (5.9).
 */
export const GET = route("portal-problems", async (request) => {
  const auth = await requireMember(request);
  if (!auth.ok) return auth.response;
  const { member } = auth;
  const config = getConfig();

  const gate = problemsGate(config);
  if (!gate.open) return errorResponse(403, gate.message);
  if (!member.pledgeSignedAt) {
    return errorResponse(403, "Sign the Integrity Declaration to get access to the problem statements.");
  }

  const { rows } = await selectRows<{
    id: string; kind: string; name: string; content_type: string; size_bytes: number; sha256: string;
  }>("problem_files", {
    select: "id,kind,name,content_type,size_bytes,sha256",
    track: `eq.${member.team.track}`,
    active: "eq.true",
    order: "kind.asc,name.asc",
  });

  return okResponse({
    track: member.team.track,
    seed: teamSeedHex(member.team.id, config.teamSeedSecret).slice(0, 8),
    files: rows.map((f) => ({
      id: f.id, kind: f.kind, name: f.name, contentType: f.content_type, size: f.size_bytes, sha256: f.sha256,
    })),
  });
});
