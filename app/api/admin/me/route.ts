import { requireAdmin } from "@/lib/admin";
import { getConfig, isDatabaseConfigured } from "@/lib/config";
import { notConfigured, okResponse, serverError } from "@/lib/http";

/** GET /api/admin/me — validates admin bearer token & returns actor and role. */
export async function GET(request: Request): Promise<Response> {
  try {
    if (!isDatabaseConfigured(getConfig())) return notConfigured();
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.response;
    return okResponse({ actor: auth.actor, role: auth.role });
  } catch (error) {
    return serverError("admin-me", error);
  }
}
