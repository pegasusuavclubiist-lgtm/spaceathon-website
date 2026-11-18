/**
 * Team registration service: atomic create, one-person-one-team conflicts,
 * idempotent replay of an identical retry, and the college ID upload grant.
 */

import { getConfig } from "./config";
import { auditBestEffort } from "./audit";
import { getSchedule } from "./rules";
import { ID_FILE_TYPES, newId, newUploadToken, sha256Hex } from "./security";
import { rpc, selectRows, SupabaseError, updateRows } from "./supabase";
import { teamNameKey, type FieldErrors, type NormalisedRegistration } from "./validation";

/** An identical resubmission within this window is treated as a client retry. */
const REPLAY_WINDOW_MS = 15 * 60 * 1000;

export interface CollegeIdUploadGrant {
  url: string;
  method: "POST";
  /** multipart/form-data with `memberIndex` and `file`. */
  tokenType: "Bearer";
  token: string;
  fileField: "file";
  memberIndexField: "memberIndex";
  maxBytes: number;
  allowedTypes: string[];
  expiresAt: string | null;
}

export interface RegisterData {
  id: string;
  teamName: string;
  track: string;
  memberCount: number;
  receivedAt: string;
  verificationStatus: "pending";
  collegeIdUpload: CollegeIdUploadGrant;
}

export type RegisterOutcome =
  | { kind: "created" | "replayed"; data: RegisterData }
  | { kind: "conflict"; message: string; fieldErrors: FieldErrors };

export function hashRegistration(input: NormalisedRegistration): string {
  return sha256Hex(
    JSON.stringify({
      teamName: teamNameKey(input.teamName),
      track: input.track,
      leaderEmail: input.leaderEmail,
      members: input.members.map((m) => [m.fullName, m.email, m.college, m.programme]),
    }),
  );
}

function buildResponse(
  id: string,
  input: NormalisedRegistration,
  receivedAt: string,
  token: string,
): RegisterData {
  const config = getConfig();
  const lockAt = getSchedule(config).lockAt;
  return {
    id,
    teamName: input.teamName,
    track: input.track,
    memberCount: input.members.length,
    receivedAt,
    verificationStatus: "pending",
    collegeIdUpload: {
      url: `/api/register/${id}/college-id`,
      method: "POST",
      tokenType: "Bearer",
      token,
      fileField: "file",
      memberIndexField: "memberIndex",
      maxBytes: config.maxIdBytes,
      allowedTypes: Object.values(ID_FILE_TYPES).map((t) => t.contentType),
      expiresAt: lockAt ? lockAt.toISOString() : null,
    },
  };
}

export async function createRegistration(
  input: NormalisedRegistration,
  ipHash: string,
): Promise<RegisterOutcome> {
  const config = getConfig();
  const id = newId("reg");
  const token = newUploadToken();
  const payloadHash = hashRegistration(input);

  try {
    const created = await rpc<{ id: string; created_at: string }>("register_team", {
      p_team: {
        id,
        team_name: input.teamName,
        track: input.track,
        leader_email: input.leaderEmail,
        payload_hash: payloadHash,
        upload_token_hash: sha256Hex(token),
        rulebook_sha256: config.rulebookSha256 ?? "",
      },
      p_members: input.members.map((m) => ({
        position: m.position,
        full_name: m.fullName,
        email: m.email,
        college: m.college,
        programme: m.programme,
      })),
    });
    return { kind: "created", data: buildResponse(id, input, created.created_at, token) };
  } catch (error) {
    if (!(error instanceof SupabaseError) || error.code !== "23505") throw error;
    return handleConflict(error, input, ipHash);
  }
}

async function handleConflict(
  error: SupabaseError,
  input: NormalisedRegistration,
  ipHash: string,
): Promise<RegisterOutcome> {
  if (error.message.includes("team_members_email_unique")) {
    // PostgREST details: Key (email_key)=(someone@college.edu) already exists.
    const match = /\(email_key\)=\(([^)]*)\)/.exec(error.details ?? "");
    const clash = match?.[1];
    const fieldErrors: FieldErrors = {};
    input.members.forEach((member, index) => {
      if (!clash || member.email === clash) {
        fieldErrors[`members.${index}.email`] =
          "This email is already registered with a team. One person can join one team only.";
      }
    });
    // Rulebook 3.4: the OC decides what happens to duplicate registrations.
    await auditBestEffort("system", "duplicate_member_rejected", null, {
      ipHash,
      positions: Object.keys(fieldErrors),
    });
    return {
      kind: "conflict",
      message: "A member is already registered with another team.",
      fieldErrors,
    };
  }

  // Team name clash: either a genuine duplicate or the client retrying after a
  // lost response. Replaying is only allowed for an identical payload, shortly
  // after creation; the upload token is rotated and returned again.
  const { rows } = await selectRows<{ id: string; payload_hash: string; created_at: string }>(
    "teams",
    { select: "id,payload_hash,created_at", team_name_key: `eq.${teamNameKey(input.teamName)}` },
  );
  const existing = rows[0];

  if (
    existing &&
    existing.payload_hash === hashRegistration(input) &&
    Date.now() - new Date(existing.created_at).getTime() <= REPLAY_WINDOW_MS
  ) {
    const token = newUploadToken();
    await updateRows("teams", { id: `eq.${existing.id}` }, { upload_token_hash: sha256Hex(token) });
    return {
      kind: "replayed",
      data: buildResponse(existing.id, input, existing.created_at, token),
    };
  }

  return {
    kind: "conflict",
    message: "A registration already exists for this team.",
    fieldErrors: { teamName: "A team with this name is already registered." },
  };
}
