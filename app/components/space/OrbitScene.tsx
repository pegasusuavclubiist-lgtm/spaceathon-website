"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  MathUtils,
  Object3D,
  Vector3,
  type Group,
  type InstancedMesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
} from "three";
import { getPointer } from "../effects/pointer-store";
import { getScrollState } from "../effects/scroll-store";
import {
  getHovered,
  getReticleEl,
  getHoverLabelEl,
  getTracked,
  setHovered,
  startTracking,
  stopTracking,
  type TrackId,
} from "./tracking-store";
import { Globe, AXIAL_TILT } from "./Globe";

const GLOBE_RADIUS = 1.65;
const INNER_RADIUS = GLOBE_RADIUS * 1.7;
const OUTER_RADIUS = GLOBE_RADIUS * 2.5;
const TICK_RADIUS = GLOBE_RADIUS * 2.0;
const TICK_COUNT = 48;

const INNER_TILT = MathUtils.degToRad(24);
const OUTER_TILT = MathUtils.degToRad(-16);
const INNER_PERIOD = 28;
const OUTER_PERIOD = 46;

const HOVER_RADIUS_MOUSE = 36;
const HOVER_RADIUS_TOUCH = 56;

const FOLLOW_RADIAL_OFFSET = 2.2;
const FOLLOW_UP_OFFSET = 0.9;
const AUTO_RELEASE_PROGRESS = 0.45;

const SCROLL_SPAN = 0.6;
const RECEDE_START = 0.65;
const RECEDE_MAX = 0.62;

const TRAIL_POINTS = 24;
const TRAIL_STRIDE = 4;

const CLICK_SELECTOR =
  'a, button, input, select, textarea, summary, label, [role="button"], [role="tab"], [contenteditable], [data-no-orbit]';

const SATELLITES: ReadonlyArray<{
  id: TrackId;
  radius: number;
  period: number;
  dir: 1 | -1;
  offset: number;
  tilt: number;
  tint: string;
}> = [
  {
    id: "beginner",
    radius: INNER_RADIUS,
    period: INNER_PERIOD,
    dir: 1,
    offset: 0.9,
    tilt: INNER_TILT,
    tint: "#6fe3f2",
  },
  {
    id: "advanced",
    radius: OUTER_RADIUS,
    period: OUTER_PERIOD,
    dir: -1,
    offset: 3.4,
    tilt: OUTER_TILT,
    tint: "#ffb066",
  },
];

function circlePositions(radius: number, segments: number) {
  const positions = new Float32Array(segments * 3);

  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = 0;
    positions[index * 3 + 2] = Math.sin(angle) * radius;
  }

  return positions;
}

function arcPositions(radius: number, arcDegrees: number, segments: number) {
  const positions = new Float32Array((segments + 1) * 3);
  const arc = MathUtils.degToRad(arcDegrees);

  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * arc - arc / 2;
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = 0;
    positions[index * 3 + 2] = Math.sin(angle) * radius;
  }

  return positions;
}

function trailColorData(tint: string) {
  const color = new Color(tint);
  const colors = new Float32Array(TRAIL_POINTS * 3);

  for (let index = 0; index < TRAIL_POINTS; index += 1) {
    const weight = Math.pow(index / (TRAIL_POINTS - 1), 1.7);
    colors[index * 3] = color.r * weight;
    colors[index * 3 + 1] = color.g * weight;
    colors[index * 3 + 2] = color.b * weight;
  }

  return colors;
}

function createArcLine(radius: number, arcDegrees: number, segments: number, tint: string) {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(arcPositions(radius, arcDegrees, segments), 3),
  );
  const material = new LineDashedMaterial({
    color: tint,
    transparent: true,
    opacity: 0,
    dashSize: 0.34,
    gapSize: 0.2,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const line = new Line(geometry, material);
  line.frustumCulled = false;
  line.visible = false;
  return line;
}

function createTrailLine(tint: string) {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(TRAIL_POINTS * 3), 3),
  );
  geometry.setAttribute("color", new BufferAttribute(trailColorData(tint), 3));
  const material = new LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const line = new Line(geometry, material);
  line.frustumCulled = false;
  return line;
}

