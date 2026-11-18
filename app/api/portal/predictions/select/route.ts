import { auditBestEffort } from "@/lib/audit";
import { getConfig } from "@/lib/config";
import { errorResponse, okResponse, readJson } from "@/lib/http";
import { requireMember } from "@/lib/portal-auth";
import { route } from "@/lib/route";
import { predictionGate } from "@/lib/schedule";
import { selectRows, updateRows } from "@/lib/supabase";

/** POST /api/portal/predictions/select { id }: choose the final predictions file before T+48 (12.2). */
export const POST = route("portal-prediction-select", async (request) => {
  const auth = await requireMember(request);
  if (!auth.ok) return auth.response;
  const { member } = auth;
  if (member.team.track !== "Advanced") return errorResponse(404, "Only the Advanced track uses prediction uploads.");

  const gate = predictionGate(getConfig());
  if (!gate.open) return errorResponse(403, gate.message);

  const body = await readJson(request, 1024);
  if (!body.ok) return body.response;
  const id = String(((body.body ?? {}) as { id?: unknown }).id ?? "");
  if (!/^pred_[0-9a-f]{20}$/.test(id)) return errorResponse(422, "Choose one of your uploads.", { id: "Invalid id." });

  const { rows } = await selectRows("prediction_uploads", { select: "id", id: `eq.${id}`, team_id: `eq.${member.team.id}` });
  if (rows.length === 0) return errorResponse(404, "Upload not found.");

  await updateRows("prediction_uploads", { team_id: `eq.${member.team.id}` }, { selected: false });
  await updateRows("prediction_uploads", { id: `eq.${id}` }, { selected: true });
  await auditBestEffort(`member:${member.team.code}/${member.position}`, "prediction_selected", member.team.id, { id });
  return okResponse({ id, selected: true });
});
