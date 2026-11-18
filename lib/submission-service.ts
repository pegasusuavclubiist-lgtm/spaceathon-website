/** Shared submission logic: file rules, current items per team, package status. */

import { getConfig } from "./config";
import { buildManifest, missingItems, type Manifest, type MissingItem, type RepoFacts, type SubmissionItem } from "./manifest";
import { getMilestones } from "./schedule";
import { selectRows } from "./supabase";
import type { Track } from "./rules";

export type UploadItem = Exclude<SubmissionItem, "predictions">;

export const UPLOAD_ITEMS: readonly UploadItem[] = ["report", "demo", "deck"];

const MB = 1024 * 1024;

export const ITEM_RULES: Record<UploadItem, { maxBytes: number; contentTypes: string[]; label: string }> = {
  report: { maxBytes: 20 * MB, contentTypes: ["application/pdf"], label: "Technical report (PDF)" },
  demo: {
    maxBytes: 50 * MB,
    contentTypes: ["video/mp4", "video/webm", "video/quicktime"],
    label: "Demo video",
  },
  deck: {
    maxBytes: 50 * MB,
    contentTypes: ["application/pdf", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    label: "Finals slide deck",
  },
};

export function maxBytesFor(item: UploadItem): number {
  return ITEM_RULES[item].maxBytes;
}

/** Identify a file by its first bytes; the client MIME type is never trusted. */
export function sniffItem(item: UploadItem, head: Uint8Array): string | null {
  const startsWith = (sig: number[], offset = 0) =>
    head.length >= offset + sig.length && sig.every((v, i) => head[offset + i] === v);
  const pdf = startsWith([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
  if (item === "report") return pdf ? "application/pdf" : null;
  if (item === "deck") {
    if (pdf) return "application/pdf";
    if (startsWith([0x50, 0x4b, 0x03, 0x04])) {
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    }
    return null;
  }
  // demo: MP4/MOV have an 'ftyp' box at offset 4; WebM/Matroska start with the EBML magic.
  if (startsWith([0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = String.fromCharCode(...head.slice(8, 12));
    return brand.startsWith("qt") ? "video/quicktime" : "video/mp4";
  }
  if (startsWith([0x1a, 0x45, 0xdf, 0xa3])) return "video/webm";
  return null;
}

export interface ItemRow {
  item: SubmissionItem;
  object_path: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  in_grace: boolean;
  uploaded_at: string;
}

/** Latest upload per item, optionally only those at or before `cutoff` (8.1: the last valid upload counts). */
export async function currentItems(teamId: string, cutoff?: Date): Promise<ItemRow[]> {
  const { rows } = await selectRows<ItemRow>("submission_items", {
    select: "item,object_path,content_type,size_bytes,sha256,in_grace,uploaded_at",
    team_id: `eq.${teamId}`,
    order: "uploaded_at.desc",
    ...(cutoff ? { uploaded_at: `lte.${cutoff.toISOString()}` } : {}),
  });
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.item) ? false : (seen.add(r.item), true)));
}

export interface PredictionRow {
  id: string;
  sha256: string;
  size_bytes: number;
  selected: boolean;
  uploaded_at: string;
}

/** 12.2: the selected file, or the last upload if none is selected. */
export async function finalPrediction(teamId: string, cutoff?: Date): Promise<PredictionRow | null> {
  const { rows } = await selectRows<PredictionRow>("prediction_uploads", {
    select: "id,sha256,size_bytes,selected,uploaded_at",
    team_id: `eq.${teamId}`,
    order: "uploaded_at.desc",
    ...(cutoff ? { uploaded_at: `lte.${cutoff.toISOString()}` } : {}),
  });
  return rows.find((r) => r.selected) ?? rows[0] ?? null;
}

export interface PackageStatus {
  items: { item: SubmissionItem; sha256: string; size: number; uploadedAt: string; inGrace: boolean }[];
  missing: MissingItem[];
  membersSigned: number;
  memberCount: number;
  manifest: Manifest | null;
  usedGrace: boolean;
}

/** Package status for a team as of `cutoff` (default: now). */
export async function packageStatus(
  team: { id: string; code: string; track: Track; graceGranted: boolean },
  cutoff?: Date,
): Promise<PackageStatus> {
  const config = getConfig();
  const m = getMilestones(config);
  const [items, prediction, snapshot, members] = await Promise.all([
    currentItems(team.id, cutoff),
    team.track === "Advanced" ? finalPrediction(team.id, cutoff) : Promise.resolve(null),
    selectRows<{ repo_url: string; commit_sha: string; facts: Record<string, unknown> }>("repo_snapshots", {
      select: "repo_url,commit_sha,facts",
      team_id: `eq.${team.id}`,
    }),
    selectRows<{ final_declaration_signed_at: string | null }>("team_members", {
      select: "final_declaration_signed_at",
      team_id: `eq.${team.id}`,
    }),
  ]);

  const rows = items.map((i) => ({
    item: i.item, sha256: i.sha256, size: i.size_bytes, uploadedAt: i.uploaded_at, inGrace: i.in_grace,
  }));
  if (prediction) {
    rows.push({ item: "predictions", sha256: prediction.sha256, size: prediction.size_bytes, uploadedAt: prediction.uploaded_at, inGrace: false });
  }

  const snap = snapshot.rows[0];
  const facts = (snap?.facts ?? {}) as Partial<RepoFacts>;
  const repo: RepoFacts | null = snap
    ? { commitSha: snap.commit_sha, hasReadme: facts.hasReadme, hasEnvFile: facts.hasEnvFile, hasDockerfile: facts.hasDockerfile }
    : null;

  const memberCount = members.rows.length;
  const membersSigned = members.rows.filter((r) => r.final_declaration_signed_at).length;
  const present = new Set(rows.map((r) => r.item));
  const missing = missingItems(team.track, present, repo, membersSigned, memberCount);

  const manifest = buildManifest({
    teamCode: team.code,
    track: team.track,
    hardCloseISO: m ? m.hardClose.toISOString() : "",
    items: rows.map((r) => ({ item: r.item, sha256: r.sha256, size: r.size })),
    repo: snap ? { url: snap.repo_url, commitSha: snap.commit_sha } : null,
    membersSigned,
    memberCount,
  });

  return {
    items: rows,
    missing,
    membersSigned,
    memberCount,
    manifest,
    usedGrace: items.some((i) => i.in_grace),
  };
}
