import { getConfig, isDatabaseConfigured } from "@/lib/config";
import { selectRows } from "@/lib/supabase";

/**
 * GET /api/health            liveness, no database access.
 * GET /api/health?deep=1     also checks that the database is reachable.
 * Never returns secrets or configuration values.
 */
export async function GET(request: Request): Promise<Response> {
  const deep = new URL(request.url).searchParams.get("deep") === "1";
  let database: "ok" | "error" | "unconfigured" | "skipped" = "skipped";

  if (deep) {
    database = "unconfigured";
    if (isDatabaseConfigured(getConfig())) {
      try {
        await selectRows("rate_limits", { select: "key", limit: "1" });
        database = "ok";
      } catch {
        database = "error";
      }
    }
  }

  return Response.json(
    { ok: database !== "error", database, time: new Date().toISOString() },
    { status: database === "error" ? 503 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
