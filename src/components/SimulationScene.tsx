import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { Vec3 } from "../simulation/types";
import { normalizeTrajectories } from "../utils/normalize";
import * as THREE from "three";

const BODY_COLORS = ["#ff6b6b", "#4ecdc4", "#ffe66d"] as const;
const SPHERE_RADIUS = 0.04;

interface SimulationSceneProps {
  trajectories: Vec3[][];
}

function TrajectoryLine({ points, color }: { points: Vec3[]; color: string }) {
  const geometry = useMemo(() => {
    const positions = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
      positions[i * 3] = points[i][0];
      positions[i * 3 + 1] = points[i][1];
      positions[i * 3 + 2] = points[i][2];
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geom;
  }, [points]);

  return <line geometry={geometry}>
    <lineBasicMaterial color={color} />
  </line>;
}

function EndpointSphere({ position, color }: { position: Vec3; color: string }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[SPHERE_RADIUS, 16, 16]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

export function SimulationScene({ trajectories }: SimulationSceneProps) {
  const normalized = useMemo(
    () => normalizeTrajectories(trajectories),
    [trajectories],
  );

  return (
    <Canvas
      camera={{ position: [0, 0, 2.5], fov: 50 }}
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={0.6} />
      <pointLight position={[5, 5, 5]} intensity={0.8} />
      <OrbitControls enableZoom={false} enablePan={false} />

      {normalized.map((traj, i) => {
        if (traj.length < 2) return null;
        const color = BODY_COLORS[i % BODY_COLORS.length];
        return (
          <group key={i}>
            <TrajectoryLine points={traj} color={color} />
            <EndpointSphere position={traj[0]} color={color} />
            <EndpointSphere position={traj[traj.length - 1]} color={color} />
          </group>
        );
      })}
    </Canvas>
  );
}
