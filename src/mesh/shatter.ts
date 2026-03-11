import type { Vec3 } from "../simulation/types";
import type { Mesh } from "./tube";
import { add, sub, scale, dot, cross, normalize, length } from "../utils/vec3";
import quickhull3d from "quickhull3d";
import RAPIER from "@dimforge/rapier3d-compat";

/** A single fragment: its convex hull mesh and centroid. */
export interface Fragment {
  mesh: Mesh;
  centroid: Vec3;
}

let rapierInitialized = false;

/**
 * Initialize the Rapier WASM module. Must be called before simulateShatterPhysics.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function initRapier(): Promise<void> {
  if (rapierInitialized) return;
  await RAPIER.init();
  rapierInitialized = true;
}

/**
 * Simple seeded PRNG (mulberry32) for deterministic fragment generation.
 * Takes a 32-bit integer seed, returns a function that produces [0, 1) floats.
 */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generate a random unit vector using Marsaglia rejection on a seeded PRNG. */
function randomUnitVector(rand: () => number): Vec3 {
  let x: number, y: number, z: number, lenSq: number;
  do {
    x = rand() * 2 - 1;
    y = rand() * 2 - 1;
    z = rand() * 2 - 1;
    lenSq = x * x + y * y + z * z;
  } while (lenSq > 1 || lenSq < 1e-10);
  const len = Math.sqrt(lenSq);
  return [x / len, y / len, z / len];
}

/**
 * Place Voronoi seed points for fragmentation.
 * More seeds (smaller fragments) near the impact side,
 * fewer larger chunks on the back side.
 */
function placeSeeds(
  center: Vec3,
  radius: number,
  impactDir: Vec3,
  numFragments: number,
  nBack: number,
  rand: () => number,
): Vec3[] {
  const seeds: Vec3[] = [];

  // Back-side seeds: large chunks away from impact
  for (let i = 0; i < nBack; i++) {
    let pt = randomUnitVector(rand);
    // Push away from impact direction
    pt = sub(pt, scale(impactDir, 1.5));
    pt = normalize(pt);
    seeds.push(add(center, scale(pt, radius * 0.4)));
  }

  // Impact-side seeds: smaller fragments near impact point
  for (let i = 0; i < numFragments - nBack; i++) {
    let pt = randomUnitVector(rand);
    // Push toward impact direction
    pt = add(pt, scale(impactDir, 2.5));
    pt = normalize(pt);
    const r = radius * Math.cbrt(rand() * 0.6 + 0.2); // uniform in volume, range [0.2, 0.8]
    seeds.push(add(center, scale(pt, r)));
  }

  return seeds;
}

/**
 * Sample random points uniformly inside a sphere.
 */
function sampleSpherePoints(
  center: Vec3,
  radius: number,
  count: number,
  rand: () => number,
): Vec3[] {
  const points: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    const dir = randomUnitVector(rand);
    const r = radius * Math.cbrt(rand());
    points.push(add(center, scale(dir, r)));
  }
  return points;
}

/**
 * Assign each point to its nearest seed (brute-force Voronoi).
 */
function assignToNearestSeed(points: Vec3[], seeds: Vec3[]): number[] {
  const assignments = new Array<number>(points.length);
  for (let i = 0; i < points.length; i++) {
    let bestDist = Infinity;
    let bestSeed = 0;
    const p = points[i];
    for (let j = 0; j < seeds.length; j++) {
      const s = seeds[j];
      const dx = p[0] - s[0];
      const dy = p[1] - s[1];
      const dz = p[2] - s[2];
      const dist = dx * dx + dy * dy + dz * dz;
      if (dist < bestDist) {
        bestDist = dist;
        bestSeed = j;
      }
    }
    assignments[i] = bestSeed;
  }
  return assignments;
}

/**
 * Fix face winding so normals point outward from the centroid.
 */
function fixWinding(
  vertices: Vec3[],
  faces: [number, number, number][],
  centroid: Vec3,
): [number, number, number][] {
  return faces.map(([a, b, c]) => {
    const v0 = vertices[a];
    const edge1 = sub(vertices[b], v0);
    const edge2 = sub(vertices[c], v0);
    const faceNormal = cross(edge1, edge2);
    const toFace = sub(v0, centroid);
    if (dot(faceNormal, toFace) < 0) {
      return [a, c, b]; // flip
    }
    return [a, b, c];
  });
}

