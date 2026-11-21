/**
 * Request validation and normalisation. Mirrors the frontend rules in
 * docs/api-contract.md and adds the rulebook rules the client can bypass.
 * Pure functions, no I/O.
 */

import { getConfig } from "./config";
import {
  CONTACT_TOPICS,
  MAX_TEAM_SIZE,
  MIN_TEAM_SIZE,
  PROGRAMMES,
  TRACKS,
  isFreeEmailDomain,
  trackEligibilityErrors,
  type ContactTopic,
  type Track,
} from "./rules";

export type FieldErrors = Record<string, string>;
export type ParticipantCategory = "iist" | "outsider";

export const FEE_BY_CATEGORY: Record<ParticipantCategory, number> = {
  iist: 299,
  outsider: 499,
};

export const LIMITS = {
  teamName: 80,
  fullName: 100,
  college: 150,
  email: 254,
  contactName: 100,
  message: 4000,
  paymentUtr: 64,
} as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UTR_PATTERN = /^[A-Za-z0-9@._/-]{6,64}$/;
// C0/C1 control characters, DEL, and Unicode bidi/zero-width controls.
const CONTROL_CHARS =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/** Single-line text: NFC, no control characters, whitespace collapsed. */
export function cleanLine(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFC")
    .replace(CONTROL_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Multi-line text: like cleanLine but keeps newlines (max 2 in a row). */
export function cleanMultiline(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normaliseEmail(value: unknown): string {
  return cleanLine(value).toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function emailError(email: string, institutional: boolean): string | null {
  if (!email) return "Enter an email address.";
  if (email.length > LIMITS.email || !EMAIL_PATTERN.test(email)) {
    return "Enter a valid email address.";
  }
  if (institutional && getConfig().blockFreeEmailDomains && isFreeEmailDomain(email)) {
    return "Use your institutional email address, not a personal mail provider.";
  }
  return null;
}

export interface NormalisedMember {
  position: number;
  fullName: string;
  email: string;
  college: string;
  programme: string;
}

export interface NormalisedRegistration {
  teamName: string;
  track: Track;
  leaderEmail: string;
  participantCategory: ParticipantCategory;
  feeAmount: number;
  paymentUtr: string | null;
  members: NormalisedMember[];
}

export type Validated<T> =
  | { ok: true; value: T }
  | { ok: false; fieldErrors: FieldErrors };

export function validateRegistration(body: unknown): Validated<NormalisedRegistration> {
  if (!isRecord(body)) {
    return { ok: false, fieldErrors: { form: "The request is not valid." } };
  }

  const errors: FieldErrors = {};

  const teamName = cleanLine(body.teamName);
  if (!teamName) errors.teamName = "Enter a team name.";
  else if (teamName.length < 2) errors.teamName = "Team name must be at least 2 characters.";
  else if (teamName.length > LIMITS.teamName) {
    errors.teamName = `Team name must be at most ${LIMITS.teamName} characters.`;
  }

  const track = cleanLine(body.track);
  if (!(TRACKS as readonly string[]).includes(track)) {
    errors.track = "Choose Beginner or Advanced.";
  }

  const leaderEmail = normaliseEmail(body.leaderEmail);
  const leaderProblem = emailError(leaderEmail, true);
  if (leaderProblem) errors.leaderEmail = leaderProblem;

  // Payment category & UPI UTR reference (₹299 IISTians, ₹499 outsiders)
  const rawCategory = cleanLine(body.participantCategory).toLowerCase();
  let participantCategory: ParticipantCategory = "outsider";
  if (rawCategory === "iist" || rawCategory === "outsider") {
    participantCategory = rawCategory;
  } else if (rawCategory) {
    errors.participantCategory = "Choose IISTian (₹299) or Outsider (₹499).";
  }

  const rawUtr = cleanLine(body.paymentUtr);
  let paymentUtr: string | null = null;
  if (body.paymentUtr !== undefined) {
    if (!rawUtr) {
      errors.paymentUtr = "Enter the UPI transaction ID / UTR number after scanning the QR code.";
    } else if (!UTR_PATTERN.test(rawUtr)) {
      errors.paymentUtr = "Enter a valid UPI transaction ID / UTR (6 to 64 characters).";
    } else {
      paymentUtr = rawUtr;
    }
  }

  const members: NormalisedMember[] = [];
  const rawMembers = Array.isArray(body.members) ? body.members : null;

  if (!rawMembers) {
    errors.form = `Add ${MIN_TEAM_SIZE} to ${MAX_TEAM_SIZE} team members.`;
  } else if (rawMembers.length < MIN_TEAM_SIZE) {
    errors.form = "A team needs at least 2 members. Solo entries are not accepted.";
  } else if (rawMembers.length > MAX_TEAM_SIZE) {
    errors.form = "A team can have at most 4 members.";
  } else {
    const seen = new Map<string, number>();

    rawMembers.forEach((raw, index) => {
      const prefix = `members.${index}`;
      const record = isRecord(raw) ? raw : {};

      const fullName = cleanLine(record.fullName);
      if (!fullName) errors[`${prefix}.fullName`] = "Enter the member's full name.";
      else if (fullName.length > LIMITS.fullName) {
        errors[`${prefix}.fullName`] = `Name must be at most ${LIMITS.fullName} characters.`;
      }

      const email = normaliseEmail(record.email);
      const problem = emailError(email, true);
      if (problem) errors[`${prefix}.email`] = problem;
      else if (seen.has(email)) {
        errors[`${prefix}.email`] = "This email is already used by another member.";
      } else {
        seen.set(email, index);
      }

      const college = cleanLine(record.college);
      if (!college) errors[`${prefix}.college`] = "Enter the member's institution.";
      else if (college.length > LIMITS.college) {
        errors[`${prefix}.college`] = `Institution must be at most ${LIMITS.college} characters.`;
      }

      const programme = cleanLine(record.programme);
      if (!(PROGRAMMES as readonly string[]).includes(programme)) {
        errors[`${prefix}.programme`] = "Choose a programme and year.";
      }

      members.push({ position: index, fullName, email, college, programme });
    });

    // Rulebook 3.7: the team leader is one of the members.
    if (!errors.leaderEmail && !members.some((m) => m.email === leaderEmail)) {
      errors.leaderEmail = "The team leader must be one of the team members.";
    }

    // Rulebook 3.1 / 4.1 / 4.2.
    if (!errors.track && (TRACKS as readonly string[]).includes(track)) {
      Object.assign(
        errors,
        trackEligibilityErrors(
          track as Track,
          members.map((m) => m.programme),
        ),
      );
    }
  }

  // The three consent flags must be literally `true` (rulebook 3.9, Annex A).
  if (body.rulebookAccepted !== true) {
    errors.rulebookAccepted = "Accept the rulebook to register.";
  }
  if (body.declarationAccepted !== true) {
    errors.declarationAccepted = "Accept the Integrity Declaration to register.";
  }
  if (body.seniorityConfirmed !== true) {
    errors.seniorityConfirmed = "Confirm your seniority and track declaration.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };

  return {
    ok: true,
    value: {
      teamName,
      track: track as Track,
      leaderEmail,
      participantCategory,
      feeAmount: FEE_BY_CATEGORY[participantCategory],
      paymentUtr,
      members,
    },
  };
}

/** Team names are unique case-insensitively; this is the comparison key. */
export function teamNameKey(teamName: string): string {
  return teamName.toLowerCase();
}

export interface NormalisedContact {
  name: string;
  email: string;
  topic: ContactTopic;
  message: string;
  /** True when the honeypot field was filled in: treat as spam. */
  spam: boolean;
}

export function validateContact(body: unknown): Validated<NormalisedContact> {
  if (!isRecord(body)) {
    return { ok: false, fieldErrors: { form: "The request is not valid." } };
  }

  const errors: FieldErrors = {};

  const name = cleanLine(body.name);
  if (!name) errors.name = "Enter your name.";
  else if (name.length > LIMITS.contactName) {
    errors.name = `Name must be at most ${LIMITS.contactName} characters.`;
  }

  const email = normaliseEmail(body.email);
  const problem = emailError(email, false);
  if (problem) errors.email = problem;

  const topic = cleanLine(body.topic);
  if (!(CONTACT_TOPICS as readonly string[]).includes(topic)) {
    errors.topic = "Choose a topic.";
  }

  const message = cleanMultiline(body.message);
  if (!message) errors.message = "Enter a message.";
  else if (message.length > LIMITS.message) {
    errors.message = `Message must be at most ${LIMITS.message} characters.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };

  // Honeypot: real users never see or fill a field called "website".
  const spam = cleanLine(body.website).length > 0;

  return {
    ok: true,
    value: { name, email, topic: topic as ContactTopic, message, spam },
  };
}
