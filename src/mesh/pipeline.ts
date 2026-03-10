import type { Vec3, SimulationResult } from "../simulation/types";
import type { ExportSettings } from "./types";
import type { Mesh } from "./tube";
import { generateTube } from "./tube";
import { generateSphere } from "./sphere";
import { generateArrow } from "./arrow";
import { generateArmillary } from "./armillary";
import { combineMeshes } from "./arrow";
import { bodyRadius, AU } from "../simulation/config";
import { add, sub, scale, length, normalize } from "../utils/vec3";
import { generateShatterFragments, simulateShatterPhysics, rayMeshIntersect } from "./shatter";

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

    // End position marker (solid sphere only; exploding handled below)
    const endPos = scaledTraj[scaledTraj.length - 1];
    if (settings.end.style === "solid_sphere") {
      const sphere = generateSphere(endPos, markerRadius, settings.end.segments);
      meshes.push({ name: `end_${bodyNum}`, material, mesh: sphere });
    }
  }

  // Exploding sphere: shatter fragments for colliding bodies
  if (settings.end.style === "exploding" && result.reason === "collision") {
    const shatterMeshes = generateCollisionShatter(
      result,
      trajectories,
      scaleFactor,
      tubeRadius,
      settings,
    );
    meshes.push(...shatterMeshes);
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

/**
 * Find which two bodies collided by checking which pair ended closest together.
 * Returns [indexA, indexB] sorted ascending.
 */
function findCollidingPair(trajectories: Vec3[][]): [number, number] {
  let bestDist = Infinity;
  let bestPair: [number, number] = [0, 1];
  for (let i = 0; i < trajectories.length; i++) {
    for (let j = i + 1; j < trajectories.length; j++) {
      const endI = trajectories[i][trajectories[i].length - 1];
      const endJ = trajectories[j][trajectories[j].length - 1];
      const dist = length(sub(endI, endJ));
      if (dist < bestDist) {
        bestDist = dist;
        bestPair = [i, j];
      }
    }
  }
  return bestPair;
}

/**
 * Generate shatter fragments and support struts for a collision.
 */
function generateCollisionShatter(
  result: SimulationResult,
  trajectories: Vec3[][],
  scaleFactor: number,
  tubeRadius: number,
  settings: ExportSettings,
): NamedMesh[] {
  const meshes: NamedMesh[] = [];
  const ic = result.initialConditions;
  const safeFactor = Math.min(result.maxSafeScale, settings.end.scaleFactor);
  const [colA, colB] = findCollidingPair(trajectories);

  const scaledTrajA = trajectories[colA].map((p) => scalePoint(p, scaleFactor));
  const scaledTrajB = trajectories[colB].map((p) => scalePoint(p, scaleFactor));
  const endA = scaledTrajA[scaledTrajA.length - 1];
  const endB = scaledTrajB[scaledTrajB.length - 1];

  // Impact direction: from each body toward the midpoint
  const impactPoint: Vec3 = [
    (endA[0] + endB[0]) / 2,
    (endA[1] + endB[1]) / 2,
    (endA[2] + endB[2]) / 2,
  ];
  const impactDirA = normalize(sub(impactPoint, endA));
  const impactDirB = normalize(sub(impactPoint, endB));

  // Sphere radii
  const radiusA = bodyRadius(ic.masses[colA]) * scaleFactor * safeFactor;
  const radiusB = bodyRadius(ic.masses[colB]) * scaleFactor * safeFactor;

  const fragCount = settings.end.fragmentCount;
  const nBack = Math.max(1, Math.floor(fragCount * 0.3));

  const fragmentsA = generateShatterFragments(endA, radiusA, impactDirA, fragCount, nBack, colA * 1000 + 42);
  const fragmentsB = generateShatterFragments(endB, radiusB, impactDirB, fragCount, nBack, colB * 1000 + 99);

  // Compute velocities from last two trajectory points
  const velA = scaledTrajA.length >= 2
    ? sub(scaledTrajA[scaledTrajA.length - 1], scaledTrajA[scaledTrajA.length - 2])
    : [1, 0, 0] as Vec3;
  const velB = scaledTrajB.length >= 2
    ? sub(scaledTrajB[scaledTrajB.length - 1], scaledTrajB[scaledTrajB.length - 2])
    : [-1, 0, 0] as Vec3;

  // Scale velocities for good visual spread
  const speed = Math.max(length(velA), length(velB), 1e-6);
  const velScale = Math.max(radiusA, radiusB) * 3.0 / speed;
  const scaledVelA = scale(velA, velScale);
  const scaledVelB = scale(velB, velScale);

  // Simulate physics
  const simResults = simulateShatterPhysics(
    fragmentsA,
    fragmentsB,
    scaledVelA,
    scaledVelB,
    settings.end.physicsSteps,
  );

  // Add fragment meshes and support struts
  const nA = fragmentsA.length;
  const strutRadius = tubeRadius * 0.15;

  for (let j = 0; j < simResults.length; j++) {
    const fragMesh = simResults[j];
    if (fragMesh.vertices.length === 0) continue;

    const isA = j < nA;
    const bodyIdx = isA ? colA : colB;
    const material = `body_${bodyIdx + 1}`;
    const sphereCenter = isA ? endA : endB;

    // Fragment mesh
    meshes.push({ name: `end_${bodyIdx + 1}`, material, mesh: fragMesh });

    // Support strut: ray from sphere center toward fragment centroid
    const fragCentroid: Vec3 = [0, 0, 0];
    for (const v of fragMesh.vertices) {
      fragCentroid[0] += v[0];
      fragCentroid[1] += v[1];
      fragCentroid[2] += v[2];
    }
    fragCentroid[0] /= fragMesh.vertices.length;
    fragCentroid[1] /= fragMesh.vertices.length;
    fragCentroid[2] /= fragMesh.vertices.length;

    const rayDir = sub(fragCentroid, sphereCenter);
    const rayLen = length(rayDir);
    if (rayLen > 1e-10) {
      const rayDirN = normalize(rayDir);
      const hitPt = rayMeshIntersect(sphereCenter, rayDirN, fragMesh, rayLen) ?? fragCentroid;
      const strut = generateTube([sphereCenter, hitPt], strutRadius, strutRadius, 8);
      if (strut.vertices.length > 0) {
        meshes.push({ name: `strut_${bodyIdx + 1}`, material, mesh: strut });
      }
    }
  }

  return meshes;
}
