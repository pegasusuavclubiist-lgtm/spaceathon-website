/** Append-only, hash-chained ledger (rulebook Section 9: scores and manifests in an append-only ledger). */

import { rpc } from "./supabase";

export async function appendLedger(
  kind: string,
  subject: string | null,
  payload: Record<string, unknown>,
): Promise<{ id: number; hash: string }> {
  return rpc<{ id: number; hash: string }>("ledger_append", {
    p_kind: kind,
    p_subject: subject,
    p_payload: payload,
  });
}

/** Returns the id of the first broken entry, or null when the chain is intact. */
export async function verifyLedger(): Promise<number | null> {
  return rpc<number | null>("verify_ledger", {});
}
