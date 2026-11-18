import { getConfig } from "@/lib/config";
import { clientIpHash, errorResponse, okResponse, tooManyRequests } from "@/lib/http";
import { requireMember } from "@/lib/portal-auth";
import { rateLimit } from "@/lib/rate-limit";
import { route } from "@/lib/route";
import { predictionGate } from "@/lib/schedule";
import { randomUUID } from "node:crypto";
import { createSignedUploadUrl, SUBMISSIONS_BUCKET } from "@/lib/supabase";

/** POST /api/portal/predictions/upload-url: a one-shot signed URL for a predictions file. */
export const POST = route("portal-prediction-url", async (request) => {
  const auth = await requireMember(request);
  if (!auth.ok) return auth.response;
  const { team } = auth.member;
  if (team.track !== "Advanced") return errorResponse(404, "Only the Advanced track uses prediction uploads.");

  const limit = await rateLimit("portalWrite", clientIpHash(request));
  if (!limit.allowed) return tooManyRequests(limit.retryAfter);

  const gate = predictionGate(getConfig());
  if (!gate.open) return errorResponse(403, gate.message);

  const objectPath = `${team.id}/predictions/${randomUUID()}`;
  const { uploadUrl } = await createSignedUploadUrl(SUBMISSIONS_BUCKET, objectPath);
  return okResponse({ objectPath, uploadUrl, method: "PUT", maxBytes: 50 * 1024 * 1024 });
});
