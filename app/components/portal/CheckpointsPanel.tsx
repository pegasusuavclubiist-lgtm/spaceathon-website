"use client";

import { useEffect, useState } from "react";
import { portalRequest } from "@/app/services/api";
import type { PortalCheckpoint, PortalMe } from "@/app/types/api";
import { Badge } from "../ui/Badge";
import { Button3D } from "../ui/Button3D";
import { errorText, fieldBase, formatIst, Notice, Section } from "./shared";

const WORD_LIMIT = 200;
const words = (text: string) => (text.trim() === "" ? 0 : text.trim().split(/\s+/).length);

function NoteForm({
  n, apiKey, saved, dueAt, onSaved,
}: { n: 1 | 3; apiKey: string; saved?: PortalCheckpoint; dueAt?: string; onSaved: () => void }) {
  const [note, setNote] = useState(saved?.note ?? "");
  const [sha, setSha] = useState(saved?.commitSha ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const count = words(note);

  async function save() {
    setBusy(true);
    setMessage(null);
    const result = await portalRequest(apiKey, "POST", `/api/portal/checkpoints/${n}`, { note, commitSha: sha.trim() || undefined });
    setBusy(false);
    if (result.ok) {
      setMessage({ tone: "ok", text: "Saved. You can edit it until the checkpoint closes." });
      onSaved();
    } else {
      setMessage({ tone: "error", text: errorText(result) });
    }
  }

  return (
    <Section title={n === 1 ? "Checkpoint 1: progress note (T+12)" : "Checkpoint 3: readiness note (T+36)"}>
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={saved ? "success" : "warning"}>{saved ? "Recorded" : "Not yet recorded"}</Badge>
        <span className="text-xs">Due {formatIst(dueAt)}. A missed checkpoint costs 3 points.</span>
      </div>
      <label htmlFor={`cp${n}-note`} className="block text-foreground">
        Note (up to {WORD_LIMIT} words)
      </label>
      <textarea id={`cp${n}-note`} rows={6} className={fieldBase} value={note} onChange={(e) => setNote(e.target.value)} />
      <p className={count > WORD_LIMIT ? "text-xs text-danger" : "text-xs"} aria-live="polite">
        {count} / {WORD_LIMIT} words
      </p>
      <label htmlFor={`cp${n}-sha`} className="block text-foreground">Repository snapshot (commit SHA)</label>
      <input id={`cp${n}-sha`} className={fieldBase} value={sha} onChange={(e) => setSha(e.target.value)} placeholder="e.g. 9fceb02" spellCheck={false} />
      <Button3D type="button" disabled={busy || count === 0 || count > WORD_LIMIT} onClick={() => void save()}>
        {busy ? "Saving…" : saved ? "Update note" : "Save note"}
      </Button3D>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
    </Section>
  );
}

export function CheckpointsPanel({ apiKey, me }: { apiKey: string; me: PortalMe; reload: () => Promise<void> }) {
  const [list, setList] = useState<PortalCheckpoint[] | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    void portalRequest<{ checkpoints: PortalCheckpoint[] }>(apiKey, "GET", "/api/portal/checkpoints").then((r) => {
      if (active && r.ok) setList(r.data.checkpoints);
    });
    return () => {
      active = false;
    };
  }, [apiKey, version]);

  if (!list) return <p className="text-sm text-muted" role="status">Loading…</p>;
  const find = (n: number) => list.find((c) => c.n === n);
  const cp2 = find(2);

  return (
    <div className="space-y-5">
      <NoteForm n={1} apiKey={apiKey} saved={find(1)} dueAt={me.schedule?.checkpoint1} onSaved={() => setVersion((v) => v + 1)} />
      <Section title="Checkpoint 2: live video check-in (T+24)">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={cp2 ? "success" : "neutral"}>
            {cp2 ? `Recorded: ${cp2.presentPositions?.length ?? 0} of ${me.team.members.length} members present` : "Not recorded yet"}
          </Badge>
        </div>
        <p>
          A 5-minute call on the official video platform with cameras on and every member present, ID shown on request. The OC records attendance; there is nothing to upload here. It is due {formatIst(me.schedule?.checkpoint2)}.
        </p>
      </Section>
      <NoteForm n={3} apiKey={apiKey} saved={find(3)} dueAt={me.schedule?.checkpoint3} onSaved={() => setVersion((v) => v + 1)} />
    </div>
  );
}
