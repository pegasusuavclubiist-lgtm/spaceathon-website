/**
 * Payment-gated registration confirmation email.
 *
 * Sent ONLY after an admin explicitly confirms a team's UPI QR payment on the
 * Admin Portal. Never called during initial registration.
 */

import { getConfig } from "./config";
import { mailConfigured, sendMail } from "./mailer";
import { getLiveSiteContent } from "./site-content";
import { selectRows, updateRows } from "./supabase";

export interface ConfirmationEmailResult {
  delivery: "emailed" | "partial" | "manual";
  emailedCount: number;
  failedRecipients: string[];
  subject: string;
  previewText: string;
}

export async function sendRegistrationConfirmationEmail(
  teamId: string,
): Promise<ConfirmationEmailResult> {
  const { rows: teams } = await selectRows<{
    id: string;
    team_name: string;
    track: string;
    leader_email: string;
    participant_category: string | null;
    fee_amount: number | null;
    payment_utr: string | null;
    payment_status: string | null;
    team_members: { position: number; full_name: string; email: string }[];
  }>("teams", {
    select:
      "id,team_name,track,leader_email,participant_category,fee_amount,payment_utr,payment_status," +
      "team_members(position,full_name,email)",
    id: `eq.${teamId}`,
  });

  const team = teams[0];
  if (!team) {
    throw new Error("Team not found for confirmation email.");
  }
  if (team.payment_status !== "confirmed") {
    throw new Error("Payment must be confirmed before sending confirmation email.");
  }

  const content = await getLiveSiteContent();
  const eventName = content.general.name || "Kosmodrome 2027";
  const eventDates = content.general.eventDatesLabel || "17–18 January 2027";
  const categoryLabel =
    team.participant_category === "iist" ? "IISTian" : "Outsider";
  const feeAmount =
    team.fee_amount ?? (team.participant_category === "iist" ? 299 : 499);
  const siteUrl = getConfig().siteUrl;

  const subject = `${eventName}: Payment confirmed & registration confirmed (${team.team_name})`;
  const previewText = [
    `Hello Team ${team.team_name},`,
    "",
    `Your registration payment of ₹${feeAmount} (${categoryLabel}) has been verified and confirmed by the Organising Committee.`,
    `Your team's registration for ${eventName} (${eventDates}) is now confirmed!`,
    "",
    `Registration ID: ${team.id}`,
    `Team Name: ${team.team_name}`,
    `Track: ${team.track}`,
    `Category: ${categoryLabel} (₹${feeAmount})`,
    `UPI / UTR Reference: ${team.payment_utr ?? "Verified by OC"}`,
    `Event Dates: ${eventDates}`,
    "",
    "Next steps:",
    "1. The OC will complete college ID verification before team lock (D-3).",
    "2. Once verified, every team member will receive their personal portal key for the event portal.",
    `3. Review the rules and schedule anytime at ${siteUrl}/timeline`,
    "",
    `See you on the launch pad — ${content.general.organiser}.`,
  ].join("\n");

  const recipients = Array.from(
    new Set(
      [
        team.leader_email,
        ...(team.team_members ?? []).map((m) => m.email),
      ]
        .map((e) => e?.trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  let emailedCount = 0;
  const failedRecipients: string[] = [];

  for (const email of recipients) {
    const ok = mailConfigured() && (await sendMail(email, subject, previewText));
    if (ok) {
      emailedCount += 1;
    } else {
      failedRecipients.push(email);
    }
  }

  await updateRows(
    "teams",
    { id: `eq.${teamId}` },
    { confirmation_email_sent_at: new Date().toISOString() },
  );

  const delivery: ConfirmationEmailResult["delivery"] =
    emailedCount === recipients.length && recipients.length > 0
      ? "emailed"
      : emailedCount > 0
        ? "partial"
        : "manual";

  return {
    delivery,
    emailedCount,
    failedRecipients,
    subject,
    previewText,
  };
}
