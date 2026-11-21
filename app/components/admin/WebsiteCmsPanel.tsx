"use client";

import { useCallback, useEffect, useState } from "react";
import type { SiteContentBundle, SiteContentSectionKey } from "@/app/content/site-content-types";
import { adminRequest } from "@/app/services/api";
import { useToast } from "../effects/ToastProvider";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Button3D } from "../ui/Button3D";
import { cn } from "../ui/cn";

type CmsTab =
  | "general"
  | "heroStats"
  | "tracks"
  | "timeline"
  | "prizes"
  | "rules"
  | "scoring"
  | "faq"
  | "sponsorsAbout";

const CMS_TABS: Array<{ id: CmsTab; label: string }> = [
  { id: "general", label: "General, Dates & UPI" },
  { id: "heroStats", label: "Stats & Guarantees" },
  { id: "tracks", label: "Tracks" },
  { id: "timeline", label: "Timeline" },
  { id: "prizes", label: "Prizes" },
  { id: "rules", label: "Rules & Fair Play" },
  { id: "scoring", label: "Scoring & Submission" },
  { id: "faq", label: "FAQs" },
  { id: "sponsorsAbout", label: "Sponsors, About & Contact" },
];

const inputCls =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted";

export function WebsiteCmsPanel({
  token,
  actor,
}: {
  token: string;
  actor: string;
}) {
  const { toast } = useToast();
  const [content, setContent] = useState<SiteContentBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cmsTab, setCmsTab] = useState<CmsTab>("general");
  const [jsonMode, setJsonMode] = useState(false);
  const [rawJson, setRawJson] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await adminRequest<{ content: SiteContentBundle }>(
      token,
      actor,
      "GET",
      "/api/admin/site-content",
    );
    setLoading(false);
    if (!res.ok) {
      toast({ title: "Could not load website content", description: res.message, tone: "warning" });
      return;
    }
    setContent(res.data.content);
    setRawJson(JSON.stringify(res.data.content, null, 2));
  }, [token, actor, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSections(sections: Partial<Record<SiteContentSectionKey, unknown>>) {
    setSaving(true);
    const res = await adminRequest<{ saved: string[]; content: SiteContentBundle }>(
      token,
      actor,
      "PUT",
      "/api/admin/site-content",
      { sections },
    );
    setSaving(false);
    if (!res.ok) {
      toast({ title: "Save failed", description: res.message, tone: "warning" });
      return;
    }
    setContent(res.data.content);
    setRawJson(JSON.stringify(res.data.content, null, 2));
    toast({
      title: "Website updated live",
      description: `Saved: ${res.data.saved.join(", ")}. Reload the main website to view changes.`,
      tone: "success",
    });
  }

  async function resetSection(section?: SiteContentSectionKey) {
    setSaving(true);
    const url = section
      ? `/api/admin/site-content?section=${encodeURIComponent(section)}`
      : "/api/admin/site-content";
    const res = await adminRequest<{ content: SiteContentBundle }>(
      token,
      actor,
      "DELETE",
      url,
    );
    setSaving(false);
    if (!res.ok) {
      toast({ title: "Reset failed", description: res.message, tone: "warning" });
      return;
    }
    setContent(res.data.content);
    setRawJson(JSON.stringify(res.data.content, null, 2));
    toast({
      title: "Reset to defaults",
      description: section ? `Restored "${section}" to defaults.` : "Restored all website sections to defaults.",
      tone: "success",
    });
  }

  if (loading || !content) {
    return <p className="text-sm text-muted">Loading website CMS…</p>;
  }

  const g = content.general;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
        <div>
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-primary">
            Live Website Content Management
          </p>
          <p className="mt-0.5 text-sm text-muted">
            Every change saved here is stored in Supabase and rendered live across the main website.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => setJsonMode((v) => !v)}>
            {jsonMode ? "Visual Editor" : "Full JSON Backup / Import"}
          </Button>
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary"
          >
            Preview Website ↗
          </a>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={saving}
            onClick={() => {
              if (window.confirm("Reset ALL website sections back to compiled defaults?")) {
                void resetSection();
              }
            }}
          >
            Reset All
          </Button>
        </div>
      </div>

      {jsonMode ? (
        <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-foreground">Full Website JSON Editor</h3>
            <Button3D
              type="button"
              size="sm"
              disabled={saving}
              onClick={() => {
                try {
                  const parsed = JSON.parse(rawJson) as SiteContentBundle;
                  void saveSections(parsed);
                } catch (err) {
                  toast({
                    title: "Invalid JSON",
                    description: err instanceof Error ? err.message : "Check JSON syntax.",
                    tone: "warning",
                  });
                }
              }}
            >
              {saving ? "Saving…" : "Save Full JSON"}
            </Button3D>
          </div>
          <textarea
            rows={26}
            value={rawJson}
            onChange={(e) => setRawJson(e.target.value)}
            className="w-full rounded-lg border border-border bg-background p-3 font-mono text-xs text-foreground"
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {CMS_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setCmsTab(t.id)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                  cmsTab === t.id
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border bg-surface text-muted hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* 1. General, Dates, Clock & UPI Payment */}
          {cmsTab === "general" ? (
            <div className="space-y-5 rounded-xl border border-border bg-surface p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-foreground">
                  General, Event Dates, Countdown Clock &amp; UPI QR Settings
                </h3>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => void resetSection("general")}>
                    Reset Section
                  </Button>
                  <Button3D
                    type="button"
                    size="sm"
                    disabled={saving}
                    onClick={() => void saveSections({ general: content.general })}
                  >
                    {saving ? "Saving…" : "Save General Settings"}
                  </Button3D>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-muted">Site Name</label>
                  <input
                    className={inputCls}
                    value={g.name}
                    onChange={(e) => setContent({ ...content, general: { ...g, name: e.target.value } })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted">Display Title (Hero)</label>
                  <input
                    className={inputCls}
                    value={g.displayName}
                    onChange={(e) => setContent({ ...content, general: { ...g, displayName: e.target.value } })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted">Year</label>
                  <input
                    type="number"
                    className={inputCls}
                    value={g.year}
                    onChange={(e) => setContent({ ...content, general: { ...g, year: Number(e.target.value) || 2027 } })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted">Tagline</label>
                  <input
                    className={inputCls}
                    value={g.tagline}
                    onChange={(e) => setContent({ ...content, general: { ...g, tagline: e.target.value } })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted">Subtitle Badge</label>
                  <input
                    className={inputCls}
                    value={g.subtitle}
                    onChange={(e) => setContent({ ...content, general: { ...g, subtitle: e.target.value } })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted">Organiser</label>
                  <input
                    className={inputCls}
                    value={g.organiser}
                    onChange={(e) => setContent({ ...content, general: { ...g, organiser: e.target.value } })}
                  />
                </div>

                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="block text-xs font-medium text-muted">Hero Concept Line</label>
                  <input
                    className={inputCls}
                    value={g.conceptLine}
                    onChange={(e) => setContent({ ...content, general: { ...g, conceptLine: e.target.value } })}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-muted">Hero Facts Line</label>
                  <input
                    className={inputCls}
                    value={g.factsLine}
                    onChange={(e) => setContent({ ...content, general: { ...g, factsLine: e.target.value } })}
                  />
                </div>

                <div className="flex items-end">
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={g.registrationOpen}
                      onChange={(e) =>
                        setContent({ ...content, general: { ...g, registrationOpen: e.target.checked } })
                      }
                      className="size-4 accent-primary"
                    />
                    Registration Open on Website
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-medium text-primary">
                    Countdown Clock Target (ISO 8601 IST)
                  </label>
                  <input
                    className={cn(inputCls, "font-mono")}
                    value={g.eventStartISO ?? ""}
                    placeholder="2027-01-17T10:00:00+05:30"
                    onChange={(e) =>
                      setContent({ ...content, general: { ...g, eventStartISO: e.target.value || null } })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-primary">Event Dates Label</label>
                  <input
                    className={inputCls}
                    value={g.eventDatesLabel}
                    placeholder="17–18 January 2027"
                    onChange={(e) =>
                      setContent({ ...content, general: { ...g, eventDatesLabel: e.target.value } })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted">Fee Display Text</label>
                  <input
                    className={inputCls}
                    value={g.registrationFee ?? ""}
                    onChange={(e) =>
                      setContent({ ...content, general: { ...g, registrationFee: e.target.value || null } })
                    }
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-primary">IISTian Fee (₹)</label>
                  <input
                    type="number"
                    className={cn(inputCls, "font-mono")}
                    value={g.feeIist}
                    onChange={(e) =>
                      setContent({ ...content, general: { ...g, feeIist: Number(e.target.value) || 0 } })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-primary">Outsider Fee (₹)</label>
                  <input
                    type="number"
                    className={cn(inputCls, "font-mono")}
                    value={g.feeOutsider}
                    onChange={(e) =>
                      setContent({ ...content, general: { ...g, feeOutsider: Number(e.target.value) || 0 } })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-primary">UPI ID</label>
                  <input
                    className={cn(inputCls, "font-mono")}
                    value={g.upiId}
                    onChange={(e) => setContent({ ...content, general: { ...g, upiId: e.target.value } })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted">UPI Payee Name</label>
                  <input
                    className={inputCls}
                    value={g.upiPayeeName}
                    onChange={(e) =>
                      setContent({ ...content, general: { ...g, upiPayeeName: e.target.value } })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted">QR Image Path / URL</label>
                  <input
                    className={cn(inputCls, "font-mono")}
                    value={g.paymentQrPath}
                    onChange={(e) =>
                      setContent({ ...content, general: { ...g, paymentQrPath: e.target.value } })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted">Rulebook URL</label>
                  <input
                    className={inputCls}
                    value={g.rulebookUrl ?? ""}
                    placeholder="https://…"
                    onChange={(e) =>
                      setContent({ ...content, general: { ...g, rulebookUrl: e.target.value || null } })
                    }
                  />
                </div>

                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="block text-xs font-medium text-muted">Hero Footnote</label>
                  <input
                    className={inputCls}
                    value={g.heroFootnote}
                    onChange={(e) =>
                      setContent({ ...content, general: { ...g, heroFootnote: e.target.value } })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted">Final Call Heading</label>
                  <input
                    className={inputCls}
                    value={g.finalCallHeading}
                    onChange={(e) =>
                      setContent({ ...content, general: { ...g, finalCallHeading: e.target.value } })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-muted">Final Call Copy</label>
                  <input
                    className={inputCls}
                    value={g.finalCallCopy}
                    onChange={(e) =>
                      setContent({ ...content, general: { ...g, finalCallCopy: e.target.value } })
                    }
                  />
                </div>
              </div>
            </div>
          ) : null}

          {/* 2. Stats & Guarantees */}
          {cmsTab === "heroStats" ? (
            <div className="space-y-6 rounded-xl border border-border bg-surface p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-foreground">Status Board Stats &amp; Three Guarantees</h3>
                <Button3D
                  type="button"
                  size="sm"
                  disabled={saving}
                  onClick={() =>
                    void saveSections({ stats: content.stats, guarantees: content.guarantees })
                  }
                >
                  {saving ? "Saving…" : "Save Stats & Guarantees"}
                </Button3D>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-xs uppercase tracking-[0.12em] text-primary">Status Board Cards</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setContent({
                        ...content,
                        stats: [...content.stats, { value: "New", label: "Label", detail: "Detail" }],
                      })
                    }
                  >
                    + Add Stat
                  </Button>
                </div>
                {content.stats.map((s, idx) => (
                  <div key={idx} className="grid gap-3 rounded-lg border border-border bg-background p-3 sm:grid-cols-[1fr_1fr_1.5fr_auto]">
                    <input
                      className={inputCls}
                      value={s.value}
                      placeholder="Value"
                      onChange={(e) => {
                        const next = [...content.stats];
                        next[idx] = { ...s, value: e.target.value };
                        setContent({ ...content, stats: next });
                      }}
                    />
                    <input
                      className={inputCls}
                      value={s.label}
                      placeholder="Label"
                      onChange={(e) => {
                        const next = [...content.stats];
                        next[idx] = { ...s, label: e.target.value };
                        setContent({ ...content, stats: next });
                      }}
                    />
                    <input
                      className={inputCls}
                      value={s.detail}
                      placeholder="Detail"
                      onChange={(e) => {
                        const next = [...content.stats];
                        next[idx] = { ...s, detail: e.target.value };
                        setContent({ ...content, stats: next });
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setContent({ ...content, stats: content.stats.filter((_, i) => i !== idx) })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>

              <div className="space-y-3 border-t border-border pt-5">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-xs uppercase tracking-[0.12em] text-primary">Range Checks / Guarantees</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setContent({
                        ...content,
                        guarantees: [...content.guarantees, { title: "New guarantee", description: "Description" }],
                      })
                    }
                  >
                    + Add Guarantee
                  </Button>
                </div>
                {content.guarantees.map((item, idx) => (
                  <div key={idx} className="grid gap-3 rounded-lg border border-border bg-background p-3 sm:grid-cols-[1fr_2fr_auto]">
                    <input
                      className={inputCls}
                      value={item.title}
                      onChange={(e) => {
                        const next = [...content.guarantees];
                        next[idx] = { ...item, title: e.target.value };
                        setContent({ ...content, guarantees: next });
                      }}
                    />
                    <input
                      className={inputCls}
                      value={item.description}
                      onChange={(e) => {
                        const next = [...content.guarantees];
                        next[idx] = { ...item, description: e.target.value };
                        setContent({ ...content, guarantees: next });
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setContent({ ...content, guarantees: content.guarantees.filter((_, i) => i !== idx) })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* 3. Tracks */}
          {cmsTab === "tracks" ? (
            <div className="space-y-6 rounded-xl border border-border bg-surface p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-foreground">Tracks &amp; Indicative Themes</h3>
                <Button3D
                  type="button"
                  size="sm"
                  disabled={saving}
                  onClick={() =>
                    void saveSections({
                      tracks: content.tracks,
                      trackRules: content.trackRules,
                      trackThemesNote: content.trackThemesNote,
                    })
                  }
                >
                  {saving ? "Saving…" : "Save Tracks"}
                </Button3D>
              </div>
              {content.tracks.map((track, idx) => (
                <div key={track.id} className="space-y-3 rounded-xl border border-border bg-background p-4">
                  <Badge tone={track.id === "beginner" ? "primary" : "accent"}>{track.name}</Badge>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs text-muted">Summary</label>
                      <textarea
                        rows={2}
                        className={inputCls}
                        value={track.summary}
                        onChange={(e) => {
                          const next = [...content.tracks];
                          next[idx] = { ...track, summary: e.target.value };
                          setContent({ ...content, tracks: next });
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted">Audience</label>
                      <textarea
                        rows={2}
                        className={inputCls}
                        value={track.audience}
                        onChange={(e) => {
                          const next = [...content.tracks];
                          next[idx] = { ...track, audience: e.target.value };
                          setContent({ ...content, tracks: next });
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted">Themes (one per line)</label>
                      <textarea
                        rows={5}
                        className={inputCls}
                        value={track.themes.join("\n")}
                        onChange={(e) => {
                          const next = [...content.tracks];
                          next[idx] = {
                            ...track,
                            themes: e.target.value.split("\n").filter((l) => l.trim().length > 0),
                          };
                          setContent({ ...content, tracks: next });
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted">Submission Pack (one per line)</label>
                      <textarea
                        rows={5}
                        className={inputCls}
                        value={track.submissionPack.join("\n")}
                        onChange={(e) => {
                          const next = [...content.tracks];
                          next[idx] = {
                            ...track,
                            submissionPack: e.target.value.split("\n").filter((l) => l.trim().length > 0),
                          };
                          setContent({ ...content, tracks: next });
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-muted">Track Rules (one per line)</label>
                <textarea
                  rows={4}
                  className={inputCls}
                  value={content.trackRules.join("\n")}
                  onChange={(e) =>
                    setContent({
                      ...content,
                      trackRules: e.target.value.split("\n").filter((l) => l.trim().length > 0),
                    })
                  }
                />
              </div>
            </div>
          ) : null}

          {/* 4. Timeline */}
          {cmsTab === "timeline" ? (
            <div className="space-y-4 rounded-xl border border-border bg-surface p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-foreground">Event Timeline ({content.timeline.length} items)</h3>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setContent({
                        ...content,
                        timeline: [
                          ...content.timeline,
                          {
                            id: `item-${Date.now()}`,
                            when: "T+0",
                            clock: "10:00",
                            event: "New milestone",
                            note: null,
                            type: "milestone",
                          },
                        ],
                      })
                    }
                  >
                    + Add Milestone
                  </Button>
                  <Button3D
                    type="button"
                    size="sm"
                    disabled={saving}
                    onClick={() => void saveSections({ timeline: content.timeline })}
                  >
                    {saving ? "Saving…" : "Save Timeline"}
                  </Button3D>
                </div>
              </div>
              <div className="space-y-2.5">
                {content.timeline.map((item, idx) => (
                  <div
                    key={`${item.id}-${idx}`}
                    className="grid gap-2 rounded-lg border border-border bg-background p-3 sm:grid-cols-[100px_110px_1fr_140px_120px_auto]"
                  >
                    <input
                      className={inputCls}
                      value={item.when}
                      placeholder="When"
                      onChange={(e) => {
                        const next = [...content.timeline];
                        next[idx] = { ...item, when: e.target.value };
                        setContent({ ...content, timeline: next });
                      }}
                    />
                    <input
                      className={inputCls}
                      value={item.clock ?? ""}
                      placeholder="Clock"
                      onChange={(e) => {
                        const next = [...content.timeline];
                        next[idx] = { ...item, clock: e.target.value || null };
                        setContent({ ...content, timeline: next });
                      }}
                    />
                    <input
                      className={inputCls}
                      value={item.event}
                      placeholder="Event description"
                      onChange={(e) => {
                        const next = [...content.timeline];
                        next[idx] = { ...item, event: e.target.value };
                        setContent({ ...content, timeline: next });
                      }}
                    />
                    <input
                      className={inputCls}
                      value={item.note ?? ""}
                      placeholder="Note"
                      onChange={(e) => {
                        const next = [...content.timeline];
                        next[idx] = { ...item, note: e.target.value || null };
                        setContent({ ...content, timeline: next });
                      }}
                    />
                    <select
                      className={inputCls}
                      value={item.type}
                      onChange={(e) => {
                        const next = [...content.timeline];
                        next[idx] = { ...item, type: e.target.value as typeof item.type };
                        setContent({ ...content, timeline: next });
                      }}
                    >
                      <option value="milestone">milestone</option>
                      <option value="checkpoint">checkpoint</option>
                      <option value="deadline">deadline</option>
                      <option value="judging">judging</option>
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setContent({ ...content, timeline: content.timeline.filter((_, i) => i !== idx) })
                      }
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* 5. Prizes */}
          {cmsTab === "prizes" ? (
            <div className="space-y-5 rounded-xl border border-border bg-surface p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-foreground">Prizes, Certificates &amp; Rules</h3>
                <Button3D
                  type="button"
                  size="sm"
                  disabled={saving}
                  onClick={() =>
                    void saveSections({
                      prizeTracks: content.prizeTracks,
                      prizeCertificates: content.prizeCertificates,
                      prizeConditions: content.prizeConditions,
                      prizeRules: content.prizeRules,
                    })
                  }
                >
                  {saving ? "Saving…" : "Save Prizes"}
                </Button3D>
              </div>
              {content.prizeTracks.map((pt, tIdx) => (
                <div key={pt.id} className="space-y-3 rounded-xl border border-border bg-background p-4">
                  <div className="flex items-center justify-between">
                    <Badge tone={pt.id === "beginner" ? "primary" : "accent"}>{pt.name} Track Awards</Badge>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const next = [...content.prizeTracks];
                        next[tIdx] = {
                          ...pt,
                          awards: [...pt.awards, { name: "Special Award", amount: "₹10,000", note: "" }],
                        };
                        setContent({ ...content, prizeTracks: next });
                      }}
                    >
                      + Add Award
                    </Button>
                  </div>
                  {pt.awards.map((aw, aIdx) => (
                    <div key={aIdx} className="grid gap-2 sm:grid-cols-[1.2fr_1fr_1.5fr_auto]">
                      <input
                        className={inputCls}
                        value={aw.name}
                        placeholder="Award name"
                        onChange={(e) => {
                          const next = [...content.prizeTracks];
                          const awards = [...pt.awards];
                          awards[aIdx] = { ...aw, name: e.target.value };
                          next[tIdx] = { ...pt, awards };
                          setContent({ ...content, prizeTracks: next });
                        }}
                      />
                      <input
                        className={inputCls}
                        value={aw.amount}
                        placeholder="Amount (e.g. ₹25,000)"
                        onChange={(e) => {
                          const next = [...content.prizeTracks];
                          const awards = [...pt.awards];
                          awards[aIdx] = { ...aw, amount: e.target.value };
                          next[tIdx] = { ...pt, awards };
                          setContent({ ...content, prizeTracks: next });
                        }}
                      />
                      <input
                        className={inputCls}
                        value={aw.note ?? ""}
                        placeholder="Optional note"
                        onChange={(e) => {
                          const next = [...content.prizeTracks];
                          const awards = [...pt.awards];
                          awards[aIdx] = { ...aw, note: e.target.value || undefined };
                          next[tIdx] = { ...pt, awards };
                          setContent({ ...content, prizeTracks: next });
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const next = [...content.prizeTracks];
                          next[tIdx] = { ...pt, awards: pt.awards.filter((_, i) => i !== aIdx) };
                          setContent({ ...content, prizeTracks: next });
                        }}
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : null}

          {/* 6. Rules & Fair Play */}
          {cmsTab === "rules" ? (
            <div className="space-y-5 rounded-xl border border-border bg-surface p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-foreground">Rulebook Sections &amp; Fair Play</h3>
                <Button3D
                  type="button"
                  size="sm"
                  disabled={saving}
                  onClick={() =>
                    void saveSections({
                      ruleSections: content.ruleSections,
                      fairPlayCards: content.fairPlayCards,
                      fairPlayThreats: content.fairPlayThreats,
                    })
                  }
                >
                  {saving ? "Saving…" : "Save Rules & Fair Play"}
                </Button3D>
              </div>
              {content.ruleSections.map((sec, idx) => (
                <div key={sec.id} className="space-y-2 rounded-xl border border-border bg-background p-4">
                  <input
                    className={cn(inputCls, "font-semibold")}
                    value={sec.title}
                    onChange={(e) => {
                      const next = [...content.ruleSections];
                      next[idx] = { ...sec, title: e.target.value };
                      setContent({ ...content, ruleSections: next });
                    }}
                  />
                  <textarea
                    rows={4}
                    className={inputCls}
                    value={sec.bullets.join("\n")}
                    onChange={(e) => {
                      const next = [...content.ruleSections];
                      next[idx] = {
                        ...sec,
                        bullets: e.target.value.split("\n").filter((l) => l.trim().length > 0),
                      };
                      setContent({ ...content, ruleSections: next });
                    }}
                  />
                </div>
              ))}
            </div>
          ) : null}

          {/* 7. Scoring & Submission */}
          {cmsTab === "scoring" ? (
            <div className="space-y-5 rounded-xl border border-border bg-surface p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-foreground">Scoring, Penalties &amp; Submission Copy</h3>
                <Button3D
                  type="button"
                  size="sm"
                  disabled={saving}
                  onClick={() =>
                    void saveSections({
                      penalties: content.penalties,
                      tieBreakers: content.tieBreakers,
                      disqualifications: content.disqualifications,
                      submission: content.submission,
                    })
                  }
                >
                  {saving ? "Saving…" : "Save Scoring & Submission"}
                </Button3D>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-muted">Submission Window Note</label>
                  <textarea
                    rows={3}
                    className={inputCls}
                    value={content.submission.window}
                    onChange={(e) =>
                      setContent({
                        ...content,
                        submission: { ...content.submission, window: e.target.value },
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted">Blind Judging Note</label>
                  <textarea
                    rows={3}
                    className={inputCls}
                    value={content.submission.blindJudging}
                    onChange={(e) =>
                      setContent({
                        ...content,
                        submission: { ...content.submission, blindJudging: e.target.value },
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted">Tie-breakers (one per line)</label>
                  <textarea
                    rows={4}
                    className={inputCls}
                    value={content.tieBreakers.join("\n")}
                    onChange={(e) =>
                      setContent({
                        ...content,
                        tieBreakers: e.target.value.split("\n").filter((l) => l.trim().length > 0),
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted">Disqualification Grounds (one per line)</label>
                  <textarea
                    rows={4}
                    className={inputCls}
                    value={content.disqualifications.join("\n")}
                    onChange={(e) =>
                      setContent({
                        ...content,
                        disqualifications: e.target.value.split("\n").filter((l) => l.trim().length > 0),
                      })
                    }
                  />
                </div>
              </div>
            </div>
          ) : null}

          {/* 8. FAQs */}
          {cmsTab === "faq" ? (
            <div className="space-y-5 rounded-xl border border-border bg-surface p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-foreground">FAQ Groups &amp; Answers</h3>
                <Button3D
                  type="button"
                  size="sm"
                  disabled={saving}
                  onClick={() => void saveSections({ faqGroups: content.faqGroups })}
                >
                  {saving ? "Saving…" : "Save FAQs"}
                </Button3D>
              </div>
              {content.faqGroups.map((group, gIdx) => (
                <div key={group.id} className="space-y-3 rounded-xl border border-border bg-background p-4">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      className={cn(inputCls, "max-w-sm font-semibold")}
                      value={group.title}
                      onChange={(e) => {
                        const next = [...content.faqGroups];
                        next[gIdx] = { ...group, title: e.target.value };
                        setContent({ ...content, faqGroups: next });
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const next = [...content.faqGroups];
                        next[gIdx] = {
                          ...group,
                          items: [
                            ...group.items,
                            { id: `faq-${Date.now()}`, question: "New question?", answer: "Answer here." },
                          ],
                        };
                        setContent({ ...content, faqGroups: next });
                      }}
                    >
                      + Add Question
                    </Button>
                  </div>
                  {group.items.map((item, iIdx) => (
                    <div key={item.id} className="space-y-2 rounded-lg border border-border/70 bg-surface p-3">
                      <div className="flex gap-2">
                        <input
                          className={inputCls}
                          value={item.question}
                          onChange={(e) => {
                            const next = [...content.faqGroups];
                            const items = [...group.items];
                            items[iIdx] = { ...item, question: e.target.value };
                            next[gIdx] = { ...group, items };
                            setContent({ ...content, faqGroups: next });
                          }}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const next = [...content.faqGroups];
                            next[gIdx] = { ...group, items: group.items.filter((_, i) => i !== iIdx) };
                            setContent({ ...content, faqGroups: next });
                          }}
                        >
                          ×
                        </Button>
                      </div>
                      <textarea
                        rows={2}
                        className={inputCls}
                        value={item.answer}
                        onChange={(e) => {
                          const next = [...content.faqGroups];
                          const items = [...group.items];
                          items[iIdx] = { ...item, answer: e.target.value };
                          next[gIdx] = { ...group, items };
                          setContent({ ...content, faqGroups: next });
                        }}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : null}

          {/* 9. Sponsors, About & Contact */}
          {cmsTab === "sponsorsAbout" ? (
            <div className="space-y-6 rounded-xl border border-border bg-surface p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-foreground">Sponsors, About &amp; Contact Channels</h3>
                <Button3D
                  type="button"
                  size="sm"
                  disabled={saving}
                  onClick={() =>
                    void saveSections({
                      sponsors: content.sponsors,
                      about: content.about,
                      contactChannels: content.contactChannels,
                    })
                  }
                >
                  {saving ? "Saving…" : "Save Sponsors, About & Contact"}
                </Button3D>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-xs uppercase tracking-[0.12em] text-primary">Sponsors</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setContent({
                        ...content,
                        sponsors: [
                          ...content.sponsors,
                          { id: `sp-${Date.now()}`, name: "New Sponsor", tier: "Partner", logoUrl: null, websiteUrl: null },
                        ],
                      })
                    }
                  >
                    + Add Sponsor
                  </Button>
                </div>
                {content.sponsors.map((sp, idx) => (
                  <div key={sp.id} className="grid gap-2 rounded-lg border border-border bg-background p-3 sm:grid-cols-[1fr_120px_1.5fr_1.5fr_auto]">
                    <input
                      className={inputCls}
                      value={sp.name}
                      placeholder="Name"
                      onChange={(e) => {
                        const next = [...content.sponsors];
                        next[idx] = { ...sp, name: e.target.value };
                        setContent({ ...content, sponsors: next });
                      }}
                    />
                    <input
                      className={inputCls}
                      value={sp.tier}
                      placeholder="Tier"
                      onChange={(e) => {
                        const next = [...content.sponsors];
                        next[idx] = { ...sp, tier: e.target.value };
                        setContent({ ...content, sponsors: next });
                      }}
                    />
                    <input
                      className={inputCls}
                      value={sp.logoUrl ?? ""}
                      placeholder="Logo URL (/logos/...)"
                      onChange={(e) => {
                        const next = [...content.sponsors];
                        next[idx] = { ...sp, logoUrl: e.target.value || null };
                        setContent({ ...content, sponsors: next });
                      }}
                    />
                    <input
                      className={inputCls}
                      value={sp.websiteUrl ?? ""}
                      placeholder="Website URL"
                      onChange={(e) => {
                        const next = [...content.sponsors];
                        next[idx] = { ...sp, websiteUrl: e.target.value || null };
                        setContent({ ...content, sponsors: next });
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setContent({ ...content, sponsors: content.sponsors.filter((_, i) => i !== idx) })
                      }
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>

              <div className="space-y-3 border-t border-border pt-4">
                <p className="font-mono text-xs uppercase tracking-[0.12em] text-primary">About Page Intro (one paragraph per line)</p>
                <textarea
                  rows={5}
                  className={inputCls}
                  value={content.about.intro.join("\n")}
                  onChange={(e) =>
                    setContent({
                      ...content,
                      about: {
                        ...content.about,
                        intro: e.target.value.split("\n").filter((l) => l.trim().length > 0),
                      },
                    })
                  }
                />
              </div>

              <div className="space-y-3 border-t border-border pt-4">
                <p className="font-mono text-xs uppercase tracking-[0.12em] text-primary">Contact Channels</p>
                {content.contactChannels.map((ch, idx) => (
                  <div key={ch.id} className="grid gap-2 rounded-lg border border-border bg-background p-3 sm:grid-cols-[1fr_1.5fr_1.5fr]">
                    <input
                      className={inputCls}
                      value={ch.label}
                      onChange={(e) => {
                        const next = [...content.contactChannels];
                        next[idx] = { ...ch, label: e.target.value };
                        setContent({ ...content, contactChannels: next });
                      }}
                    />
                    <input
                      className={inputCls}
                      value={ch.description}
                      onChange={(e) => {
                        const next = [...content.contactChannels];
                        next[idx] = { ...ch, description: e.target.value };
                        setContent({ ...content, contactChannels: next });
                      }}
                    />
                    <input
                      className={inputCls}
                      value={ch.url ?? ""}
                      placeholder="https://… or mailto:…"
                      onChange={(e) => {
                        const next = [...content.contactChannels];
                        next[idx] = { ...ch, url: e.target.value || null };
                        setContent({ ...content, contactChannels: next });
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
