/** Judge / Grand Jury authentication: `Authorization: Bearer kmj_…`, only the hash is stored. */

import { clientIpHash, errorResponse, tooManyRequests } from "./http";
import { rateLimit } from "./rate-limit";
import { sha256Hex } from "./security";
import { selectRows } from "./supabase";

export type JudgeRole = "judge" | "chair" | "moderator" | "grand_jury";

export interface Judge {
  id: string;
  name: string;
  role: JudgeRole;
  tracks: string[];
}

export type JudgeAuth = { ok: true; judge: Judge } | { ok: false; response: Response };

export async function requireJudge(
  request: Request,
  allowed: readonly JudgeRole[] = ["judge", "chair", "moderator", "grand_jury"],
): Promise<JudgeAuth> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  const fail = async (): Promise<JudgeAuth> => {
    const limit = await rateLimit("portalFailure", clientIpHash(request));
    if (!limit.allowed) return { ok: false, response: tooManyRequests(limit.retryAfter) };
    return { ok: false, response: errorResponse(401, "Your judge key is not valid.") };
  };

  if (!/^kmj_[\w-]{20,80}$/.test(token)) return fail();
  const { rows } = await selectRows<{ id: string; name: string; role: JudgeRole; tracks: string[] }>("judges", {
    select: "id,name,role,tracks",
    token_hash: `eq.${sha256Hex(token)}`,
    active: "eq.true",
  });
  const row = rows[0];
  if (!row) return fail();
  if (!allowed.includes(row.role)) return { ok: false, response: errorResponse(403, "Your role cannot do this.") };
  return { ok: true, judge: row };
}
