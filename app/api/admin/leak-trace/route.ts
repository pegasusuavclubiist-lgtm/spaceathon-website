import { requireAdmin } from "@/lib/admin";
import { TECH } from "@/lib/admin-routes";
import { audit } from "@/lib/audit";
import { getConfig } from "@/lib/config";
import { errorResponse, okResponse, readJson } from "@/lib/http";
import { route } from "@/lib/route";
import { teamSeedHex } from "@/lib/security";
import { downloadObject, PROBLEMS_BUCKET, selectRows } from "@/lib/supabase";
import { traceLeak } from "@/lib/watermark";

/**
 * POST /api/admin/leak-trace { fileId, leakedCsv }
 * Compares a leaked copy of a CSV dataset with the canary records each team
 * would have received (5.8, 5.12). Reports a ranked match; the OC decides.
 */
export const POST = route("admin-leak-trace", async (request) => {
  const auth = await requireAdmin(request, TECH);
  if (!auth.ok) return auth.response;
  const body = await readJson(request, 30 * 1024 * 1024);
  if (!body.ok) return body.response;
  const input = (body.body ?? {}) as { fileId?: unknown; leakedCsv?: unknown };
  if (typeof input.fileId !== "string" || typeof input.leakedCsv !== "string") return errorResponse(422, "Send fileId and leakedCsv.");

  const { rows: files } = await selectRows<{ object_path: string; track: string }>("problem_files", {
    select: "object_path,track", id: `eq.${input.fileId}`,
  });
  if (!files[0]) return errorResponse(404, "File not found.");
  const original = new TextDecoder().decode(await downloadObject(PROBLEMS_BUCKET, files[0].object_path));
  const { rows: teams } = await selectRows<{ id: string; team_code: string }>("teams", {
    select: "id,team_code", track: `eq.${files[0].track}`, team_code: "not.is.null",
  });
  const secret = getConfig().teamSeedSecret;
  const ranked = traceLeak(original, input.leakedCsv, teams.map((t) => ({ teamCode: t.team_code, seedHex: teamSeedHex(t.id, secret) })));
  await audit(auth.actor, "leak_trace_run", input.fileId, { top: ranked[0]?.teamCode ?? null });
  return okResponse({ matches: ranked.filter((r) => r.matched > 0).slice(0, 5), note: "A full match on one team is strong evidence, not proof; follow Section 9.2." });
});
