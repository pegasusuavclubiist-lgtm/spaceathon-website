"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  getServerTrackingSnapshot,
  getTracked,
  getTrackingSnapshot,
  startTracking,
  stopTracking,
  subscribeTracking,
  type TrackId,
} from "./tracking-store";

const CHIPS: ReadonlyArray<{ id: TrackId; sat: string; label: string }> = [
  { id: "beginner", sat: "SAT-01", label: "Beginner" },
  { id: "advanced", sat: "SAT-02", label: "Advanced" },
];

export function SatelliteChips() {
  const { tracked } = useSyncExternalStore(
    subscribeTracking,
    getTrackingSnapshot,
    getServerTrackingSnapshot,
  );
  const chipRefs = useRef<Partial<Record<TrackId, HTMLButtonElement | null>>>(
    {},
  );
  const lastOpened = useRef<TrackId | null>(null);
  const hadTracked = useRef(false);

  useEffect(() => {
    if (tracked) {
      hadTracked.current = true;
      return;
    }

    if (hadTracked.current) {
      hadTracked.current = false;
      const opened = lastOpened.current;

      if (opened) {
        chipRefs.current[opened]?.focus();
      }
    }
  }, [tracked]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && getTracked()) {
        stopTracking();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="sat-chips-row" role="group" aria-label="Track a satellite" data-no-orbit>
      <span className="sat-chips-label">Track a satellite</span>
      {CHIPS.map((chip) => {
        const pressed = tracked === chip.id;

        return (
          <button
            key={chip.id}
            type="button"
            ref={(node) => {
              chipRefs.current[chip.id] = node;
            }}
            className="sat-chip"
            data-track={chip.id}
            aria-pressed={pressed}
            data-cursor="TRACK"
            data-no-orbit
            onClick={() => {
              if (pressed) {
                stopTracking();
                return;
              }

              lastOpened.current = chip.id;
              startTracking(chip.id);
            }}
          >
            <span className="sat-chip-dot" aria-hidden="true" />
            {chip.sat} {chip.label}
          </button>
        );
      })}
    </div>
  );
}
