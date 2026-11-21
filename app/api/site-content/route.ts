import { okResponse, serverError } from "@/lib/http";
import { getLiveSiteContent } from "@/lib/site-content";

/** GET /api/site-content — public merged website content (defaults + CMS overrides). */
export async function GET(): Promise<Response> {
  try {
    const content = await getLiveSiteContent();
    return okResponse(content);
  } catch (error) {
    return serverError("site-content", error);
  }
}
