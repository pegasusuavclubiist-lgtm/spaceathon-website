/**
 * Rulebook constants and rules that the backend enforces.
 * Source: Kakshya 2026 Official Rulebook (Sections 2, 3, 4, 15.6).
 * Keep the lists in sync with app/content/event-data.ts
 * (tests/content-parity.test.ts fails if they drift).
 */

import type { BackendConfig } from "./config";

export const TRACKS = ["Beginner", "Advanced"] as const;
export type Track = (typeof TRACKS)[number];

export const PROGRAMMES = [
  "Diploma",
  "UG year 1",
  "UG year 2",
  "UG year 3",
  "UG year 4+",
  "PG",
  "PhD",
  "Graduate within six months",
] as const;
export type Programme = (typeof PROGRAMMES)[number];

export const CONTACT_TOPICS = [
  "Registration",
  "Eligibility and tracks",
  "Accessibility request",
  "Conduct or integrity report",
  "Technical support",
  "General question",
] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

/** Rulebook 3.3: 2 to 4 members, no solo entries. */
export const MIN_TEAM_SIZE = 2;
export const MAX_TEAM_SIZE = 4;

/** Rulebook 4: Beginner is Diploma and 1st/2nd-year UG only. */
const BEGINNER_ELIGIBLE: ReadonlySet<string> = new Set([
  "Diploma",
  "UG year 1",
  "UG year 2",
]);

export function isBeginnerEligible(programme: string): boolean {
  return BEGINNER_ELIGIBLE.has(programme);
}

/**
 * Rulebook 3.1, 4.1, 4.2: the team's track follows its most senior member; a
 * Beginner-eligible team may opt up but nobody may move down. Returns the
 * field errors for a Beginner registration that contains Advanced-only members.
 */
export function trackEligibilityErrors(
  track: Track,
  programmes: readonly string[],
): Record<string, string> {
  if (track !== "Beginner") return {};

  const errors: Record<string, string> = {};
  let graduate = false;
  let ineligible = 0;

  programmes.forEach((programme, index) => {
    if (!isBeginnerEligible(programme)) {
      ineligible += 1;
      if (programme === "Graduate within six months") graduate = true;
      errors[`members.${index}.programme`] =
        programme === "Graduate within six months"
          ? "Graduates join the Advanced track only."
          : "This member is only eligible for the Advanced track.";
    }
  });

  if (ineligible > 0) {
    errors.track = graduate
      ? "Graduates within six months of their final exam can enter the Advanced track only."
      : "A team with 3rd-year UG, PG or PhD members must enter the Advanced track.";
  }
  return errors;
}

/** Providers whose addresses are not institutional (rulebook 3.5). */
const FREE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.in", "yahoo.co.in",
  "ymail.com", "outlook.com", "outlook.in", "hotmail.com", "live.com",
  "msn.com", "rediffmail.com", "icloud.com", "me.com", "proton.me",
  "protonmail.com", "aol.com", "gmx.com", "mail.com", "zoho.com",
  "yandex.com", "tutanota.com",
]);

export function isFreeEmailDomain(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return FREE_EMAIL_DOMAINS.has(domain);
}

// ── Schedule (rulebook Section 2) ──────────────────────────────────────────

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 00:00 IST on the calendar day that is `daysBefore` days before T0's day. */
export function istDayStart(t0: Date, daysBefore: number): Date {
  const istMs = t0.getTime() + IST_OFFSET_MS;
  const dayStartIst = Math.floor(istMs / DAY_MS) * DAY_MS;
  return new Date(dayStartIst - IST_OFFSET_MS - daysBefore * DAY_MS);
}

export interface Schedule {
  opensAt: Date | null;
  closesAt: Date | null;
  lockAt: Date | null;
}

/**
 * Registration opens D-14, closes D-5, teams lock D-3. The rulebook gives days,
 * not instants, so the defaults are: opens 00:00 IST on D-14, closes at the end
 * of D-5 (00:00 IST on D-4), locks 00:00 IST on D-3. Each can be overridden with
 * REGISTRATION_OPENS_AT / REGISTRATION_CLOSES_AT / TEAM_LOCK_AT.
 */
export function getSchedule(config: BackendConfig): Schedule {
  const t0 = config.eventStart;
  return {
    opensAt: config.registrationOpensAt ?? (t0 ? istDayStart(t0, 14) : null),
    closesAt: config.registrationClosesAt ?? (t0 ? istDayStart(t0, 4) : null),
    lockAt: config.teamLockAt ?? (t0 ? istDayStart(t0, 3) : null),
  };
}

export type GateResult = { open: true } | { open: false; message: string };

export function registrationGate(config: BackendConfig, now = new Date()): GateResult {
  if (!config.registrationOpen) {
    return { open: false, message: "Registration is not open yet." };
  }
  const { opensAt, closesAt } = getSchedule(config);
  if (opensAt && now < opensAt) {
    return { open: false, message: "Registration has not opened yet." };
  }
  if (closesAt && now >= closesAt) {
    return { open: false, message: "Registration is closed." };
  }
  return { open: true };
}

/** Rulebook 3.6: no changes after the D-3 team lock. */
export function uploadGate(config: BackendConfig, now = new Date()): GateResult {
  const { lockAt } = getSchedule(config);
  if (lockAt && now >= lockAt) {
    return {
      open: false,
      message: "Teams are locked. College IDs can no longer be changed.",
    };
  }
  return { open: true };
}

/** Rulebook 15.6: personal data is kept 180 days after final results (T+144). */
export const RETENTION_DAYS = 180;
const FINAL_RESULTS_OFFSET_MS = 144 * 60 * 60 * 1000;

export function retentionCutoff(config: BackendConfig): Date | null {
  if (!config.eventStart) return null;
  return new Date(
    config.eventStart.getTime() + FINAL_RESULTS_OFFSET_MS + RETENTION_DAYS * DAY_MS,
  );
}
