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

  // Normalize all positions to fit within outputSize inches
  const worldScale = computeScaleFactor(trajectories, settings.outputSize);

  // maxSafeScale: largest uniform radius multiplier that avoids false visual
  // collisions at any point in the simulation
  const safeScale = result.maxSafeScale;

  for (let bodyIdx = 0; bodyIdx < trajectories.length; bodyIdx++) {
    const traj = trajectories[bodyIdx];
    if (traj.length < 2) continue;

    const bodyNum = bodyIdx + 1;
    const material = `body_${bodyNum}`;

    // Per-body radius: physical radius scaled to output space, then enlarged
    // by safeScale (the max that avoids false visual collisions)
    const massKg = ic.masses[bodyIdx];
    const tubeRadius = bodyRadius(massKg) * worldScale * safeScale;
    // Markers use a user-configurable multiplier on top of the tube radius
    const markerRadius = tubeRadius * settings.start.scaleFactor;

    // Scale trajectory points
    const scaledTraj = traj.map((p) => scalePoint(p, worldScale));
    const startPos = scaledTraj[0];

    // Truncate the beginning of the trajectory at the marker sphere edge
    const trimmedTraj = settings.start.style !== "none"
      ? truncateAtSphere(scaledTraj, startPos, markerRadius)
      : scaledTraj;

    // Direction from start toward the first point of the truncated path
    const pathDir = trimmedTraj.length >= 2
      ? sub(trimmedTraj[1], startPos)
      : sub(scaledTraj[Math.min(1, scaledTraj.length - 1)], startPos);

    // Trajectory tube
    if (trimmedTraj.length >= 2) {
      const tube = generateTube(trimmedTraj, tubeRadius, tubeRadius, settings.tubeSegments);
      meshes.push({ name: `path_${bodyNum}`, material, mesh: tube });
    }

    // Start position marker
    if (settings.start.style !== "none") {
      const startMesh = generateStartMarker(
        startPos,
        markerRadius,
        settings,
        pathDir,
        worldScale,
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
    // Use the smallest body radius for strut thickness
    const minTubeRadius = Math.min(
      ...ic.masses.map((m) => bodyRadius(m) * worldScale * safeScale),
    );
    const shatterMeshes = generateCollisionShatter(
      result,
      trajectories,
      worldScale,
      minTubeRadius,
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
  direction: Vec3,
  _worldScale: number,
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
        direction,
        stretch,
      );
    }

    case "ring": {
      const ringThickness = radius * 0.1;
      return generateArmillary(
        position,
        radius,
        ringThickness,
        Math.min(settings.tubeSegments, 8),
        settings.start.segments,
        direction,
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
 * Truncate the beginning of a trajectory so it starts at the edge of
 * a sphere centered at the first point. Returns a new path whose first
 * point lies on the sphere surface (interpolated).
 */
function truncateAtSphere(path: Vec3[], center: Vec3, radius: number): Vec3[] {
  // Find the first point outside the sphere
  let firstOutside = -1;
  for (let i = 1; i < path.length; i++) {
    if (length(sub(path[i], center)) > radius) {
      firstOutside = i;
      break;
    }
  }
  if (firstOutside < 0) return path; // all inside or trivial

  // Interpolate between the last inside point and the first outside point
  const inside = path[firstOutside - 1];
  const outside = path[firstOutside];
  const dir = sub(outside, inside);
  const segLen = length(dir);
  if (segLen < 1e-10) return path.slice(firstOutside);

  // Solve for t where |center + t*(outside - inside) - center| = radius
  // Using the parametric ray from `inside` to `outside`
  const oc = sub(inside, center);
  const a = dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2];
  const b = 2 * (oc[0] * dir[0] + oc[1] * dir[1] + oc[2] * dir[2]);
  const c = oc[0] * oc[0] + oc[1] * oc[1] + oc[2] * oc[2] - radius * radius;
  const disc = b * b - 4 * a * c;

  let edgePoint: Vec3;
  if (disc < 0) {
    edgePoint = outside; // fallback
  } else {
    const t = (-b + Math.sqrt(disc)) / (2 * a);
    edgePoint = [
      inside[0] + t * dir[0],
      inside[1] + t * dir[1],
      inside[2] + t * dir[2],
    ];
  }

  return [edgePoint, ...path.slice(firstOutside)];
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
  worldScale: number,
  minTubeRadius: number,
  settings: ExportSettings,
): NamedMesh[] {
  const meshes: NamedMesh[] = [];
  const ic = result.initialConditions;
  const safeScale = Math.min(result.maxSafeScale, settings.end.scaleFactor);
  const [colA, colB] = findCollidingPair(trajectories);

  const scaledTrajA = trajectories[colA].map((p) => scalePoint(p, worldScale));
  const scaledTrajB = trajectories[colB].map((p) => scalePoint(p, worldScale));
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
  const radiusA = bodyRadius(ic.masses[colA]) * worldScale * safeScale;
  const radiusB = bodyRadius(ic.masses[colB]) * worldScale * safeScale;

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
  const strutRadius = minTubeRadius * 0.15;

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