/**
 * Generate Voronoi-based shatter fragments from a sphere.
 *
 * Splits a sphere into convex fragments using Voronoi tessellation.
 * Fragments near the impact point are smaller; back-side fragments are larger.
 *
 * @param center - Sphere center position
 * @param radius - Sphere radius
 * @param impactDir - Normalized impact direction
 * @param numFragments - Total number of fragments to generate
 * @param nBack - Number of large back-side fragments (default 3)
 * @param seed - PRNG seed for deterministic output
 * @returns Array of fragments with meshes and centroids
 */
export function generateShatterFragments(
  center: Vec3,
  radius: number,
  impactDir: Vec3,
  numFragments: number = 10,
  nBack: number = 3,
  seed: number = 42,
): Fragment[] {
  const rand = mulberry32(seed);
  const seeds = placeSeeds(center, radius, impactDir, numFragments, nBack, rand);
  const points = sampleSpherePoints(center, radius, 5000, rand);
  const assignments = assignToNearestSeed(points, seeds);

  const fragments: Fragment[] = [];

  for (let cellId = 0; cellId < seeds.length; cellId++) {
    const cellPoints = points.filter((_, i) => assignments[i] === cellId);
    if (cellPoints.length < 4) continue;

    // quickhull3d expects number[][] and returns number[][]
    const pointsArr = cellPoints.map((p) => [p[0], p[1], p[2]]);
    let hullFaces: number[][];
    try {
      hullFaces = quickhull3d(pointsArr);
    } catch {
      continue;
    }

    if (hullFaces.length === 0) continue;

    // Compute centroid
    const centroid: Vec3 = [0, 0, 0];
    for (const p of cellPoints) {
      centroid[0] += p[0];
      centroid[1] += p[1];
      centroid[2] += p[2];
    }
    centroid[0] /= cellPoints.length;
    centroid[1] /= cellPoints.length;
    centroid[2] /= cellPoints.length;

    // quickhull3d returns faces as indices into the original points array
    const faces = hullFaces.map(
      (f) => [f[0], f[1], f[2]] as [number, number, number],
    );
    const fixedFaces = fixWinding(cellPoints, faces, centroid);

    fragments.push({
      mesh: { vertices: cellPoints, faces: fixedFaces },
      centroid,
    });
  }

  return fragments;
}

/**
 * Apply a quaternion rotation to a vector.
 * q = [x, y, z, w] (Rapier convention)
 */
function applyQuaternion(v: Vec3, q: { x: number; y: number; z: number; w: number }): Vec3 {
  const { x: qx, y: qy, z: qz, w: qw } = q;
  // v' = q * v * q^-1, expanded:
  const ix = qw * v[0] + qy * v[2] - qz * v[1];
  const iy = qw * v[1] + qz * v[0] - qx * v[2];
  const iz = qw * v[2] + qx * v[1] - qy * v[0];
  const iw = -qx * v[0] - qy * v[1] - qz * v[2];
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ];
}

/**
 * Run rigid body physics on shatter fragments using Rapier.
 *
 * Creates a Rapier world with zero gravity, adds each fragment as a dynamic
 * rigid body with a convex hull collider, sets initial velocities from the
 * 3-body simulation, and steps the physics forward. Inter-fragment collisions
 * are fully simulated.
 *
 * The two sets of fragments are backed up along their respective velocity
 * vectors so they start just touching (not overlapping), then launched
 * forward with their collision velocities.
 *
 * @param fragmentsA - Fragments from body A (centered at body A's collision position)
 * @param fragmentsB - Fragments from body B (centered at body B's collision position)
 * @param velA - Body A's velocity at collision (scaled for visual spread)
 * @param velB - Body B's velocity at collision (scaled for visual spread)
 * @param simSteps - Number of physics steps to simulate
 * @returns Array of displaced fragment meshes (A fragments first, then B)
 */
