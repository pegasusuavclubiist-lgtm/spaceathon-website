"use client";

import { useSyncExternalStore } from "react";
import {
  getServerTrackingSnapshot,
  getTrackingSnapshot,
  registerHoverLabel,
  registerReticle,
  subscribeTracking,
} from "./tracking-store";

const SAT_META = {
  beginner: { label: "SAT-01", track: "BEGINNER" },
  advanced: { label: "SAT-02", track: "ADVANCED" },
} as const;

export function TrackingOverlays() {
  const { hovered, tracked } = useSyncExternalStore(
    subscribeTracking,
    getTrackingSnapshot,
    getServerTrackingSnapshot,
  );

  const hoverMeta = hovered && !tracked ? SAT_META[hovered] : null;
  const reticleMeta = tracked ? SAT_META[tracked] : null;

  return (
    <>
      {hoverMeta ? (
        <div
          ref={(node) => {
            registerHoverLabel(node);
            return () => registerHoverLabel(null);
          }}
          className="sat-hover-label"
        >
          <span className="sat-hover-title">
            {hoverMeta.label} / {hoverMeta.track}
          </span>
          <span className="sat-hover-sub">Click to track</span>
        </div>
      ) : null}
      {reticleMeta ? (
        <div
          ref={(node) => {
            registerReticle(node);
            return () => registerReticle(null);
          }}
          className="sat-reticle"
        >
          <span className="sat-reticle-corner sat-reticle-corner-tl" />
          <span className="sat-reticle-corner sat-reticle-corner-tr" />
          <span className="sat-reticle-corner sat-reticle-corner-bl" />
          <span className="sat-reticle-corner sat-reticle-corner-br" />
          <span className="sat-reticle-cross" />
          <span className="sat-reticle-label">
            {reticleMeta.label} / TRACKING
          </span>
        </div>
      ) : null}
    </>
  );
}
