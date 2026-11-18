"use client";

import { useEffect, useState } from "react";
import { portalDownload, portalRequest } from "@/app/services/api";
import type { PortalMe, PortalProblems } from "@/app/types/api";
import { Button3D } from "../ui/Button3D";
import { errorText, formatBytes, Notice, Section } from "./shared";

export function ProblemsPanel({ apiKey, me }: { apiKey: string; me: PortalMe }) {
  const [data, setData] = useState<PortalProblems | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void portalRequest<PortalProblems>(apiKey, "GET", "/api/portal/problems").then((result) => {
      if (!active) return;
      if (result.ok) setData(result.data);
      else setError(errorText(result));
    });
    return () => {
      active = false;
    };
  }, [apiKey]);

  if (error) {
    return (
      <Section title="Problem statements">
        <Notice tone="info">{error}</Notice>
        <p>Statements are released to every team at the same instant at T0, to members who have signed the pledge.</p>
      </Section>
    );
  }
  if (!data) return <p className="text-sm text-muted" role="status">Loading…</p>;

  return (
    <div className="space-y-5">
      <Section title={`${me.team.track} track problem set`}>
        <p>
          Every download is logged against your team and your name. Statements and datasets are confidential until the OC publishes them after results: do not share or post them, and keep your repository private.
        </p>
        <p>
          Your team variant seed: <code className="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-xs text-foreground">{data.seed}</code>. Where the statement says to use a seed, use this one.
        </p>
        {data.files.length === 0 ? (
          <Notice tone="info">No files have been published for your track yet.</Notice>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {data.files.map((file) => (
              <li key={file.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium text-foreground">{file.name}</p>
                  <p className="text-xs">{file.kind} · {formatBytes(file.size)} · SHA-256 {file.sha256.slice(0, 12)}…</p>
                </div>
                <Button3D
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    setDownloadError(null);
                    const result = await portalDownload(apiKey, file.id, file.name);
                    if (!result.ok) setDownloadError(errorText(result));
                  }}
                >
                  Download
                </Button3D>
              </li>
            ))}
          </ul>
        )}
        {downloadError ? <Notice tone="error">{downloadError}</Notice> : null}
      </Section>
    </div>
  );
}
