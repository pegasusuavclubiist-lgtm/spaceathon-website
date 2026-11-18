import { getConfig } from "@/lib/config";
import { okResponse } from "@/lib/http";
import { requireMember } from "@/lib/portal-auth";
import { route } from "@/lib/route";
import { getMilestones, pledgeGate, problemsGate } from "@/lib/schedule";
import { selectRows } from "@/lib/supabase";

/** GET /api/portal/me: who am I, my team, schedule and what is open. */
export const GET = route("portal-me", async (request) => {
  const auth = await requireMember(request);
  if (!auth.ok) return auth.response;
  const { member } = auth;
  const config = getConfig();
  const now = new Date();
  const m = getMilestones(config);

  const { rows: cps } = await selectRows<{ n: number; recorded_at: string }>("checkpoints", {
    select: "n,recorded_at",
    team_id: `eq.${member.team.id}`,
  });

  return okResponse({
    member: { position: member.position, fullName: member.fullName, isLeader: member.isLeader },
    team: {
      id: member.team.id,
      code: member.team.code,
      name: member.team.name,
      track: member.team.track,
      members: member.team.members,
    },
    pledgeSigned: Boolean(member.pledgeSignedAt),
    finalDeclarationSigned: Boolean(member.finalDeclarationSignedAt),
    state: {
      pledgeOpen: pledgeGate(config, now).open,
      problemsOpen: problemsGate(config, now).open && Boolean(member.pledgeSignedAt),
    },
    checkpoints: [1, 2, 3].map((n) => ({ n, done: cps.some((c) => c.n === n) })),
    schedule: m
      ? Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.toISOString()]))
      : null,
    serverTime: now.toISOString(),
  });
});
