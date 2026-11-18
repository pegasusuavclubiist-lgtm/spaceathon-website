"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useEffects } from "../effects/effects-provider";
import { supportsWebGL } from "../effects/effects-store";
import { stopTracking } from "./tracking-store";
import { TrackingPanel } from "./TrackingPanel";

const SpaceScene = dynamic(() => import("./SpaceScene"), {
  ssr: false,
  loading: () => null,
});

function subscribeNothing() {
  return () => {};
}

function getWebGL() {
  return supportsWebGL();
}

function getServerWebGL() {
  return false;
}

export function SpaceCanvas() {
  const { mode, ready } = useEffects();
  const [idle, setIdle] = useState(false);
  const webgl = useSyncExternalStore(
    subscribeNothing,
    getWebGL,
    getServerWebGL,
  );

  useEffect(() => {
    if (!ready || mode !== "off") {
      return;
    }

    stopTracking();
  }, [ready, mode]);

  useEffect(() => {
    if (!ready || mode === "off" || !webgl) {
      return;
    }

    let cancelled = false;
    const requestIdle =
      typeof window.requestIdleCallback === "function"
        ? (callback: () => void) =>
            window.requestIdleCallback(callback, { timeout: 2000 })
        : (callback: () => void) => window.setTimeout(callback, 1200);

    const handle = requestIdle(() => {
      if (!cancelled) {
        setIdle(true);
      }
    });

    return () => {
      cancelled = true;
      if (typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(handle as number);
      } else {
        window.clearTimeout(handle as number);
      }
    };
  }, [ready, mode, webgl]);

  if (!ready) {
    return null;
  }

  if (mode === "off" || !webgl) {
    return (
      <>
        <div className="space-canvas-fixed space-horizon-off" aria-hidden="true">
          <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
            <defs>
              <radialGradient id="orbit-fallback-globe" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#123240" />
                <stop offset="55%" stopColor="#08141f" />
                <stop offset="100%" stopColor="#03060c" />
              </radialGradient>
              <radialGradient id="orbit-fallback-glow" cx="50%" cy="50%" r="50%">
                <stop offset="72%" stopColor="#3ac8e0" stopOpacity="0" />
                <stop offset="88%" stopColor="#3ac8e0" stopOpacity="0.32" />
                <stop offset="100%" stopColor="#3ac8e0" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="900" cy="380" r="150" fill="url(#orbit-fallback-glow)" />
            <g className="space-horizon-orbit-a">
              <ellipse
                cx="900"
                cy="380"
                rx="235"
                ry="72"
                transform="rotate(-16 900 380)"
                fill="none"
                stroke="#6fe3f2"
                strokeOpacity="0.5"
                strokeWidth="2"
              />
              <g transform="translate(1135 318) rotate(-16)">
                <rect x="-14" y="-2.5" width="10" height="5" fill="#274b63" />
                <rect x="4" y="-2.5" width="10" height="5" fill="#274b63" />
                <rect x="-4" y="-4" width="8" height="8" fill="#cdd5e0" />
                <circle r="2" fill="#ffd9a0" />
              </g>
            </g>
            <g className="space-horizon-orbit-b">
              <ellipse
                cx="900"
                cy="380"
                rx="330"
                ry="118"
                transform="rotate(14 900 380)"
                fill="none"
                stroke="#ff9e45"
                strokeOpacity="0.42"
                strokeWidth="2"
              />
              <g transform="translate(590 430) rotate(14)">
                <rect x="-14" y="-2.5" width="10" height="5" fill="#273c54" />
                <rect x="4" y="-2.5" width="10" height="5" fill="#273c54" />
                <rect x="-4" y="-4" width="8" height="8" fill="#cdd5e0" />
                <circle r="2" fill="#ffd9a0" />
              </g>
            </g>
            <circle
              cx="900"
              cy="380"
              r="118"
              fill="url(#orbit-fallback-globe)"
              stroke="#2b4a5a"
              strokeOpacity="0.8"
              strokeWidth="1.5"
            />
            <circle cx="862" cy="352" r="3.4" fill="#ffb066" fillOpacity="0.9" />
            <circle cx="936" cy="402" r="2.2" fill="#8fe8f4" fillOpacity="0.8" />
            <circle cx="884" cy="428" r="1.7" fill="#d9e8ff" fillOpacity="0.7" />
          </svg>
        </div>
        <TrackingPanel />
      </>
    );
  }

  if (!idle) {
    return <TrackingPanel />;
  }

  return (
    <>
      <div className="space-canvas-fixed" aria-hidden="true">
        <SpaceScene mode={mode} />
      </div>
      <TrackingPanel />
    </>
  );
}
