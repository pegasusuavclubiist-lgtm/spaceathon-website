/**
 * Shared API types for the Kosmodrome frontend.
 *
 * These describe the payloads the UI sends to the backend and the envelope it
 * expects back. The backend developer owns `app/api/` and should keep the two
 * in sync; see `docs/api-contract.md` for the full contract.
 */

/** Tracks the frontend can register a team for. */
export type RegisterTrack = "Beginner" | "Advanced";

/** One team member as sent by the registration form. */
export interface RegisterMemberPayload {
  fullName: string;
  /** Institutional email. */
  email: string;
  /** College or institution name. */
  college: string;
  /** Programme and year, e.g. "UG year 2", "PG", "Graduate within six months". */
  programme: string;
  // The college ID file is not part of this JSON payload. After registering,
  // the form uploads each member's file with `uploadCollegeId` using the grant
  // returned in `RegisterResponse.collegeIdUpload`.
}

/** Payload for POST /api/register. */
export interface RegisterPayload {
  teamName: string;
  /** Either "Beginner" or "Advanced". */
  track: string;
  /** Leader contact for OC updates. */
  leaderEmail: string;
  /** 2 to 4 members. */
  members: RegisterMemberPayload[];
  rulebookAccepted: boolean;
  declarationAccepted: boolean;
  seniorityConfirmed: boolean;
}

/** What the backend acknowledges with after a successful registration. */
export interface RegisterResponse {
  id: string;
  teamName: string;
  track: string;
  memberCount: number;
  receivedAt: string;
  verificationStatus?: "pending";
  /** One-time capability for uploading each member's college ID. Absent in mock mode. */
  collegeIdUpload?: CollegeIdUploadGrant;
}

export interface CollegeIdUploadGrant {
  url: string;
  method: "POST";
  tokenType: "Bearer";
  token: string;
  fileField: string;
  memberIndexField: string;
  maxBytes: number;
  allowedTypes: string[];
  expiresAt: string | null;
}

/** Payload for POST /api/contact. */
export interface ContactPayload {
  name: string;
  email: string;
  topic: string;
  message: string;
}

/** What the backend acknowledges with after a contact message is stored. */
export interface ContactResponse {
  id: string;
  receivedAt: string;
}

/** Field-level validation errors, keyed like the form does:
 *  "teamName" | "track" | "leaderEmail" | "members.<index>.email" | "…"
 *  or top-level form keys such as "rulebookAccepted". */
export type ApiFieldErrors = Record<string, string>;

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  /** User-friendly message, safe to render in the UI. */
  message: string;
  /** HTTP status, or null for network/timeout/client-side failures. */
  status: number | null;
  /** Optional per-field errors returned by the server (400/422). */
  fieldErrors?: ApiFieldErrors;
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

// ── Portal (participants) ───────────────────────────────────────────────────

export interface PortalMe {
  member: { position: number; fullName: string; isLeader: boolean };
  team: {
    id: string;
    code: string;
    name: string;
    track: RegisterTrack;
    members: { position: number; pledged: boolean; finalSigned: boolean }[];
  };
  pledgeSigned: boolean;
  finalDeclarationSigned: boolean;
  state: { pledgeOpen: boolean; problemsOpen: boolean };
  checkpoints: { n: number; done: boolean }[];
  schedule: Record<string, string> | null;
  serverTime: string;
}

export interface PortalProblems {
  track: RegisterTrack;
  seed: string;
  files: { id: string; kind: string; name: string; contentType: string; size: number; sha256: string }[];
}

export interface PortalCheckpoint {
  n: number;
  note: string | null;
  wordCount: number | null;
  commitSha: string | null;
  presentPositions: number[] | null;
  recordedAt: string;
}

export interface PortalSubmission {
  window: { open: boolean; message: string | null; opensAt: string | null; closesAt: string | null; graceGranted: boolean };
  rules: Record<string, { maxBytes: number; contentTypes: string[]; label: string }>;
  items: { item: string; sha256: string; size: number; uploadedAt: string; inGrace: boolean }[];
  missing: string[];
  declarations: { signed: number; required: number };
  manifestPreview: string | null;
  frozenManifest: { sha256: string; createdAt: string } | null;
}

export interface SignedUpload {
  objectPath: string;
  uploadUrl: string;
  method: "PUT";
  maxBytes: number;
  allowedTypes?: string[];
}

export interface PortalPredictions {
  uploads: { id: string; uploadedAt: string; status: string; publicScore: number | null; selected: boolean }[];
  cap: { perWindow: number; windowHours: number; retryAfterSeconds: number };
}

export interface PortalLeaderboard {
  leaderboard: { rank: number; teamCode: string; teamName: string; publicScore: number; you: boolean }[];
  note: string;
}

export interface PortalAppeal {
  appeal: { id: string; ground: string; description: string; status: string; decision_note: string | null; created_at: string } | null;
}
