import type { Vec3 } from "./types";
import { sub, addScaled, lengthSq, length } from "../utils/vec3";

/**
 * Perpendicular distance from a point to a line segment.
 * Clamps the projection to [0, 1] so endpoints are handled correctly.
 */
function pointToSegmentDistance(point: Vec3, start: Vec3, end: Vec3): number {
  const seg = sub(end, start);
  const segLenSq = lengthSq(seg);

  if (segLenSq === 0) return length(sub(point, start));

  // Project point onto segment, clamped to [0, 1]
  const toPoint = sub(point, start);
  const t = Math.max(0, Math.min(1,
    (toPoint[0] * seg[0] + toPoint[1] * seg[1] + toPoint[2] * seg[2]) / segLenSq
  ));

  // Closest point on segment
  const closest = addScaled(start, seg, t);
  return length(sub(point, closest));
}

/**
 * Douglas-Peucker trajectory simplification.
 * Returns a subset of the input points that approximates the original
 * trajectory within the given epsilon tolerance.
 *
 * Uses an iterative stack-based approach to avoid recursion depth limits.
 */
export function simplifyTrajectory(points: Vec3[], epsilon?: number): Vec3[] {
  const n = points.length;
  if (n <= 2) return points.slice();

  // Default epsilon: 0.01% of trajectory bounding box diagonal
  if (epsilon === undefined) {
    epsilon = computeDefaultEpsilon(points);
  }

  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;

  // Stack of [startIndex, endIndex] ranges to process
  const stack: [number, number][] = [[0, n - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    if (end - start < 2) continue;

    let maxDist = 0;
    let maxIndex = start;

    const startPt = points[start]!;
    const endPt = points[end]!;

    for (let i = start + 1; i < end; i++) {
      const dist = pointToSegmentDistance(points[i]!, startPt, endPt);
      if (dist > maxDist) {
        maxDist = dist;
        maxIndex = i;
      }
    }

    if (maxDist > epsilon) {
      keep[maxIndex] = 1;
      stack.push([start, maxIndex]);
      stack.push([maxIndex, end]);
    }
  }

  const result: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    if (keep[i]) result.push(points[i]!);
  }
  return result;
}

function computeDefaultEpsilon(points: Vec3[]): number {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const p of points) {
    if (p[0] < minX) minX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[2] < minZ) minZ = p[2];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] > maxY) maxY = p[1];
    if (p[2] > maxZ) maxZ = p[2];
  }

  const dx = maxX - minX;
  const dy = maxY - minY;
  const dz = maxZ - minZ;
  const diagonal = Math.sqrt(dx * dx + dy * dy + dz * dz);

  return diagonal * 0.0001;
}
