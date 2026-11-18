"use client";

import { useCallback, useEffect, useState } from "react";
import { portalRequest, putToSignedUrl } from "@/app/services/api";
import type {
  PortalLeaderboard, PortalMe, PortalPredictions, PortalSubmission, SignedUpload,
} from "@/app/types/api";
import { Badge } from "../ui/Badge";
import { Button3D } from "../ui/Button3D";
import { errorText, formatBytes, formatIst, Notice, Section } from "./shared";

type Status = { tone: "ok" | "error" | "info"; text: string } | null;

const LABELS: Record<string, string> = {
  report: "Technical report (PDF)",
  demo: "Demo video (single take, live clock visible)",
  deck: "Finals slide deck (finalists only, due T+94)",
};
const MISSING_LABELS: Record<string, string> = {
  repo_snapshot: "Repository snapshot (taken by the organisers at hard close)",
  readme: "README in the repository",
  env_file: "Pinned environment file in the repository",
  dockerfile: "Dockerfile in the repository",
  report: "Technical report",
  demo: "Demo video",
  predictions: "Final predictions file",
  declaration: "Final Integrity Declaration signed by every member",
};

/** Ask for a signed URL, PUT the file to storage, then register it with the backend. */
async function uploadVia(
  apiKey: string, urlPath: string, registerPath: string, body: Record<string, unknown>, file: File, setStatus: (s: Status) => void,
) {
  setStatus({ tone: "info", text: "Preparing upload…" });
  const signed = await portalRequest<SignedUpload>(apiKey, "POST", urlPath, body);
  if (!signed.ok) return setStatus({ tone: "error", text: errorText(signed) });
  if (file.size > signed.data.maxBytes) {
    return setStatus({ tone: "error", text: `The file is ${formatBytes(file.size)}; the limit is ${formatBytes(signed.data.maxBytes)}.` });
  }
  setStatus({ tone: "info", text: `Uploading ${formatBytes(file.size)}…` });
  const put = await putToSignedUrl(signed.data, file);
  if (!put.ok) return setStatus({ tone: "error", text: errorText(put) });
  const registered = await portalRequest<{ sha256: string }>(apiKey, "POST", registerPath, { ...body, objectPath: signed.data.objectPath });
  if (!registered.ok) return setStatus({ tone: "error", text: errorText(registered) });
  setStatus({ tone: "ok", text: `Uploaded. SHA-256 ${registered.data.sha256.slice(0, 16)}…` });
  return "done" as const;
}

function ItemUploader({
  item, apiKey, rules, onDone, disabled,
}: { item: string; apiKey: string; rules?: { maxBytes: number; contentTypes: string[] }; onDone: () => void; disabled: boolean }) {
  const [status, setStatus] = useState<Status>(null);
  return (
    <div className="space-y-2 rounded-lg border border-border p-4">
      <label htmlFor={`up-${item}`} className="block font-medium text-foreground">{LABELS[item] ?? item}</label>
      {rules ? <p className="text-xs">Up to {formatBytes(rules.maxBytes)}.</p> : null}
      <input
        id={`up-${item}`}
        type="file"
        disabled={disabled}
        accept={rules?.contentTypes.join(",")}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          const done = await uploadVia(apiKey, "/api/portal/submission/upload-url", "/api/portal/submission/items", { item }, file, setStatus);
          if (done) onDone();
        }}
        className="block w-full text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
      />
      {status ? <Notice tone={status.tone}>{status.text}</Notice> : null}
    </div>
  );
}