export function OrbitScene({ lite }: { lite: boolean }) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const isNarrow = size.width < 768;

  const reducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const coarsePointer = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: coarse)").matches,
    [],
  );
  const hitRadius = coarsePointer ? HOVER_RADIUS_TOUCH : HOVER_RADIUS_MOUSE;

  const rootRef = useRef<Group>(null);
  const tickSpinRef = useRef<Group>(null);
  const tickMeshRef = useRef<InstancedMesh>(null);
  const tickDummy = useMemo(() => new Object3D(), []);
  const lastLit = useRef(-1);
  const tickColorA = useMemo(() => new Color("#ffb066"), []);
  const tickColorB = useMemo(() => new Color("#26313f"), []);

  const fadeRef = useRef(1);
  const spinScaleRef = useRef(1);

  const innerRingMat = useRef<LineBasicMaterial>(null);
  const outerRingMat = useRef<LineBasicMaterial>(null);

  const [arcBeginner] = useState(() =>
    createArcLine(INNER_RADIUS, 72, 36, SATELLITES[0].tint),
  );
  const [arcAdvanced] = useState(() =>
    createArcLine(OUTER_RADIUS, 72, 36, SATELLITES[1].tint),
  );
  const arcBeginnerRef = useRef<Line>(null);
  const arcAdvancedRef = useRef<Line>(null);

  const [trailBeginner] = useState(() => createTrailLine(SATELLITES[0].tint));
  const [trailAdvanced] = useState(() => createTrailLine(SATELLITES[1].tint));
  const trailBeginnerRef = useRef<Line>(null);
  const trailAdvancedRef = useRef<Line>(null);

  useEffect(() => {
    arcBeginner.computeLineDistances();
    arcAdvanced.computeLineDistances();

    return () => {
      for (const line of [
        arcBeginner,
        arcAdvanced,
        trailBeginner,
        trailAdvanced,
      ]) {
        line.geometry.dispose();
        (line.material as LineBasicMaterial | LineDashedMaterial).dispose();
      }
    };
  }, [arcBeginner, arcAdvanced, trailBeginner, trailAdvanced]);

  const satGroupA = useRef<Group>(null);
  const satGroupB = useRef<Group>(null);
  const bodyMatA = useRef<MeshStandardMaterial>(null);
  const bodyMatB = useRef<MeshStandardMaterial>(null);
  const panelMatA = useRef<MeshStandardMaterial>(null);
  const panelMatA2 = useRef<MeshStandardMaterial>(null);
  const panelMatB = useRef<MeshStandardMaterial>(null);
  const panelMatB2 = useRef<MeshStandardMaterial>(null);
  const coreMatA = useRef<MeshBasicMaterial>(null);
  const coreMatB = useRef<MeshBasicMaterial>(null);

  const satScale = useRef({ beginner: 1, advanced: 1 });
  const satFade = useRef({ beginner: 1, advanced: 1 });

  const ringPositions = useMemo(
    () => SATELLITES.map((sat) => circlePositions(sat.radius, 128)),
    [],
  );

  const angleA = useRef(SATELLITES[0].offset);
  const angleB = useRef(SATELLITES[1].offset);
  const frameCount = useRef(0);

  const hitRef = useRef({ ax: -9999, ay: -9999, bx: -9999, by: -9999 });
  const lookTarget = useRef(new Vector3(1.15, 1.15, -1.7));
  const camTmp = useRef(new Vector3());
  const tmp = useRef({
    satA: new Vector3(),
    satB: new Vector3(),
    desired: new Vector3(),
    look: new Vector3(),
    radial: new Vector3(),
    offset: new Vector3(),
    projection: new Vector3(),
    up: new Vector3(0, FOLLOW_UP_OFFSET, 0),
    base: new Vector3(0, 1.55, 9.6),
  });

  useEffect(() => {
    const mesh = tickMeshRef.current;

    if (!mesh) {
      return;
    }

    const dimColor = tickColorB;

    for (let index = 0; index < TICK_COUNT; index += 1) {
      const angle = (index / TICK_COUNT) * Math.PI * 2;
      tickDummy.position.set(
        Math.cos(angle) * TICK_RADIUS,
        0,
        Math.sin(angle) * TICK_RADIUS,
      );
      tickDummy.rotation.set(0, -angle, 0);
      tickDummy.updateMatrix();
      mesh.setMatrixAt(index, tickDummy.matrix);
      mesh.setColorAt(index, dimColor);
    }

    mesh.instanceMatrix.needsUpdate = true;

    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }

    return () => {
      mesh.dispose();
    };
  }, [tickDummy, tickColorB]);

  useFrame((state, delta) => {
    const root = rootRef.current;

    if (!root) {
      return;
    }

    const progress = getScrollState().progress;
    const pointer = getPointer();
    const hoveredId = getHovered();

    if (getTracked() && progress > AUTO_RELEASE_PROGRESS) {
      stopTracking();
    }

    const tracked = getTracked();
    const easeT = MathUtils.clamp(progress / SCROLL_SPAN, 0, 1);
    const ease = 1 - Math.pow(1 - easeT, 3);
    const damp = reducedMotion ? 1000 : 4.5;

    const targetX = isNarrow ? 0 : MathUtils.lerp(2.3, 3.7, ease);
    const targetY = isNarrow ? MathUtils.lerp(1.8, 2.4, ease) : 0.15;
    const targetScale = (isNarrow ? 0.62 : 1) * MathUtils.lerp(1, 0.8, ease);

    root.position.x = MathUtils.damp(root.position.x, targetX, damp, delta);
    root.position.y = MathUtils.damp(root.position.y, targetY, damp, delta);
    root.position.z = MathUtils.damp(root.position.z, -1.2, damp, delta);
    const scale = MathUtils.damp(root.scale.x, targetScale, damp, delta);
    root.scale.setScalar(scale);

    fadeRef.current =
      1 -
      MathUtils.clamp((progress - RECEDE_START) / 0.3, 0, 1) * RECEDE_MAX;
    spinScaleRef.current =
      reducedMotion ? 0 : tracked === null ? 1 : 0.25;

    if (tickSpinRef.current && !reducedMotion) {
      tickSpinRef.current.rotation.y += delta * 0.06;
    }

    const tickMesh = tickMeshRef.current;

    if (tickMesh) {
      const lit = Math.round(MathUtils.clamp(progress, 0, 1) * TICK_COUNT);

      if (lit !== lastLit.current) {
        lastLit.current = lit;

        for (let index = 0; index < TICK_COUNT; index += 1) {
          const color = index < lit ? tickColorA : tickColorB;
          tickMesh.setColorAt(index, color);
        }

        if (tickMesh.instanceColor) {
          tickMesh.instanceColor.needsUpdate = true;
        }
      }
    }

    if (!reducedMotion) {
      angleA.current +=
        (delta * SATELLITES[0].dir * Math.PI * 2) / SATELLITES[0].period;
      angleB.current +=
        (delta * SATELLITES[1].dir * Math.PI * 2) / SATELLITES[1].period;
    }

    const placeSatellite = (
      satId: TrackId,
      group: Group | null,
      body: MeshStandardMaterial | null,
      panels: Array<MeshStandardMaterial | null>,
      core: MeshBasicMaterial | null,
      angle: number,
      radius: number,
      phase: number,
    ) => {
      if (!group) {
        return;
      }

      group.position.set(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius,
      );
      group.rotation.y = -angle + Math.PI / 2;

      const isHot = hoveredId === satId || tracked === satId;
      const scaleState = satScale.current;
      const fadeState = satFade.current;
      scaleState[satId] = MathUtils.damp(
        scaleState[satId],
        isHot ? 1.28 : 1,
        reducedMotion ? 1000 : 8,
        delta,
      );
      group.scale.setScalar(scaleState[satId]);

      fadeState[satId] = MathUtils.damp(
        fadeState[satId],
        tracked !== null && tracked !== satId ? 0.25 : 1,
        reducedMotion ? 1000 : 6,
        delta,
      );

      if (body) {
        body.opacity = fadeState[satId];
      }

      for (const panel of panels) {
        if (panel) {
          panel.opacity = fadeState[satId];
        }
      }

      if (core) {
        const pulse =
          !lite && !reducedMotion
            ? 0.75 + 0.25 * Math.sin(state.clock.elapsedTime * 2.4 + phase)
            : 1;
        core.opacity = fadeState[satId] * pulse;
      }
    };

    placeSatellite(
      "beginner",
      satGroupA.current,
      bodyMatA.current,
      [panelMatA.current, panelMatA2.current],
      coreMatA.current,
      angleA.current,
      INNER_RADIUS,
      0,
    );
    placeSatellite(
      "advanced",
      satGroupB.current,
      bodyMatB.current,
      [panelMatB.current, panelMatB2.current],
      coreMatB.current,
      angleB.current,
      OUTER_RADIUS,
      2.1,
    );

    const satA = tmp.current.satA;
    const satB = tmp.current.satB;

    if (satGroupA.current) {
      satGroupA.current.getWorldPosition(satA);
    } else {
      satA.set(9999, 9999, 9999);
    }

    if (satGroupB.current) {
      satGroupB.current.getWorldPosition(satB);
    } else {
      satB.set(9999, 9999, 9999);
    }

    const arcRefs = [
      { id: "beginner" as TrackId, ref: arcBeginnerRef },
      { id: "advanced" as TrackId, ref: arcAdvancedRef },
    ];

    for (const arc of arcRefs) {
      const line = arc.ref.current;

      if (!line) {
        continue;
      }

      const material = line.material as LineDashedMaterial;
      const arcTarget = tracked === arc.id ? 0.95 : 0;
      material.opacity = MathUtils.damp(
        material.opacity,
        arcTarget,
        reducedMotion ? 1000 : 6,
        delta,
      );
      line.visible = arcTarget > 0 || material.opacity > 0.02;

      if (tracked === arc.id && !reducedMotion) {
        line.rotation.y += delta * 0.9;
      }
    }

    const ringDamp = reducedMotion ? 1000 : 8;

    if (innerRingMat.current) {
      const target = tracked
        ? tracked === "beginner"
          ? 0.95
          : 0.14
        : hoveredId === "beginner"
          ? 0.8
          : 0.55;
      innerRingMat.current.opacity = MathUtils.damp(
        innerRingMat.current.opacity,
        target,
        ringDamp,
        delta,
      );
    }

    if (outerRingMat.current) {
      const target = tracked
        ? tracked === "advanced"
          ? 0.9
          : 0.1
        : hoveredId === "advanced"
          ? 0.62
          : 0.4;
      outerRingMat.current.opacity = MathUtils.damp(
        outerRingMat.current.opacity,
        target,
        ringDamp,
        delta,
      );
    }

    const desired = tmp.current.desired;
    const look = tmp.current.look;

    if (tracked) {
      const satellitePos = tracked === "beginner" ? satA : satB;
      const radial = tmp.current.radial;
      radial.copy(satellitePos).sub(root.position);

      if (radial.lengthSq() < 1e-6) {
        radial.set(1, 0, 0);
      } else {
        radial.normalize();
      }

      desired
        .copy(satellitePos)
        .addScaledVector(radial, FOLLOW_RADIAL_OFFSET)
        .add(tmp.current.up);
      look.copy(satellitePos);
    } else {
      const arc = ease * (Math.PI / 6);
      const cos = Math.cos(arc);
      const sin = Math.sin(arc);
      const radiusScale = 1 - 0.32 * ease;
      const offset = tmp.current.offset;

      offset.copy(tmp.current.base).sub(root.position);
      desired.set(
        offset.x * cos + offset.z * sin,
        offset.y,
        -offset.x * sin + offset.z * cos,
      );
      desired.multiplyScalar(radiusScale).add(root.position);

      if (pointer.active) {
        desired.x += pointer.nx * 0.3;
        desired.y += -pointer.ny * 0.2;
      }

      look.set(
        MathUtils.lerp(1.15, root.position.x, ease),
        MathUtils.lerp(1.15, root.position.y + 0.1, ease),
        MathUtils.lerp(-1.7, root.position.z, ease),
      );
    }

    const cameraDamp = reducedMotion ? 1000 : tracked ? 3.0 : 3.4;

    camTmp.current.set(
      MathUtils.damp(camera.position.x, desired.x, cameraDamp, delta),
      MathUtils.damp(camera.position.y, desired.y, cameraDamp, delta),
      MathUtils.damp(camera.position.z, desired.z, cameraDamp, delta),
    );
    camera.position.copy(camTmp.current);

    lookTarget.current.x = MathUtils.damp(
      lookTarget.current.x,
      look.x,
      cameraDamp,
      delta,
    );
    lookTarget.current.y = MathUtils.damp(
      lookTarget.current.y,
      look.y,
      cameraDamp,
      delta,
    );
    lookTarget.current.z = MathUtils.damp(
      lookTarget.current.z,
      look.z,
      cameraDamp,
      delta,
    );
    camera.lookAt(lookTarget.current);

    frameCount.current += 1;

    if (!lite && !reducedMotion && frameCount.current % TRAIL_STRIDE === 0) {
      const trailRefs = [trailBeginnerRef, trailAdvancedRef];
      const sources = [satA, satB];

      for (let index = 0; index < trailRefs.length; index += 1) {
        const line = trailRefs[index].current;

        if (!line) {
          continue;
        }

        const attribute = line.geometry.getAttribute("position");

        if (!attribute) {
          continue;
        }

        attribute.array.copyWithin(0, 3);
        attribute.setXYZ(
          TRAIL_POINTS - 1,
          sources[index].x,
          sources[index].y,
          sources[index].z,
        );
        attribute.needsUpdate = true;
      }
    }

    const width = size.width;
    const height = size.height;
    const projection = tmp.current.projection;

    projection.copy(satA).project(camera);
    const pointA = {
      x: (projection.x * 0.5 + 0.5) * width,
      y: (-projection.y * 0.5 + 0.5) * height,
      behind: projection.z > 1,
    };

    projection.copy(satB).project(camera);
    const pointB = {
      x: (projection.x * 0.5 + 0.5) * width,
      y: (-projection.y * 0.5 + 0.5) * height,
      behind: projection.z > 1,
    };

    const hit = hitRef.current;
    hit.ax = pointA.behind ? -9999 : pointA.x;
    hit.ay = pointA.behind ? -9999 : pointA.y;
    hit.bx = pointB.behind ? -9999 : pointB.x;
    hit.by = pointB.behind ? -9999 : pointB.y;

    if (pointer.active) {
      let nextHovered: TrackId | null = null;
      const radiusSq = hitRadius * hitRadius;
      const dxA = pointer.x - hit.ax;
      const dyA = pointer.y - hit.ay;
      const dxB = pointer.x - hit.bx;
      const dyB = pointer.y - hit.by;

      if (dxA * dxA + dyA * dyA <= radiusSq) {
        nextHovered = "beginner";
      } else if (dxB * dxB + dyB * dyB <= radiusSq) {
        nextHovered = "advanced";
      }

      if (nextHovered !== hoveredId) {
        setHovered(nextHovered);
      }
    } else if (hoveredId !== null) {
      setHovered(null);
    }

    if (tracked) {
      const reticle = getReticleEl();

      if (reticle) {
        const point = tracked === "beginner" ? pointA : pointB;

        if (point.behind) {
          reticle.style.opacity = "0";
        } else {
          reticle.style.opacity = "1";
          reticle.style.transform = `translate3d(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
        }
      }
    } else if (hoveredId) {
      const label = getHoverLabelEl();

      if (label) {
        const point = hoveredId === "beginner" ? pointA : pointB;

        if (point.behind) {
          label.style.opacity = "0";
        } else {
          label.style.opacity = "1";
          label.style.transform = `translate3d(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px, 0) translate(-50%, -130%)`;
        }
      }
    }
  });

  useEffect(() => {
    const hit = hitRef.current;

    function handleClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;

      if (target?.closest(CLICK_SELECTOR)) {
        return;
      }

      const radiusSq = hitRadius * hitRadius;
      const dxA = event.clientX - hit.ax;
      const dyA = event.clientY - hit.ay;

      if (dxA * dxA + dyA * dyA <= radiusSq) {
        startTracking("beginner");
        return;
      }

      const dxB = event.clientX - hit.bx;
      const dyB = event.clientY - hit.by;

      if (dxB * dxB + dyB * dyB <= radiusSq) {
        startTracking("advanced");
      }
    }

    window.addEventListener("click", handleClick);

    return () => {
      window.removeEventListener("click", handleClick);
      stopTracking();
      setHovered(null);
    };
  }, [hitRadius]);

  return (
    <group ref={rootRef} position={[2.3, 0.15, -1.2]}>
      <group rotation={[0, 0, AXIAL_TILT]}>
        <group ref={tickSpinRef}>
          <instancedMesh
            ref={tickMeshRef}
            args={[undefined, undefined, TICK_COUNT]}
          >
            <boxGeometry args={[0.055, 0.16, 0.055]} />
            <meshBasicMaterial toneMapped={false} />
          </instancedMesh>
        </group>
      </group>

      {SATELLITES.map((sat, index) => (
        <group key={sat.id} rotation={[sat.tilt, 0, 0]}>
          <lineLoop>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[ringPositions[index], 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial
              ref={sat.id === "beginner" ? innerRingMat : outerRingMat}
              color={sat.tint}
              transparent
              opacity={sat.id === "beginner" ? 0.55 : 0.4}
              depthWrite={false}
              blending={AdditiveBlending}
            />
          </lineLoop>
          <primitive
            object={sat.id === "beginner" ? arcBeginner : arcAdvanced}
            ref={sat.id === "beginner" ? arcBeginnerRef : arcAdvancedRef}
          />
          <group ref={sat.id === "beginner" ? satGroupA : satGroupB}>
            <mesh>
              <boxGeometry args={[0.16, 0.09, 0.09]} />
              <meshStandardMaterial
                ref={sat.id === "beginner" ? bodyMatA : bodyMatB}
                color="#d5dce6"
                metalness={0.35}
                roughness={0.45}
                transparent
              />
            </mesh>
            <mesh position={[-0.19, 0, 0]}>
              <boxGeometry args={[0.2, 0.016, 0.1]} />
              <meshStandardMaterial
                ref={sat.id === "beginner" ? panelMatA : panelMatB}
                color="#173c4d"
                emissive={sat.tint}
                emissiveIntensity={0.55}
                roughness={0.6}
                transparent
              />
            </mesh>
            <mesh position={[0.19, 0, 0]}>
              <boxGeometry args={[0.2, 0.016, 0.1]} />
              <meshStandardMaterial
                ref={sat.id === "beginner" ? panelMatA2 : panelMatB2}
                color="#173c4d"
                emissive={sat.tint}
                emissiveIntensity={0.55}
                roughness={0.6}
                transparent
              />
            </mesh>
            <mesh>
              <sphereGeometry args={[0.055, 12, 12]} />
              <meshBasicMaterial
                ref={sat.id === "beginner" ? coreMatA : coreMatB}
                color="#ffd9a0"
                toneMapped={false}
                transparent
              />
            </mesh>
          </group>
        </group>
      ))}

      {!lite ? (
        <>
          <primitive object={trailBeginner} ref={trailBeginnerRef} />
          <primitive object={trailAdvanced} ref={trailAdvancedRef} />
        </>
      ) : null}

      <Globe lite={lite} fadeRef={fadeRef} spinScaleRef={spinScaleRef} />
    </group>
  );
}
