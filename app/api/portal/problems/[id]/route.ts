import { getConfig } from "@/lib/config";
import { clientIpHash, errorResponse, okResponse } from "@/lib/http";
import { requireMember } from "@/lib/portal-auth";
import { route } from "@/lib/route";
import { problemsGate } from "@/lib/schedule";
import { teamSeedHex } from "@/lib/security";
import {
  downloadObject, insertRow, PROBLEMS_BUCKET, selectRows, signedDownloadUrl,
} from "@/lib/supabase";
import { injectCanary, isCsv, isWatermarkableText, watermarkText } from "@/lib/watermark";

/** Text and CSV files above this size are served unmodified through a signed URL. */
const MAX_INLINE_BYTES = 25 * 1024 * 1024;

/**
 * GET /api/portal/problems/{id}
 * Every download is logged (team, member, IP hash, time). Text statements are
 * returned watermarked, CSV datasets carry the team's canary records; other
 * files return `{ url }`, a 60-second signed link.
 */
export const GET = route<{ id: string }>("portal-problem-file", async (request, context) => {
  const auth = await requireMember(request);
  if (!auth.ok) return auth.response;
  const { member } = auth;
  const config = getConfig();

  const gate = problemsGate(config);
  if (!gate.open) return errorResponse(403, gate.message);
  if (!member.pledgeSignedAt) return errorResponse(403, "Sign the Integrity Declaration first.");

  const { id } = await context.params;
  if (!/^prob_[0-9a-f]{20}$/.test(id)) return errorResponse(404, "File not found.");

  const { rows } = await selectRows<{
    id: string; name: string; content_type: string; object_path: string; size_bytes: number;
  }>("problem_files", {
    select: "id,name,content_type,object_path,size_bytes",
    id: `eq.${id}`,
    track: `eq.${member.team.track}`,
    active: "eq.true",
  });
  const file = rows[0];
  if (!file) return errorResponse(404, "File not found.");

  const inline = file.size_bytes <= MAX_INLINE_BYTES;
  const text = inline && isWatermarkableText(file.content_type, file.name);
  const csv = inline && isCsv(file.content_type, file.name);

  await insertRow("download_log", {
    team_id: member.team.id,
    member_pos: member.position,
    file_id: file.id,
    ip_hash: clientIpHash(request),
    watermarked: text || csv,
  }, "id");

  if (text || csv) {
    const original = new TextDecoder().decode(await downloadObject(PROBLEMS_BUCKET, file.object_path));
    const content = text
      ? watermarkText(original, member.team.code, file.name)
      : injectCanary(original, teamSeedHex(member.team.id, config.teamSeedSecret)).content;
    return new Response(content, {
      headers: {
        "Content-Type": `${file.content_type.split(";")[0] || "text/plain"}; charset=utf-8`,
        "Content-Disposition": `attachment; filename="${file.name.replace(/[^\w.-]/g, "_")}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const url = await signedDownloadUrl(file.object_path, 60, file.name, PROBLEMS_BUCKET);
  return okResponse({ url, expiresIn: 60, watermarked: false });
});
