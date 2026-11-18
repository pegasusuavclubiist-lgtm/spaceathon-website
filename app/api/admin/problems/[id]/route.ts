import { requireAdmin } from "@/lib/admin";
import { OC } from "@/lib/admin-routes";
import { audit } from "@/lib/audit";
import { errorResponse, okResponse } from "@/lib/http";
import { route } from "@/lib/route";
import { updateRows } from "@/lib/supabase";

/** DELETE /api/admin/problems/{id}: retire a file (reserve plan, 5.6). The object stays in storage for the record. */
export const DELETE = route<{ id: string }>("admin-problem-retire", async (request, context) => {
  const auth = await requireAdmin(request, OC);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!/^prob_[0-9a-f]{20}$/.test(id)) return errorResponse(404, "File not found.");
  const n = await updateRows("problem_files", { id: `eq.${id}` }, { active: false });
  if (n === 0) return errorResponse(404, "File not found.");
  await audit(auth.actor, "problem_file_retired", id, {});
  return okResponse({ id, active: false });
});
