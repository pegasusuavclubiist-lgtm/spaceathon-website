import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { getConfig, isDatabaseConfigured } from "@/lib/config";
import {
  errorResponse,
  notConfigured,
  okResponse,
  readJson,
  serverError,
} from "@/lib/http";
import {
  getDefaultSiteContent,
  getLiveSiteContent,
  isValidSection,
} from "@/lib/site-content";
import { deleteRows, upsertRow } from "@/lib/supabase";

function revalidateAllPublicPages() {
  const paths = [
    "/",
    "/about",
    "/tracks",
    "/timeline",
    "/scoring",
    "/rules",
    "/submission",
    "/fair-play",
    "/prizes",
    "/faq",
    "/contact",
    "/register",
  ];
  for (const p of paths) {
    try {
      revalidatePath(p);
    } catch {
      /* ignore outside request context */
    }
  }
}

/** GET /api/admin/site-content — returns current live content and defaults. */
export async function GET(request: Request): Promise<Response> {
  try {
    if (!isDatabaseConfigured(getConfig())) return notConfigured();
    const auth = await requireAdmin(request, ["oc"]);
    if (!auth.ok) return auth.response;

    const content = await getLiveSiteContent();
    return okResponse({ content, defaults: getDefaultSiteContent() });
  } catch (error) {
    return serverError("admin-site-content-get", error);
  }
}

/**
 * PUT /api/admin/site-content
 * Either `{ section: "<key>", data: <value> }` to update one section,
 * or `{ sections: { <key>: <value>, ... } }` to update multiple sections at once.
 */
export async function PUT(request: Request): Promise<Response> {
  try {
    if (!isDatabaseConfigured(getConfig())) return notConfigured();
    const auth = await requireAdmin(request, ["oc"]);
    if (!auth.ok) return auth.response;

    const body = await readJson(request, 512 * 1024);
    if (!body.ok) return body.response;
    const input = (body.body ?? {}) as Record<string, unknown>;

    const updates: Array<{ section: string; data: unknown }> = [];

    if (typeof input.section === "string") {
      if (!isValidSection(input.section)) {
        return errorResponse(422, `Unknown site content section: ${input.section}`);
      }
      if (input.data === undefined) {
        return errorResponse(422, "Missing data payload for section.");
      }
      updates.push({ section: input.section, data: input.data });
    } else if (input.sections && typeof input.sections === "object" && !Array.isArray(input.sections)) {
      for (const [section, data] of Object.entries(input.sections as Record<string, unknown>)) {
        if (!isValidSection(section)) {
          return errorResponse(422, `Unknown site content section: ${section}`);
        }
        updates.push({ section, data });
      }
    } else {
      return errorResponse(422, "Send { section, data } or { sections: { ... } }.");
    }

    if (updates.length === 0) {
      return errorResponse(422, "No sections provided to update.");
    }

    const now = new Date().toISOString();
    for (const item of updates) {
      await upsertRow(
        "site_content",
        {
          section: item.section,
          data: item.data,
          updated_by: auth.actor,
          updated_at: now,
        },
        "section",
        "section",
      );
    }

    await audit(auth.actor, "site_content_updated", updates.map((u) => u.section).join(","), {
      sections: updates.map((u) => u.section),
    });

    revalidateAllPublicPages();

    return okResponse({
      saved: updates.map((u) => u.section),
      content: await getLiveSiteContent(),
    });
  } catch (error) {
    return serverError("admin-site-content-put", error);
  }
}

/** DELETE /api/admin/site-content?section=<key> — reset one section (or all if omitted) to defaults. */
export async function DELETE(request: Request): Promise<Response> {
  try {
    if (!isDatabaseConfigured(getConfig())) return notConfigured();
    const auth = await requireAdmin(request, ["oc"]);
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const section = url.searchParams.get("section");

    if (section) {
      if (!isValidSection(section)) {
        return errorResponse(422, `Unknown site content section: ${section}`);
      }
      await deleteRows("site_content", { section: `eq.${section}` });
      await audit(auth.actor, "site_content_reset", section, {});
    } else {
      await deleteRows("site_content", { section: "neq.__none__" });
      await audit(auth.actor, "site_content_reset_all", null, {});
    }

    revalidateAllPublicPages();

    return okResponse({
      reset: section ?? "all",
      content: await getLiveSiteContent(),
    });
  } catch (error) {
    return serverError("admin-site-content-delete", error);
  }
}
