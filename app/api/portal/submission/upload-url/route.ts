import { getConfig } from "@/lib/config";
import { clientIpHash, errorResponse, okResponse, readJson, tooManyRequests } from "@/lib/http";
import { requireMember } from "@/lib/portal-auth";
import { rateLimit } from "@/lib/rate-limit";
import { route } from "@/lib/route";
import { deckGate, submissionGate } from "@/lib/schedule";
import { randomUUID } from "node:crypto";
import { ITEM_RULES, UPLOAD_ITEMS, type UploadItem } from "@/lib/submission-service";
import { createSignedUploadUrl, selectRows, SUBMISSIONS_BUCKET } from "@/lib/supabase";

/**
 * POST /api/portal/submission/upload-url { item: "report" | "demo" | "deck" }
 * Returns a one-shot signed URL; the browser PUTs the file straight to storage,
 * then calls POST /api/portal/submission/items to register it.
 */
export const POST = route("portal-upload-url", async (request) => {
  const auth = await requireMember(request);
  if (!auth.ok) return auth.response;
  const { team } = auth.member;

  const limit = await rateLimit("portalWrite", clientIpHash(request));
  if (!limit.allowed) return tooManyRequests(limit.retryAfter);

  const body = await readJson(request, 2048);
  if (!body.ok) return body.response;
  const item = ((body.body ?? {}) as { item?: unknown }).item;
  if (typeof item !== "string" || !(UPLOAD_ITEMS as readonly string[]).includes(item)) {
    return errorResponse(422, "Choose what you are uploading.", { item: "Use report, demo or deck." });
  }
  const kind = item as UploadItem;

  const config = getConfig();
  if (kind === "deck") {
    const gate = deckGate(config);
    if (!gate.open) return errorResponse(403, gate.message);
    const { rows } = await selectRows("results", { select: "team_id", team_id: `eq.${team.id}`, finalist: "eq.true" });
    if (rows.length === 0) return errorResponse(403, "Only finalists upload a finals deck.");
  } else {
    const gate = submissionGate(config, team.graceGranted);
    if (!gate.open) return errorResponse(403, gate.message);
  }

  const objectPath = `${team.id}/${kind}/${randomUUID()}`;
  const { uploadUrl } = await createSignedUploadUrl(SUBMISSIONS_BUCKET, objectPath);
  const rule = ITEM_RULES[kind];
  return okResponse({
    objectPath,
    uploadUrl,
    method: "PUT",
    maxBytes: rule.maxBytes,
    allowedTypes: rule.contentTypes,
  });
});
