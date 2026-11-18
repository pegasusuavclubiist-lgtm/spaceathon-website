/**
 * Event timeline (rulebook Section 2) derived from T0 (EVENT_START_ISO).
 * All gates fail closed while T0 is "to be announced".
 */

import type { BackendConfig } from "./config";
import { istDayStart } from "./rules";

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

export interface Milestones {
  t0: Date;
  /** D-1 18:00 IST: briefing and dry run; pledges are signed by then. */
  briefingAt: Date;
  checkpoint1: Date; // T+12
  checkpoint2: Date; // T+24
  checkpoint3: Date; // T+36
  submitOpens: Date; // T+40
  hardClose: Date; // T+48
  graceEnds: Date; // T+48 plus the 10-minute technical grace (8.3)
  stage0Ends: Date; // T+54
  stage1Ends: Date; // T+78
  finalistsAt: Date; // T+80
  deckDue: Date; // T+94
  finalsAt: Date; // T+96
  provisionalAt: Date; // T+102, appeal window opens
  appealCloses: Date; // T+126
  grievanceDecideBy: Date; // T+138
  finalResultsAt: Date; // T+144
}

export function getMilestones(config: Pick<BackendConfig, "eventStart">): Milestones | null {
  const t0 = config.eventStart;
  if (!t0) return null;
  const at = (hours: number) => new Date(t0.getTime() + hours * HOUR);
  return {
    t0,
    briefingAt: new Date(istDayStart(t0, 1).getTime() + 18 * HOUR),
    checkpoint1: at(12),
    checkpoint2: at(24),
    checkpoint3: at(36),
    submitOpens: at(40),
    hardClose: at(48),
    graceEnds: new Date(at(48).getTime() + 10 * MINUTE),
    stage0Ends: at(54),
    stage1Ends: at(78),
    finalistsAt: at(80),
    deckDue: at(94),
    finalsAt: at(96),
    provisionalAt: at(102),
    appealCloses: at(126),
    grievanceDecideBy: at(138),
    finalResultsAt: at(144),
  };
}

export type Gate = { open: true } | { open: false; message: string };

const TBA = { open: false as const, message: "The event schedule has not been announced yet." };

function between(start: Date, end: Date, now: Date, before: string, after: string): Gate {
  if (now < start) return { open: false, message: before };
  if (now >= end) return { open: false, message: after };
  return { open: true };
}

/** Annex A pledge: signed before T0 (no pledge, no access at T0). */
export function pledgeGate(config: BackendConfig, now = new Date()): Gate {
  const m = getMilestones(config);
  if (!m) return TBA;
  return now < m.t0 ? { open: true } : { open: false, message: "Kickoff has passed; pledges can no longer be signed. Contact the OC." };
}

/** Statements and datasets are released to everyone at T0 (5.7). */
export function problemsGate(config: BackendConfig, now = new Date()): Gate {
  const m = getMilestones(config);
  if (!m) return TBA;
  return now >= m.t0 ? { open: true } : { open: false, message: "Problem statements are released at kickoff." };
}

/** Checkpoint notes (1 and 3) are accepted from T0 until the checkpoint instant. */
export function checkpointGate(config: BackendConfig, n: 1 | 3, now = new Date()): Gate {
  const m = getMilestones(config);
  if (!m) return TBA;
  const due = n === 1 ? m.checkpoint1 : m.checkpoint3;
  return between(m.t0, due, now, "The event has not started.", `Checkpoint ${n} has closed.`);
}

/** Submission window T+40 to T+48; a team with a pre-close ticket also gets the 10-minute grace. */
export function submissionGate(
  config: BackendConfig,
  graceGranted: boolean,
  now = new Date(),
): { open: true; inGrace: boolean } | { open: false; message: string } {
  const m = getMilestones(config);
  if (!m) return { open: false, message: TBA.message };
  if (now < m.submitOpens) return { open: false, message: "The submission window opens at T+40." };
  if (now < m.hardClose) return { open: true, inGrace: false };
  if (graceGranted && now < m.graceEnds) return { open: true, inGrace: true };
  return { open: false, message: "The submission window has closed." };
}

/** Prediction uploads for the leaderboard run from T0 to hard close (12.2). */
export function predictionGate(config: BackendConfig, now = new Date()): Gate {
  const m = getMilestones(config);
  if (!m) return TBA;
  return between(m.t0, m.hardClose, now, "The leaderboard opens at kickoff.", "Prediction uploads have closed.");
}

/** Finals slide deck, finalists only: after the finalists are announced until T+94. */
export function deckGate(config: BackendConfig, now = new Date()): Gate {
  const m = getMilestones(config);
  if (!m) return TBA;
  return between(m.finalistsAt, m.deckDue, now, "Decks open once the finalists are announced.", "The deck deadline has passed.");
}

/** One appeal per team from T+102 to T+126 (15.1). */
export function appealGate(config: BackendConfig, now = new Date()): Gate {
  const m = getMilestones(config);
  if (!m) return TBA;
  return between(m.provisionalAt, m.appealCloses, now, "The appeal window has not opened.", "The appeal window has closed.");
}
