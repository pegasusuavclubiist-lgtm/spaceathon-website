import { auditBestEffort } from "@/lib/audit";
import { getConfig } from "@/lib/config";
import { clientIpHash, errorResponse, okResponse, readJson, tooManyRequests } from "@/lib/http";
import { requireMember } from "@/lib/portal-auth";
import { rateLimit } from "@/lib/rate-limit";
import { route } from "@/lib/route";
import { deckGate, submissionGate } from "@/lib/schedule";
import { maxBytesFor, sniffItem, UPLOAD_ITEMS, type UploadItem } from "@/lib/submission-service";
import { hashObject, insertRow, removeObjects, SUBMISSIONS_BUCKET } from "@/lib/supabase";

/**
 * POST /api/portal/submission/items { item, objectPath }
 * Registers an uploaded file: checks it exists, is within the size limit and
 * really is the right kind of file, and records its SHA-256. The last valid
 * upload before close counts (8.1).
 */
export const POST = route("portal-register-item", async (request) => {
  const auth = await requireMember(request);
  if (!auth.ok) return auth.response;
  const { member } = auth;
  const { team } = member;

  const limit = await rateLimit("portalWrite", clientIpHash(request));
  if (!limit.allowed) return tooManyRequests(limit.retryAfter);

  const body = await readJson(request, 2048);
  if (!body.ok) return body.response;
  const input = (body.body ?? {}) as { item?: unknown; objectPath?: unknown };

  if (typeof input.item !== "string" || !(UPLOAD_ITEMS as readonly string[]).includes(input.item)) {
    return errorResponse(422, "Choose what you uploaded.", { item: "Use report, demo or deck." });
  }
  const item = input.item as UploadItem;
  const objectPath = typeof input.objectPath === "string" ? input.objectPath : "";
  if (!objectPath.startsWith(`${team.id}/${item}/`) || objectPath.includes("..")) {
    return errorResponse(422, "That upload does not belong to your team.", { objectPath: "Invalid object path." });
  }

  const config = getConfig();
  let inGrace = false;
  if (item === "deck") {
    const gate = deckGate(config);
    if (!gate.open) return errorResponse(403, gate.message);
  } else {
    const gate = submissionGate(config, team.graceGranted);
    if (!gate.open) return errorResponse(403, gate.message);
    inGrace = gate.inGrace;
  }

  let hashed;
  try {
    hashed = await hashObject(SUBMISSIONS_BUCKET, objectPath, maxBytesFor(item));
  } catch (error) {
    if ((error as { status?: number }).status === 413) {
      await removeObjects([objectPath], SUBMISSIONS_BUCKET).catch(() => undefined);
      return errorResponse(413, "The file is too large.");
    }
    throw error;
  }
  if (!hashed) return errorResponse(422, "The file has not been uploaded yet.", { objectPath: "Upload the file first." });

  const contentType = sniffItem(item, hashed.head);
  if (!contentType) {
    await removeObjects([objectPath], SUBMISSIONS_BUCKET).catch(() => undefined);
    return errorResponse(415, "That file type is not accepted for this item.", { file: "Wrong file type." });
  }

  await insertRow("submission_items", {
    team_id: team.id,
    item,
    object_path: objectPath,
    content_type: contentType,
    size_bytes: hashed.size,
    sha256: hashed.sha256,
    in_grace: inGrace,
    uploaded_pos: member.position,
  }, "id");
  await auditBestEffort(`member:${team.code}/${member.position}`, "submission_item", team.id, { item, sha256: hashed.sha256, inGrace });

  return okResponse({ item, sha256: hashed.sha256, size: hashed.size, inGrace }, 201);
});
