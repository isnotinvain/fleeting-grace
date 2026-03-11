import type { Vec3 } from "../simulation/types";
import { sub, cross, dot, scale, normalize, length, addScaled } from "../utils/vec3";

export interface FrenetFrames {
  tangents: Vec3[];
  normals: Vec3[];
  binormals: Vec3[];
}

/**
 * Compute rotation-minimizing frames along a curve.
 * Each frame consists of a tangent, normal, and binormal vector.
 */
export function computeFrenetFrames(points: Vec3[]): FrenetFrames {
  const n = points.length;
  if (n < 2) {
    return { tangents: [], normals: [], binormals: [] };
  }

  // Compute tangent vectors via forward differences
  const tangents: Vec3[] = new Array(n);
  for (let i = 0; i < n - 1; i++) {
    const t = sub(points[i + 1]!, points[i]!);
    const len = length(t);
    tangents[i] = len >= 1e-10 ? scale(t, 1 / len) : (i > 0 ? tangents[i - 1]! : [1, 0, 0]);
  }
  tangents[n - 1] = tangents[n - 2]!;

  // Compute initial normal perpendicular to first tangent
  const t0 = tangents[0]!;
  const seed: Vec3 = Math.abs(t0[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const normals: Vec3[] = new Array(n);
  normals[0] = normalize(cross(t0, seed));

  // Propagate normals using rotation-minimizing approach
  for (let i = 1; i < n; i++) {
    // Project previous normal onto plane perpendicular to current tangent
    const proj = addScaled(normals[i - 1]!, tangents[i]!, -dot(normals[i - 1]!, tangents[i]!));
    const projLen = length(proj);
    normals[i] = projLen >= 1e-10 ? scale(proj, 1 / projLen) : normals[i - 1]!;
  }

  // Compute binormals
  const binormals: Vec3[] = new Array(n);
  for (let i = 0; i < n; i++) {
    binormals[i] = cross(tangents[i]!, normals[i]!);
  }

  return { tangents, normals, binormals };
}
