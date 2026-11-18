"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { portalRequest } from "@/app/services/api";
import type { PortalMe } from "@/app/types/api";
import { Badge } from "../ui/Badge";
import { Button3D } from "../ui/Button3D";
import { Callout } from "../ui/Callout";
import { cn } from "../ui/cn";
import { AppealPanel } from "./AppealPanel";
import { CheckpointsPanel } from "./CheckpointsPanel";
import { OverviewPanel } from "./OverviewPanel";
import { ProblemsPanel } from "./ProblemsPanel";
import { captureKeyFromHash, KEY_PATTERN, readKey, subscribeKey, writeKey } from "./portal-key";
import { fieldBase } from "./shared";
import { SubmissionPanel } from "./SubmissionPanel";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "problems", label: "Problems" },
  { id: "checkpoints", label: "Checkpoints" },
  { id: "submission", label: "Submission" },
  { id: "appeal", label: "Appeal" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function KeyForm() {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      noValidate
      className="max-w-xl space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const key = value.trim();
        if (!KEY_PATTERN.test(key)) {
          setError("That does not look like a portal key. It starts with kmp_.");
          return;
        }
        setError("");
        writeKey(key);
      }}
    >
      <label htmlFor="portal-key" className="block text-sm font-medium text-foreground">
        Your personal portal key
      </label>
      <input
        id="portal-key"
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="kmp_…"
        aria-invalid={Boolean(error)}
        className={cn(fieldBase, error && "border-danger")}
      />
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
      <p className="text-xs leading-relaxed text-muted">
        The OC emails each verified member their own key. It is stored for this browser tab only.
      </p>
      <Button3D type="submit">Sign in</Button3D>
    </form>
  );
}

export function PortalApp() {
  const key = useSyncExternalStore(subscribeKey, readKey, () => null);
  const [me, setMe] = useState<PortalMe | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("overview");

  useEffect(() => {
    captureKeyFromHash();
  }, []);

  const load = useCallback(async () => {
    if (!key) return;
    const result = await portalRequest<PortalMe>(key, "GET", "/api/portal/me");
    if (result.ok) {
      setMe(result.data);
      setLoadError(null);
      return;
    }
    setMe(null);
    setLoadError(result.message);
    if (result.status === 401) writeKey(null);
  }, [key]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!key) return <KeyForm />;

  if (me === undefined) {
    return <p className="text-sm text-muted" role="status">Loading your team…</p>;
  }

  if (me === null) {
    return (
      <div className="space-y-4">
        <Callout title="Could not open the portal" tone="warning">
          <p>{loadError}</p>
        </Callout>
        <div className="flex gap-3">
          <Button3D type="button" onClick={() => void load()}>Try again</Button3D>
          <Button3D type="button" variant="secondary" onClick={() => writeKey(null)}>Use a different key</Button3D>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
        <div>
          <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-muted">Team ID</p>
          <p className="text-2xl font-semibold tracking-tight text-foreground">{me.team.code}</p>
          <p className="text-sm text-muted">{me.team.name} · {me.team.track} track · signed in as {me.member.fullName}{me.member.isLeader ? " (leader)" : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={me.pledgeSigned ? "success" : "warning"}>{me.pledgeSigned ? "Pledge signed" : "Pledge needed"}</Badge>
          <Button3D type="button" size="sm" variant="ghost" onClick={() => writeKey(null)}>Sign out</Button3D>
        </div>
      </div>

      <div role="tablist" aria-label="Portal sections" className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`panel-${item.id}`}
            onClick={() => setTab(item.id)}
            className={cn(
              "rounded-md border px-4 py-2 text-sm font-medium transition-colors",
              tab === item.id ? "border-primary bg-primary-soft text-primary" : "border-border text-muted hover:border-border-strong hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "overview" ? <OverviewPanel apiKey={key} me={me} reload={load} /> : null}
        {tab === "problems" ? <ProblemsPanel apiKey={key} me={me} /> : null}
        {tab === "checkpoints" ? <CheckpointsPanel apiKey={key} me={me} reload={load} /> : null}
        {tab === "submission" ? <SubmissionPanel apiKey={key} me={me} reload={load} /> : null}
        {tab === "appeal" ? <AppealPanel apiKey={key} me={me} /> : null}
      </div>
    </div>
  );
}
