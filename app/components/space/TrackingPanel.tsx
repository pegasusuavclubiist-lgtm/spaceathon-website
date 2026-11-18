"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { tracks } from "@/app/content/event-data";
import { Badge } from "../ui/Badge";
import { Button3D } from "../ui/Button3D";
import { Frame } from "../ui/Frame";
import { StatusLight } from "../ui/StatusLight";
import { Surface } from "../ui/Surface";
import {
  getServerTrackingSnapshot,
  getTracked,
  getTrackingSnapshot,
  stopTracking,
  switchTracking,
  subscribeTracking,
  type TrackId,
} from "./tracking-store";

const SAT_META: Record<
  TrackId,
  { label: string; orbit: string; tone: "primary" | "accent" }
> = {
  beginner: { label: "SAT-01", orbit: "Low Earth Orbit", tone: "primary" },
  advanced: { label: "SAT-02", orbit: "Deep Space", tone: "accent" },
};

const TELEMETRY: Record<
  TrackId,
  {
    alt: number;
    altDrift: number;
    velocity: number;
    velocityDrift: number;
    period: number;
    periodDrift: number;
    signal: number;
    signalDrift: number;
  }
> = {
  beginner: {
    alt: 552,
    altDrift: 9,
    velocity: 7.59,
    velocityDrift: 0.02,
    period: 94.6,
    periodDrift: 0.4,
    signal: -108,
    signalDrift: 1.6,
  },
  advanced: {
    alt: 1836,
    altDrift: 26,
    velocity: 7.06,
    velocityDrift: 0.03,
    period: 123.4,
    periodDrift: 0.6,
    signal: -124,
    signalDrift: 2.2,
  },
};

export function TrackingPanel() {
  const { tracked } = useSyncExternalStore(
    subscribeTracking,
    getTrackingSnapshot,
    getServerTrackingSnapshot,
  );
  const reducedMotion = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  )[0];
  const [now, setNow] = useState(() => 0);

  useEffect(() => {
    if (!tracked || reducedMotion) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setNow(Date.now() / 1000);
    }, 250);

    return () => window.clearInterval(interval);
  }, [tracked, reducedMotion]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && getTracked()) {
        stopTracking();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!tracked) {
    return null;
  }

  const track = tracks.find((entry) => entry.id === tracked);

  if (!track) {
    return null;
  }

  const sat = SAT_META[tracked];
  const sim = TELEMETRY[tracked];
  const phase = reducedMotion ? 0 : now;
  const altitude =
    sim.alt +
    Math.sin(phase * 0.7) * sim.altDrift +
    Math.sin(phase * 1.7 + 1.3) * sim.altDrift * 0.35;
  const velocity = sim.velocity + Math.sin(phase * 0.9 + 0.6) * sim.velocityDrift;
  const period = sim.period + Math.sin(phase * 0.5 + 2.1) * sim.periodDrift;
  const signal = sim.signal + Math.sin(phase * 1.3 + 0.9) * sim.signalDrift;

  return (
    <div className="tracking-panel" role="region" aria-label="Satellite tracking" data-no-orbit>
      <p className="sr-only" aria-live="polite">
        Now tracking {sat.label}, {track.name} track
      </p>
      <Surface tone="raised" depth={3} className="tracking-panel-surface">
        <Frame>
          <div className="tracking-panel-inner">
            <div className="tracking-panel-head">
              <StatusLight tone="go" />
              <p className="tracking-panel-eyebrow">TRACKING // {sat.label}</p>
              <Badge tone={sat.tone}>{sat.label}</Badge>
            </div>
            <h2 className="tracking-panel-title">
              {track.name} track · {sat.orbit}
            </h2>
            <p className="tracking-panel-audience">{track.audience}</p>
            <p className="tracking-panel-team">{track.teamSize}</p>
            <div>
              <p className="tracking-panel-label">Problem style</p>
              <ul className="tracking-panel-list">
                {track.problemStyle.slice(0, 3).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="tracking-chips">
              {track.submissionPack.map((item) => (
                <Badge key={item} tone="neutral">
                  {item}
                </Badge>
              ))}
            </div>
            <p className="tracking-panel-finalists">{track.finalists}</p>
            <div className="tracking-sim" aria-hidden="true">
              <div className="tracking-sim-head">
                <span className="tracking-panel-label">Simulated telemetry</span>
                <span className="tracking-sim-note">SIMULATED / DECORATIVE</span>
              </div>
              <div className="tracking-metric-grid">
                <div className="tracking-metric">
                  <p className="tracking-metric-label">Altitude</p>
                  <p className="tracking-metric-value">
                    {altitude.toFixed(0)} KM
                  </p>
                </div>
                <div className="tracking-metric">
                  <p className="tracking-metric-label">Velocity</p>
                  <p className="tracking-metric-value">
                    {velocity.toFixed(2)} KM/S
                  </p>
                </div>
                <div className="tracking-metric">
                  <p className="tracking-metric-label">Orbital period</p>
                  <p className="tracking-metric-value">
                    {period.toFixed(1)} MIN
                  </p>
                </div>
                <div className="tracking-metric">
                  <p className="tracking-metric-label">Signal</p>
                  <p className="tracking-metric-value">
                    {signal.toFixed(1)} DBM
                  </p>
                </div>
              </div>
            </div>
            <div className="tracking-panel-actions">
              <Button3D href={`/tracks#${tracked}`} size="sm">
                Open track
              </Button3D>
              <Button3D variant="secondary" size="sm" onClick={switchTracking}>
                Switch satellite
              </Button3D>
              <Button3D variant="ghost" size="sm" onClick={stopTracking}>
                Release
              </Button3D>
            </div>
          </div>
        </Frame>
      </Surface>
    </div>
  );
}
