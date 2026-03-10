import type { Vec3, SimulationResult } from "../simulation/types";
import type { ExportSettings } from "./types";
import type { Mesh } from "./tube";
import { generateTube } from "./tube";
import { generateSphere } from "./sphere";
import { generateArrow } from "./arrow";
import { generateArmillary } from "./armillary";
import { combineMeshes } from "./arrow";
import { bodyRadius, AU } from "../simulation/config";
import { sub, length, normalize } from "../utils/vec3";

interface NamedMesh {
  name: string;
  material: string;
  mesh: Mesh;
}

/**
 * Generate all meshes for a simulation result, scaled to fit within
 * the configured output size (bounding sphere in inches).
 */
export function generateAllMeshes(
  result: SimulationResult,
  settings: ExportSettings,
): NamedMesh[] {
  const meshes: NamedMesh[] = [];
  const trajectories = result.trajectories;
  const ic = result.initialConditions;
  const safeFactor = Math.min(result.maxSafeScale, settings.start.scaleFactor);

  // Compute scale: normalize everything to fit in outputSize inches
  const scaleFactor = computeScaleFactor(trajectories, settings.outputSize);

  // Tube radius: proportional to output size
  const tubeRadius = settings.outputSize * 0.005; // 0.5% of output size

  for (let bodyIdx = 0; bodyIdx < trajectories.length; bodyIdx++) {
    const traj = trajectories[bodyIdx];
    if (traj.length < 2) continue;

    const bodyNum = bodyIdx + 1;
    const material = `body_${bodyNum}`;

    // Scale trajectory points
    const scaledTraj = traj.map((p) => scalePoint(p, scaleFactor));

    // Trajectory tube
    const tube = generateTube(scaledTraj, tubeRadius, tubeRadius, settings.tubeSegments);
    meshes.push({ name: `path_${bodyNum}`, material, mesh: tube });

    // Start position marker
    const startPos = scaledTraj[0];
    const massKg = ic.masses[bodyIdx];
    const baseRadius = bodyRadius(massKg) * scaleFactor;
    const markerRadius = baseRadius * safeFactor;

    if (settings.start.style !== "none") {
      const startMesh = generateStartMarker(
        startPos,
        markerRadius,
        settings,
        ic.velocities[bodyIdx],
        scaleFactor,
      );
      if (startMesh.vertices.length > 0) {
        meshes.push({ name: `start_${bodyNum}`, material, mesh: startMesh });
      }
    }

    // Velocity arrow
    if (settings.start.showVelocityArrow) {
      const vel = ic.velocities[bodyIdx];
      const velLen = length(vel);
      if (velLen > 1e-10) {
        const arrowLength = markerRadius * 3;
        const arrow = generateArrow(
          startPos,
          vel,
          arrowLength,
          tubeRadius * 1.5,
          arrowLength * 0.3,
          tubeRadius * 3,
          Math.min(settings.tubeSegments, 16),
        );
        meshes.push({ name: `arrow_${bodyNum}`, material, mesh: arrow });
      }
    }

    // End position marker
    const endPos = scaledTraj[scaledTraj.length - 1];
    if (settings.end.style === "solid_sphere") {
      const sphere = generateSphere(endPos, markerRadius, settings.end.segments);
      meshes.push({ name: `end_${bodyNum}`, material, mesh: sphere });
    }
    // "exploding" style handled in Phase 7 (shatter)
  }

  return meshes;
}

function generateStartMarker(
  position: Vec3,
  radius: number,
  settings: ExportSettings,
  velocity: Vec3,
  scaleFactor: number,
): Mesh {
  switch (settings.start.style) {
    case "solid_sphere":
      return generateSphere(position, radius, settings.start.segments);

    case "armillary": {
      const ringThickness = radius * 0.1;
      const stretch = settings.start.velocityStretch ?? 1;
      return generateArmillary(
        position,
        radius,
        ringThickness,
        Math.min(settings.tubeSegments, 8),
        settings.start.segments,
        velocity,
        stretch,
      );
    }

    case "ring": {
      // Single ring oriented along velocity direction
      const ringThickness = radius * 0.1;
      // Generate as a single-ring armillary (just use the first ring)
      return generateArmillary(
        position,
        radius,
        ringThickness,
        Math.min(settings.tubeSegments, 8),
        settings.start.segments,
        velocity,
      );
    }

    default:
      return { vertices: [], faces: [] };
  }
}

function computeScaleFactor(trajectories: Vec3[][], outputSizeInches: number): number {
  // Find bounding box of all trajectory points
  let maxExtent = 0;
  for (const traj of trajectories) {
    for (const p of traj) {
      const extent = Math.max(Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]));
      if (extent > maxExtent) maxExtent = extent;
    }
  }

  if (maxExtent < 1e-10) return 1;

  // Scale so that maxExtent maps to half the output size (radius)
  // Convert inches to arbitrary mesh units (1 inch = 1 unit)
  return (outputSizeInches / 2) / maxExtent;
}

function scalePoint(p: Vec3, factor: number): Vec3 {
  return [p[0] * factor, p[1] * factor, p[2] * factor];
}