export function simulateShatterPhysics(
  fragmentsA: Fragment[],
  fragmentsB: Fragment[],
  velA: Vec3,
  velB: Vec3,
  simSteps: number = 60,
): Mesh[] {
  const allFragments = [...fragmentsA, ...fragmentsB];
  if (allFragments.length === 0) return [];

  const nA = fragmentsA.length;

  // Create Rapier world with zero gravity (space)
  const gravity = new RAPIER.Vector3(0, 0, 0);
  const world = new RAPIER.World(gravity);

  // Track rigid body handles so we can read transforms back
  const bodyHandles: RAPIER.RigidBodyHandle[] = [];

  for (let i = 0; i < allFragments.length; i++) {
    const frag = allFragments[i];
    const { mesh, centroid } = frag;
    const vel = i < nA ? velA : velB;

    // Center vertices on centroid for the collider shape
    const centeredVerts = new Float32Array(mesh.vertices.length * 3);
    for (let j = 0; j < mesh.vertices.length; j++) {
      centeredVerts[j * 3 + 0] = mesh.vertices[j][0] - centroid[0];
      centeredVerts[j * 3 + 1] = mesh.vertices[j][1] - centroid[1];
      centeredVerts[j * 3 + 2] = mesh.vertices[j][2] - centroid[2];
    }

    // Create convex hull collider descriptor
    const colliderDesc = RAPIER.ColliderDesc.convexHull(centeredVerts);
    if (!colliderDesc) continue; // degenerate hull

    colliderDesc.setMass(1.0);
    colliderDesc.setRestitution(0.3);

    // Create dynamic rigid body at the fragment's centroid position
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(centroid[0], centroid[1], centroid[2])
      .setLinvel(vel[0], vel[1], vel[2]);

    const body = world.createRigidBody(bodyDesc);
    world.createCollider(colliderDesc, body);
    bodyHandles.push(body.handle);
  }

  // Step physics
  for (let step = 0; step < simSteps; step++) {
    world.step();
  }

  // Read back transforms and apply to original vertices
  const results: Mesh[] = [];
  let handleIdx = 0;

  for (let i = 0; i < allFragments.length; i++) {
    const frag = allFragments[i];
    const { mesh, centroid } = frag;

    // Some fragments may have been skipped (degenerate hull)
    if (handleIdx >= bodyHandles.length) {
      results.push({ vertices: [...mesh.vertices], faces: mesh.faces });
      continue;
    }

    const body = world.getRigidBody(bodyHandles[handleIdx]);
    handleIdx++;

    const pos = body.translation();
    const rot = body.rotation();

    // Transform vertices: rotate (v - centroid), then translate to new position
    const newVertices = mesh.vertices.map((v) => {
      const centered: Vec3 = [v[0] - centroid[0], v[1] - centroid[1], v[2] - centroid[2]];
      const rotated = applyQuaternion(centered, rot);
      return [rotated[0] + pos.x, rotated[1] + pos.y, rotated[2] + pos.z] as Vec3;
    });

    results.push({ vertices: newVertices, faces: mesh.faces });
  }

  // Free Rapier resources
  world.free();

  return results;
}

/**
 * Möller–Trumbore ray-triangle intersection.
 * Returns the distance along the ray, or null if no intersection.
 */
export function rayTriangleIntersect(
  origin: Vec3,
  dir: Vec3,
  v0: Vec3,
  v1: Vec3,
  v2: Vec3,
): number | null {
  const e1 = sub(v1, v0);
  const e2 = sub(v2, v0);
  const h = cross(dir, e2);
  const a = dot(e1, h);
  if (Math.abs(a) < 1e-10) return null;

  const f = 1 / a;
  const s = sub(origin, v0);
  const u = f * dot(s, h);
  if (u < 0 || u > 1) return null;

  const q = cross(s, e1);
  const v = f * dot(dir, q);
  if (v < 0 || u + v > 1) return null;

  const t = f * dot(e2, q);
  return t > 0 ? t : null;
}

/**
 * Find the nearest intersection point of a ray with a mesh.
 * Returns the hit point, or the fallback if no intersection found.
 */
export function rayMeshIntersect(
  origin: Vec3,
  dir: Vec3,
  mesh: Mesh,
  maxDist: number,
): Vec3 | null {
  let bestT = maxDist;
  let hit = false;

  for (const [a, b, c] of mesh.faces) {
    const t = rayTriangleIntersect(origin, dir, mesh.vertices[a], mesh.vertices[b], mesh.vertices[c]);
    if (t !== null && t < bestT) {
      bestT = t;
      hit = true;
    }
  }

  return hit ? add(origin, scale(dir, bestT)) : null;
}
