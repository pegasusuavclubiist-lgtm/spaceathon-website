"use client";

import { useCallback, useEffect, useState } from "react";
import { adminRequest } from "@/app/services/api";
import { useToast } from "../effects/ToastProvider";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";

interface ContactMsg {
  id: string;
  name: string;
  email: string;
  topic: string;
  message: string;
  status: "new" | "in_progress" | "resolved";
  created_at: string;
}

interface AppealRow {
  id: string;
  team_id: string;
  ground: string;
  description: string;
  status: "open" | "upheld" | "rejected";
  decision_note: string | null;
  created_at: string;
}

export function OperationsPanel({
  token,
  actor,
}: {
  token: string;
  actor: string;
}) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ContactMsg[]>([]);
  const [appeals, setAppeals] = useState<AppealRow[]>([]);
  const [busyOp, setBusyOp] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [mRes, aRes] = await Promise.all([
      adminRequest<{ messages: ContactMsg[] }>(token, actor, "GET", "/api/admin/messages?limit=100"),
      adminRequest<{ appeals: AppealRow[] }>(token, actor, "GET", "/api/admin/appeals"),
    ]);
    if (mRes.ok) setMessages(mRes.data.messages ?? []);
    if (aRes.ok) setAppeals(aRes.data.appeals ?? []);
  }, [token, actor]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runOp(label: string, path: string, payload?: unknown) {
    setBusyOp(label);
    const res = await adminRequest<Record<string, unknown>>(token, actor, "POST", path, payload ?? {});
    setBusyOp(null);
    if (!res.ok) {
      toast({ title: `${label} failed`, description: res.message, tone: "warning" });
      return;
    }
    toast({ title: `${label} complete`, tone: "success" });
    await load();
  }

  async function updateMsgStatus(id: string, status: "new" | "in_progress" | "resolved") {
    const res = await adminRequest(token, actor, "PATCH", `/api/admin/messages/${id}`, { status });
    if (!res.ok) {
      toast({ title: "Update failed", description: res.message, tone: "warning" });
      return;
    }
    toast({ title: `Message marked ${status}`, tone: "success" });
    await load();
  }

  async function decideAppeal(id: string, status: "upheld" | "rejected") {
    const note = window.prompt(`Decision note for marking appeal ${status}:`);
    if (!note) return;
    const res = await adminRequest(token, actor, "PATCH", `/api/admin/appeals/${id}`, {
      status,
      decisionNote: note,
    });
    if (!res.ok) {
      toast({ title: "Appeal decision failed", description: res.message, tone: "warning" });
      return;
    }
    toast({ title: `Appeal ${status}`, tone: "success" });
    await load();
  }

  return (
    <div className="space-y-8">
      {/* Event Pipeline Controls */}
      <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
        <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-primary">
          Event Lifecycle Controls
        </p>
        <h3 className="mt-1 text-lg font-semibold text-foreground">
          Submission Freeze, Stage 0 &amp; Results Pipeline
        </h3>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={Boolean(busyOp)}
            onClick={() => void runOp("Freeze Submissions", "/api/admin/submissions/close")}
          >
            Freeze Submissions (T+48)
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={Boolean(busyOp)}
            onClick={() => void runOp("Stage 0 Screening", "/api/admin/stage0")}
          >
            Run Stage 0 Screening
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={Boolean(busyOp)}
            onClick={() => void runOp("Compute Results", "/api/admin/results/compute")}
          >
            Compute Rankings
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={Boolean(busyOp)}
            onClick={() =>
              void runOp("Publish Provisional Results", "/api/admin/results/publish", {
                phase: "provisional",
              })
            }
          >
            Publish Provisional Results
          </Button>
          <Button
            type="button"
            size="sm"
            variant="primary"
            disabled={Boolean(busyOp)}
            onClick={() =>
              void runOp("Publish Final Results", "/api/admin/results/publish", {
                phase: "final",
              })
            }
          >
            Publish Final Results
          </Button>
        </div>
      </section>

      {/* Contact Messages */}
      <section className="space-y-4 rounded-xl border border-border bg-surface p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-foreground">
          Contact Messages ({messages.length})
        </h3>
        {messages.length === 0 ? (
          <p className="text-sm text-muted">No contact messages yet.</p>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => (
              <div key={m.id} className="rounded-lg border border-border bg-background p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-foreground">{m.name}</span>{" "}
                    <span className="font-mono text-xs text-muted">({m.email})</span>{" "}
                    <Badge tone="primary">{m.topic}</Badge>{" "}
                    <Badge tone={m.status === "resolved" ? "success" : m.status === "in_progress" ? "warning" : "neutral"}>
                      {m.status}
                    </Badge>
                  </div>
                  <div className="flex gap-1.5">
                    <Button type="button" size="sm" variant="ghost" onClick={() => void updateMsgStatus(m.id, "in_progress")}>
                      In Progress
                    </Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => void updateMsgStatus(m.id, "resolved")}>
                      Resolve
                    </Button>
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{m.message}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Appeals */}
      <section className="space-y-4 rounded-xl border border-border bg-surface p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-foreground">
          Team Appeals ({appeals.length})
        </h3>
        {appeals.length === 0 ? (
          <p className="text-sm text-muted">No appeals submitted.</p>
        ) : (
          <div className="space-y-3">
            {appeals.map((a) => (
              <div key={a.id} className="rounded-lg border border-border bg-background p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-foreground">{a.team_id}</span>
                    <Badge tone="warning">{a.ground}</Badge>
                    <Badge tone={a.status === "upheld" ? "success" : a.status === "rejected" ? "danger" : "neutral"}>
                      {a.status}
                    </Badge>
                  </div>
                  {a.status === "open" ? (
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="secondary" onClick={() => void decideAppeal(a.id, "upheld")}>
                        Uphold
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => void decideAppeal(a.id, "rejected")}>
                        Reject
                      </Button>
                    </div>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-muted">{a.description}</p>
                {a.decision_note ? (
                  <p className="mt-1 text-xs text-primary">Decision: {a.decision_note}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
