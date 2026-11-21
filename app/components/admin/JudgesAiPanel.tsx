"use client";

import { useCallback, useEffect, useState } from "react";
import { adminRequest } from "@/app/services/api";
import type { AiUsageReport } from "@/app/types/api";
import { useToast } from "../effects/ToastProvider";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Button3D } from "../ui/Button3D";
import { Callout } from "../ui/Callout";

interface JudgeRow {
  id: string;
  name: string;
  role: string;
  tracks: string[];
  active: boolean;
  created_at: string;
}

interface TeamOption {
  id: string;
  team_code: string | null;
  team_name: string;
  track: string;
}

const inputCls =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground";

export function JudgesAiPanel({
  token,
  actor,
}: {
  token: string;
  actor: string;
}) {
  const { toast } = useToast();
  const [judges, setJudges] = useState<JudgeRow[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [reports, setReports] = useState<(AiUsageReport & { teamName?: string; track?: string })[]>([]);
  const [loading, setLoading] = useState(true);

  // Create Judge form
  const [jName, setJName] = useState("");
  const [jRole, setJRole] = useState<"judge" | "chair" | "moderator" | "grand_jury">("judge");
  const [jBeginner, setJBeginner] = useState(true);
  const [jAdvanced, setJAdvanced] = useState(true);
  const [createdKey, setCreatedKey] = useState<{ name: string; role: string; key: string } | null>(null);
  const [creatingJudge, setCreatingJudge] = useState(false);

  // AI Analysis form
  const [aiTeamId, setAiTeamId] = useState("");
  const [aiMode, setAiMode] = useState<"auto" | "manual">("auto");
  const [aiReadme, setAiReadme] = useState("");
  const [aiCode, setAiCode] = useState("");
  const [aiOverall, setAiOverall] = useState("25");
  const [aiCodePct, setAiCodePct] = useState("");
  const [aiReportPct, setAiReportPct] = useState("");
  const [aiTools, setAiTools] = useState("");
  const [aiLogPresent, setAiLogPresent] = useState(true);
  const [aiUndeclared, setAiUndeclared] = useState(false);
  const [aiSummary, setAiSummary] = useState("");
  const [runningAi, setRunningAi] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [jRes, tRes, aRes] = await Promise.all([
      adminRequest<{ judges: JudgeRow[] }>(token, actor, "GET", "/api/admin/judges"),
      adminRequest<{ registrations: TeamOption[] }>(token, actor, "GET", "/api/admin/registrations?limit=200"),
      adminRequest<{ reports: (AiUsageReport & { teamName?: string; track?: string })[] }>(
        token,
        actor,
        "GET",
        "/api/admin/ai-analysis",
      ),
    ]);
    setLoading(false);
    if (jRes.ok) setJudges(jRes.data.judges);
    if (tRes.ok) {
      setTeams(tRes.data.registrations);
      if (!aiTeamId && tRes.data.registrations[0]) {
        setAiTeamId(tRes.data.registrations[0].id);
      }
    }
    if (aRes.ok) setReports(aRes.data.reports);
  }, [token, actor, aiTeamId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createJudge(e: React.FormEvent) {
    e.preventDefault();
    const tracks: string[] = [];
    if (jBeginner) tracks.push("Beginner");
    if (jAdvanced) tracks.push("Advanced");

    setCreatingJudge(true);
    const res = await adminRequest<{ id: string; name: string; role: string; key: string }>(
      token,
      actor,
      "POST",
      "/api/admin/judges",
      { name: jName.trim(), role: jRole, tracks },
    );
    setCreatingJudge(false);
    if (!res.ok) {
      toast({ title: "Could not create judge", description: res.message, tone: "warning" });
      return;
    }
    setCreatedKey({ name: res.data.name, role: res.data.role, key: res.data.key });
    setJName("");
    toast({ title: "Judge created", description: "Copy their one-time key below.", tone: "success" });
    await load();
  }

  async function autoAssign(stage: 1 | 2, track?: "Beginner" | "Advanced") {
    const res = await adminRequest<{ assigned?: number }>(
      token,
      actor,
      "POST",
      "/api/admin/assignments",
      { stage, ...(track ? { track } : {}) },
    );
    if (!res.ok) {
      toast({ title: "Assignment failed", description: res.message, tone: "warning" });
      return;
    }
    toast({ title: "Judges assigned", description: `Stage ${stage}${track ? ` (${track})` : ""} assignments updated.`, tone: "success" });
  }

  async function runAiAnalysis(e: React.FormEvent) {
    e.preventDefault();
    if (!aiTeamId) {
      toast({ title: "Select a team first", tone: "warning" });
      return;
    }
    setRunningAi(true);
    const payload =
      aiMode === "auto"
        ? { teamId: aiTeamId, mode: "auto", readmeText: aiReadme, codeSnippet: aiCode }
        : {
            teamId: aiTeamId,
            mode: "manual",
            overallAiPercent: Number(aiOverall),
            codeAiPercent: aiCodePct === "" ? null : Number(aiCodePct),
            reportAiPercent: aiReportPct === "" ? null : Number(aiReportPct),
            declaredAiTools: aiTools,
            declaredAiLogPresent: aiLogPresent,
            undeclaredAiSuspected: aiUndeclared,
            summary: aiSummary,
          };

    const res = await adminRequest<AiUsageReport>(
      token,
      actor,
      "POST",
      "/api/admin/ai-analysis",
      payload,
    );
    setRunningAi(false);
    if (!res.ok) {
      toast({ title: "AI analysis failed", description: res.message, tone: "warning" });
      return;
    }
    toast({
      title: "AI usage report saved",
      description: `Recorded ${res.data.overallAiPercent}% AI usage (${res.data.riskLevel} risk). Visible in the Judging Portal.`,
      tone: "success",
    });
    await load();
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="space-y-8">
      {/* Judges Management */}
      <section className="space-y-5 rounded-xl border border-border bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-primary">
              Judging Panel Management
            </p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">
              Judges &amp; Auto-Assignments ({judges.length})
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => void autoAssign(1, "Beginner")}>
              Auto-Assign Stage 1 (Beginner)
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => void autoAssign(1, "Advanced")}>
              Auto-Assign Stage 1 (Advanced)
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => void autoAssign(2)}>
              Auto-Assign Stage 2 (Finals)
            </Button>
          </div>
        </div>

        {createdKey ? (
          <Callout title={`Judge Key Issued for ${createdKey.name} (${createdKey.role})`} tone="success">
            <p className="text-xs">
              Copy and send this private sign-in link to the judge now — the raw key is never shown again:
            </p>
            <p className="mt-2 break-all rounded-md border border-border bg-background p-2 font-mono text-xs text-primary">
              {origin}/judge#key={createdKey.key}
            </p>
            <p className="mt-1 font-mono text-xs text-muted">Raw Key: {createdKey.key}</p>
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard?.writeText(`${origin}/judge#key=${createdKey.key}`);
                  toast({ title: "Judge sign-in link copied", tone: "success" });
                }}
              >
                Copy Sign-In Link
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setCreatedKey(null)}>
                Dismiss
              </Button>
            </div>
          </Callout>
        ) : null}

        <form onSubmit={(e) => void createJudge(e)} className="grid gap-3 rounded-xl border border-border bg-background p-4 sm:grid-cols-[1.5fr_1fr_auto_auto]">
          <div>
            <label className="block text-xs text-muted">Judge Full Name</label>
            <input
              required
              className={inputCls}
              value={jName}
              onChange={(e) => setJName(e.target.value)}
              placeholder="Dr. A. Nair"
            />
          </div>
          <div>
            <label className="block text-xs text-muted">Role</label>
            <select
              className={inputCls}
              value={jRole}
              onChange={(e) => setJRole(e.target.value as typeof jRole)}
            >
              <option value="judge">Stage 1 Judge</option>
              <option value="chair">Track Chair</option>
              <option value="moderator">Moderator</option>
              <option value="grand_jury">Grand Jury (Stage 2 Finals)</option>
            </select>
          </div>
          <div className="flex items-end gap-3 pb-2 text-xs text-foreground">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={jBeginner}
                onChange={(e) => setJBeginner(e.target.checked)}
                className="accent-primary"
              />
              Beginner
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={jAdvanced}
                onChange={(e) => setJAdvanced(e.target.checked)}
                className="accent-primary"
              />
              Advanced
            </label>
          </div>
          <div className="flex items-end">
            <Button3D type="submit" size="sm" disabled={creatingJudge}>
              {creatingJudge ? "Creating…" : "Create Judge"}
            </Button3D>
          </div>
        </form>

        {!loading && judges.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-border bg-background">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border font-mono uppercase tracking-[0.12em] text-muted">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Tracks</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {judges.map((j) => (
                  <tr key={j.id}>
                    <td className="px-3 py-2 font-medium text-foreground">{j.name}</td>
                    <td className="px-3 py-2 font-mono text-primary">{j.role}</td>
                    <td className="px-3 py-2 text-muted">{j.tracks.join(", ") || "Finals"}</td>
                    <td className="px-3 py-2">
                      <Badge tone={j.active ? "success" : "neutral"}>{j.active ? "Active" : "Inactive"}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {/* AI Usage Analysis Manager */}
      <section className="space-y-5 rounded-xl border border-border bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-primary">
              Submission AI Usage Telemetry
            </p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">
              Run or Record AI Usage Reports (Visible to Judges)
            </h3>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={aiMode === "auto" ? "primary" : "secondary"}
              onClick={() => setAiMode("auto")}
            >
              Auto Scan Submission
            </Button>
            <Button
              type="button"
              size="sm"
              variant={aiMode === "manual" ? "primary" : "secondary"}
              onClick={() => setAiMode("manual")}
            >
              Record External Detector %
            </Button>
          </div>
        </div>

        <form onSubmit={(e) => void runAiAnalysis(e)} className="space-y-4 rounded-xl border border-border bg-background p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-muted">Select Team</label>
              <select
                className={inputCls}
                value={aiTeamId}
                onChange={(e) => setAiTeamId(e.target.value)}
              >
                <option value="">Choose a team…</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.team_code ? `[${t.team_code}] ` : ""}
                    {t.team_name} ({t.track})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {aiMode === "auto" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-muted">README / AI-Use Log Text (optional — auto-scans uploaded PDF too)</label>
                <textarea
                  rows={4}
                  className={inputCls}
                  value={aiReadme}
                  onChange={(e) => setAiReadme(e.target.value)}
                  placeholder="Paste team README.md to check declared AI tools…"
                />
              </div>
              <div>
                <label className="block text-xs text-muted">Repository Code Sample (optional)</label>
                <textarea
                  rows={4}
                  className={inputCls}
                  value={aiCode}
                  onChange={(e) => setAiCode(e.target.value)}
                  placeholder="Paste key source files for code AI-marker scan…"
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs text-muted">Overall AI % (0–100)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  className={inputCls}
                  value={aiOverall}
                  onChange={(e) => setAiOverall(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-muted">Code AI % (optional)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  className={inputCls}
                  value={aiCodePct}
                  onChange={(e) => setAiCodePct(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-muted">Report AI % (optional)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  className={inputCls}
                  value={aiReportPct}
                  onChange={(e) => setAiReportPct(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-muted">Declared AI Tools (comma-separated)</label>
                <input
                  className={inputCls}
                  value={aiTools}
                  onChange={(e) => setAiTools(e.target.value)}
                  placeholder="ChatGPT, GitHub Copilot, Claude"
                />
              </div>
              <div className="flex flex-col justify-end gap-1.5 text-xs text-foreground">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={aiLogPresent}
                    onChange={(e) => setAiLogPresent(e.target.checked)}
                    className="accent-primary"
                  />
                  README AI-Use Log Present
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={aiUndeclared}
                    onChange={(e) => setAiUndeclared(e.target.checked)}
                    className="accent-danger"
                  />
                  Flag Undeclared AI Suspected
                </label>
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs text-muted">Summary / Auditor Notes</label>
                <input
                  className={inputCls}
                  value={aiSummary}
                  onChange={(e) => setAiSummary(e.target.value)}
                  placeholder="Summary visible to judges in the Judging Portal…"
                />
              </div>
            </div>
          )}

          <Button3D type="submit" size="sm" disabled={runningAi}>
            {runningAi ? "Saving AI Report…" : aiMode === "auto" ? "Run Automated AI Scan" : "Save AI Usage Report"}
          </Button3D>
        </form>

        {reports.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-border bg-background">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border font-mono uppercase tracking-[0.12em] text-muted">
                <tr>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Overall AI %</th>
                  <th className="px-3 py-2">Code / Report</th>
                  <th className="px-3 py-2">Risk</th>
                  <th className="px-3 py-2">Declared Tools</th>
                  <th className="px-3 py-2">Undeclared Flag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {reports.map((r) => (
                  <tr key={r.teamId ?? r.teamCode}>
                    <td className="px-3 py-2 font-medium text-foreground">
                      {r.teamCode ? `${r.teamCode} · ` : ""}
                      {r.teamName ?? r.teamId}
                    </td>
                    <td className="px-3 py-2 font-mono font-bold text-foreground">
                      {r.overallAiPercent}%
                    </td>
                    <td className="px-3 py-2 font-mono text-muted">
                      {r.codeAiPercent ?? "—"}% / {r.reportAiPercent ?? "—"}%
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        tone={
                          r.riskLevel === "high"
                            ? "danger"
                            : r.riskLevel === "moderate"
                              ? "warning"
                              : "success"
                        }
                      >
                        {r.riskLevel}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {r.declaredAiTools.join(", ") || "None"}
                    </td>
                    <td className="px-3 py-2">
                      {r.undeclaredAiSuspected ? (
                        <Badge tone="danger">Suspected</Badge>
                      ) : (
                        <span className="text-muted">Clear</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