function Predictions({ apiKey }: { apiKey: string }) {
  const [data, setData] = useState<PortalPredictions | null>(null);
  const [board, setBoard] = useState<PortalLeaderboard | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    void Promise.all([
      portalRequest<PortalPredictions>(apiKey, "GET", "/api/portal/predictions"),
      portalRequest<PortalLeaderboard>(apiKey, "GET", "/api/portal/leaderboard"),
    ]).then(([p, b]) => {
      if (!active) return;
      if (p.ok) setData(p.data);
      if (b.ok) setBoard(b.data);
    });
    return () => {
      active = false;
    };
  }, [apiKey, version]);

  return (
    <Section title="Predictions and leaderboard (Advanced)">
      <p>
        At most 5 uploads per rolling 12 hours. The leaderboard uses the public 30% of the test inputs only; the final ranking uses the hidden private 70%. Choose one file as final before T+48 (otherwise your last upload counts).
      </p>
      {data && data.cap.retryAfterSeconds > 0 ? (
        <Notice tone="info">Upload cap reached. Next slot in about {Math.ceil(data.cap.retryAfterSeconds / 60)} minutes.</Notice>
      ) : null}
      <input
        type="file"
        aria-label="Predictions file"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          const done = await uploadVia(apiKey, "/api/portal/predictions/upload-url", "/api/portal/predictions", {}, file, setStatus);
          if (done) setVersion((v) => v + 1);
        }}
        className="block w-full text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
      />
      {status ? <Notice tone={status.tone}>{status.text}</Notice> : null}
      {data && data.uploads.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {data.uploads.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
              <span>{formatIst(u.uploadedAt)} · {u.status}{u.publicScore != null ? ` · public score ${u.publicScore.toFixed(4)}` : ""}</span>
              {u.selected ? <Badge tone="success">Final</Badge> : (
                <Button3D type="button" size="sm" variant="ghost" onClick={async () => {
                  const r = await portalRequest(apiKey, "POST", "/api/portal/predictions/select", { id: u.id });
                  if (r.ok) setVersion((v) => v + 1);
                  else setStatus({ tone: "error", text: errorText(r) });
                }}>
                  Select as final
                </Button3D>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {board && board.leaderboard.length > 0 ? (
        <table className="w-full text-left text-xs">
          <caption className="mb-2 text-left text-muted">{board.note}</caption>
          <thead><tr><th className="py-1 pr-3">#</th><th className="pr-3">Team</th><th>Public score</th></tr></thead>
          <tbody>
            {board.leaderboard.map((row) => (
              <tr key={row.teamCode} className={row.you ? "text-primary" : "text-foreground"}>
                <td className="py-1 pr-3">{row.rank}</td><td className="pr-3">{row.teamName}</td><td>{row.publicScore.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </Section>
  );
}

export function SubmissionPanel({ apiKey, me }: { apiKey: string; me: PortalMe; reload: () => Promise<void> }) {
  const [data, setData] = useState<PortalSubmission | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await portalRequest<PortalSubmission>(apiKey, "GET", "/api/portal/submission");
    if (result.ok) setData(result.data);
    else setError(errorText(result));
  }, [apiKey]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!data) return <p className="text-sm text-muted" role="status">Loading…</p>;

  const have = (item: string) => data.items.find((i) => i.item === item);

  return (
    <div className="space-y-5">
      <Section title="Submission window">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={data.window.open ? "success" : "neutral"}>{data.window.open ? "Open" : "Closed"}</Badge>
          <span>Opens {formatIst(data.window.opensAt)}; hard close {formatIst(data.window.closesAt)}.</span>
        </div>
        {!data.window.open && data.window.message ? <Notice tone="info">{data.window.message}</Notice> : null}
        <p>
          Upload as often as you like during the window; the last valid upload counts. At hard close the organisers snapshot your repository at its latest commit and freeze a SHA-256 manifest. Do not put team, member or institute names in any file (-3 points).
        </p>
      </Section>

      <Section title="Files">
        {(["report", "demo"] as const).map((item) => (
          <div key={item} className="space-y-1">
            <ItemUploader item={item} apiKey={apiKey} rules={data.rules[item]} onDone={() => void load()} disabled={!data.window.open} />
            {have(item) ? (
              <p className="text-xs">
                Current: {formatBytes(have(item)!.size)}, uploaded {formatIst(have(item)!.uploadedAt)}, SHA-256 {have(item)!.sha256.slice(0, 16)}…
                {have(item)!.inGrace ? " (grace window, -5 points)" : ""}
              </p>
            ) : null}
          </div>
        ))}
        <ItemUploader item="deck" apiKey={apiKey} rules={data.rules.deck} onDone={() => void load()} disabled={false} />
      </Section>

      {me.team.track === "Advanced" ? <Predictions apiKey={apiKey} /> : null}

      <Section title="Package checklist (Annex D)">
        <p>Final declarations signed: {data.declarations.signed} of {data.declarations.required} members.</p>
        {data.missing.length === 0 ? (
          <Notice tone="ok">Nothing is missing right now.</Notice>
        ) : (
          <>
            <p>Each missing item costs 5 points:</p>
            <ul className="list-disc space-y-1 pl-5">
              {data.missing.map((m) => <li key={m}>{MISSING_LABELS[m] ?? m}</li>)}
            </ul>
          </>
        )}
        <p className="break-all font-mono text-xs">
          {data.frozenManifest ? `Frozen manifest: ${data.frozenManifest.sha256}` : data.manifestPreview ? `Manifest preview: ${data.manifestPreview}` : null}
        </p>
      </Section>
    </div>
  );
}
