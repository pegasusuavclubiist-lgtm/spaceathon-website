import { auditBestEffort } from "@/lib/audit";
import { getConfig } from "@/lib/config";
import { predictionWait, scorePredictions } from "@/lib/eval";
import { errorResponse, okResponse, readJson, tooManyRequests } from "@/lib/http";
import { requireMember } from "@/lib/portal-auth";
import { route } from "@/lib/route";
import { predictionGate } from "@/lib/schedule";
import { newId } from "@/lib/security";
import {
  hashObject, insertRow, selectRows, signedDownloadUrl, SUBMISSIONS_BUCKET, updateRows,
} from "@/lib/supabase";

const MAX_PREDICTION_BYTES = 50 * 1024 * 1024;

interface Row {
  id: string; uploaded_at: string; eval_status: string; public_score: number | null; selected: boolean;
}

/** GET /api/portal/predictions: my uploads (public score only) and the remaining quota. */
export const GET = route("portal-predictions", async (request) => {
  const auth = await requireMember(request);
  if (!auth.ok) return auth.response;
  if (auth.member.team.track !== "Advanced") return errorResponse(404, "Only the Advanced track uses prediction uploads.");

  const { rows } = await selectRows<Row>("prediction_uploads", {
    select: "id,uploaded_at,eval_status,public_score,selected",
    team_id: `eq.${auth.member.team.id}`,
    order: "uploaded_at.desc",
  });
  const wait = predictionWait(rows.map((r) => new Date(r.uploaded_at)));
  return okResponse({
    uploads: rows.map((r) => ({
      id: r.id, uploadedAt: r.uploaded_at, status: r.eval_status, publicScore: r.public_score, selected: r.selected,
    })),
    cap: { perWindow: 5, windowHours: 12, retryAfterSeconds: wait },
  });
});

/**
 * POST /api/portal/predictions { objectPath }
 * Registers a predictions file already uploaded to the signed URL from
 * /predictions/upload-url, enforces 5 uploads per rolling 12 hours (12.2) and
 * asks the organiser scoring service for the public-split score. The private
 * score is stored but never returned.
 */
export const POST = route("portal-prediction-register", async (request) => {
  const auth = await requireMember(request);
  if (!auth.ok) return auth.response;
  const { member } = auth;
  const { team } = member;
  if (team.track !== "Advanced") return errorResponse(404, "Only the Advanced track uses prediction uploads.");

  const gate = predictionGate(getConfig());
  if (!gate.open) return errorResponse(403, gate.message);

  const body = await readJson(request, 2048);
  if (!body.ok) return body.response;
  const objectPath = String(((body.body ?? {}) as { objectPath?: unknown }).objectPath ?? "");
  if (!objectPath.startsWith(`${team.id}/predictions/`) || objectPath.includes("..")) {
    return errorResponse(422, "That upload does not belong to your team.", { objectPath: "Invalid object path." });
  }

  const { rows: previous } = await selectRows<{ uploaded_at: string }>("prediction_uploads", {
    select: "uploaded_at", team_id: `eq.${team.id}`, order: "uploaded_at.desc", limit: "20",
  });
  const wait = predictionWait(previous.map((r) => new Date(r.uploaded_at)));
  if (wait > 0) return tooManyRequests(wait);

  const hashed = await hashObject(SUBMISSIONS_BUCKET, objectPath, MAX_PREDICTION_BYTES);
  if (!hashed) return errorResponse(422, "The file has not been uploaded yet.", { objectPath: "Upload the file first." });

  const id = newId("pred");
  await insertRow("prediction_uploads", {
    id, team_id: team.id, object_path: objectPath, sha256: hashed.sha256, size_bytes: hashed.size,
  }, "id");

  let status: "pending" | "scored" | "failed" = "pending";
  let publicScore: number | null = null;
  if (getConfig().evalServiceUrl) {
    const url = await signedDownloadUrl(objectPath, 300, `${id}.bin`, SUBMISSIONS_BUCKET);
    const scores = await scorePredictions(id, url);
    if (scores) {
      status = "scored";
      publicScore = scores.publicScore;
      await updateRows("prediction_uploads", { id: `eq.${id}` }, {
        eval_status: "scored", public_score: scores.publicScore, private_score: scores.privateScore,
      });
    } else {
      status = "failed";
      await updateRows("prediction_uploads", { id: `eq.${id}` }, { eval_status: "failed" });
    }
  }
  await auditBestEffort(`member:${team.code}/${member.position}`, "prediction_upload", team.id, { id, status });
  return okResponse({ id, status, publicScore, sha256: hashed.sha256 }, 201);
});
