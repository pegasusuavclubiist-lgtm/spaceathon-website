/**
 * Participant (portal) authentication: every verified member has a personal
 * key, `Authorization: Bearer kmp_…`, issued when the OC verifies the team.
 * Only the SHA-256 of the key is stored. Failed attempts are rate limited.
 */

import { clientIpHash, errorResponse, tooManyRequests } from "./http";
import { rateLimit } from "./rate-limit";
import { sha256Hex } from "./security";
import { selectRows } from "./supabase";
import type { Track } from "./rules";

export interface PortalMember {
  position: number;
  fullName: string;
  email: string;
  pledgeSignedAt: string | null;
  finalDeclarationSignedAt: string | null;
  isLeader: boolean;
  team: {
    id: string;
    code: string;
    name: string;
    track: Track;
    graceGranted: boolean;
    repoUrl: string | null;
    members: { position: number; pledged: boolean; finalSigned: boolean }[];
  };
}

export type PortalAuth =
  | { ok: true; member: PortalMember }
  | { ok: false; response: Response };

interface Row {
  position: number;
  full_name: string;
  email_key: string;
  pledge_signed_at: string | null;
  final_declaration_signed_at: string | null;
  teams: {
    id: string;
    team_code: string | null;
    team_name: string;
    track: Track;
    leader_email: string;
    verification_status: string;
    disqualified: boolean;
    grace_granted: boolean;
    repo_url: string | null;
    team_members: { position: number; pledge_signed_at: string | null; final_declaration_signed_at: string | null }[];
  };
}

const SELECT =
  "position,full_name,email_key,pledge_signed_at,final_declaration_signed_at," +
  "teams!inner(id,team_code,team_name,track,leader_email,verification_status,disqualified,grace_granted,repo_url," +
  "team_members(position,pledge_signed_at,final_declaration_signed_at))";

export async function requireMember(
  request: Request,
  options: { leaderOnly?: boolean } = {},
): Promise<PortalAuth> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  const fail = async (): Promise<PortalAuth> => {
    const limit = await rateLimit("portalFailure", clientIpHash(request));
    if (!limit.allowed) return { ok: false, response: tooManyRequests(limit.retryAfter) };
    return { ok: false, response: errorResponse(401, "Your portal key is not valid.") };
  };

  if (!/^kmp_[\w-]{20,80}$/.test(token)) return fail();

  const { rows } = await selectRows<Row>("team_members", {
    select: SELECT,
    portal_token_hash: `eq.${sha256Hex(token)}`,
  });
  const row = rows[0];
  if (!row) return fail();

  const team = row.teams;
  if (team.verification_status !== "verified" || !team.team_code) {
    return { ok: false, response: errorResponse(403, "Your team is not verified yet.") };
  }
  if (team.disqualified) {
    return { ok: false, response: errorResponse(403, "This team is no longer in the competition.") };
  }

  const isLeader = team.leader_email.toLowerCase() === row.email_key;
  if (options.leaderOnly && !isLeader) {
    return { ok: false, response: errorResponse(403, "Only the team leader can do this.") };
  }

  return {
    ok: true,
    member: {
      position: row.position,
      fullName: row.full_name,
      email: row.email_key,
      pledgeSignedAt: row.pledge_signed_at,
      finalDeclarationSignedAt: row.final_declaration_signed_at,
      isLeader,
      team: {
        id: team.id,
        code: team.team_code,
        name: team.team_name,
        track: team.track,
        graceGranted: team.grace_granted,
        repoUrl: team.repo_url,
        members: team.team_members
          .map((m) => ({
            position: m.position,
            pledged: Boolean(m.pledge_signed_at),
            finalSigned: Boolean(m.final_declaration_signed_at),
          }))
          .sort((a, b) => a.position - b.position),
      },
    },
  };
}

/** Same hash used when issuing keys, exported for the activation code and tests. */
export const hashPortalKey = (token: string) => sha256Hex(token);
