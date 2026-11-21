/**
 * Team activation: runs when the OC verifies a team (after payment is confirmed).
 * Assigns the anonymous Team ID (B-001 / A-001), issues one personal portal key
 * per member and emails it. If mail is not configured (or a send fails) the
 * affected keys are returned to the OC once so they can be handed over by hand.
 */

import { getConfig } from "./config";
import { mailConfigured, sendMail } from "./mailer";
import { newPortalToken, sha256Hex } from "./security";
import { rpc, selectRows, updateRows } from "./supabase";

export interface ActivationResult {
  teamCode: string;
  alreadyActive: boolean;
  delivery: "emailed" | "partial" | "manual" | "none";
  /** Keys that could not be emailed. Shown to the OC once and never stored in plain text. */
  manualKeys: { position: number; fullName: string; email: string; key: string }[];
}

function mailBody(name: string, teamCode: string, key: string): { subject: string; text: string } {
  const link = `${getConfig().siteUrl}/portal#key=${key}`;
  return {
    subject: `Kosmodrome 2027: your team ${teamCode} is verified`,
    text: [
      `Hello ${name},`,
      "",
      `Your team has been verified for Kosmodrome 2027 (17–18 January 2027 · 48 Hours to Orbit). Your Team ID is ${teamCode}.`,
      "",
      "This is your personal portal key. It signs you in to the event portal, where you sign the",
      "Integrity Declaration before kickoff, get the problem statements at T0, and make your submission.",
      "Do not share it: every download and action is logged against you.",
      "",
      `Open the portal: ${link}`,
      `Key: ${key}`,
      "",
      "If you did not expect this email, ignore it.",
    ].join("\n"),
  };
}

async function issueKeys(
  teamId: string,
  teamCode: string,
  members: { position: number; full_name: string; email: string }[],
): Promise<ActivationResult["manualKeys"]> {
  const manual: ActivationResult["manualKeys"] = [];
  for (const m of members) {
    const key = newPortalToken("kmp");
    await updateRows(
      "team_members",
      { team_id: `eq.${teamId}`, position: `eq.${m.position}` },
      { portal_token_hash: sha256Hex(key) },
    );
    const mail = mailBody(m.full_name, teamCode, key);
    const sent = mailConfigured() && (await sendMail(m.email, mail.subject, mail.text));
    if (!sent) manual.push({ position: m.position, fullName: m.full_name, email: m.email, key });
  }
  return manual;
}

function deliveryOf(total: number, manual: number): ActivationResult["delivery"] {
  if (total === 0) return "none";
  if (manual === 0) return "emailed";
  return manual === total ? "manual" : "partial";
}

export async function activateTeam(teamId: string): Promise<ActivationResult> {
  const teamCode = await rpc<string>("assign_team_code", { p_team_id: teamId });
  const { rows: teams } = await selectRows<{ portal_activated_at: string | null }>("teams", {
    select: "portal_activated_at",
    id: `eq.${teamId}`,
  });
  if (teams[0]?.portal_activated_at) {
    return { teamCode, alreadyActive: true, delivery: "none", manualKeys: [] };
  }

  const { rows: members } = await selectRows<{ position: number; full_name: string; email: string }>(
    "team_members",
    { select: "position,full_name,email", team_id: `eq.${teamId}`, order: "position.asc" },
  );
  const manualKeys = await issueKeys(teamId, teamCode, members);
  await updateRows("teams", { id: `eq.${teamId}` }, { portal_activated_at: new Date().toISOString() });
  return { teamCode, alreadyActive: false, delivery: deliveryOf(members.length, manualKeys.length), manualKeys };
}

/** Replace one member's key (lost key, suspected sharing). The old key stops working at once. */
export async function reissueMemberKey(teamId: string, position: number): Promise<ActivationResult | null> {
  const { rows: teams } = await selectRows<{ team_code: string | null }>("teams", {
    select: "team_code",
    id: `eq.${teamId}`,
  });
  const teamCode = teams[0]?.team_code;
  if (!teamCode) return null;
  const { rows } = await selectRows<{ position: number; full_name: string; email: string }>(
    "team_members",
    { select: "position,full_name,email", team_id: `eq.${teamId}`, position: `eq.${position}` },
  );
  if (rows.length === 0) return null;
  const manualKeys = await issueKeys(teamId, teamCode, rows);
  return { teamCode, alreadyActive: true, delivery: deliveryOf(1, manualKeys.length), manualKeys };
}
