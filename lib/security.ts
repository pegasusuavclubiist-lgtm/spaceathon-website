import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Constant-time string comparison (compares fixed-length digests). */
export function safeEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

/** Public record id such as `reg_3f9a…`; random, unguessable, URL/path safe. */
export function newId(prefix: "reg" | "msg" | "prob" | "tkt" | "pred" | "app" | "jdg"): string {
  return `${prefix}_${randomBytes(10).toString("hex")}`;
}

/** Capability token handed to the registrant once; only its hash is stored. */
export function newUploadToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Hash an IP so rate limiting works without storing the address itself. */
export function hashIp(ip: string, salt: string): string {
  return sha256Hex(`${salt}:${ip}`).slice(0, 32);
}

export type IdFileKind = "pdf" | "jpeg" | "png" | "webp";

export const ID_FILE_TYPES: Record<
  IdFileKind,
  { contentType: string; extension: string }
> = {
  pdf: { contentType: "application/pdf", extension: "pdf" },
  jpeg: { contentType: "image/jpeg", extension: "jpg" },
  png: { contentType: "image/png", extension: "png" },
  webp: { contentType: "image/webp", extension: "webp" },
};

/**
 * Identify an uploaded college ID by its leading bytes. The client-supplied
 * MIME type and filename are never trusted.
 */
export function sniffIdFile(bytes: Uint8Array): IdFileKind | null {
  const startsWith = (sig: number[], offset = 0) =>
    bytes.length >= offset + sig.length &&
    sig.every((value, i) => bytes[offset + i] === value);

  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (startsWith([0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (
    startsWith([0x52, 0x49, 0x46, 0x46]) && // RIFF
    startsWith([0x57, 0x45, 0x42, 0x50], 8) // WEBP
  ) {
    return "webp";
  }
  return null;
}

/** Per-member portal key (shown once, only the hash is stored). */
export function newPortalToken(prefix: "kmp" | "kmj" = "kmp"): string {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}


/** Deterministic per-team secret derived from the server secret (rulebook 5.9 seeds, 5.8 canaries). */
export function teamSeedHex(teamId: string, secret: string): string {
  return createHmac("sha256", secret).update(`team-seed:${teamId}`).digest("hex");
}
