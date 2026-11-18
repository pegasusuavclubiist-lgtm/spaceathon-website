import { insertRow } from "./supabase";

/** Append an entry to the append-only audit log. Never put emails or message text in `detail`. */
export async function audit(
  actor: string,
  action: string,
  subject: string | null,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await insertRow("audit_log", { actor, action, subject, detail }, "id");
}

/** Audit that must not break the user-facing request (e.g. rejected duplicates). */
export async function auditBestEffort(
  actor: string,
  action: string,
  subject: string | null,
  detail: Record<string, unknown> = {},
): Promise<void> {
  try {
    await audit(actor, action, subject, detail);
  } catch (error) {
    console.error("[audit]", error instanceof Error ? error.message : "unknown error");
  }
}
