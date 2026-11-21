import { auditBestEffort } from "@/lib/audit";
import { TEAM_ID_PATTERN } from "@/lib/college-id";
import { getConfig, isDatabaseConfigured } from "@/lib/config";
import {
  clientIpHash,
  errorResponse,
  notConfigured,
  okResponse,
  serverError,
  tooManyRequests,
} from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { uploadGate } from "@/lib/rules";
import { ID_FILE_TYPES, safeEqual, sha256Hex, sniffIdFile } from "@/lib/security";
import {
  PAYMENT_PROOFS_BUCKET,
  removeObjects,
  selectRows,
  updateRows,
  uploadObject,
} from "@/lib/supabase";

/**
 * POST /api/register/{id}/payment-proof
 * multipart/form-data with `file` (UPI payment screenshot or PDF), authorized
 * with the Bearer upload token returned by POST /api/register.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const config = getConfig();
    if (!isDatabaseConfigured(config)) return notConfigured();

    const ipHash = clientIpHash(request);
    const limit = await rateLimit("upload", ipHash);
    if (!limit.allowed) return tooManyRequests(limit.retryAfter);

    const gate = uploadGate(config);
    if (!gate.open) return errorResponse(403, gate.message);

    const { id } = await context.params;
    if (!TEAM_ID_PATTERN.test(id)) return errorResponse(404, "Registration not found.");

    const authHeader = request.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) return errorResponse(401, "Upload token required.");

    const { rows } = await selectRows<{
      id: string;
      upload_token_hash: string;
      payment_proof_path: string | null;
    }>("teams", {
      select: "id,upload_token_hash,payment_proof_path",
      id: `eq.${id}`,
    });
    const team = rows[0];
    if (!team || !safeEqual(sha256Hex(token), team.upload_token_hash)) {
      return errorResponse(401, "Invalid upload token.");
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return errorResponse(400, "Send multipart/form-data with a payment proof file.");
    }

    const entry = form.get("file");
    if (!(entry instanceof File)) {
      return errorResponse(422, "Attach a payment proof image or PDF.", {
        paymentProof: "Select a payment screenshot or PDF.",
      });
    }

    if (entry.size === 0 || entry.size > config.maxIdBytes) {
      return errorResponse(
        413,
        `Payment proof must be under ${Math.round(config.maxIdBytes / 1048576)} MB.`,
      );
    }

    const bytes = new Uint8Array(await entry.arrayBuffer());
    const kind = sniffIdFile(bytes);
    if (!kind) {
      return errorResponse(415, "Upload a JPEG, PNG, WebP or PDF payment screenshot.");
    }
    const detected = ID_FILE_TYPES[kind];

    const objectPath = `${id}/payment-proof-${Date.now()}.${detected.extension}`;
    await uploadObject(objectPath, bytes, detected.contentType, PAYMENT_PROOFS_BUCKET);

    if (team.payment_proof_path && team.payment_proof_path !== objectPath) {
      await removeObjects([team.payment_proof_path], PAYMENT_PROOFS_BUCKET).catch(() => undefined);
    }

    await updateRows(
      "teams",
      { id: `eq.${id}` },
      {
        payment_proof_path: objectPath,
        payment_proof_content_type: detected.contentType,
        payment_proof_size_bytes: bytes.byteLength,
        payment_proof_uploaded_at: new Date().toISOString(),
      },
    );

    await auditBestEffort("applicant", "payment_proof_uploaded", id, {
      contentType: detected.contentType,
      sizeBytes: bytes.byteLength,
    });

    return okResponse({ uploaded: true, contentType: detected.contentType, sizeBytes: bytes.byteLength }, 201);
  } catch (error) {
    return serverError("payment-proof-upload", error);
  }
}
