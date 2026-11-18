"use client";

import type { ReactNode } from "react";
import type { ApiResult } from "@/app/types/api";
import { cn } from "../ui/cn";

export const fieldBase =
  "mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted transition-colors hover:border-border-strong";

export const IST = "Asia/Kolkata";

export function formatIst(iso: string | null | undefined): string {
  if (!iso) return "To be announced";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "To be announced";
  return `${date.toLocaleString("en-IN", { timeZone: IST, dateStyle: "medium", timeStyle: "short" })} IST`;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** Message plus per-field errors from a failed ApiResult, for inline display. */
export function errorText(result: Extract<ApiResult<unknown>, { ok: false }>): string {
  const fields = result.fieldErrors ? Object.values(result.fieldErrors).join(" ") : "";
  return fields && !result.message.includes(fields) ? `${result.message} ${fields}` : result.message;
}

export function Notice({ tone, children }: { tone: "error" | "ok" | "info"; children: ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "mt-3 rounded-md border px-3 py-2 text-sm leading-relaxed",
        tone === "error" && "border-danger bg-danger-soft text-danger",
        tone === "ok" && "border-success bg-success-soft text-success",
        tone === "info" && "border-border-strong bg-surface-raised text-muted",
      )}
    >
      {children}
    </p>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-[var(--elev-1)]">
      <h3 className="text-lg font-semibold tracking-tight text-foreground">{title}</h3>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}
