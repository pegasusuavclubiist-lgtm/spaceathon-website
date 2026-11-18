import { requireAdmin } from "@/lib/admin";
import { OC } from "@/lib/admin-routes";
import { okResponse } from "@/lib/http";
import { verifyLedger } from "@/lib/ledger";
import { route } from "@/lib/route";
import { selectRows } from "@/lib/supabase";

/** GET /api/admin/ledger: recent entries and whether the hash chain is intact. */
export const GET = route("admin-ledger", async (request) => {
  const auth = await requireAdmin(request, OC);
  if (!auth.ok) return auth.response;
  const brokenAt = await verifyLedger();
  const { rows } = await selectRows("ledger", { select: "id,at,kind,subject,hash", order: "id.desc", limit: "100" });
  return okResponse({ intact: brokenAt === null, brokenAt, recent: rows });
});
