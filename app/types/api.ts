/**
 * Shared API types for the Kosmodrome frontend.
 */

/** Tracks the frontend can register a team for. */
export type RegisterTrack = "Beginner" | "Advanced";
export type ParticipantCategory = "iist" | "outsider";

/** One team member as sent by the registration form. */
export interface RegisterMemberPayload {
  fullName: string;
  email: string;
  college: string;
  programme: string;
}

/** Payload for POST /api/register. */
export interface RegisterPayload {
  teamName: string;
  track: string;
  leaderEmail: string;
  participantCategory: ParticipantCategory;
  paymentUtr: string;
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
  participantCategory?: ParticipantCategory;
  feeAmount?: number;
  paymentUtr?: string | null;
  paymentStatus?: "pending" | "confirmed" | "rejected";
  receivedAt: string;
  verificationStatus?: "pending";
  collegeIdUpload?: CollegeIdUploadGrant;
  paymentProofUpload?: PaymentProofUploadGrant;
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

export interface PaymentProofUploadGrant {
  url: string;
  method: "POST";
  tokenType: "Bearer";
  token: string;
  fileField: string;
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

export type ApiFieldErrors = Record<string, string>;

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  message: string;
  status: number | null;
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

// ── AI Usage Analysis (Judging & Admin) ─────────────────────────────────────

export interface AiFileBreakdown {
  path: string;
  aiPercent: number;
  confidence: "low" | "medium" | "high";
  signals: string[];
}

export interface AiUsageReport {
  teamCode?: string;
  teamId?: string;
  overallAiPercent: number;
  codeAiPercent: number | null;
  reportAiPercent: number | null;
  declaredAiTools: string[];
  declaredAiLogPresent: boolean;
  undeclaredAiSuspected: boolean;
  riskLevel: "low" | "moderate" | "high";
  fileBreakdown: AiFileBreakdown[];
  signals: string[];
  summary: string;
  analyzedBy: string;
  analyzedAt: string;
}
