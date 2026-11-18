/**
 * Backend configuration. Everything is read from environment variables lazily
 * (per call) so tests can change `process.env` and nothing is captured at
 * import time. No secrets are ever returned to clients.
 */

export interface BackendConfig {
  supabaseUrl: string | null;
  serviceRoleKey: string | null;
  adminToken: string | null;
  cronSecret: string | null;
  /** Kickoff instant (T0) or null while the date is "to be announced". */
  eventStart: Date | null;
  /** Manual kill switch, mirrors `siteConfig.registrationOpen` on the frontend. */
  registrationOpen: boolean;
  /** Optional explicit overrides of the rulebook-derived schedule. */
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  teamLockAt: Date | null;
  rulebookSha256: string | null;
  blockFreeEmailDomains: boolean;
  maxIdBytes: number;
  ipHashSalt: string;
  notifyWebhookUrl: string | null;
  retentionPurgeEnabled: boolean;
  /** Named OC tokens with roles (ADMIN_TOKENS). The legacy ADMIN_API_TOKEN still works as role "oc". */
  adminTokens: AdminTokenEntry[];
  /** Transactional email (Resend-compatible HTTP API). Both must be set to send mail. */
  resendApiKey: string | null;
  mailFrom: string | null;
  /** Public origin used in emailed portal links. */
  siteUrl: string;
  /** Organiser-side scoring service for the Advanced benchmark (labels never leave it). */
  evalServiceUrl: string | null;
  evalServiceToken: string | null;
  /** Secret for per-team problem seeds and canary records (rulebook 5.8, 5.9). */
  teamSeedSecret: string;
}

export type AdminRole = "oc" | "technical" | "moderator" | "chair";
export const ADMIN_ROLES: readonly AdminRole[] = ["oc", "technical", "moderator", "chair"];
export interface AdminTokenEntry {
  actor: string;
  role: AdminRole;
  token: string;
}

/** ADMIN_TOKENS="Asha:oc:<token>;Ravi:technical:<token>" (tokens are base64url, so no ':' or ';'). */
export function parseAdminTokens(raw: string | null): AdminTokenEntry[] {
  if (!raw) return [];
  const entries: AdminTokenEntry[] = [];
  for (const part of raw.split(";")) {
    const [actor, role, token] = part.split(":").map((x) => x?.trim());
    if (!actor || !token || !(ADMIN_ROLES as readonly string[]).includes(role ?? "")) continue;
    entries.push({ actor, role: role as AdminRole, token });
  }
  return entries;
}

function str(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function bool(name: string, fallback: boolean): boolean {
  const value = str(name);
  if (value === null) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function date(name: string): Date | null {
  const value = str(name);
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function int(name: string, fallback: number): number {
  const value = Number.parseInt(str(name) ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getConfig(): BackendConfig {
  const serviceRoleKey = str("SUPABASE_SERVICE_ROLE_KEY");
  return {
    supabaseUrl: str("NEXT_PUBLIC_SUPABASE_URL")?.replace(/\/+$/, "") ?? null,
    serviceRoleKey,
    adminToken: str("ADMIN_API_TOKEN"),
    cronSecret: str("CRON_SECRET"),
    eventStart: date("EVENT_START_ISO"),
    // Fail closed: registration is only open when explicitly switched on.
    registrationOpen: bool("REGISTRATION_OPEN", false),
    registrationOpensAt: date("REGISTRATION_OPENS_AT"),
    registrationClosesAt: date("REGISTRATION_CLOSES_AT"),
    teamLockAt: date("TEAM_LOCK_AT"),
    rulebookSha256: str("RULEBOOK_SHA256"),
    blockFreeEmailDomains: bool("BLOCK_FREE_EMAIL_DOMAINS", true),
    // 4 MB default keeps uploads under typical serverless body limits (4.5 MB).
    maxIdBytes: int("MAX_ID_BYTES", 4 * 1024 * 1024),
    ipHashSalt: str("IP_HASH_SALT") ?? serviceRoleKey ?? "kosmodrome-dev-salt",
    notifyWebhookUrl: str("OC_NOTIFY_WEBHOOK_URL"),
    retentionPurgeEnabled: bool("RETENTION_PURGE_ENABLED", false),
    adminTokens: parseAdminTokens(str("ADMIN_TOKENS")),
    resendApiKey: str("RESEND_API_KEY"),
    mailFrom: str("MAIL_FROM"),
    siteUrl: (str("NEXT_PUBLIC_SITE_URL") ?? "http://localhost:3000").replace(/\/+$/, ""),
    evalServiceUrl: str("EVAL_SERVICE_URL"),
    evalServiceToken: str("EVAL_SERVICE_TOKEN"),
    teamSeedSecret: str("TEAM_SEED_SECRET") ?? serviceRoleKey ?? "kosmodrome-dev-seed",
  };
}

export function isDatabaseConfigured(config = getConfig()): boolean {
  return Boolean(config.supabaseUrl && config.serviceRoleKey);
}
