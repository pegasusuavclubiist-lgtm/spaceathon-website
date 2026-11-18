"use client";

import { useState } from "react";
import { portalRequest } from "@/app/services/api";
import type { PortalMe } from "@/app/types/api";
import { Button3D } from "../ui/Button3D";
import { errorText, fieldBase, formatIst, Notice, Section } from "./shared";

const SCHEDULE: [string, string][] = [
  ["briefingAt", "Briefing and dry run (D-1)"],
  ["t0", "Kickoff (T0)"],
  ["checkpoint1", "Checkpoint 1: progress note (T+12)"],
  ["checkpoint2", "Checkpoint 2: live video check-in (T+24)"],
  ["checkpoint3", "Checkpoint 3: readiness note (T+36)"],
  ["submitOpens", "Submission window opens (T+40)"],
  ["hardClose", "Hard close (T+48)"],
  ["finalistsAt", "Finalists announced (T+80)"],
  ["finalsAt", "Finals (T+96)"],
  ["provisionalAt", "Provisional results; appeals open (T+102)"],
  ["appealCloses", "Appeal window closes (T+126)"],
];

type Kind = "pledge" | "final";

export function OverviewPanel({ apiKey, me, reload }: { apiKey: string; me: PortalMe; reload: () => Promise<void> }) {
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [ticket, setTicket] = useState({ kind: "general", subject: "", body: "" });
  const [ticketMessage, setTicketMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function sign(kind: Kind) {
    setBusy(true);
    setMessage(null);
    const result = await portalRequest(apiKey, "POST", "/api/portal/declaration", { kind, accepted });
    setBusy(false);
    if (result.ok) {
      setMessage({ tone: "ok", text: kind === "pledge" ? "Pledge signed." : "Final declaration signed." });
      await reload();
    } else {
      setMessage({ tone: "error", text: errorText(result) });
    }
  }

  async function sendTicket() {
    setTicketMessage(null);
    const result = await portalRequest<{ id: string; graceGranted: boolean }>(apiKey, "POST", "/api/portal/tickets", ticket);
    if (result.ok) {
      setTicketMessage({
        tone: "ok",
        text: result.data.graceGranted
          ? "Ticket sent. Your 10-minute technical grace window is recorded (-5 points if you use it)."
          : "Ticket sent. The OC will reply through the official channels.",
      });
      setTicket({ kind: "general", subject: "", body: "" });
    } else {
      setTicketMessage({ tone: "error", text: errorText(result) });
    }
  }

  return (
    <div className="space-y-5">
      <Section title="Integrity Declaration (Annex A)">
        <p>
          Each member signs before kickoff, and again with the final submission. No pledge means no access to the problem statements at T0.
        </p>
        <ul className="grid gap-1 sm:grid-cols-2">
          {me.team.members.map((m) => (
            <li key={m.position}>
              Member {m.position + 1}: {m.pledged ? "pledge signed" : "pledge missing"}; final {m.finalSigned ? "signed" : "not yet"}
            </li>
          ))}
        </ul>
        {!me.pledgeSigned ? (
          <>
            <label className="flex items-start gap-3 text-foreground">
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1" />
              <span>
                I confirm that I am the person on my uploaded ID, that I have not shared problem material outside my team, that all project work will be created after T0, and that every third-party component and AI tool will be declared in the README.
              </span>
            </label>
            <Button3D type="button" disabled={!accepted || busy || !me.state.pledgeOpen} onClick={() => void sign("pledge")}>
              {busy ? "Signing…" : "Sign the pledge"}
            </Button3D>
            {!me.state.pledgeOpen ? <Notice tone="info">The pledge window is closed. Contact the OC.</Notice> : null}
          </>
        ) : !me.finalDeclarationSigned ? (
          <>
            <label className="flex items-start gap-3 text-foreground">
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1" />
              <span>I confirm the Integrity Declaration again for the final submission, and that I can explain every part of it.</span>
            </label>
            <Button3D type="button" variant="secondary" disabled={!accepted || busy} onClick={() => void sign("final")}>
              {busy ? "Signing…" : "Sign the final declaration"}
            </Button3D>
            <p className="text-xs">Available during the submission window (T+40 to T+48).</p>
          </>
        ) : (
          <Notice tone="ok">Both declarations are signed.</Notice>
        )}
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      </Section>

      <Section title="Schedule">
        {me.schedule ? (
          <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[1fr_auto]">
            {SCHEDULE.map(([k, label]) => (
              <div key={k} className="contents">
                <dt>{label}</dt>
                <dd className="font-mono text-xs text-foreground">{formatIst(me.schedule?.[k])}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p>The event schedule has not been announced yet.</p>
        )}
      </Section>

      <Section title="Support ticket">
        <p>
          Team-specific technical or account problems go here. Raise an upload-failure ticket within 15 minutes of a problem; one raised during the submission window earns the 10-minute grace.
        </p>
        <label className="block text-foreground" htmlFor="ticket-kind">Type</label>
        <select id="ticket-kind" className={fieldBase} value={ticket.kind} onChange={(e) => setTicket({ ...ticket, kind: e.target.value })}>
          <option value="general">General</option>
          <option value="upload_failure">Upload or portal failure</option>
        </select>
        <label className="block text-foreground" htmlFor="ticket-subject">Subject</label>
        <input id="ticket-subject" className={fieldBase} maxLength={120} value={ticket.subject} onChange={(e) => setTicket({ ...ticket, subject: e.target.value })} />
        <label className="block text-foreground" htmlFor="ticket-body">What happened</label>
        <textarea id="ticket-body" rows={4} className={fieldBase} maxLength={3000} value={ticket.body} onChange={(e) => setTicket({ ...ticket, body: e.target.value })} />
        <Button3D type="button" variant="secondary" onClick={() => void sendTicket()}>Send ticket</Button3D>
        {ticketMessage ? <Notice tone={ticketMessage.tone}>{ticketMessage.text}</Notice> : null}
      </Section>
    </div>
  );
}
