import { requireAdmin } from "@/lib/admin";
import { OC } from "@/lib/admin-routes";
import { okResponse } from "@/lib/http";
import { route } from "@/lib/route";
import { selectRows } from "@/lib/supabase";

/** GET /api/admin/appeals?status= : appeals for the Grievance Committee. */
export const GET = route("admin-appeals", async (request) => {
  const auth = await requireAdmin(request, OC);
  if (!auth.ok) return auth.response;
  const status = new URL(request.url).searchParams.get("status");
  const { rows } = await selectRows("appeals", {
    select: "id,team_id,ground,description,status,decision_note,decided_by,decided_at,created_at,teams(team_code,team_name,track)",
    order: "created_at.asc",
    ...(status ? { status: `eq.${status}` } : {}),
  });
  return okResponse({ appeals: rows });
});
