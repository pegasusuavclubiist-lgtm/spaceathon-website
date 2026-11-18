"use client";

import { useEffect, useState } from "react";
import { portalRequest } from "@/app/services/api";
import type { PortalAppeal, PortalMe } from "@/app/types/api";
import { Badge } from "../ui/Badge";
import { Button3D } from "../ui/Button3D";
import { errorText, fieldBase, formatIst, Notice, Section } from "./shared";

const GROUNDS = [
  ["arithmetic_error", "An arithmetic or data-entry error"],
  ["misapplied_rule", "A misapplied rule"],
  ["undeclared_conflict", "An undeclared conflict of interest"],
  ["procedural_irregularity", "A procedural irregularity"],
] as const;

export function AppealPanel({ apiKey, me }: { apiKey: string; me: PortalMe }) {
  const [current, setCurrent] = useState<PortalAppeal["appeal"] | undefined>(undefined);
  const [ground, setGround] = useState<string>(GROUNDS[0][0]);
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    void portalRequest<PortalAppeal>(apiKey, "GET", "/api/portal/appeals").then((r) => {
      if (active && r.ok) setCurrent(r.data.appeal);
    });
    return () => {
      active = false;
    };
  }, [apiKey, version]);

  async function file() {
    setMessage(null);
    const result = await portalRequest(apiKey, "POST", "/api/portal/appeals", { ground, description });
    if (result.ok) {
      setMessage({ tone: "ok", text: "Appeal filed. The Grievance Committee decides by T+138." });
      setVersion((v) => v + 1);
    } else {
      setMessage({ tone: "error", text: errorText(result) });
    }
  }

  if (current === undefined) return <p className="text-sm text-muted" role="status">Loading…</p>;

  return (
    <Section title="Appeal">
      <p>
        One appeal per team, filed by the team leader between {formatIst(me.schedule?.provisionalAt)} and {formatIst(me.schedule?.appealCloses)}. Valid grounds are an arithmetic or data-entry error, a misapplied rule, an undeclared conflict of interest, or a procedural irregularity. Disagreeing with a judge&apos;s subjective assessment is not a valid ground, and scores are not re-judged.
      </p>
      {current ? (
        <div className="space-y-2">
          <Badge tone={current.status === "open" ? "primary" : current.status === "upheld" ? "success" : "neutral"}>{current.status}</Badge>
          <p className="text-foreground">{current.description}</p>
          {current.decision_note ? <Notice tone="info">Decision: {current.decision_note}</Notice> : null}
        </div>
      ) : me.member.isLeader ? (
        <>
          <label htmlFor="appeal-ground" className="block text-foreground">Ground</label>
          <select id="appeal-ground" className={fieldBase} value={ground} onChange={(e) => setGround(e.target.value)}>
            {GROUNDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label htmlFor="appeal-description" className="block text-foreground">What went wrong</label>
          <textarea id="appeal-description" rows={5} className={fieldBase} value={description} onChange={(e) => setDescription(e.target.value)} />
          <Button3D type="button" disabled={description.trim().length < 30} onClick={() => void file()}>File appeal</Button3D>
        </>
      ) : (
        <Notice tone="info">Only the team leader can file the appeal.</Notice>
      )}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
    </Section>
  );
}
