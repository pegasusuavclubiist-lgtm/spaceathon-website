"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { programmeOptions } from "@/app/content/event-data";
import { TBA } from "@/app/content/site-config";
import {
  isMockMode,
  registerTeam,
  uploadCollegeId,
  uploadPaymentProof,
} from "@/app/services/api";
import { fitCollegeId } from "@/app/services/compress";
import type {
  CollegeIdUploadGrant,
  ParticipantCategory,
  PaymentProofUploadGrant,
  RegisterPayload,
} from "@/app/types/api";
import { useSiteContent } from "../content/SiteContentProvider";
import { useToast } from "../effects/ToastProvider";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Button3D } from "../ui/Button3D";
import { cn } from "../ui/cn";

interface MemberForm {
  id: string;
  fullName: string;
  email: string;
  college: string;
  programme: string;
  collegeId: File | null;
}

interface RegistrationState {
  teamName: string;
  track: string;
  leaderEmail: string;
  participantCategory: ParticipantCategory;
  paymentUtr: string;
  paymentProof: File | null;
  members: MemberForm[];
  rulebookAccepted: boolean;
  declarationAccepted: boolean;
  seniorityConfirmed: boolean;
}

type FieldErrors = Record<string, string>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const utrPattern = /^[A-Za-z0-9@._/-]{6,64}$/;

const advancedProgrammes = new Set([
  "UG year 3",
  "UG year 4+",
  "PG",
  "PhD",
  "Graduate within six months",
]);

const steps = [
  {
    id: "team",
    label: "Team details",
    description:
      "Name the team, choose a track and set the leader contact for OC updates.",
  },
  {
    id: "crew",
    label: "Crew and IDs",
    description:
      "Add 2 to 4 members with institutional emails and a college ID for each.",
  },
  {
    id: "payment",
    label: "UPI QR Payment",
    description:
      "Select IISTian (₹299) or Outsider (₹499), scan the QR code to pay, and enter your UTR.",
  },
  {
    id: "clearance",
    label: "Consent and review",
    description:
      "Accept the rulebook, integrity declaration and seniority check before launch.",
  },
] as const;

const stepFieldMatchers: Array<(key: string) => boolean> = [
  (key) => key === "teamName" || key === "track" || key === "leaderEmail",
  (key) => key === "form" || key.startsWith("members."),
  (key) =>
    key === "participantCategory" ||
    key === "paymentUtr" ||
    key === "paymentProof",
  (key) =>
    key === "rulebookAccepted" ||
    key === "declarationAccepted" ||
    key === "seniorityConfirmed",
];

const fieldBase =
  "mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted transition-colors";

function fieldClass(hasError: boolean) {
  return cn(
    fieldBase,
    hasError ? "border-danger" : "border-border hover:border-border-strong",
  );
}

function createMember(id: string): MemberForm {
  return {
    id,
    fullName: "",
    email: "",
    college: "",
    programme: "",
    collegeId: null,
  };
}

function isAllowedUpload(file: File) {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  return (
    type.startsWith("image/") ||
    type === "application/pdf" ||
    /\.(png|jpe?g|gif|webp|pdf)$/.test(name)
  );
}

function validate(state: RegistrationState): FieldErrors {
  const errors: FieldErrors = {};

  if (!state.teamName.trim()) {
    errors.teamName = "Enter a team name.";
  }

  if (!state.track) {
    errors.track = "Select a track.";
  }

  if (!state.leaderEmail.trim()) {
    errors.leaderEmail = "Enter the team leader email.";
  } else if (!emailPattern.test(state.leaderEmail.trim())) {
    errors.leaderEmail = "Enter a valid email address.";
  }

  if (state.members.length < 2) {
    errors.form = "A team needs at least two members.";
  }

  const emailCounts = new Map<string, number>();

  for (const member of state.members) {
    const normalized = member.email.trim().toLowerCase();
    if (normalized) {
      emailCounts.set(normalized, (emailCounts.get(normalized) ?? 0) + 1);
    }
  }

  for (const member of state.members) {
    const prefix = `members.${member.id}`;

    if (!member.fullName.trim()) {
      errors[`${prefix}.fullName`] = "Enter the member's full name.";
    }

    if (!member.email.trim()) {
      errors[`${prefix}.email`] = "Enter an institutional email.";
    } else if (!emailPattern.test(member.email.trim())) {
      errors[`${prefix}.email`] = "Enter a valid email address.";
    } else if (
      (emailCounts.get(member.email.trim().toLowerCase()) ?? 0) > 1
    ) {
      errors[`${prefix}.email`] =
        "This email is already used by another member.";
    }

    if (!member.college.trim()) {
      errors[`${prefix}.college`] = "Enter the institution name.";
    }

    if (!member.programme) {
      errors[`${prefix}.programme`] = "Select a programme and year.";
    }

    if (!member.collegeId) {
      errors[`${prefix}.collegeId`] = "Select a college ID file.";
    } else if (!isAllowedUpload(member.collegeId)) {
      errors[`${prefix}.collegeId`] = "Use an image or PDF file.";
    }
  }

  if (!state.paymentUtr.trim()) {
    errors.paymentUtr =
      "Enter the UPI Transaction ID / UTR number after completing payment.";
  } else if (!utrPattern.test(state.paymentUtr.trim())) {
    errors.paymentUtr =
      "Enter a valid UPI Transaction ID / UTR (6 to 64 characters, no spaces).";
  }

  if (state.paymentProof && !isAllowedUpload(state.paymentProof)) {
    errors.paymentProof = "Upload an image (JPG/PNG/WebP) or PDF receipt.";
  }

  if (!state.rulebookAccepted) {
    errors.rulebookAccepted = "Accept the rulebook to continue.";
  }

  if (!state.declarationAccepted) {
    errors.declarationAccepted =
      "Accept the Integrity Declaration to continue.";
  }

  if (!state.seniorityConfirmed) {
    errors.seniorityConfirmed =
      "Confirm the seniority and track declaration.";
  }

  return errors;
}

