import type { Vec3 } from "../simulation/types";
import type { Mesh } from "./tube";
import { generateTube } from "./tube";
import { combineMeshes } from "./arrow";
import { normalize, cross, dot, length, addScaled } from "../utils/vec3";

/**
 * Generate an armillary sphere: 3 orthogonal ring tubes.
 *
 * If a direction is provided, the rings are oriented relative to it
 * and can be stretched along the direction (velocity-based motion blur).
 */
export function generateArmillary(
  center: Vec3,
  radius: number,
  ringThickness: number,
  tubeSegments: number,
  ringPoints: number,
  direction?: Vec3,
  stretch?: number,
): Mesh {
  // Build orthonormal frame from direction
  let fwd: Vec3, right: Vec3, up: Vec3;

  if (direction && length(direction) >= 1e-10) {
    fwd = normalize(direction);
  } else {
    fwd = [0, 0, 1];
  }

  const seed: Vec3 = Math.abs(fwd[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  right = normalize(cross(fwd, seed));
  up = cross(fwd, right);

  const axisPairs: [Vec3, Vec3][] = [
    [right, up],
    [right, fwd],
    [up, fwd],
  ];

  let result: Mesh = { vertices: [], faces: [] };

  for (const [ax1, ax2] of axisPairs) {
    const path = generateRingPath(center, radius, ax1, ax2, fwd, ringPoints, stretch);
    const tube = generateTube(path, ringThickness, ringThickness, tubeSegments);
    result = combineMeshes(result, tube);
  }

  return result;
}

function generateRingPath(
  center: Vec3,
  radius: number,
  ax1: Vec3,
  ax2: Vec3,
  fwd: Vec3,
  numPoints: number,
  stretch?: number,
): Vec3[] {
  const points: Vec3[] = [];

  for (let i = 0; i <= numPoints; i++) {
    const angle = (2 * Math.PI * i) / numPoints;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Base point on ring
    let x = radius * (cos * ax1[0] + sin * ax2[0]);
    let y = radius * (cos * ax1[1] + sin * ax2[1]);
    let z = radius * (cos * ax1[2] + sin * ax2[2]);

    // Apply velocity stretch along fwd direction
    if (stretch !== undefined && stretch !== 1) {
      const fwdComp = x * fwd[0] + y * fwd[1] + z * fwd[2];
      const t = (1 - fwdComp / radius) / 2; // [0, 1]
      const ease = t * t * t; // cubic ease-in
      const stretchAmount = fwdComp * (stretch - 1) * ease;
      x += fwd[0] * stretchAmount;
      y += fwd[1] * stretchAmount;
      z += fwd[2] * stretchAmount;
    }

    points.push([center[0] + x, center[1] + y, center[2] + z]);
  }

  // Add one extra point to overlap for smooth tube closure
  if (points.length >= 2) {
    points.push(points[1]);
  }

  return points;
}
