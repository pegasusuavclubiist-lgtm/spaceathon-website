/**
 * Submission manifest (rulebook 8.7) and package completeness (8.4, Annex D).
 * The manifest is a SHA-256 over a canonical listing of the evaluated version,
 * so any later change to an item or to the repository commit changes the hash.
 */

import { sha256Hex } from "./security";
import type { Track } from "./rules";

export type SubmissionItem = "report" | "demo" | "predictions" | "deck";

/** Items uploaded through the portal, per track (Section 8 table). */
export function requiredPortalItems(track: Track): SubmissionItem[] {
  return track === "Beginner" ? ["report", "demo"] : ["report", "demo", "predictions"];
}

export interface RepoFacts {
  commitSha: string;
  hasReadme?: boolean;
  hasEnvFile?: boolean;
  hasDockerfile?: boolean;
}

export interface ManifestInput {
  teamCode: string;
  track: Track;
  hardCloseISO: string;
  items: { item: SubmissionItem; sha256: string; size: number }[];
  repo: { url: string; commitSha: string } | null;
  membersSigned: number;
  memberCount: number;
}

export interface Manifest {
  sha256: string;
  payload: {
    teamCode: string;
    track: Track;
    hardClose: string;
    repo: { url: string; commitSha: string } | null;
    items: { item: SubmissionItem; sha256: string; size: number }[];
    declarations: { signed: number; required: number };
  };
}

export function buildManifest(input: ManifestInput): Manifest {
  const items = [...input.items].sort((a, b) => a.item.localeCompare(b.item));
  const payload = {
    teamCode: input.teamCode,
    track: input.track,
    hardClose: input.hardCloseISO,
    repo: input.repo,
    items,
    declarations: { signed: input.membersSigned, required: input.memberCount },
  };
  return { sha256: sha256Hex(JSON.stringify(payload)), payload };
}

export type MissingItem =
  | "repo_snapshot" | "readme" | "env_file" | "dockerfile"
  | "report" | "demo" | "predictions" | "declaration";

/** Each missing item costs -5 (8.4). No repository snapshot means the team is not evaluated. */
export function missingItems(
  track: Track,
  present: ReadonlySet<SubmissionItem>,
  repo: RepoFacts | null,
  membersSigned: number,
  memberCount: number,
): MissingItem[] {
  const missing: MissingItem[] = [];
  if (!repo) missing.push("repo_snapshot");
  else {
    if (!repo.hasReadme) missing.push("readme");
    if (!repo.hasEnvFile) missing.push("env_file");
    if (track === "Advanced" && !repo.hasDockerfile) missing.push("dockerfile");
  }
  for (const item of requiredPortalItems(track)) {
    if (!present.has(item)) missing.push(item as MissingItem);
  }
  if (membersSigned < memberCount) missing.push("declaration");
  return missing;
}
