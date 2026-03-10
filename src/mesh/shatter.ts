import type { Vec3 } from "../simulation/types";
import type { Mesh } from "./tube";
import { add, sub, scale, dot, cross, normalize, length } from "../utils/vec3";
import quickhull3d from "quickhull3d";

/** A single fragment: its convex hull mesh and centroid. */
export interface Fragment {
  mesh: Mesh;
  centroid: Vec3;
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

/** Generate a random unit vector using Box-Muller on a seeded PRNG. */
function randomUnitVector(rand: () => number): Vec3 {
  // Marsaglia method: sample in unit cube, reject outside sphere
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
 * Apply a simple explosion physics simulation to shatter fragments.
 *
 * Instead of a full rigid body simulation (which would require Rapier WASM loading),
 * we use a deterministic ballistic model: each fragment gets an initial velocity
 * based on its position relative to the impact point, plus a small random spin.
 * Fragments translate and rotate over the given number of steps.
 *
 * This produces a visually convincing explosion without the complexity of
 * loading a WASM physics engine synchronously.
 *
 * @param fragmentsA - Fragments from body A
 * @param fragmentsB - Fragments from body B
 * @param velA - Body A's velocity at collision (scaled)
 * @param velB - Body B's velocity at collision (scaled)
 * @param simSteps - Number of simulation steps
 * @returns Array of displaced fragment meshes
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
  const results: Mesh[] = [];
  const rand = mulberry32(12345);

  for (let i = 0; i < allFragments.length; i++) {
    const frag = allFragments[i];
    const bodyVel = i < nA ? velA : velB;
    const { mesh, centroid } = frag;

    // Fragment velocity = body velocity + radial explosion velocity
    // The radial component pushes fragments outward from the centroid
    const radial = sub(centroid, i < nA ? fragmentsA[0].centroid : fragmentsB[0].centroid);
    const radialLen = length(radial);
    const radialDir = radialLen > 1e-10 ? scale(radial, 1 / radialLen) : randomUnitVector(rand);

    // Explosion speed proportional to body velocity magnitude
    const bodySpeed = length(bodyVel);
    const explosionSpeed = bodySpeed * (0.3 + rand() * 0.7);
    const fragVel = add(bodyVel, scale(radialDir, explosionSpeed));

    // Random rotation axis and speed
    const rotAxis = normalize(randomUnitVector(rand));
    const rotSpeed = (rand() - 0.5) * 0.1; // radians per step

    // Simulate: translate + rotate
    const totalAngle = rotSpeed * simSteps;
    const displacement = scale(fragVel, simSteps * 0.016); // ~60fps timestep

    // Apply rotation (Rodrigues' formula) and translation
    const cosA = Math.cos(totalAngle);
    const sinA = Math.sin(totalAngle);

    const newVertices = mesh.vertices.map((v) => {
      // Center on centroid, rotate, uncenter, then displace
      const centered = sub(v, centroid);
      const rotated = rodriguesRotate(centered, rotAxis, cosA, sinA);
      return add(add(rotated, centroid), displacement);
    });

    results.push({ vertices: newVertices, faces: mesh.faces });
  }

  return results;
}

/**
 * Rodrigues' rotation formula: rotate vector v around axis k by angle.
 */
function rodriguesRotate(v: Vec3, k: Vec3, cosA: number, sinA: number): Vec3 {
  const kCrossV = cross(k, v);
  const kDotV = dot(k, v);
  return [
    v[0] * cosA + kCrossV[0] * sinA + k[0] * kDotV * (1 - cosA),
    v[1] * cosA + kCrossV[1] * sinA + k[1] * kDotV * (1 - cosA),
    v[2] * cosA + kCrossV[2] * sinA + k[2] * kDotV * (1 - cosA),
  ];
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
