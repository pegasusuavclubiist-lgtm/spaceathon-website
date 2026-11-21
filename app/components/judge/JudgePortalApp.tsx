"use client";

import { useCallback, useEffect, useState } from "react";
import { judgeRequest } from "@/app/services/api";
import type { AiUsageReport } from "@/app/types/api";
import { useToast } from "../effects/ToastProvider";
import { Badge, type BadgeTone } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Button3D } from "../ui/Button3D";
import { Callout } from "../ui/Callout";
import { cn } from "../ui/cn";

const SESSION_KEY = "kosmodrome_judge_key";
const KEY_PATTERN = /^kmj_[\w-]{20,80}$/;

interface JudgeAssignment {
  teamCode: string;
  track: "Beginner" | "Advanced";
  stage: 1 | 2;
  moderation: boolean;
  scored: boolean;
  aiUsage: {
    overallAiPercent: number;
    riskLevel: string;
    undeclaredAiSuspected: boolean;
    declaredAiTools: string[];
  } | null;
}

interface JudgeProfile {
  id: string;
  name: string;
  role: "judge" | "chair" | "moderator" | "grand_jury";
  tracks: string[];
}

interface SubmissionFile {
  item: string;
  sha256: string;
  size: number;
  contentType: string;
  url: string;
}

interface JudgeSubmissionDetail {
  teamCode: string;
  track: "Beginner" | "Advanced";
  frozen: boolean;
  manifestSha256: string | null;
  repo: { url: string; commitSha: string } | null;
  files: SubmissionFile[];
  aiUsage: AiUsageReport | null;
}

interface RubricCriterion {
  key: string;
  label: string;
  judgeMax: number;
  scriptMax?: number;
}

const BEGINNER_RUBRIC: RubricCriterion[] = [
  { key: "problem_understanding", label: "Problem understanding and approach", judgeMax: 15 },
  { key: "technical_implementation", label: "Technical implementation (judge portion)", judgeMax: 10, scriptMax: 15 },
  { key: "domain_accuracy", label: "Space-domain accuracy", judgeMax: 15 },
  { key: "innovation", label: "Innovation and creativity", judgeMax: 10 },
  { key: "code_quality", label: "Code quality and documentation", judgeMax: 10 },
  { key: "demo_communication", label: "Demo and communication", judgeMax: 15 },
  { key: "process_learning", label: "Process and learning", judgeMax: 10 },
];

const ADVANCED_RUBRIC: RubricCriterion[] = [
  { key: "technical_depth", label: "Technical depth and engineering rigour", judgeMax: 25 },
  { key: "innovation", label: "Innovation and novelty", judgeMax: 15 },
  { key: "domain_correctness", label: "Domain correctness and mission relevance", judgeMax: 15 },
  { key: "system_design", label: "System design and feasibility", judgeMax: 10 },
  { key: "reproducibility", label: "Reproducibility and code quality", judgeMax: 5 },
  { key: "report_demo", label: "Report and demo", judgeMax: 10 },
];

const FINALS_RUBRIC: RubricCriterion[] = [
  { key: "technical_defence", label: "Technical defence and viva", judgeMax: 40 },
  { key: "pitch_demo", label: "Pitch and live demo", judgeMax: 30 },
  { key: "impact_feasibility", label: "Impact and feasibility", judgeMax: 20 },
  { key: "individual_understanding", label: "Individual understanding", judgeMax: 10 },
];

function rubricFor(track: "Beginner" | "Advanced", stage: 1 | 2): RubricCriterion[] {
  if (stage === 2) return FINALS_RUBRIC;
  return track === "Beginner" ? BEGINNER_RUBRIC : ADVANCED_RUBRIC;
}

function bandOf(score: number, max: number): { label: string; tone: BadgeTone } {
  const pct = max > 0 ? (score / max) * 100 : 0;
  if (pct >= 90) return { label: "Exceptional", tone: "success" };
  if (pct >= 70) return { label: "Strong", tone: "primary" };
  if (pct >= 40) return { label: "Adequate", tone: "warning" };
  return { label: "Weak", tone: "danger" };
}

