/** Checkpoint helpers (rulebook 6.4): 200-word notes, repository snapshot reference. */

export const NOTE_WORD_LIMIT = 200;

export function countWords(text: string): number {
  return text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
}

export function validateNote(
  raw: unknown,
  rawSha: unknown,
): { ok: true; note: string; words: number; sha: string | null } | { ok: false; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  const note = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
  const words = countWords(note);
  if (words < 10) fieldErrors.note = "Write a short progress note (at least 10 words).";
  else if (words > NOTE_WORD_LIMIT) fieldErrors.note = `Keep the note to ${NOTE_WORD_LIMIT} words (yours is ${words}).`;
  if (note.length > 4000) fieldErrors.note = "The note is too long.";

  let sha: string | null = null;
  if (rawSha !== undefined && rawSha !== null && rawSha !== "") {
    if (typeof rawSha === "string" && /^[0-9a-f]{7,40}$/i.test(rawSha.trim())) sha = rawSha.trim().toLowerCase();
    else fieldErrors.commitSha = "Enter the commit SHA of your repository snapshot (7 to 40 hex characters).";
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, note, words, sha };
}

/** Number of missed checkpoints among 1..3 given the recorded ones. 2 needs every member present. */
export function missedCheckpoints(
  recorded: { n: number; present_positions?: number[] | null }[],
  memberCount: number,
): number {
  let missed = 0;
  for (const n of [1, 2, 3]) {
    const row = recorded.find((r) => r.n === n);
    if (!row) { missed += 1; continue; }
    if (n === 2 && (row.present_positions?.length ?? 0) < memberCount) missed += 1;
  }
  return missed;
}
