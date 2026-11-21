"use client";

import { useCallback, useEffect, useState } from "react";
import { adminRequest } from "@/app/services/api";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Button3D } from "../ui/Button3D";
import { cn } from "../ui/cn";
import { JudgesAiPanel } from "./JudgesAiPanel";
import { OperationsPanel } from "./OperationsPanel";
import { RegistrationsPanel } from "./RegistrationsPanel";
import { WebsiteCmsPanel } from "./WebsiteCmsPanel";

const TOKEN_STORAGE_KEY = "kosmodrome_admin_token";
const ACTOR_STORAGE_KEY = "kosmodrome_admin_actor";

const TABS = [
  { id: "cms", label: "Website CMS (Edit Everything)" },
  { id: "registrations", label: "Registrations & Payments" },
  { id: "judges", label: "Judges & AI Usage" },
  { id: "operations", label: "Messages, Appeals & Results" },
] as const;

type AdminTab = (typeof TABS)[number]["id"];

export function AdminPortalApp() {
  const [token, setToken] = useState<string | null>(null);
  const [actor, setActor] = useState<string>("");
  const [tokenInput, setTokenInput] = useState("");
  const [actorInput, setActorInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [verifying, setVerifying] = useState(false);

  const [identity, setIdentity] = useState<{ actor: string; role: string } | null>(null);
  const [tab, setTab] = useState<AdminTab>("cms");

  const verifySession = useCallback(async (t: string, a: string) => {
    setVerifying(true);
    setAuthError("");
    const res = await adminRequest<{ actor: string; role: string }>(
      t,
      a,
      "GET",
      "/api/admin/me",
    );
    setVerifying(false);
    if (!res.ok) {
      setAuthError(res.message);
      setIdentity(null);
      return false;
    }
    sessionStorage.setItem(TOKEN_STORAGE_KEY, t);
    sessionStorage.setItem(ACTOR_STORAGE_KEY, a);
    setToken(t);
    setActor(a);
    setIdentity(res.data);
    return true;
  }, []);

  useEffect(() => {
    const savedToken = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    const savedActor = sessionStorage.getItem(ACTOR_STORAGE_KEY) ?? "";
    if (savedToken) {
      void verifySession(savedToken, savedActor);
    }
  }, [verifySession]);

  function signOut() {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(ACTOR_STORAGE_KEY);
    setToken(null);
    setActor("");
    setIdentity(null);
  }

  if (!token || !identity) {
    return (
      <div className="max-w-xl rounded-2xl border border-border bg-surface p-6 shadow-[var(--elev-2)] sm:p-8">
        <Badge tone="primary">Organising Committee Auth</Badge>
        <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground">
          Sign in to Admin Mission Control
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Enter your <code className="font-mono text-primary">ADMIN_API_TOKEN</code> (with your name for the audit log) or a named token from{" "}
          <code className="font-mono text-primary">ADMIN_TOKENS</code>. Credentials are kept in this browser tab only.
        </p>

        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!tokenInput.trim()) {
              setAuthError("Enter your admin bearer token.");
              return;
            }
            void verifySession(tokenInput.trim(), actorInput.trim());
          }}
        >
          <div>
            <label htmlFor="admin-token" className="block text-sm font-medium text-foreground">
              Admin Token
            </label>
            <input
              id="admin-token"
              type="password"
              autoComplete="off"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Paste ADMIN_API_TOKEN or named token…"
              className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground"
            />
          </div>

          <div>
            <label htmlFor="admin-actor" className="block text-sm font-medium text-foreground">
              Your Name (required when using shared ADMIN_API_TOKEN)
            </label>
            <input
              id="admin-actor"
              type="text"
              value={actorInput}
              onChange={(e) => setActorInput(e.target.value)}
              placeholder="e.g. Vedendra Vardhan"
              className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>

          {authError ? (
            <p role="alert" className="text-xs text-danger">
              {authError}
            </p>
          ) : null}

          <Button3D type="submit" disabled={verifying}>
            {verifying ? "Verifying…" : "Enter Admin Portal"}
          </Button3D>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div>
          <p className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-primary">
            Signed in as Organising Committee
          </p>
          <p className="mt-1 text-xl font-semibold text-foreground">
            {identity.actor}{" "}
            <Badge tone="primary" className="ml-2">
              role: {identity.role}
            </Badge>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button href="/judge" size="sm" variant="secondary">
            Open Judging Portal
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>

      <div role="tablist" aria-label="Admin Portal sections" className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "rounded-md border px-4 py-2 text-sm font-medium transition-colors",
              tab === item.id
                ? "border-primary bg-primary-soft text-primary"
                : "border-border bg-surface text-muted hover:border-border-strong hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div>
        {tab === "cms" ? <WebsiteCmsPanel token={token} actor={actor} /> : null}
        {tab === "registrations" ? <RegistrationsPanel token={token} actor={actor} /> : null}
        {tab === "judges" ? <JudgesAiPanel token={token} actor={actor} /> : null}
        {tab === "operations" ? <OperationsPanel token={token} actor={actor} /> : null}
      </div>
    </div>
  );
}
