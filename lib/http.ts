import { getConfig } from "./config";
import { hashIp } from "./security";

/** Error envelope the frontend client (`app/services/api.ts`) understands. */
export function errorResponse(
  status: number,
  message: string,
  fieldErrors?: Record<string, string>,
  headers?: Record<string, string>,
): Response {
  return Response.json(
    { error: { message, ...(fieldErrors ? { fieldErrors } : {}) } },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );
}

export function okResponse(data: unknown, status = 200): Response {
  return Response.json(
    { data },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function tooManyRequests(retryAfter: number): Response {
  return errorResponse(
    429,
    `Too many attempts. Please wait ${retryAfter} seconds and try again.`,
    undefined,
    { "Retry-After": String(retryAfter) },
  );
}

export function notConfigured(): Response {
  return errorResponse(
    503,
    "This service is not available yet. Please try again later.",
  );
}

export function serverError(scope: string, error: unknown): Response {
  // Log the error class and message only; request bodies hold personal data.
  console.error(
    `[api:${scope}]`,
    error instanceof Error ? `${error.name}: ${error.message}` : "unknown error",
  );
  return errorResponse(500, "Something went wrong on our side. Please try again.");
}

/** Best-effort client IP (Vercel and most proxies set x-forwarded-for). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function clientIpHash(request: Request): string {
  return hashIp(clientIp(request), getConfig().ipHashSalt);
}

export type JsonResult =
  | { ok: true; body: unknown }
  | { ok: false; response: Response };

/** Read a size-capped JSON body. */
export async function readJson(
  request: Request,
  maxBytes = 32 * 1024,
): Promise<JsonResult> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return {
      ok: false,
      response: errorResponse(415, "Send the request as application/json."),
    };
  }

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, response: errorResponse(413, "The request is too large.") };
  }

  let text = "";
  if (request.body) {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        return {
          ok: false,
          response: errorResponse(413, "The request is too large."),
        };
      }
      chunks.push(value);
    }
    text = Buffer.concat(chunks).toString("utf8");
  }

  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return {
      ok: false,
      response: errorResponse(400, "The request body is not valid JSON."),
    };
  }
}
