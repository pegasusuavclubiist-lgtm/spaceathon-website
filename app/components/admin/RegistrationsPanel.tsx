"use client";

import { useCallback, useEffect, useState } from "react";
import { adminRequest } from "@/app/services/api";
import { useToast } from "../effects/ToastProvider";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Button3D } from "../ui/Button3D";
import { Callout } from "../ui/Callout";

interface MemberRow {
  position: number;
  full_name: string;
  email: string;
  college: string;
  programme: string;
  id_uploaded_at: string | null;
}

interface RegistrationRow {
  id: string;
  team_name: string;
  team_code: string | null;
  track: string;
  leader_email: string;
  verification_status: "pending" | "verified" | "rejected";
  rejection_reason: string | null;
  participant_category: "iist" | "outsider" | null;
  fee_amount: number | null;
  payment_status: "pending" | "confirmed" | "rejected" | null;
  payment_utr: string | null;
  payment_proof_uploaded_at: string | null;
  payment_confirmed_at: string | null;
  payment_confirmed_by: string | null;
  payment_rejection_reason: string | null;
  confirmation_email_sent_at: string | null;
  created_at: string;
  team_members: MemberRow[];
}

export function RegistrationsPanel({
  token,
  actor,
}: {
  token: string;
  actor: string;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<RegistrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentFilter, setPaymentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [trackFilter, setTrackFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastEmailNotice, setLastEmailNotice] = useState<{
    teamName: string;
    delivery: string;
    subject: string;
    previewText: string;
    manualKeys?: Array<{ fullName: string; email: string; key: string }>;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "200" });
    if (paymentFilter) params.set("paymentStatus", paymentFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (trackFilter) params.set("track", trackFilter);

    const res = await adminRequest<{ registrations: RegistrationRow[] }>(
      token,
      actor,
      "GET",
      `/api/admin/registrations?${params.toString()}`,
    );
    setLoading(false);
    if (!res.ok) {
      toast({ title: "Could not load registrations", description: res.message, tone: "warning" });
      return;
    }
    setRows(res.data.registrations);
  }, [token, actor, paymentFilter, statusFilter, trackFilter, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchTeam(
    row: RegistrationRow,
    payload: Record<string, unknown>,
    successTitle: string,
  ) {
    setBusyId(row.id);
    const res = await adminRequest<{
      confirmationEmail?: {
        delivery: string;
        emailedCount: number;
        subject: string;
        previewText: string;
      };
      portal?: {
        teamCode: string;
        delivery: string;
        manualKeys: Array<{ fullName: string; email: string; key: string }>;
      };
    }>(token, actor, "PATCH", `/api/admin/registrations/${row.id}`, payload);
    setBusyId(null);

    if (!res.ok) {
      toast({ title: "Action blocked", description: res.message, tone: "warning" });
      return;
    }

    if (res.data.confirmationEmail || (res.data.portal && res.data.portal.manualKeys.length > 0)) {
      setLastEmailNotice({
        teamName: row.team_name,
        delivery: res.data.confirmationEmail?.delivery ?? res.data.portal?.delivery ?? "emailed",
        subject: res.data.confirmationEmail?.subject ?? `Portal keys for ${row.team_name}`,
        previewText: res.data.confirmationEmail?.previewText ?? "",
        manualKeys: res.data.portal?.manualKeys,
      });
    }

    toast({
      title: successTitle,
      description: res.data.confirmationEmail
        ? `Confirmation email delivery: ${res.data.confirmationEmail.delivery} (${res.data.confirmationEmail.emailedCount} sent).`
        : undefined,
      tone: "success",
    });
    await load();
  }

  async function openPaymentProof(teamId: string) {
    const res = await adminRequest<{ url: string }>(
      token,
      actor,
      "GET",
      `/api/admin/registrations/${teamId}/payment-proof`,
    );
    if (!res.ok) {
      toast({ title: "Payment proof unavailable", description: res.message, tone: "warning" });
      return;
    }
    window.open(res.data.url, "_blank", "noopener,noreferrer");
  }

  async function openCollegeId(teamId: string, pos: number) {
    const res = await adminRequest<{ url: string }>(
      token,
      actor,
      "GET",
      `/api/admin/registrations/${teamId}/members/${pos}/college-id`,
    );
    if (!res.ok) {
      toast({ title: "College ID unavailable", description: res.message, tone: "warning" });
      return;
    }
    window.open(res.data.url, "_blank", "noopener,noreferrer");
  }

  const confirmedCount = rows.filter((r) => r.payment_status === "confirmed").length;
  const pendingPayCount = rows.filter((r) => (r.payment_status ?? "pending") === "pending").length;
  const verifiedCount = rows.filter((r) => r.verification_status === "verified").length;
  const revenue = rows
    .filter((r) => r.payment_status === "confirmed")
    .reduce((sum, r) => sum + (r.fee_amount ?? (r.participant_category === "iist" ? 299 : 499)), 0);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted">Total Teams</p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">{rows.length}</p>
        </div>
        <div className="rounded-xl border border-warning/40 bg-surface p-4">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-warning">Payments Pending</p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">{pendingPayCount}</p>
        </div>
        <div className="rounded-xl border border-success/40 bg-surface p-4">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-success">Payments Confirmed</p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">
            {confirmedCount} <span className="text-sm font-normal text-muted">(₹{revenue.toLocaleString("en-IN")})</span>
          </p>
        </div>
        <div className="rounded-xl border border-primary/40 bg-surface p-4">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-primary">Verified &amp; Portal Active</p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">{verifiedCount}</p>
        </div>
      </div>

      {/* Email / Manual Key Delivery Notice */}
      {lastEmailNotice ? (
        <Callout
          title={`Confirmation Mail Status for ${lastEmailNotice.teamName}: ${lastEmailNotice.delivery.toUpperCase()}`}
          tone={lastEmailNotice.delivery === "emailed" ? "success" : "warning"}
        >
          <p className="text-xs">
            {lastEmailNotice.delivery === "emailed"
              ? "Registration confirmation email was delivered automatically via Resend."
              : "RESEND_API_KEY / MAIL_FROM is not configured (or delivery failed). Copy the confirmation message below to send manually:"}
          </p>
          {lastEmailNotice.previewText ? (
            <pre className="mt-2 max-h-40 overflow-auto rounded-md border border-border bg-background p-2 font-mono text-[0.7rem] whitespace-pre-wrap text-foreground">
              {lastEmailNotice.previewText}
            </pre>
          ) : null}
          {lastEmailNotice.manualKeys && lastEmailNotice.manualKeys.length > 0 ? (
            <div className="mt-3 space-y-1">
              <p className="font-mono text-xs font-semibold text-foreground">
                One-time Portal Keys (copy now — not shown again):
              </p>
              {lastEmailNotice.manualKeys.map((mk) => (
                <p key={mk.email} className="font-mono text-xs text-foreground">
                  {mk.fullName} ({mk.email}): <span className="text-primary">{mk.key}</span>
                </p>
              ))}
            </div>
          ) : null}
          <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={() => setLastEmailNotice(null)}>
            Dismiss
          </Button>
        </Callout>
      ) : null}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4">
        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
        >
          <option value="">All payments</option>
          <option value="pending">Payment pending</option>
          <option value="confirmed">Payment confirmed</option>
          <option value="rejected">Payment rejected</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
        >
          <option value="">All verification</option>
          <option value="pending">Verification pending</option>
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
        </select>
        <select
          value={trackFilter}
          onChange={(e) => setTrackFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
        >
          <option value="">All tracks</option>
          <option value="Beginner">Beginner</option>
          <option value="Advanced">Advanced</option>
        </select>
        <Button type="button" size="sm" variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading registrations…</p>
      ) : rows.length === 0 ? (
        <Callout title="No registrations found" tone="primary">
          <p>No teams match the current filters.</p>
        </Callout>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => {
            const pStatus = row.payment_status ?? "pending";
            const fee = row.fee_amount ?? (row.participant_category === "iist" ? 299 : 499);
            const cat = row.participant_category === "iist" ? "IISTian" : "Outsider";
            const busy = busyId === row.id;

            return (
              <div
                key={row.id}
                className="rounded-xl border border-border bg-surface p-5 shadow-[var(--elev-1)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-foreground">{row.team_name}</h3>
                      {row.team_code ? <Badge tone="primary">{row.team_code}</Badge> : null}
                      <Badge tone={row.track === "Beginner" ? "primary" : "accent"}>{row.track}</Badge>
                      <Badge
                        tone={
                          pStatus === "confirmed"
                            ? "success"
                            : pStatus === "rejected"
                              ? "danger"
                              : "warning"
                        }
                      >
                        Payment: {pStatus} (₹{fee} · {cat})
                      </Badge>
                      <Badge
                        tone={
                          row.verification_status === "verified"
                            ? "success"
                            : row.verification_status === "rejected"
                              ? "danger"
                              : "neutral"
                        }
                      >
                        IDs: {row.verification_status}
                      </Badge>
                    </div>
                    <p className="mt-1 font-mono text-xs text-muted">
                      ID: {row.id} · Leader: {row.leader_email} · UTR:{" "}
                      <span className="text-foreground">{row.payment_utr ?? "Not provided"}</span>
                      {row.confirmation_email_sent_at
                        ? ` · Confirmation mail sent ${new Date(row.confirmation_email_sent_at).toLocaleString("en-IN")}`
                        : " · Confirmation mail NOT sent yet"}
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-2">
                    {row.payment_proof_uploaded_at ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => void openPaymentProof(row.id)}
                      >
                        View Payment Proof
                      </Button>
                    ) : null}

                    {pStatus !== "confirmed" ? (
                      <Button3D
                        type="button"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void patchTeam(
                            row,
                            { paymentStatus: "confirmed" },
                            `Payment confirmed & confirmation mail triggered for ${row.team_name}`,
                          )
                        }
                      >
                        Confirm Payment &amp; Send Mail
                      </Button3D>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          void patchTeam(
                            row,
                            { resendConfirmationEmail: true },
                            `Resent confirmation email to ${row.team_name}`,
                          )
                        }
                      >
                        Resend Confirmation Mail
                      </Button>
                    )}

                    {pStatus !== "rejected" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          const reason = window.prompt("Reason for rejecting payment (e.g. UTR not found / wrong amount):");
                          if (reason) {
                            void patchTeam(
                              row,
                              { paymentStatus: "rejected", paymentRejectionReason: reason },
                              `Payment rejected for ${row.team_name}`,
                            );
                          }
                        }}
                      >
                        Reject Payment
                      </Button>
                    ) : null}

                    {row.verification_status !== "verified" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busy || pStatus !== "confirmed"}
                        title={
                          pStatus !== "confirmed"
                            ? "Confirm payment first before verifying team"
                            : "Verify IDs & activate participant portal keys"
                        }
                        onClick={() =>
                          void patchTeam(
                            row,
                            { verificationStatus: "verified" },
                            `Team ${row.team_name} verified & portal keys issued`,
                          )
                        }
                      >
                        Verify IDs &amp; Activate Portal
                      </Button>
                    ) : null}
                  </div>
                </div>

                {/* Members */}
                <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-background">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-border font-mono uppercase tracking-[0.12em] text-muted">
                      <tr>
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Email</th>
                        <th className="px-3 py-2">Institution</th>
                        <th className="px-3 py-2">Programme</th>
                        <th className="px-3 py-2">College ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {[...row.team_members]
                        .sort((a, b) => a.position - b.position)
                        .map((m) => (
                          <tr key={m.position}>
                            <td className="px-3 py-2 font-mono text-muted">{m.position + 1}</td>
                            <td className="px-3 py-2 font-medium text-foreground">{m.full_name}</td>
                            <td className="px-3 py-2 font-mono text-muted">{m.email}</td>
                            <td className="px-3 py-2 text-muted">{m.college}</td>
                            <td className="px-3 py-2 text-muted">{m.programme}</td>
                            <td className="px-3 py-2">
                              {m.id_uploaded_at ? (
                                <button
                                  type="button"
                                  onClick={() => void openCollegeId(row.id, m.position)}
                                  className="text-primary underline underline-offset-4"
                                >
                                  View ID
                                </button>
                              ) : (
                                <span className="text-danger">Missing</span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
