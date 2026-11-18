import { requireAdmin } from "@/lib/admin";
import { getConfig, isDatabaseConfigured } from "@/lib/config";
import { errorResponse, notConfigured, okResponse, serverError } from "@/lib/http";
import { CONTACT_TOPICS } from "@/lib/rules";
import { selectRows } from "@/lib/supabase";

const STATUSES = ["new", "in_progress", "resolved"];

/** GET /api/admin/messages?status=&topic=&limit=&offset= */
export async function GET(request: Request): Promise<Response> {
  try {
    if (!isDatabaseConfigured(getConfig())) return notConfigured();
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const topic = url.searchParams.get("topic");
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);
    const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

    if (status && !STATUSES.includes(status)) return errorResponse(400, "Unknown status.");
    if (topic && !(CONTACT_TOPICS as readonly string[]).includes(topic)) {
      return errorResponse(400, "Unknown topic.");
    }

    const params: Record<string, string> = {
      select: "id,name,email,topic,message,status,legal_hold,created_at",
      order: "created_at.desc",
      limit: String(limit),
      offset: String(offset),
    };
    if (status) params.status = `eq.${status}`;
    if (topic) params.topic = `eq.${topic}`;

    const { rows, total } = await selectRows("contact_messages", params, { count: true });
    return okResponse({ total, limit, offset, messages: rows });
  } catch (error) {
    return serverError("admin-messages", error);
  }
}
