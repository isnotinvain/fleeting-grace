import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { Vec3 } from "../simulation/types";
import { normalizeTrajectories } from "../utils/normalize";
import * as THREE from "three";

const BODY_COLORS = ["#ff6b6b", "#4ecdc4", "#ffe66d"] as const;
const SPHERE_RADIUS = 0.04;
const ANIMATION_DURATION = 6; // seconds per loop

interface SimulationSceneProps {
  /** Simplified trajectories for rendering lines. */
  trajectories: Vec3[][];
  /** Raw trajectories (uniform dt) for animating spheres. */
  rawTrajectories?: Vec3[][];
  animate?: boolean;
  sphereRadii?: number[];
}

function TrajectoryLine({ points, color }: { points: Vec3[]; color: string }) {
  const geometry = useMemo(() => {
    const positions = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
      positions[i * 3] = points[i]![0];
      positions[i * 3 + 1] = points[i]![1];
      positions[i * 3 + 2] = points[i]![2];
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geom;
  }, [points]);

  return (
    // @ts-expect-error R3F extends 'line' for Three.js Line, conflicts with SVG typings
    <line geometry={geometry}>
      <lineBasicMaterial color={color} />
    </line>
  );
}

function AnimatedSphere({ trajectory, color, animate, radius }: {
  trajectory: Vec3[]; color: string; animate: boolean; radius: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  useFrame((_, delta) => {
    if (!meshRef.current || trajectory.length < 2) return;
    if (animate) {
      timeRef.current = (timeRef.current + delta) % ANIMATION_DURATION;
    }
    const t = timeRef.current / ANIMATION_DURATION;
    const idx = t * (trajectory.length - 1);
    const i = Math.floor(idx);
    const frac = idx - i;
    const a = trajectory[Math.min(i, trajectory.length - 1)]!;
    const b = trajectory[Math.min(i + 1, trajectory.length - 1)]!;
    meshRef.current.position.set(
      a[0] + (b[0] - a[0]) * frac,
      a[1] + (b[1] - a[1]) * frac,
      a[2] + (b[2] - a[2]) * frac,
    );
  });

  return (
    <mesh ref={meshRef} position={trajectory[0]!}>
      <sphereGeometry args={[radius, 16, 16]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
    </mesh>
  );
}

export function SimulationScene({ trajectories, rawTrajectories, animate = false, sphereRadii }: SimulationSceneProps) {
  // Simplified trajectories for lines
  const normalizedLines = useMemo(
    () => normalizeTrajectories(trajectories),
    [trajectories],
  );

  // Raw trajectories for animation (uniform dt = correct timing)
  const normalizedRaw = useMemo(
    () => rawTrajectories ? normalizeTrajectories(rawTrajectories) : normalizedLines,
    [rawTrajectories, normalizedLines],
  );

  return (
    <Canvas
      camera={{ position: [0, 0, 2.5], fov: 50 }}
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={0.6} />
      <pointLight position={[5, 5, 5]} intensity={0.8} />
      <OrbitControls enableZoom={false} enablePan={false} />

      {normalizedLines.map((traj, i) => {
        if (traj.length < 2) return null;
        const color = BODY_COLORS[i % BODY_COLORS.length]!;
        return (
          <group key={i}>
            <TrajectoryLine points={traj} color={color} />
            <AnimatedSphere trajectory={normalizedRaw[i]!} color={color} animate={animate} radius={sphereRadii?.[i] ?? SPHERE_RADIUS} />
          </group>
        );
      })}
    </Canvas>
  );
}
