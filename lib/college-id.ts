/** College ID upload: token auth, rulebook lock, content sniffing, private storage. */

import { getConfig } from "./config";
import { auditBestEffort } from "./audit";
import { uploadGate } from "./rules";
import { ID_FILE_TYPES, safeEqual, sha256Hex, sniffIdFile } from "./security";
import { removeObjects, selectRows, updateRows, uploadObject } from "./supabase";
import { randomBytes } from "node:crypto";

export type UploadOutcome =
  | { ok: true; data: { memberIndex: number; uploaded: true; membersMissingId: number } }
  | { ok: false; status: number; message: string; fieldErrors?: Record<string, string> };

interface TeamRow {
  id: string;
  upload_token_hash: string;
  verification_status: "pending" | "verified" | "rejected";
}

interface MemberRow {
  id: number;
  id_object_path: string | null;
}

export const TEAM_ID_PATTERN = /^reg_[0-9a-f]{20}$/;

export async function storeCollegeId(args: {
  teamId: string;
  token: string;
  memberIndex: number;
  file: Blob;
}): Promise<UploadOutcome> {
  const { teamId, token, memberIndex, file } = args;
  const config = getConfig();
  const fieldKey = `members.${memberIndex}.collegeId`;

  const { rows: teams } = await selectRows<TeamRow>("teams", {
    select: "id,upload_token_hash,verification_status",
    id: `eq.${teamId}`,
  });
  const team = teams[0];

  // Same answer for "no such team" and "wrong token" so ids cannot be probed.
  const tokenOk = safeEqual(sha256Hex(token), team?.upload_token_hash ?? "");
  if (!team || !tokenOk) {
    return { ok: false, status: 401, message: "The upload link is not valid." };
  }

  const gate = uploadGate(config);
  if (!gate.open) return { ok: false, status: 403, message: gate.message };

  if (team.verification_status === "verified") {
    return {
      ok: false,
      status: 409,
      message: "This team is already verified. Contact the OC to change a document.",
    };
  }

  const { rows: members } = await selectRows<MemberRow>("team_members", {
    select: "id,id_object_path",
    team_id: `eq.${teamId}`,
    position: `eq.${memberIndex}`,
  });
  const member = members[0];
  if (!member) {
    return {
      ok: false,
      status: 422,
      message: "That team member does not exist.",
      fieldErrors: { [fieldKey]: "No such team member." },
    };
  }

  if (file.size === 0 || file.size > config.maxIdBytes) {
    const mb = (config.maxIdBytes / (1024 * 1024)).toFixed(0);
    return {
      ok: false,
      status: 422,
      message: "The college ID file is not acceptable.",
      fieldErrors: { [fieldKey]: `Choose a file between 1 byte and ${mb} MB.` },
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffIdFile(bytes);
  if (!kind) {
    return {
      ok: false,
      status: 422,
      message: "The college ID file is not acceptable.",
      fieldErrors: { [fieldKey]: "Use a JPEG, PNG or WebP image, or a PDF file." },
    };
  }

  const type = ID_FILE_TYPES[kind];
  const path = `${teamId}/${memberIndex}-${randomBytes(6).toString("hex")}.${type.extension}`;

  await uploadObject(path, bytes, type.contentType);
  await updateRows(
    "team_members",
    { id: `eq.${member.id}` },
    {
      id_object_path: path,
      id_content_type: type.contentType,
      id_size_bytes: bytes.length,
      id_uploaded_at: new Date().toISOString(),
    },
  );

  if (member.id_object_path) {
    try {
      await removeObjects([member.id_object_path]);
    } catch {
      /* orphaned old file; the retention job removes it with the team folder */
    }
  }

  // A re-upload after a rejection puts the team back in the OC's queue.
  if (team.verification_status === "rejected") {
    await updateRows(
      "teams",
      { id: `eq.${teamId}` },
      { verification_status: "pending", rejection_reason: null },
    );
    await auditBestEffort("team", "resubmitted_after_rejection", teamId);
  }

  const { rows: missing } = await selectRows<{ id: number }>("team_members", {
    select: "id",
    team_id: `eq.${teamId}`,
    id_object_path: "is.null",
  });

  return {
    ok: true,
    data: { memberIndex, uploaded: true, membersMissingId: missing.length },
  };
}
