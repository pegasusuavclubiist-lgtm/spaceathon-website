import { requireAdmin } from "@/lib/admin";
import { getConfig, isDatabaseConfigured } from "@/lib/config";
import { errorResponse, notConfigured, okResponse, serverError } from "@/lib/http";
import { TRACKS } from "@/lib/rules";
import { selectRows } from "@/lib/supabase";

const STATUSES = ["pending", "verified", "rejected"];

/** GET /api/admin/registrations?status=&track=&limit=&offset= */
export async function GET(request: Request): Promise<Response> {
  try {
    if (!isDatabaseConfigured(getConfig())) return notConfigured();
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const track = url.searchParams.get("track");
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);
    const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

    if (status && !STATUSES.includes(status)) return errorResponse(400, "Unknown status.");
    if (track && !(TRACKS as readonly string[]).includes(track)) {
      return errorResponse(400, "Unknown track.");
    }

    const params: Record<string, string> = {
      select:
        "id,team_name,track,leader_email,verification_status,rejection_reason,legal_hold,created_at," +
        "team_members(position,full_name,email,college,programme,id_uploaded_at)",
      order: "created_at.desc",
      limit: String(limit),
      offset: String(offset),
    };
    if (status) params.verification_status = `eq.${status}`;
    if (track) params.track = `eq.${track}`;

    const { rows, total } = await selectRows("teams", params, { count: true });
    return okResponse({ total, limit, offset, registrations: rows });
  } catch (error) {
    return serverError("admin-registrations", error);
  }
}
