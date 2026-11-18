export type TrackId = "beginner" | "advanced";

export interface TrackingSnapshot {
  tracked: TrackId | null;
  hovered: TrackId | null;
}

const EMPTY: TrackingSnapshot = { tracked: null, hovered: null };

let tracked: TrackId | null = null;
let hovered: TrackId | null = null;
const listeners = new Set<() => void>();
let snapshot: TrackingSnapshot = EMPTY;

let reticleEl: HTMLElement | null = null;
let hoverLabelEl: HTMLElement | null = null;

function emit() {
  snapshot = { tracked, hovered };
  for (const listener of listeners) {
    listener();
  }
}

export function getTrackingSnapshot(): TrackingSnapshot {
  return snapshot;
}

export function getServerTrackingSnapshot(): TrackingSnapshot {
  return EMPTY;
}

export function subscribeTracking(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getTracked() {
  return tracked;
}

export function getHovered() {
  return hovered;
}

export function setHovered(id: TrackId | null) {
  if (hovered === id) {
    return;
  }

  hovered = id;
  emit();
}

export function startTracking(id: TrackId) {
  if (tracked === id) {
    return;
  }

  tracked = id;
  emit();
}

export function stopTracking() {
  if (!tracked) {
    return;
  }

  tracked = null;
  emit();
}

export function switchTracking() {
  if (!tracked) {
    return;
  }

  tracked = tracked === "beginner" ? "advanced" : "beginner";
  emit();
}

export function registerReticle(el: HTMLElement | null) {
  reticleEl = el;
}

export function registerHoverLabel(el: HTMLElement | null) {
  hoverLabelEl = el;
}

export function getReticleEl() {
  return reticleEl;
}

export function getHoverLabelEl() {
  return hoverLabelEl;
}
