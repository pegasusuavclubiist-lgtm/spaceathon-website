/**
 * Minimal Supabase client over the PostgREST and Storage HTTP APIs, using the
 * service-role key. Server-only: never import this from client components.
 * Deliberately dependency-free (just `fetch`).
 */

import { getConfig } from "./config";

export class SupabaseError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details: string | null;

  constructor(status: number, message: string, code: string | null, details: string | null) {
    super(message);
    this.name = "SupabaseError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const TIMEOUT_MS = 10_000;
export const ID_BUCKET = "college-ids";
export const PROBLEMS_BUCKET = "problems";
export const SUBMISSIONS_BUCKET = "submissions";

function credentials() {
  const { supabaseUrl, serviceRoleKey } = getConfig();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new SupabaseError(503, "Supabase is not configured", null, null);
  }
  return { url: supabaseUrl, key: serviceRoleKey };
}

async function call(
  path: string,
  init: RequestInit & { headers?: Record<string, string> } = {},
): Promise<Response> {
  const { url, key } = credentials();
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...init.headers,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    let body: { message?: string; code?: string; details?: string } = {};
    try {
      body = await response.json();
    } catch {
      /* non-JSON error body */
    }
    throw new SupabaseError(
      response.status,
      body.message ?? `Supabase request failed (${response.status})`,
      body.code ?? null,
      body.details ?? null,
    );
  }
  return response;
}

const json = { "Content-Type": "application/json" };

export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const response = await call(`/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: json,
    body: JSON.stringify(args),
  });
  return (await response.json()) as T;
}

export async function selectRows<T>(
  table: string,
  params: Record<string, string>,
  options: { count?: boolean } = {},
): Promise<{ rows: T[]; total: number | null }> {
  const query = new URLSearchParams(params).toString();
  const response = await call(`/rest/v1/${table}?${query}`, {
    headers: options.count ? { Prefer: "count=exact" } : {},
  });
  const rows = (await response.json()) as T[];
  const range = response.headers.get("content-range"); // e.g. "0-24/134"
  const total = range?.includes("/") ? Number(range.split("/")[1]) : null;
  return { rows, total: Number.isFinite(total) ? total : null };
}

export async function insertRow<T>(
  table: string,
  row: Record<string, unknown>,
  select = "*",
): Promise<T> {
  const response = await call(`/rest/v1/${table}?select=${encodeURIComponent(select)}`, {
    method: "POST",
    headers: { ...json, Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  const rows = (await response.json()) as T[];
  return rows[0];
}

/** PATCH rows matching `filter` (PostgREST syntax, e.g. { id: "eq.reg_x" }). */
export async function updateRows(
  table: string,
  filter: Record<string, string>,
  patch: Record<string, unknown>,
): Promise<number> {
  const query = new URLSearchParams({ ...filter, select: "id" }).toString();
  const response = await call(`/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: { ...json, Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  return ((await response.json()) as unknown[]).length;
}

// ── Storage ────────────────────────────────────────────────────────────────

function objectPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export async function uploadObject(
  path: string,
  bytes: Uint8Array,
  contentType: string,
  bucket: string = ID_BUCKET,
): Promise<void> {
  await call(`/storage/v1/object/${bucket}/${objectPath(path)}`, {
    method: "POST",
    headers: { "Content-Type": contentType, "x-upsert": "false" },
    body: bytes as unknown as BodyInit,
  });
}

export async function removeObjects(paths: string[], bucket: string = ID_BUCKET): Promise<void> {
  if (paths.length === 0) return;
  await call(`/storage/v1/object/${bucket}`, {
    method: "DELETE",
    headers: json,
    body: JSON.stringify({ prefixes: paths }),
  });
}

/** Short-lived download URL for a private object. */
export async function signedDownloadUrl(
  path: string,
  expiresInSeconds: number,
  downloadName: string,
  bucket: string = ID_BUCKET,
): Promise<string> {
  const response = await call(`/storage/v1/object/sign/${bucket}/${objectPath(path)}`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ expiresIn: expiresInSeconds }),
  });
  const { signedURL } = (await response.json()) as { signedURL: string };
  const { url } = credentials();
  const separator = signedURL.includes("?") ? "&" : "?";
  return `${url}/storage/v1${signedURL}${separator}download=${encodeURIComponent(downloadName)}`;
}

/**
 * One-shot signed upload URL so large files (reports, demo videos, datasets)
 * go straight to Storage and never pass through a serverless body limit.
 * The client PUTs the file to `uploadUrl` with a Content-Type header.
 */
export async function createSignedUploadUrl(
  bucket: string,
  path: string,
): Promise<{ uploadUrl: string }> {
  const response = await call(`/storage/v1/object/upload/sign/${bucket}/${objectPath(path)}`, {
    method: "POST",
    headers: json,
    body: "{}",
  });
  const { url } = (await response.json()) as { url: string };
  const { url: base } = credentials();
  return { uploadUrl: `${base}/storage/v1${url.startsWith("/") ? "" : "/"}${url}` };
}

/** Stream an object through a SHA-256 hasher; returns null if it does not exist. */
export async function hashObject(
  bucket: string,
  path: string,
  maxBytes: number,
): Promise<{ sha256: string; size: number; head: Uint8Array } | null> {
  const { createHash } = await import("node:crypto");
  const { url, key } = credentials();
  const response = await fetch(`${url}/storage/v1/object/${bucket}/${objectPath(path)}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(120_000),
  });
  if (response.status === 404 || response.status === 400) return null;
  if (!response.ok || !response.body) {
    throw new SupabaseError(response.status, "Storage read failed", null, null);
  }
  const hash = createHash("sha256");
  const reader = response.body.getReader();
  let size = 0;
  let head = new Uint8Array(0);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (head.length === 0) head = value.slice(0, 64);
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new SupabaseError(413, "Object too large", null, null);
    }
    hash.update(value);
  }
  return { sha256: hash.digest("hex"), size, head };
}

/** Read a whole (small) object into memory, e.g. a text statement to watermark. */
export async function downloadObject(bucket: string, path: string): Promise<Uint8Array> {
  const response = await call(`/storage/v1/object/${bucket}/${objectPath(path)}`);
  return new Uint8Array(await response.arrayBuffer());
}
