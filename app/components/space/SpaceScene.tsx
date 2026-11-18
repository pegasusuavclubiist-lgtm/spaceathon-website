"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { EffectsMode } from "../effects/effects-store";
import { getScrollState, subscribeScroll } from "../effects/scroll-store";
import { stopTracking } from "./tracking-store";
import { Nebula } from "./Nebula";
import { Starfield } from "./Starfield";
import { DistantGlobe } from "./DistantGlobe";
import { OrbitScene } from "./OrbitScene";
import { TrackingOverlays } from "./TrackingOverlays";

const REDUCED_FPS = 30;
const FULL_FPS = 60;
const PAST_HERO_PROGRESS = 0.65;

function ContextGuard({ onLost }: { onLost: () => void }) {
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    const canvas = gl.domElement;

    function handleLost(event: Event) {
      event.preventDefault();
      onLost();
    }

    canvas.addEventListener("webglcontextlost", handleLost);
    return () => canvas.removeEventListener("webglcontextlost", handleLost);
  }, [gl, onLost]);

  return null;
}

function FrameDriver({
  lite,
  home,
  pastHero,
}: {
  lite: boolean;
  home: boolean;
  pastHero: boolean;
}) {
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const cap = REDUCED_FPS;
    const fps = lite || !home || pastHero ? cap : FULL_FPS;
    const interval = Math.max(16, Math.floor(1000 / fps));

    function invalidateIfVisible() {
      if (!document.hidden) {
        invalidate();
      }
    }

    invalidate();
    const intervalId = window.setInterval(invalidateIfVisible, interval);
    document.addEventListener("visibilitychange", invalidateIfVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", invalidateIfVisible);
    };
  }, [invalidate, lite, home, pastHero]);

  return null;
}

export default function SpaceScene({ mode }: { mode: EffectsMode }) {
  const pathname = usePathname();
  const [lost, setLost] = useState(false);
  const [canvasOffscreen, setCanvasOffscreen] = useState(false);
  const sceneRef = useRef<HTMLDivElement>(null);
  const subscribePastHero = useCallback(
    (onStoreChange: () => void) => subscribeScroll(() => onStoreChange()),
    [],
  );
  const getPastHero = useCallback(
    () => getScrollState().progress > PAST_HERO_PROGRESS,
    [],
  );
  const pastHero = useSyncExternalStore(
    subscribePastHero,
    getPastHero,
    () => false,
  );
  const lite = mode === "lite";
  const home = pathname === "/";
  const suspended = canvasOffscreen || lost;

  useEffect(() => {
    stopTracking();
  }, [pathname]);

  useEffect(() => {
    const node = sceneRef.current;

    if (!node || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setCanvasOffscreen(!entry.isIntersecting);
        }
      },
      { threshold: 0 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  if (lost) {
    return null;
  }

  return (
    <div ref={sceneRef} style={{ position: "absolute", inset: 0 }}>
      <Canvas
        frameloop="demand"
        camera={{ position: [0, 1.55, 9.6], fov: 42, near: 0.1, far: 80 }}
        dpr={[1, lite ? 1 : 1.5]}
        gl={{
          alpha: true,
          antialias: !lite,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
      >
        <ContextGuard onLost={() => setLost(true)} />
        {!suspended ? (
          <FrameDriver lite={lite} home={home} pastHero={pastHero} />
        ) : null}
        <Nebula />
        <Starfield lite={lite} />
        {home ? <OrbitScene lite={lite} /> : <DistantGlobe lite={lite} />}
      </Canvas>
      {home ? <TrackingOverlays /> : null}
    </div>
  );
}
