import { requireAdmin } from "@/lib/admin";
import { TECH } from "@/lib/admin-routes";
import { audit } from "@/lib/audit";
import { errorResponse, okResponse, readJson } from "@/lib/http";
import { appendLedger } from "@/lib/ledger";
import { route } from "@/lib/route";
import { newId } from "@/lib/security";
import { hashObject, insertRow, PROBLEMS_BUCKET, selectRows } from "@/lib/supabase";
import { TRACKS } from "@/lib/rules";
import { cleanLine } from "@/lib/validation";

const KINDS = ["statement", "dataset", "starter", "other"];

/** GET /api/admin/problems?track= : every problem file, including retired ones. */
export const GET = route("admin-problems", async (request) => {
  const auth = await requireAdmin(request, TECH);
  if (!auth.ok) return auth.response;
  const track = new URL(request.url).searchParams.get("track");
  const { rows } = await selectRows("problem_files", {
    select: "id,track,kind,name,content_type,size_bytes,sha256,active,uploaded_by,created_at",
    order: "created_at.desc",
    ...(track ? { track: `eq.${track}` } : {}),
  });
  return okResponse({ files: rows });
});

/**
 * POST /api/admin/problems { track, kind, name, contentType, objectPath }
 * Registers a file already uploaded to the `problems` bucket (via /problems/upload-url
 * or the Supabase dashboard). The server hashes it and records the SHA-256 so it can
 * be compared with the hash commitments published at D-7 (5.3).
 */
export const POST = route("admin-problem-register", async (request) => {
  const auth = await requireAdmin(request, TECH);
  if (!auth.ok) return auth.response;
  const body = await readJson(request, 4096);
  if (!body.ok) return body.response;
  const input = (body.body ?? {}) as Record<string, unknown>;

  const fieldErrors: Record<string, string> = {};
  if (!(TRACKS as readonly string[]).includes(String(input.track))) fieldErrors.track = "Use Beginner or Advanced.";
  if (!KINDS.includes(String(input.kind))) fieldErrors.kind = `Use one of ${KINDS.join(", ")}.`;
  const name = cleanLine(input.name).slice(0, 120);
  if (!name) fieldErrors.name = "Give the file a name.";
  const contentType = cleanLine(input.contentType).slice(0, 100) || "application/octet-stream";
  const objectPath = typeof input.objectPath === "string" ? input.objectPath : "";
  if (!objectPath || objectPath.includes("..")) fieldErrors.objectPath = "Give the object path in the problems bucket.";
  if (Object.keys(fieldErrors).length) return errorResponse(422, "Please fix the highlighted fields.", fieldErrors);

  const hashed = await hashObject(PROBLEMS_BUCKET, objectPath, 500 * 1024 * 1024);
  if (!hashed) return errorResponse(422, "That object does not exist in the problems bucket.", { objectPath: "Not found." });

  const id = newId("prob");
  await insertRow("problem_files", {
    id, track: input.track, kind: input.kind, name, content_type: contentType,
    object_path: objectPath, size_bytes: hashed.size, sha256: hashed.sha256, uploaded_by: auth.actor,
  }, "id");
  await audit(auth.actor, "problem_file_registered", id, { track: input.track, sha256: hashed.sha256 });
  await appendLedger("problem_file", id, { track: input.track, kind: input.kind, sha256: hashed.sha256 });
  return okResponse({ id, sha256: hashed.sha256, size: hashed.size }, 201);
});
