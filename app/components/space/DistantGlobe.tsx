"use client";

import { useMemo } from "react";
import { Globe } from "./Globe";

export function DistantGlobe({ lite }: { lite: boolean }) {
  const fadeRef = useMemo(() => ({ current: 0.32 }), []);

  return (
    <group position={[3.6, -2.6, -9]} scale={0.55}>
      <Globe lite={lite} fadeRef={fadeRef} />
    </group>
  );
}
