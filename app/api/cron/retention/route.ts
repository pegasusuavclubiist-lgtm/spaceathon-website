import { getConfig, isDatabaseConfigured } from "@/lib/config";
import { auditBestEffort } from "@/lib/audit";
import { errorResponse, notConfigured, okResponse, serverError } from "@/lib/http";
import { retentionCutoff } from "@/lib/rules";
import { safeEqual } from "@/lib/security";
import { removeObjects, rpc, selectRows } from "@/lib/supabase";

/**
 * Retention job (rulebook 15.6: personal data is kept 180 days).
 * Runs only when RETENTION_PURGE_ENABLED=true and EVENT_START_ISO is set, and
 * only once now >= T0 + 144 h (final results) + 180 days. Rows under legal hold
 * are skipped. Authorised with `Authorization: Bearer $CRON_SECRET`, which is
 * what Vercel Cron sends. Schedule it daily; it is idempotent.
 */
async function run(request: Request): Promise<Response> {
  try {
    const config = getConfig();
    if (!isDatabaseConfigured(config) || !config.cronSecret) return notConfigured();

    const header = request.headers.get("authorization") ?? "";
    const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!presented || !safeEqual(presented, config.cronSecret)) {
      return errorResponse(401, "Authentication required.");
    }

    const cutoff = retentionCutoff(config);
    if (!config.retentionPurgeEnabled || !cutoff || new Date() < cutoff) {
      return okResponse({
        purged: false,
        reason: !config.retentionPurgeEnabled
          ? "RETENTION_PURGE_ENABLED is not true."
          : !cutoff
            ? "EVENT_START_ISO is not set."
            : `Retention period runs until ${cutoff.toISOString()}.`,
      });
    }

    // Collect every stored ID (outside legal hold) first, delete the files, and
    // only then anonymise rows, so a storage failure never orphans files.
    const paths: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { rows } = await selectRows<{ id_object_path: string }>("team_members", {
        select: "id_object_path,teams!inner(legal_hold,purged_at)",
        id_object_path: "not.is.null",
        "teams.legal_hold": "eq.false",
        "teams.purged_at": "is.null",
        order: "id.asc",
        limit: "1000",
        offset: String(offset),
      });
      paths.push(...rows.map((row) => row.id_object_path));
      if (rows.length < 1000) break;
    }

    for (let i = 0; i < paths.length; i += 100) {
      await removeObjects(paths.slice(i, i + 100));
    }

    const counts = await rpc<{ members: number; teams: number; messages: number }>(
      "anonymise_expired_personal_data",
      {},
    );
    await auditBestEffort("system", "retention_purge", null, { files: paths.length, ...counts });

    return okResponse({ purged: true, files: paths.length, ...counts });
  } catch (error) {
    return serverError("retention", error);
  }
}

export const GET = run;
export const POST = run;