function errorsForStep(errors: FieldErrors, step: number): FieldErrors {
  const matcher = stepFieldMatchers[step];
  if (!matcher) return {};
  return Object.fromEntries(
    Object.entries(errors).filter(([key]) => matcher(key)),
  );
}

export function RegisterForm() {
  const { general, tracks } = useSiteContent();
  const { toast } = useToast();
  const [form, setForm] = useState<RegistrationState>({
    teamName: "",
    track: "",
    leaderEmail: "",
    participantCategory: "outsider",
    paymentUtr: "",
    paymentProof: null,
    members: [createMember("member-1"), createMember("member-2")],
    rulebookAccepted: false,
    declarationAccepted: false,
    seniorityConfirmed: false,
  });
  const [step, setStep] = useState(0);
  const [attemptedSteps, setAttemptedSteps] = useState<Record<number, boolean>>(
    {},
  );
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const [idGrant, setIdGrant] = useState<CollegeIdUploadGrant | null>(null);
  const [proofGrant, setProofGrant] = useState<PaymentProofUploadGrant | null>(
    null,
  );
  const [idUploads, setIdUploads] = useState<
    Record<number, { state: "uploading" | "done" | "error"; message?: string }>
  >({});
  const [proofUpload, setProofUpload] = useState<{
    state: "idle" | "uploading" | "done" | "error";
    message?: string;
  }>({ state: "idle" });
  const [serverFieldErrors, setServerFieldErrors] = useState<FieldErrors>({});
  const [copiedUpi, setCopiedUpi] = useState(false);
  const nextMemberId = useRef(3);
  const formRef = useRef<HTMLFormElement>(null);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);

  const feeIist = general.feeIist || 299;
  const feeOutsider = general.feeOutsider || 499;
  const payableAmount =
    form.participantCategory === "iist" ? feeIist : feeOutsider;
  const upiId = general.upiId || "90323601@ubin";
  const upiPayeeName = general.upiPayeeName || "VEDENDRA VARDHAN";
  const paymentQrPath = general.paymentQrPath || "/payment-qr.jpeg";
  const upiDeepLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiPayeeName)}&am=${payableAmount}&cu=INR&tn=${encodeURIComponent(`Kosmodrome 2027 - ${form.teamName.trim() || "Registration"}`)}`;

  useEffect(() => {
    if (submitted) {
      successHeadingRef.current?.focus();
    }
  }, [submitted]);

  useEffect(() => {
    if (step > 0) {
      const behavior: ScrollBehavior = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches
        ? "auto"
        : "smooth";
      formRef.current?.scrollIntoView({ block: "start", behavior });
    }
  }, [step]);

  const allErrors = validate(form);
  const serverErrorCount = Object.keys(serverFieldErrors).length;
  const allErrorCount = Object.keys(allErrors).length + serverErrorCount;
  const errors: FieldErrors = attemptedSteps[step]
    ? {
        ...errorsForStep(allErrors, step),
        ...errorsForStep(serverFieldErrors, step),
      }
    : errorsForStep(serverFieldErrors, step);
  const errorCount = Object.keys(errors).length;
  const lastStep = steps.length - 1;

  const hasAdvancedProgramme = form.members.some((member) =>
    advancedProgrammes.has(member.programme),
  );
  const hasGraduate = form.members.some(
    (member) => member.programme === "Graduate within six months",
  );
  const showAdvancedHint = form.track === "Beginner" && hasAdvancedProgramme;

  function updateMember(id: string, patch: Partial<MemberForm>) {
    setForm((current) => {
      const nextMembers = current.members.map((member) =>
        member.id === id ? { ...member, ...patch } : member,
      );
      const looksIist = nextMembers.every(
        (m) =>
          m.email.toLowerCase().endsWith("@iist.ac.in") ||
          m.college.toLowerCase().includes("iist") ||
          m.college.toLowerCase().includes("indian institute of space"),
      );
      return {
        ...current,
        members: nextMembers,
        participantCategory: looksIist ? "iist" : current.participantCategory,
      };
    });
  }

  function addMember() {
    if (form.members.length >= 4) return;
    const id = `member-${nextMemberId.current}`;
    nextMemberId.current += 1;
    setForm((current) => ({
      ...current,
      members: [...current.members, createMember(id)],
    }));
  }

  function removeMember(id: string) {
    if (form.members.length <= 2) return;
    setForm((current) => ({
      ...current,
      members: current.members.filter((member) => member.id !== id),
    }));
  }

  function goNext() {
    const currentErrors = errorsForStep(allErrors, step);
    if (Object.keys(currentErrors).length > 0) {
      setAttemptedSteps((current) => ({ ...current, [step]: true }));
      return;
    }
    setStep((current) => Math.min(lastStep, current + 1));
  }

  function mapServerFieldErrors(
    fieldErrors: Record<string, string>,
  ): FieldErrors {
    const mapped: FieldErrors = {};
    for (const [key, value] of Object.entries(fieldErrors)) {
      const indexed = /^members\.(\d+)\.(.+)$/.exec(key);
      if (indexed) {
        const member = form.members[Number(indexed[1])];
        const field = indexed[2];
        mapped[member ? `members.${member.id}.${field}` : key] = value;
        continue;
      }
      mapped[key] = value;
    }
    return mapped;
  }

  async function uploadOneId(grant: CollegeIdUploadGrant, index: number) {
    const file = form.members[index]?.collegeId;
    if (!file) {
      setIdUploads((current) => ({
        ...current,
        [index]: { state: "error", message: "No file selected." },
      }));
      return;
    }
    setIdUploads((current) => ({ ...current, [index]: { state: "uploading" } }));
    const fitted = await fitCollegeId(file, grant.maxBytes);
    if (fitted.tooLarge) {
      setIdUploads((current) => ({
        ...current,
        [index]: {
          state: "error",
          message: `The file is over ${Math.round(grant.maxBytes / 1048576)} MB. Choose a smaller image or PDF.`,
        },
      }));
      return;
    }
    const result = await uploadCollegeId(grant, index, fitted.file);
    setIdUploads((current) => ({
      ...current,
      [index]: result.ok
        ? { state: "done" }
        : {
            state: "error",
            message:
              result.fieldErrors?.[`members.${index}.collegeId`] ??
              result.message,
          },
    }));
  }

  async function uploadAllIds(grant: CollegeIdUploadGrant) {
    for (let index = 0; index < form.members.length; index += 1) {
      await uploadOneId(grant, index);
    }
  }

  async function uploadProof(grant: PaymentProofUploadGrant) {
    if (!form.paymentProof) return;
    setProofUpload({ state: "uploading" });
    const fitted = await fitCollegeId(form.paymentProof, grant.maxBytes);
    if (fitted.tooLarge) {
      setProofUpload({
        state: "error",
        message: `Receipt is over ${Math.round(grant.maxBytes / 1048576)} MB. Choose a smaller file.`,
      });
      return;
    }
    const result = await uploadPaymentProof(grant, fitted.file);
    setProofUpload(
      result.ok
        ? { state: "done" }
        : { state: "error", message: result.message },
    );
  }

  async function submitRegistration() {
    const payload: RegisterPayload = {
      teamName: form.teamName.trim(),
      track: form.track,
      leaderEmail: form.leaderEmail.trim(),
      participantCategory: form.participantCategory,
      paymentUtr: form.paymentUtr.trim(),
      members: form.members.map((member) => ({
        fullName: member.fullName.trim(),
        email: member.email.trim(),
        college: member.college.trim(),
        programme: member.programme,
      })),
      rulebookAccepted: form.rulebookAccepted,
      declarationAccepted: form.declarationAccepted,
      seniorityConfirmed: form.seniorityConfirmed,
    };

    setSubmitting(true);
    setServerFieldErrors({});

    try {
      const result = await registerTeam(payload);

      if (result.ok) {
        setSubmitted(true);
        setRegistrationId(result.data.id);
        if (result.data.collegeIdUpload) {
          setIdGrant(result.data.collegeIdUpload);
          void uploadAllIds(result.data.collegeIdUpload);
        }
        if (result.data.paymentProofUpload && form.paymentProof) {
          setProofGrant(result.data.paymentProofUpload);
          void uploadProof(result.data.paymentProofUpload);
        }
        toast(
          isMockMode()
            ? {
                title: "Registration preview validated",
                description:
                  "Preview mode validates locally. Switch NEXT_PUBLIC_API_MODE=live to store in Supabase.",
                tone: "success",
              }
            : {
                title: "Registration received — payment pending verification",
                description:
                  "Your confirmation email will be sent once the Organising Committee confirms your UPI payment.",
                tone: "success",
              },
        );
        return;
      }

      if (result.fieldErrors) {
        const mapped = mapServerFieldErrors(result.fieldErrors);
        setServerFieldErrors(mapped);
        setAttemptedSteps({ 0: true, 1: true, 2: true, 3: true });
        const firstInvalidStep = stepFieldMatchers.findIndex((matcher) =>
          Object.keys(mapped).some((key) => matcher(key)),
        );
        setStep(firstInvalidStep === -1 ? 0 : firstInvalidStep);
      }

      toast({
        title: "Registration not sent",
        description: result.message,
        tone: "warning",
        action: {
          label: "Retry",
          onAction: () => {
            void submitRegistration();
          },
        },
      });
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (step < lastStep) {
      goNext();
      return;
    }

    if (submitting) return;

    setAttemptedSteps({ 0: true, 1: true, 2: true, 3: true });

    if (allErrorCount > 0) {
      const firstInvalidStep = stepFieldMatchers.findIndex((matcher) =>
        Object.keys(allErrors).some((key) => matcher(key)),
      );
      setStep(firstInvalidStep === -1 ? 0 : firstInvalidStep);
      return;
    }

    void submitRegistration();
  }

  if (submitted) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="success-panel rounded-xl border border-success bg-success-soft p-6 shadow-[var(--elev-2)]"
      >
        <Badge tone="warning">Payment verification pending</Badge>
        <h3
          ref={successHeadingRef}
          tabIndex={-1}
          className="mt-4 text-xl font-semibold tracking-tight text-foreground"
        >
          Registration submitted — awaiting payment confirmation.
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          {isMockMode()
            ? "Preview mode: nothing was sent or stored."
            : "Your registration and UPI reference have been recorded. The Organising Committee will verify your payment first — your official registration confirmation email will be sent immediately once payment is confirmed."}
        </p>

        <dl className="mt-5 grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-surface p-3">
            <dt className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-muted">
              Team
            </dt>
            <dd className="mt-1 text-sm font-medium text-foreground">
              {form.teamName}
            </dd>
          </div>
          <div className="rounded-lg border border-border bg-surface p-3">
            <dt className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-muted">
              Track
            </dt>
            <dd className="mt-1 text-sm font-medium text-foreground">
              {form.track}
            </dd>
          </div>
          <div className="rounded-lg border border-border bg-surface p-3">
            <dt className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-muted">
              Fee &amp; Category
            </dt>
            <dd className="mt-1 text-sm font-medium text-foreground">
              ₹{payableAmount} ({form.participantCategory === "iist" ? "IISTian" : "Outsider"})
            </dd>
          </div>
          <div className="rounded-lg border border-border bg-surface p-3">
            <dt className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-muted">
              UTR Reference
            </dt>
            <dd className="mt-1 break-all font-mono text-xs font-medium text-foreground">
              {form.paymentUtr}
            </dd>
          </div>
        </dl>

        {registrationId ? (
          <p className="mt-3 font-mono text-xs text-muted">
            Registration ID: <span className="text-foreground">{registrationId}</span>
          </p>
        ) : null}

        {idGrant ? (
          <div className="mt-5 rounded-lg border border-border bg-surface p-4">
            <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-muted">
              File uploads
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {form.members.map((member, index) => {
                const status = idUploads[index];
                return (
                  <li
                    key={member.id}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <span className="text-foreground">
                      {member.fullName.trim() || `Member ${index + 1}`} — College ID
                    </span>
                    <span className="flex items-center gap-3">
                      {status?.state === "done" ? (
                        <Badge tone="success">Uploaded</Badge>
                      ) : null}
                      {status?.state === "uploading" || !status ? (
                        <Badge tone="primary">Uploading…</Badge>
                      ) : null}
                      {status?.state === "error" ? (
                        <>
                          <span className="text-xs text-danger">{status.message}</span>
                          <Button3D
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => void uploadOneId(idGrant, index)}
                          >
                            Retry
                          </Button3D>
                        </>
                      ) : null}
                    </span>
                  </li>
                );
              })}
              {proofGrant && form.paymentProof ? (
                <li className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
                  <span className="text-foreground">UPI Payment Screenshot</span>
                  <span className="flex items-center gap-3">
                    {proofUpload.state === "done" ? (
                      <Badge tone="success">Uploaded</Badge>
                    ) : null}
                    {proofUpload.state === "uploading" ? (
                      <Badge tone="primary">Uploading…</Badge>
                    ) : null}
                    {proofUpload.state === "error" ? (
                      <>
                        <span className="text-xs text-danger">{proofUpload.message}</span>
                        <Button3D
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => void uploadProof(proofGrant)}
                        >
                          Retry
                        </Button3D>
                      </>
                    ) : null}
                  </span>
                </li>
              ) : null}
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Keep this page open until every file shows Uploaded.
            </p>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          {isMockMode() ? (
            <Button3D
              type="button"
              onClick={() => {
                setSubmitted(false);
                setStep(lastStep);
              }}
            >
              Back to edit
            </Button3D>
          ) : null}
          <Button3D href="/rules" variant="secondary">
            Read the rules
          </Button3D>
        </div>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={handleSubmit}
      className="scroll-mt-24 space-y-6"
    >
      <p className="sr-only" role="status" aria-live="polite">
        Step {step + 1} of {steps.length}: {steps[step].label}
      </p>
      <div
        className="registration-progress rounded-xl border border-border bg-surface/80 p-4 shadow-[var(--elev-1)] sm:p-5"
        role="group"
        aria-label="Registration progress"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-primary">
            Step {step + 1} of {steps.length}
          </p>
          <Badge tone={step === lastStep ? "success" : "primary"}>
            {steps[step].label}
          </Badge>
        </div>
        <ol className="mt-4 grid gap-2 sm:grid-cols-4">
          {steps.map((entry, index) => {
            const done = index < step;
            const current = index === step;
            return (
              <li
                key={entry.id}
                className="min-w-0"
                aria-current={current ? "step" : undefined}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "block h-1.5 rounded-full shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] transition-colors",
                    done
                      ? "bg-primary/70"
                      : current
                        ? "bg-primary"
                        : "bg-border",
                  )}
                />
                <span
                  className={cn(
                    "mt-2 block font-mono text-[0.625rem] uppercase tracking-[0.12em]",
                    current
                      ? "text-foreground"
                      : done
                        ? "text-primary"
                        : "text-muted",
                  )}
                >
                  {entry.label}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          {steps[step].description}
        </p>
      </div>

      {/* Step 0: Team details */}
      <section
        hidden={step !== 0}
        className="form-panel rounded-xl border border-border bg-surface p-5 sm:p-6"
        aria-labelledby="team-details-heading"
      >
        <h3
          id="team-details-heading"
          className="text-lg font-semibold tracking-tight text-foreground"
        >
          Team details
        </h3>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label
              htmlFor="teamName"
              className="block text-sm font-medium text-foreground"
            >
              Team name
            </label>
            <input
              id="teamName"
              name="teamName"
              type="text"
              autoComplete="organization"
              value={form.teamName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  teamName: event.target.value,
                }))
              }
              aria-invalid={Boolean(errors.teamName)}
              className={fieldClass(Boolean(errors.teamName))}
              placeholder="e.g. Orbital Originals"
            />
            {errors.teamName ? (
              <p className="mt-1 text-xs leading-relaxed text-danger">
                {errors.teamName}
              </p>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="track"
              className="block text-sm font-medium text-foreground"
            >
              Track
            </label>
            <select
              id="track"
              name="track"
              value={form.track}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  track: event.target.value,
                }))
              }
              aria-invalid={Boolean(errors.track)}
              className={fieldClass(Boolean(errors.track))}
            >
              <option value="">Select a track</option>
              {tracks.map((track) => (
                <option key={track.id} value={track.name}>
                  {track.name}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Opting up to Advanced is allowed. Moving down is never allowed.
            </p>
            {errors.track ? (
              <p className="mt-1 text-xs leading-relaxed text-danger">
                {errors.track}
              </p>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="leaderEmail"
              className="block text-sm font-medium text-foreground"
            >
              Team leader email
            </label>
            <input
              id="leaderEmail"
              name="leaderEmail"
              type="email"
              autoComplete="email"
              value={form.leaderEmail}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  leaderEmail: event.target.value,
                }))
              }
              aria-invalid={Boolean(errors.leaderEmail)}
              className={fieldClass(Boolean(errors.leaderEmail))}
              placeholder="leader@institution.ac.in"
            />
            {errors.leaderEmail ? (
              <p className="mt-1 text-xs leading-relaxed text-danger">
                {errors.leaderEmail}
              </p>
            ) : null}
          </div>
        </div>

        {showAdvancedHint ? (
          <div
            role="status"
            aria-live="polite"
            className="mt-5 rounded-lg border border-warning bg-warning-soft p-4 text-sm leading-relaxed text-foreground"
          >
            <p className="font-medium text-warning">Track hint: Advanced</p>
            <p className="mt-1">
              {hasGraduate
                ? "A graduate within six months is Advanced only. Choose Advanced to match the rule."
                : "One or more members are UG year 3+, PG or PhD. The seniority rule points to Advanced."}
            </p>
          </div>
        ) : null}
      </section>

      {/* Step 1: Members & College IDs */}
      <section
        hidden={step !== 1}
        className="form-panel rounded-xl border border-border bg-surface p-5 sm:p-6"
        aria-labelledby="members-heading"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3
              id="members-heading"
              className="text-lg font-semibold tracking-tight text-foreground"
            >
              Members
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Teams need 2 to 4 members. At least two are required.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={addMember}
            disabled={form.members.length >= 4}
          >
            Add member
          </Button>
        </div>

        <div className="mt-5 space-y-5">
          {form.members.map((member, index) => {
            const prefix = `members.${member.id}`;
            return (
              <div
                key={member.id}
                className="boarding-pass rounded-xl border border-border bg-background shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
                  <h4 className="text-sm font-semibold text-foreground">
                    Crew pass 0{index + 1}
                  </h4>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeMember(member.id)}
                    disabled={form.members.length <= 2}
                  >
                    Remove
                  </Button>
                </div>

                <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
                  <div>
                    <label
                      htmlFor={`${member.id}-fullName`}
                      className="block text-sm font-medium text-foreground"
                    >
                      Full name
                    </label>
                    <input
                      id={`${member.id}-fullName`}
                      type="text"
                      value={member.fullName}
                      onChange={(event) =>
                        updateMember(member.id, {
                          fullName: event.target.value,
                        })
                      }
                      className={fieldClass(
                        Boolean(errors[`${prefix}.fullName`]),
                      )}
                    />
                    {errors[`${prefix}.fullName`] ? (
                      <p className="mt-1 text-xs text-danger">
                        {errors[`${prefix}.fullName`]}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <label
                      htmlFor={`${member.id}-email`}
                      className="block text-sm font-medium text-foreground"
                    >
                      Institutional email
                    </label>
                    <input
                      id={`${member.id}-email`}
                      type="email"
                      value={member.email}
                      onChange={(event) =>
                        updateMember(member.id, {
                          email: event.target.value,
                        })
                      }
                      className={fieldClass(Boolean(errors[`${prefix}.email`]))}
                      placeholder="member@institution.ac.in"
                    />
                    {errors[`${prefix}.email`] ? (
                      <p className="mt-1 text-xs text-danger">
                        {errors[`${prefix}.email`]}
                      </p>
                    ) : null}
                  </div>

                  <div className="sm:col-span-2">
                    <label
                      htmlFor={`${member.id}-college`}
                      className="block text-sm font-medium text-foreground"
                    >
                      College or institution
                    </label>
                    <input
                      id={`${member.id}-college`}
                      type="text"
                      value={member.college}
                      onChange={(event) =>
                        updateMember(member.id, {
                          college: event.target.value,
                        })
                      }
                      className={fieldClass(
                        Boolean(errors[`${prefix}.college`]),
                      )}
                    />
                    {errors[`${prefix}.college`] ? (
                      <p className="mt-1 text-xs text-danger">
                        {errors[`${prefix}.college`]}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <label
                      htmlFor={`${member.id}-programme`}
                      className="block text-sm font-medium text-foreground"
                    >
                      Programme and year
                    </label>
                    <select
                      id={`${member.id}-programme`}
                      value={member.programme}
                      onChange={(event) =>
                        updateMember(member.id, {
                          programme: event.target.value,
                        })
                      }
                      className={fieldClass(
                        Boolean(errors[`${prefix}.programme`]),
                      )}
                    >
                      <option value="">Select programme and year</option>
                      {programmeOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    {errors[`${prefix}.programme`] ? (
                      <p className="mt-1 text-xs text-danger">
                        {errors[`${prefix}.programme`]}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <label
                      htmlFor={`${member.id}-college-id`}
                      className="block text-sm font-medium text-foreground"
                    >
                      College ID (image or PDF)
                    </label>
                    <input
                      id={`${member.id}-college-id`}
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(event) =>
                        updateMember(member.id, {
                          collegeId: event.target.files?.[0] ?? null,
                        })
                      }
                      className={cn(
                        "mt-2 block w-full cursor-pointer rounded-md border bg-background text-sm text-muted file:mr-3 file:cursor-pointer file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary-hover",
                        errors[`${prefix}.collegeId`]
                          ? "border-danger"
                          : "border-border",
                      )}
                    />
                    {errors[`${prefix}.collegeId`] ? (
                      <p className="mt-1 text-xs text-danger">
                        {errors[`${prefix}.collegeId`]}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Step 2: UPI QR Payment */}
      <section
        hidden={step !== 2}
        className="form-panel rounded-xl border border-border bg-surface p-5 sm:p-6"
        aria-labelledby="payment-heading"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3
              id="payment-heading"
              className="text-lg font-semibold tracking-tight text-foreground"
            >
              Registration Fee Payment (UPI QR)
            </h3>
            <p className="mt-1 text-sm text-muted">
              Select your category, scan the official BHIM UPI QR code to pay,
              and enter your Transaction ID / UTR below. Your registration
              confirmation email is sent once the OC confirms your payment.
            </p>
          </div>
          <Badge tone="primary">Payable: ₹{payableAmount}</Badge>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() =>
              setForm((current) => ({
                ...current,
                participantCategory: "iist",
              }))
            }
            className={cn(
              "rounded-xl border p-4 text-left transition-colors",
              form.participantCategory === "iist"
                ? "border-primary bg-primary-soft/60"
                : "border-border bg-background hover:border-border-strong",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">
                IISTian Team
              </span>
              <span className="font-mono text-lg font-bold text-primary">
                ₹{feeIist}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">
              For students of Indian Institute of Space Science and Technology
              (IIST). Valid IIST ID required.
            </p>
          </button>

          <button
            type="button"
            onClick={() =>
              setForm((current) => ({
                ...current,
                participantCategory: "outsider",
              }))
            }
            className={cn(
              "rounded-xl border p-4 text-left transition-colors",
              form.participantCategory === "outsider"
                ? "border-primary bg-primary-soft/60"
                : "border-border bg-background hover:border-border-strong",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">
                Outsider / External Team
              </span>
              <span className="font-mono text-lg font-bold text-primary">
                ₹{feeOutsider}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">
              For teams from other recognised Indian colleges, universities, or
              mixed-institution teams.
            </p>
          </button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]">
          <div className="flex flex-col items-center rounded-xl border border-border bg-white p-3 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={paymentQrPath}
              alt={`BHIM UPI QR Code for ${upiPayeeName} (${upiId})`}
              className="h-auto w-56 rounded-lg object-contain"
            />
            <p className="mt-2 font-mono text-[0.7rem] font-semibold text-neutral-800">
              {upiPayeeName}
            </p>
            <p className="font-mono text-[0.7rem] text-neutral-600">
              UPI: {upiId}
            </p>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-background p-4">
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted">
                Payment summary
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-2xl font-bold text-foreground">
                  ₹{payableAmount}
                  <span className="ml-2 text-xs font-normal text-muted">
                    ({form.participantCategory === "iist" ? "IISTian" : "Outsider"} team fee)
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      void navigator.clipboard?.writeText(upiId);
                      setCopiedUpi(true);
                      setTimeout(() => setCopiedUpi(false), 2000);
                    }}
                  >
                    {copiedUpi ? "Copied UPI ID" : `Copy ${upiId}`}
                  </Button>
                  <a
                    href={upiDeepLink}
                    className="inline-flex items-center rounded-md border border-primary bg-primary-soft px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary hover:text-primary-foreground"
                  >
                    Open UPI App
                  </a>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted">
                Payee: <strong className="text-foreground">{upiPayeeName}</strong> · UPI ID:{" "}
                <span className="font-mono text-foreground">{upiId}</span>
              </p>
            </div>

            <div>
              <label
                htmlFor="paymentUtr"
                className="block text-sm font-medium text-foreground"
              >
                UPI Transaction ID / UTR Number *
              </label>
              <input
                id="paymentUtr"
                name="paymentUtr"
                type="text"
                value={form.paymentUtr}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    paymentUtr: event.target.value,
                  }))
                }
                aria-invalid={Boolean(errors.paymentUtr)}
                className={fieldClass(Boolean(errors.paymentUtr))}
                placeholder="e.g. 432512345678 (12-digit UTR from your UPI app)"
              />
              {errors.paymentUtr ? (
                <p className="mt-1 text-xs leading-relaxed text-danger">
                  {errors.paymentUtr}
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted">
                  The Organising Committee matches this UTR against the bank
                  statement before confirming your registration and sending the
                  confirmation email.
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="paymentProof"
                className="block text-sm font-medium text-foreground"
              >
                Payment Screenshot / Receipt (recommended)
              </label>
              <input
                id="paymentProof"
                name="paymentProof"
                type="file"
                accept="image/*,application/pdf"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    paymentProof: event.target.files?.[0] ?? null,
                  }))
                }
                className={cn(
                  "mt-2 block w-full cursor-pointer rounded-md border bg-background text-sm text-muted file:mr-3 file:cursor-pointer file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary-hover",
                  errors.paymentProof ? "border-danger" : "border-border",
                )}
              />
              {errors.paymentProof ? (
                <p className="mt-1 text-xs text-danger">{errors.paymentProof}</p>
              ) : (
                <p className="mt-1 text-xs text-muted">
                  Uploading a screenshot speeds up payment confirmation by the OC.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Step 3: Consent */}
      <section
        hidden={step !== 3}
        className="form-panel rounded-xl border border-border bg-surface p-5 sm:p-6"
        aria-labelledby="consent-heading"
      >
        <h3
          id="consent-heading"
          className="text-lg font-semibold tracking-tight text-foreground"
        >
          Consent &amp; Final Review
        </h3>

        <dl className="mt-4 grid gap-3 rounded-lg border border-border bg-background p-4 text-xs sm:grid-cols-3">
          <div>
            <dt className="font-mono uppercase tracking-[0.12em] text-muted">
              Team &amp; Track
            </dt>
            <dd className="mt-1 text-sm font-medium text-foreground">
              {form.teamName || "—"} ({form.track || "—"})
            </dd>
          </div>
          <div>
            <dt className="font-mono uppercase tracking-[0.12em] text-muted">
              Fee &amp; Category
            </dt>
            <dd className="mt-1 text-sm font-medium text-foreground">
              ₹{payableAmount} · {form.participantCategory === "iist" ? "IISTian" : "Outsider"}
            </dd>
          </div>
          <div>
            <dt className="font-mono uppercase tracking-[0.12em] text-muted">
              UPI / UTR Reference
            </dt>
            <dd className="mt-1 font-mono text-sm font-medium text-foreground">
              {form.paymentUtr || "—"}
            </dd>
          </div>
        </dl>

        <div className="mt-5 space-y-4">
          <div>
            <label className="flex cursor-pointer gap-3 text-sm leading-relaxed text-foreground">
              <input
                type="checkbox"
                checked={form.rulebookAccepted}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    rulebookAccepted: event.target.checked,
                  }))
                }
                className="mt-0.5 size-4 shrink-0 accent-primary"
              />
              <span>
                We have read and accept the{" "}
                <Link
                  href="/rules"
                  className="text-primary underline underline-offset-4"
                >
                  official rulebook
                </Link>
                .
              </span>
            </label>
            {errors.rulebookAccepted ? (
              <p className="mt-1 pl-7 text-xs text-danger">
                {errors.rulebookAccepted}
              </p>
            ) : null}
          </div>

          <div>
            <label className="flex cursor-pointer gap-3 text-sm leading-relaxed text-foreground">
              <input
                type="checkbox"
                checked={form.declarationAccepted}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    declarationAccepted: event.target.checked,
                  }))
                }
                className="mt-0.5 size-4 shrink-0 accent-primary"
              />
              <span>
                Every member accepts the{" "}
                <Link
                  href="/fair-play"
                  className="text-primary underline underline-offset-4"
                >
                  Integrity Declaration
                </Link>
                .
              </span>
            </label>
            {errors.declarationAccepted ? (
              <p className="mt-1 pl-7 text-xs text-danger">
                {errors.declarationAccepted}
              </p>
            ) : null}
          </div>

          <div>
            <label className="flex cursor-pointer gap-3 text-sm leading-relaxed text-foreground">
              <input
                type="checkbox"
                checked={form.seniorityConfirmed}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    seniorityConfirmed: event.target.checked,
                  }))
                }
                className="mt-0.5 size-4 shrink-0 accent-primary"
              />
              <span>
                We declare that our programme, year, track, and payment details
                are accurate, and understand that confirmation email is sent
                after OC payment verification.
              </span>
            </label>
            {errors.seniorityConfirmed ? (
              <p className="mt-1 pl-7 text-xs text-danger">
                {errors.seniorityConfirmed}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {errors.form ? (
        <p className="text-sm leading-relaxed text-danger">{errors.form}</p>
      ) : null}

      {attemptedSteps[step] && errorCount > 0 ? (
        <div
          role="alert"
          className="rounded-lg border border-danger bg-danger-soft p-4 text-sm leading-relaxed text-danger"
        >
          Please fix the highlighted fields before continuing.{" "}
          {errorCount === 1
            ? "One field needs attention."
            : `${errorCount} fields need attention.`}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-muted">
          Step {step + 1} of {steps.length} · Fee:{" "}
          {general.registrationFee ?? TBA}.
        </p>
        <div className="flex flex-wrap gap-3">
          {step > 0 ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStep((current) => Math.max(0, current - 1))}
            >
              Back
            </Button>
          ) : null}
          {step < lastStep ? (
            <Button3D type="button" onClick={goNext}>
              Continue
            </Button3D>
          ) : (
            <Button3D type="submit" disabled={submitting} aria-busy={submitting}>
              {submitting ? "Submitting…" : "Submit registration"}
            </Button3D>
          )}
        </div>
      </div>
    </form>
  );
}
