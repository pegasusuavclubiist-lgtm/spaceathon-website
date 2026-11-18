import { getConfig, isDatabaseConfigured } from "@/lib/config";
import { storeCollegeId, TEAM_ID_PATTERN } from "@/lib/college-id";
import {
  clientIpHash,
  errorResponse,
  notConfigured,
  okResponse,
  serverError,
  tooManyRequests,
} from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/register/{id}/college-id
 * multipart/form-data: `memberIndex` (0-3) and `file` (JPEG/PNG/WebP/PDF).
 * Authorization: Bearer <token returned by POST /api/register>.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const config = getConfig();
    if (!isDatabaseConfigured(config)) return notConfigured();

    const { id } = await context.params;
    if (!TEAM_ID_PATTERN.test(id)) {
      return errorResponse(401, "The upload link is not valid.");
    }

    const limit = await rateLimit("upload", clientIpHash(request));
    if (!limit.allowed) return tooManyRequests(limit.retryAfter);

    const header = request.headers.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) return errorResponse(401, "The upload link is not valid.");

    if (!(request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      return errorResponse(415, "Send the file as multipart/form-data.");
    }

    // Reject oversized bodies before parsing (allow 64 kB for form overhead).
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > config.maxIdBytes + 64 * 1024) {
      return errorResponse(413, "The file is too large.");
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return errorResponse(400, "The upload could not be read.");
    }

    const rawIndex = form.get("memberIndex");
    const file = form.get("file");
    if (typeof rawIndex !== "string" || !/^[0-3]$/.test(rawIndex.trim())) {
      return errorResponse(422, "Choose which team member this ID belongs to.", {
        form: "memberIndex must be a number from 0 to 3.",
      });
    }
    if (!(file instanceof Blob)) {
      return errorResponse(422, "Attach the college ID file.", {
        form: "The file field is missing.",
      });
    }

    const outcome = await storeCollegeId({
      teamId: id,
      token,
      memberIndex: Number(rawIndex.trim()),
      file,
    });

    if (!outcome.ok) {
      return errorResponse(outcome.status, outcome.message, outcome.fieldErrors);
    }
    return okResponse(outcome.data);
  } catch (error) {
    return serverError("college-id", error);
  }
}
