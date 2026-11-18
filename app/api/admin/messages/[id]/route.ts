import { requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { getConfig, isDatabaseConfigured } from "@/lib/config";
import { errorResponse, notConfigured, okResponse, readJson, serverError } from "@/lib/http";
import { updateRows } from "@/lib/supabase";

/** PATCH /api/admin/messages/{id}  { status?: "new"|"in_progress"|"resolved", legalHold?: boolean } */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    if (!isDatabaseConfigured(getConfig())) return notConfigured();
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.response;

    const { id } = await context.params;
    if (!/^msg_[0-9a-f]{20}$/.test(id)) return errorResponse(404, "Message not found.");

    const body = await readJson(request);
    if (!body.ok) return body.response;
    const input = (body.body ?? {}) as Record<string, unknown>;

    const patch: Record<string, unknown> = {};
    if (input.status !== undefined) {
      if (input.status !== "new" && input.status !== "in_progress" && input.status !== "resolved") {
        return errorResponse(422, "Invalid status.", { status: "Use new, in_progress or resolved." });
      }
      patch.status = input.status;
    }
    if (input.legalHold !== undefined) {
      if (typeof input.legalHold !== "boolean") {
        return errorResponse(422, "legalHold must be true or false.");
      }
      patch.legal_hold = input.legalHold;
    }
    if (Object.keys(patch).length === 0) return errorResponse(422, "Nothing to update.");

    const updated = await updateRows("contact_messages", { id: `eq.${id}` }, patch);
    if (updated === 0) return errorResponse(404, "Message not found.");

    await audit(auth.actor, "message_updated", id, patch);
    return okResponse({ id, ...patch });
  } catch (error) {
    return serverError("admin-message-update", error);
  }
}