function riskTone(risk: string): BadgeTone {
  if (risk === "high") return "danger";
  if (risk === "moderate") return "warning";
  return "success";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function JudgePortalApp() {
  const { toast } = useToast();
  const [judgeKey, setJudgeKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [keyError, setKeyError] = useState("");

  const [judge, setJudge] = useState<JudgeProfile | null>(null);
  const [assignments, setAssignments] = useState<JudgeAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selected, setSelected] = useState<JudgeAssignment | null>(null);
  const [submission, setSubmission] = useState<JudgeSubmissionDetail | null>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);

  // On-demand AI scan drawer
  const [showScanner, setShowScanner] = useState(false);
  const [scanReadme, setScanReadme] = useState("");
  const [scanCode, setScanCode] = useState("");
  const [scanning, setScanning] = useState(false);

  // Score sheet state
  const [scores, setScores] = useState<Record<string, string>>({});
  const [justifications, setJustifications] = useState<Record<string, string>>({});
  const [comment, setComment] = useState("");
  const [submittingScore, setSubmittingScore] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    const match = /key=(kmj_[\w-]+)/.exec(hash);
    if (match?.[1]) {
      sessionStorage.setItem(SESSION_KEY, match[1]);
      window.history.replaceState(null, "", window.location.pathname);
      setJudgeKey(match[1]);
      return;
    }
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) setJudgeKey(stored);
  }, []);

  const loadAssignments = useCallback(async () => {
    if (!judgeKey) return;
    setLoading(true);
    setLoadError(null);
    const res = await judgeRequest<{
      judge: JudgeProfile;
      assignments: JudgeAssignment[];
    }>(judgeKey, "GET", "/api/judge/assignments");
    setLoading(false);

    if (!res.ok) {
      setLoadError(res.message);
      if (res.status === 401) {
        sessionStorage.removeItem(SESSION_KEY);
        setJudgeKey(null);
      }
      return;
    }
    setJudge(res.data.judge);
    setAssignments(res.data.assignments);
    if (res.data.assignments.length > 0) {
      setSelected((prev) =>
        prev
          ? res.data.assignments.find(
              (a) => a.teamCode === prev.teamCode && a.stage === prev.stage,
            ) ?? res.data.assignments[0]
          : res.data.assignments[0],
      );
    }
  }, [judgeKey]);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  const loadSubmission = useCallback(
    async (assignment: JudgeAssignment) => {
      if (!judgeKey) return;
      setSubLoading(true);
      setSubError(null);
      setSubmission(null);
      setScores({});
      setJustifications({});
      setComment("");

      const res = await judgeRequest<JudgeSubmissionDetail>(
        judgeKey,
        "GET",
        `/api/judge/submissions/${encodeURIComponent(assignment.teamCode)}`,
      );
      setSubLoading(false);
      if (!res.ok) {
        setSubError(res.message);
        return;
      }
      setSubmission(res.data);
    },
    [judgeKey],
  );

  useEffect(() => {
    if (selected) {
      void loadSubmission(selected);
    }
  }, [selected, loadSubmission]);

  async function runAiScan() {
    if (!judgeKey || !selected) return;
    setScanning(true);
    const res = await judgeRequest<AiUsageReport>(
      judgeKey,
      "POST",
      `/api/judge/submissions/${encodeURIComponent(selected.teamCode)}/ai-scan`,
      {
        readmeText: scanReadme,
        codeSnippet: scanCode,
      },
    );
    setScanning(false);
    if (!res.ok) {
      toast({ title: "AI scan failed", description: res.message, tone: "warning" });
      return;
    }
    setSubmission((prev) => (prev ? { ...prev, aiUsage: res.data } : prev));
    setAssignments((prev) =>
      prev.map((a) =>
        a.teamCode === selected.teamCode
          ? {
              ...a,
              aiUsage: {
                overallAiPercent: res.data.overallAiPercent,
                riskLevel: res.data.riskLevel,
                undeclaredAiSuspected: res.data.undeclaredAiSuspected,
                declaredAiTools: res.data.declaredAiTools,
              },
            }
          : a,
      ),
    );
    setShowScanner(false);
    toast({
      title: "AI usage scan complete",
      description: `Estimated ${res.data.overallAiPercent}% AI-assisted content (${res.data.riskLevel} risk).`,
      tone: "success",
    });
  }

  async function submitScoreSheet(event: React.FormEvent) {
    event.preventDefault();
    if (!judgeKey || !selected) return;
    const rubric = rubricFor(selected.track, selected.stage);
    const numericScores: Record<string, number> = {};
    const trimmedJust: Record<string, string> = {};

    for (const crit of rubric) {
      const val = Number(scores[crit.key]);
      if (scores[crit.key] === undefined || scores[crit.key] === "" || !Number.isFinite(val)) {
        toast({
          title: "Missing score",
          description: `Enter a score for "${crit.label}".`,
          tone: "warning",
        });
        return;
      }
      if (val < 0 || val > crit.judgeMax) {
        toast({
          title: "Score out of range",
          description: `"${crit.label}" must be between 0 and ${crit.judgeMax}.`,
          tone: "warning",
        });
        return;
      }
      const just = (justifications[crit.key] ?? "").trim();
      if (!just) {
        toast({
          title: "Missing justification",
          description: `Add a one-line justification for "${crit.label}".`,
          tone: "warning",
        });
        return;
      }
      numericScores[crit.key] = val;
      trimmedJust[crit.key] = just;
    }

    setSubmittingScore(true);
    const res = await judgeRequest<{ id: number; total: number }>(
      judgeKey,
      "POST",
      "/api/judge/scores",
      {
        teamCode: selected.teamCode,
        stage: selected.stage,
        scores: numericScores,
        justifications: trimmedJust,
        comment: comment.trim() || undefined,
      },
    );
    setSubmittingScore(false);

    if (!res.ok) {
      toast({
        title: "Could not submit score sheet",
        description: res.message,
        tone: "warning",
      });
      return;
    }

    toast({
      title: "Score sheet locked",
      description: `Recorded ${res.data.total} points for ${selected.teamCode}.`,
      tone: "success",
    });
    await loadAssignments();
  }

  function signOut() {
    sessionStorage.removeItem(SESSION_KEY);
    setJudgeKey(null);
    setJudge(null);
    setAssignments([]);
    setSelected(null);
    setSubmission(null);
  }

  if (!judgeKey) {
    return (
      <div className="max-w-xl rounded-2xl border border-border bg-surface p-6 shadow-[var(--elev-2)] sm:p-8">
        <Badge tone="primary">Judge authentication</Badge>
        <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground">
          Sign in with your Judge Key
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          The Organising Committee issues each judge a personal key starting
          with <code className="font-mono text-primary">kmj_</code>. Your key is
          stored in this browser tab only.
        </p>
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const k = keyInput.trim();
            if (!KEY_PATTERN.test(k)) {
              setKeyError("Invalid judge key format. Keys start with kmj_.");
              return;
            }
            setKeyError("");
            sessionStorage.setItem(SESSION_KEY, k);
            setJudgeKey(k);
          }}
        >
          <div>
            <label htmlFor="judge-key" className="block text-sm font-medium text-foreground">
              Judge Key
            </label>
            <input
              id="judge-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="kmj_…"
              className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground"
            />
            {keyError ? <p className="mt-1 text-xs text-danger">{keyError}</p> : null}
          </div>
          <Button3D type="submit">Open Judging Portal</Button3D>
        </form>
      </div>
    );
  }

  if (loading && !judge) {
    return <p className="text-sm text-muted">Loading your judging queue…</p>;
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <Callout title="Could not load Judging Portal" tone="warning">
          <p>{loadError}</p>
        </Callout>
        <div className="flex gap-3">
          <Button3D type="button" onClick={() => void loadAssignments()}>
            Retry
          </Button3D>
          <Button type="button" variant="secondary" onClick={signOut}>
            Use a different key
          </Button>
        </div>
      </div>
    );
  }

  const scoredCount = assignments.filter((a) => a.scored).length;
  const rubric = selected ? rubricFor(selected.track, selected.stage) : [];
  const runningTotal = rubric.reduce((sum, crit) => {
    const v = Number(scores[crit.key]);
    return sum + (Number.isFinite(v) ? v : 0);
  }, 0);
  const rubricMax = rubric.reduce((sum, c) => sum + c.judgeMax, 0);

  return (
    <div className="space-y-6">
      {/* Top Judge Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div>
          <p className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-primary">
            {judge?.role.replace("_", " ")} · {judge?.tracks.join(", ") || "All tracks"}
          </p>
          <p className="mt-1 text-xl font-semibold text-foreground">
            {judge?.name ?? "Judge"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={scoredCount === assignments.length && assignments.length > 0 ? "success" : "primary"}>
            {scoredCount} / {assignments.length} scored
          </Badge>
          <Button type="button" size="sm" variant="secondary" onClick={() => void loadAssignments()}>
            Refresh
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>

      {assignments.length === 0 ? (
        <Callout title="No submissions assigned yet" tone="primary">
          <p>
            Once the Organising Committee assigns teams to you from the Admin
            Portal, they will appear here automatically.
          </p>
        </Callout>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          {/* Left Queue */}
          <aside className="space-y-2">
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-muted">
              Assigned teams ({assignments.length})
            </p>
            <ul className="space-y-2">
              {assignments.map((item) => {
                const isSelected =
                  selected?.teamCode === item.teamCode &&
                  selected?.stage === item.stage;
                return (
                  <li key={`${item.teamCode}-${item.stage}`}>
                    <button
                      type="button"
                      onClick={() => setSelected(item)}
                      className={cn(
                        "w-full rounded-xl border p-3.5 text-left transition-colors",
                        isSelected
                          ? "border-primary bg-primary-soft/50"
                          : "border-border bg-surface hover:border-border-strong",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-base font-bold text-foreground">
                          {item.teamCode}
                        </span>
                        <Badge tone={item.scored ? "success" : "warning"}>
                          {item.scored ? "Scored" : "Pending"}
                        </Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <span>{item.track}</span>
                        <span>·</span>
                        <span>Stage {item.stage}</span>
                        {item.moderation ? (
                          <Badge tone="accent">Moderation</Badge>
                        ) : null}
                      </div>
                      <div className="mt-2">
                        {item.aiUsage ? (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[0.68rem]",
                              item.aiUsage.riskLevel === "high"
                                ? "border-danger/60 bg-danger-soft text-danger"
                                : item.aiUsage.riskLevel === "moderate"
                                  ? "border-warning/60 bg-warning-soft text-warning"
                                  : "border-success/60 bg-success-soft text-success",
                            )}
                          >
                            AI Usage: {item.aiUsage.overallAiPercent}% ({item.aiUsage.riskLevel})
                          </span>
                        ) : (
                          <span className="font-mono text-[0.68rem] text-muted">
                            AI scan: Not run yet
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* Right Workspace */}
          {selected ? (
            <div className="space-y-6">
              {/* Submission Header & Files */}
              <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-primary">
                      Blind Evaluation Package · Stage {selected.stage}
                    </p>
                    <h2 className="mt-1 text-2xl font-bold text-foreground">
                      {selected.teamCode} — {selected.track} Track
                    </h2>
                  </div>
                  <Badge tone={selected.scored ? "success" : "primary"}>
                    {selected.scored ? "Score sheet locked" : "Awaiting your score"}
                  </Badge>
                </div>

                {subLoading ? (
                  <p className="mt-4 text-sm text-muted">Loading submission package…</p>
                ) : subError ? (
                  <div className="mt-4">
                    <Callout title="Submission package unavailable" tone="warning">
                      <p>{subError}</p>
                    </Callout>
                  </div>
                ) : submission ? (
                  <div className="mt-5 space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-border bg-background p-3">
                        <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-muted">
                          Repository Snapshot
                        </p>
                        {submission.repo ? (
                          <div className="mt-1">
                            <a
                              href={submission.repo.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="break-all text-sm font-medium text-primary underline underline-offset-4"
                            >
                              {submission.repo.url}
                            </a>
                            <p className="mt-0.5 font-mono text-xs text-muted">
                              Commit: {submission.repo.commitSha}
                            </p>
                          </div>
                        ) : (
                          <p className="mt-1 text-sm text-muted">No repository snapshot linked.</p>
                        )}
                      </div>

                      <div className="rounded-lg border border-border bg-background p-3">
                        <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-muted">
                          Manifest SHA-256
                        </p>
                        <p className="mt-1 break-all font-mono text-xs text-foreground">
                          {submission.manifestSha256 ?? "Not frozen yet"}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted">
                        Uploaded Submission Files
                      </p>
                      {submission.files.length === 0 ? (
                        <p className="mt-2 text-sm text-muted">No files uploaded yet.</p>
                      ) : (
                        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                          {submission.files.map((file) => (
                            <li
                              key={file.item}
                              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3.5 py-2.5"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium capitalize text-foreground">
                                  {file.item}
                                </p>
                                <p className="font-mono text-[0.68rem] text-muted">
                                  {formatBytes(file.size)} · {file.contentType}
                                </p>
                              </div>
                              <a
                                href={file.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0 rounded-md border border-primary bg-primary-soft px-3 py-1 text-xs font-medium text-primary hover:bg-primary hover:text-primary-foreground"
                              >
                                Download
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                ) : null}
              </section>

              {/* AI Usage Transparency Panel */}
              <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-primary">
                      AI Transparency &amp; Integrity Telemetry
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-foreground">
                      Estimated AI Usage in Submission
                    </h3>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setShowScanner((v) => !v)}
                  >
                    {showScanner ? "Close AI Scanner" : "Run / Refresh AI Scan"}
                  </Button>
                </div>

                {showScanner ? (
                  <div className="mt-4 space-y-3 rounded-xl border border-primary/40 bg-background p-4">
                    <p className="text-xs leading-relaxed text-muted">
                      Running a scan automatically inspects the team&apos;s uploaded PDF report. You can also paste their README (for AI-use log detection) or a code sample from their repo below.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-foreground">
                          README / AI-Use Log (optional)
                        </label>
                        <textarea
                          rows={4}
                          value={scanReadme}
                          onChange={(e) => setScanReadme(e.target.value)}
                          placeholder="Paste README.md content here…"
                          className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-foreground"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-foreground">
                          Source Code Sample (optional)
                        </label>
                        <textarea
                          rows={4}
                          value={scanCode}
                          onChange={(e) => setScanCode(e.target.value)}
                          placeholder="Paste key source files here…"
                          className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-foreground"
                        />
                      </div>
                    </div>
                    <Button3D
                      type="button"
                      size="sm"
                      disabled={scanning}
                      onClick={() => void runAiScan()}
                    >
                      {scanning ? "Scanning submission…" : "Analyze AI Usage Now"}
                    </Button3D>
                  </div>
                ) : null}

                {submission?.aiUsage ? (
                  <div className="mt-5 space-y-5">
                    {submission.aiUsage.undeclaredAiSuspected ? (
                      <Callout title="Potential Undeclared AI Usage Detected" tone="danger">
                        <p>
                          High AI-assisted signals were detected without a matching README AI-use log. Per rulebook Section 13, undeclared AI use materially affecting the work carries a -5 to -10 point OC penalty.
                        </p>
                      </Callout>
                    ) : null}

                    {/* Big KPI Meters */}
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="rounded-xl border border-border bg-background p-4">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted">
                            Overall AI Estimate
                          </span>
                          <Badge tone={riskTone(submission.aiUsage.riskLevel)}>
                            {submission.aiUsage.riskLevel} risk
                          </Badge>
                        </div>
                        <p className="mt-2 font-mono text-3xl font-extrabold text-foreground">
                          {submission.aiUsage.overallAiPercent}%
                        </p>
                        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              submission.aiUsage.riskLevel === "high"
                                ? "bg-danger"
                                : submission.aiUsage.riskLevel === "moderate"
                                  ? "bg-warning"
                                  : "bg-success",
                            )}
                            style={{ width: `${Math.min(100, submission.aiUsage.overallAiPercent)}%` }}
                          />
                        </div>
                      </div>

                      <div className="rounded-xl border border-border bg-background p-4">
                        <span className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted">
                          Code vs Report Split
                        </span>
                        <div className="mt-3 space-y-2 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-muted">Source Code</span>
                            <span className="font-mono font-semibold text-foreground">
                              {submission.aiUsage.codeAiPercent != null
                                ? `${submission.aiUsage.codeAiPercent}%`
                                : "N/A"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted">Report / Docs</span>
                            <span className="font-mono font-semibold text-foreground">
                              {submission.aiUsage.reportAiPercent != null
                                ? `${submission.aiUsage.reportAiPercent}%`
                                : "N/A"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-border bg-background p-4">
                        <span className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted">
                          AI-Use Log &amp; Tools
                        </span>
                        <div className="mt-2 flex items-center gap-2">
                          <Badge tone={submission.aiUsage.declaredAiLogPresent ? "success" : "warning"}>
                            {submission.aiUsage.declaredAiLogPresent
                              ? "README AI Log Present"
                              : "No AI Log Found"}
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs text-muted">
                          {submission.aiUsage.declaredAiTools.length > 0
                            ? `Declared / detected: ${submission.aiUsage.declaredAiTools.join(", ")}`
                            : "No specific AI tools declared."}
                        </p>
                      </div>
                    </div>

                    <p className="text-sm leading-relaxed text-muted">
                      {submission.aiUsage.summary}
                    </p>

                    {submission.aiUsage.signals.length > 0 ? (
                      <div>
                        <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted">
                          Detected Signals
                        </p>
                        <ul className="mt-2 space-y-1.5 text-xs text-foreground">
                          {submission.aiUsage.signals.map((sig, idx) => (
                            <li key={idx} className="flex gap-2">
                              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                              <span>{sig}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {submission.aiUsage.fileBreakdown.length > 0 ? (
                      <div className="overflow-x-auto rounded-lg border border-border">
                        <table className="w-full text-left text-xs">
                          <thead className="border-b border-border bg-background font-mono uppercase tracking-[0.12em] text-muted">
                            <tr>
                              <th className="px-3 py-2">File</th>
                              <th className="px-3 py-2">Est. AI %</th>
                              <th className="px-3 py-2">Confidence</th>
                              <th className="px-3 py-2">Notes</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {submission.aiUsage.fileBreakdown.map((f, idx) => (
                              <tr key={idx}>
                                <td className="px-3 py-2 font-mono text-foreground">{f.path}</td>
                                <td className="px-3 py-2 font-mono font-semibold text-foreground">
                                  {f.aiPercent}%
                                </td>
                                <td className="px-3 py-2 capitalize text-muted">{f.confidence}</td>
                                <td className="px-3 py-2 text-muted">
                                  {f.signals.join("; ") || "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-muted">
                    No AI usage report has been generated for {selected.teamCode} yet. Click{" "}
                    <strong className="text-foreground">Run / Refresh AI Scan</strong> above to analyze the submission right now.
                  </p>
                )}
              </section>

              {/* Rubric Scoring Sheet */}
              <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-primary">
                      Annex C · Locked Score Sheet
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-foreground">
                      {selected.stage === 2
                        ? "Stage 2 Finals Rubric"
                        : `${selected.track} Track — Stage 1 Rubric`}
                    </h3>
                  </div>
                  <div className="rounded-lg border border-primary/40 bg-primary-soft/40 px-3.5 py-2 font-mono text-sm font-bold text-primary">
                    Total: {runningTotal.toFixed(1)} / {rubricMax}
                  </div>
                </div>

                {selected.scored ? (
                  <div className="mt-4">
                    <Callout title="Score sheet already submitted and locked" tone="success">
                      <p>
                        Your score sheet for {selected.teamCode} (Stage {selected.stage}) is locked in the append-only ledger. Contact the Moderator if a correction is required.
                      </p>
                    </Callout>
                  </div>
                ) : (
                  <form onSubmit={(e) => void submitScoreSheet(e)} className="mt-5 space-y-4">
                    {rubric.map((crit) => {
                      const num = Number(scores[crit.key]);
                      const hasVal = scores[crit.key] !== undefined && scores[crit.key] !== "" && Number.isFinite(num);
                      const band = hasVal ? bandOf(num, crit.judgeMax) : null;
                      return (
                        <div
                          key={crit.key}
                          className="rounded-xl border border-border bg-background p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <label
                              htmlFor={`score-${crit.key}`}
                              className="text-sm font-semibold text-foreground"
                            >
                              {crit.label}
                            </label>
                            <div className="flex items-center gap-2">
                              {band ? <Badge tone={band.tone}>{band.label}</Badge> : null}
                              <span className="font-mono text-xs text-muted">
                                Max {crit.judgeMax} pts
                                {crit.scriptMax ? ` (+${crit.scriptMax} script)` : ""}
                              </span>
                            </div>
                          </div>

                          <div className="mt-3 grid gap-3 sm:grid-cols-[140px_1fr]">
                            <input
                              id={`score-${crit.key}`}
                              type="number"
                              min={0}
                              max={crit.judgeMax}
                              step="0.5"
                              value={scores[crit.key] ?? ""}
                              onChange={(e) =>
                                setScores((prev) => ({ ...prev, [crit.key]: e.target.value }))
                              }
                              placeholder={`0 – ${crit.judgeMax}`}
                              className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-foreground"
                            />
                            <input
                              type="text"
                              maxLength={300}
                              value={justifications[crit.key] ?? ""}
                              onChange={(e) =>
                                setJustifications((prev) => ({
                                  ...prev,
                                  [crit.key]: e.target.value,
                                }))
                              }
                              placeholder="Required one-line justification for this score…"
                              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
                            />
                          </div>
                        </div>
                      );
                    })}

                    <div>
                      <label className="block text-sm font-medium text-foreground">
                        Overall judge comments (optional)
                      </label>
                      <textarea
                        rows={3}
                        maxLength={2000}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Strengths, gaps, viva follow-up questions, or AI usage observations…"
                        className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                      <p className="text-xs text-muted">
                        Score sheets are permanently locked in the audit ledger once submitted.
                      </p>
                      <Button3D type="submit" disabled={submittingScore}>
                        {submittingScore ? "Locking score sheet…" : `Submit Locked Score (${runningTotal.toFixed(1)} / ${rubricMax})`}
                      </Button3D>
                    </div>
                  </form>
                )}
              </section>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
