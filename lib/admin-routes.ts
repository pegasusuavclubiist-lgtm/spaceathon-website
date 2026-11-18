/** Role sets for admin routes (see lib/admin.ts). `oc` is always allowed. */
import type { AdminRole } from "./config";

export const OC: readonly AdminRole[] = ["oc"];
export const TECH: readonly AdminRole[] = ["oc", "technical"];
export const MOD: readonly AdminRole[] = ["oc", "moderator", "chair"];
export const JUDGING: readonly AdminRole[] = ["oc", "chair", "moderator"];
