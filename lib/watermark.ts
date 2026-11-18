/**
 * Per-team watermarks and canary records (rulebook 5.8, 5.9).
 *
 *  - Text statements get a visible footer with the Team ID and a hidden
 *    watermark (the team code encoded in zero-width characters).
 *  - CSV datasets get "canary records": a few numeric cells have their last
 *    decimal digit changed in a way that is deterministic per team and
 *    scientifically negligible, so a leaked file can be traced to a team.
 *
 * Binary files (PDF, images, archives) cannot be edited without a PDF or
 * image library; they are served as-is through a logged, signed download.
 */

import { createHash } from "node:crypto";

const ZERO = "\u200b"; // zero-width space   = bit 0
const ONE = "\u200c"; // zero-width non-joiner = bit 1
const MARK = "\u2060"; // word joiner delimits the payload

/** Encode a short ASCII string (e.g. "B-001") as invisible characters. */
export function encodeHidden(text: string): string {
  let bits = "";
  for (const byte of Buffer.from(text, "ascii")) bits += byte.toString(2).padStart(8, "0");
  return MARK + [...bits].map((b) => (b === "1" ? ONE : ZERO)).join("") + MARK;
}

export function decodeHidden(content: string): string | null {
  const match = new RegExp(`${MARK}([${ZERO}${ONE}]+)${MARK}`).exec(content);
  if (!match) return null;
  const bits = [...match[1]].map((ch) => (ch === ONE ? "1" : "0")).join("");
  if (bits.length % 8 !== 0) return null;
  const bytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes).toString("ascii");
}

export function isWatermarkableText(contentType: string, name: string): boolean {
  return (
    /^text\/(plain|markdown|html)/.test(contentType) ||
    /\.(md|txt|html?)$/i.test(name)
  );
}

export function isCsv(contentType: string, name: string): boolean {
  return /^text\/csv/.test(contentType) || /\.csv$/i.test(name);
}

/** Visible footer plus hidden watermark on a text statement. */
export function watermarkText(content: string, teamCode: string, name: string): string {
  const hidden = encodeHidden(teamCode);
  const line = `Team ID: ${teamCode} · Confidential until results are published (rulebook 5.11)`;
  if (/\.html?$/i.test(name) && /<\/body>/i.test(content)) {
    return content.replace(/<\/body>/i, `<footer>${line}${hidden}</footer></body>`);
  }
  return `${content.replace(/\s+$/, "")}\n\n---\n${line}${hidden}\n`;
}

// ── Canary records ──────────────────────────────────────────────────────────

/** Small deterministic PRNG (mulberry32) seeded from the team's hex seed. */
function prng(seedHex: string): () => number {
  let a = Number.parseInt(createHash("sha256").update(seedHex).digest("hex").slice(0, 8), 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '""'; i += 1; }
      else { cur += ch; if (ch === '"') quoted = false; }
    } else if (ch === ",") { cells.push(cur); cur = ""; }
    else { cur += ch; if (ch === '"') quoted = true; }
  }
  cells.push(cur);
  return cells;
}

/** Cells with at least three decimals can take a last-digit change without mattering scientifically. */
const CANARY_CELL = /^-?\d+\.\d{3,}$/;

export interface Canary {
  row: number;
  col: number;
  original: string;
  value: string;
}

export function injectCanary(
  csv: string,
  seedHex: string,
  count = 3,
): { content: string; canaries: Canary[] } {
  const newline = csv.includes("\r\n") ? "\r\n" : "\n";
  const lines = csv.split(/\r?\n/);
  const candidates: [number, number][] = [];
  const grid = lines.map((line, r) => {
    const cells = r === 0 ? [] : splitCsvLine(line);
    cells.forEach((cell, c) => {
      if (CANARY_CELL.test(cell.trim())) candidates.push([r, c]);
    });
    return cells;
  });
  if (candidates.length === 0) return { content: csv, canaries: [] };

  const rand = prng(seedHex);
  const canaries: Canary[] = [];
  const used = new Set<string>();
  for (let n = 0; n < Math.min(count, candidates.length); n += 1) {
    let pick = candidates[Math.floor(rand() * candidates.length)];
    let guard = 0;
    while (used.has(pick.join(":")) && guard < 50) {
      pick = candidates[Math.floor(rand() * candidates.length)];
      guard += 1;
    }
    used.add(pick.join(":"));
    const [r, c] = pick;
    const original = grid[r][c];
    const trimmed = original.trim();
    const last = Number(trimmed[trimmed.length - 1]);
    const shifted = trimmed.slice(0, -1) + String((last + 1 + Math.floor(rand() * 3)) % 10);
    grid[r][c] = original.replace(trimmed, shifted);
    canaries.push({ row: r, col: c, original, value: grid[r][c] });
  }

  const out = lines.map((line, r) => (r === 0 || grid[r].length === 0 ? line : grid[r].join(",")));
  return { content: out.join(newline), canaries };
}

/**
 * Which candidate team's canary pattern does a leaked file carry? Compares
 * the leaked cells against what each team's seed would have produced.
 */
export function traceLeak(
  original: string,
  leaked: string,
  candidates: { teamCode: string; seedHex: string }[],
): { teamCode: string; matched: number; expected: number }[] {
  const leakedLines = leaked.split(/\r?\n/).map((l) => splitCsvLine(l));
  return candidates
    .map(({ teamCode, seedHex }) => {
      const { canaries } = injectCanary(original, seedHex);
      const matched = canaries.filter((k) => leakedLines[k.row]?.[k.col] === k.value).length;
      return { teamCode, matched, expected: canaries.length };
    })
    .sort((a, b) => b.matched - a.matched);
}
