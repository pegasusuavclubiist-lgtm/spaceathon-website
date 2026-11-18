import { requireAdmin } from "@/lib/admin";
import { TECH } from "@/lib/admin-routes";
import { errorResponse, okResponse, readJson } from "@/lib/http";
import { route } from "@/lib/route";
import { createSignedUploadUrl, PROBLEMS_BUCKET } from "@/lib/supabase";
import { randomUUID } from "node:crypto";

/** POST /api/admin/problems/upload-url { track, filename }: one-shot signed upload URL for a problem file. */
export const POST = route("admin-problem-upload-url", async (request) => {
  const auth = await requireAdmin(request, TECH);
  if (!auth.ok) return auth.response;
  const body = await readJson(request, 1024);
  if (!body.ok) return body.response;
  const input = (body.body ?? {}) as { track?: unknown; filename?: unknown };
  if (input.track !== "Beginner" && input.track !== "Advanced") return errorResponse(422, "Use Beginner or Advanced.", { track: "Invalid track." });
  const safe = String(input.filename ?? "file").replace(/[^\w.-]/g, "_").slice(0, 80);
  const objectPath = `${input.track}/${randomUUID()}-${safe}`;
  const { uploadUrl } = await createSignedUploadUrl(PROBLEMS_BUCKET, objectPath);
  return okResponse({ objectPath, uploadUrl, method: "PUT" });
});
