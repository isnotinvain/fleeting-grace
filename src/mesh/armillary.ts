import type { Vec3 } from "../simulation/types";
import type { Mesh } from "./tube";
import { generateFlatRing } from "./flatRing";
import { combineMeshes } from "./combine";
import { normalize, cross, dot, length } from "../utils/vec3";

/**
 * Generate an armillary sphere: 3 orthogonal flat rings.
 *
 * If a direction is provided, the rings are oriented relative to it.
 */
export function generateArmillary(
  center: Vec3,
  radius: number,
  ringWidth: number,
  ringThickness: number,
  ringPoints: number,
  direction?: Vec3,
): Mesh {
  // Build orthonormal frame from direction
  let fwd: Vec3;

  if (direction && length(direction) >= 1e-10) {
    fwd = normalize(direction);
  } else {
    fwd = [0, 0, 1];
  }

  const seed: Vec3 = Math.abs(fwd[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const right = normalize(cross(fwd, seed));
  const up = cross(fwd, right);

  // Three orthogonal rings with normals along each axis
  const normals: Vec3[] = [fwd, right, up];

  let result: Mesh = { vertices: [], faces: [] };

  for (const normal of normals) {
    const ring = generateFlatRing(
      center,
      normal,
      radius - ringWidth,
      radius,
      ringThickness,
      ringPoints,
    );
    result = combineMeshes(result, ring);
  }

  return result;
}

/**
 * Compute the normal for the most-vertical ring that touches the path.
 *
 * Of the two rings whose planes contain the path direction (normals `right`
 * and `up`), picks the one whose normal is most horizontal
 * (smallest |dot(normal, worldUp)|), so the ring itself is most vertical.
 */
export function computeRingNormal(direction?: Vec3): Vec3 {
  let fwd: Vec3;
  if (direction && length(direction) >= 1e-10) {
    fwd = normalize(direction);
  } else {
    fwd = [0, 0, 1];
  }

  const seed: Vec3 = Math.abs(fwd[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const right = normalize(cross(fwd, seed));
  const up = cross(fwd, right);

  const worldUp: Vec3 = [0, 1, 0];
  return Math.abs(dot(right, worldUp)) < Math.abs(dot(up, worldUp))
    ? right
    : up;
}

/**
 * Generate a single flat ring that touches the path direction,
 * choosing the most vertical of the two candidate rings.
 */
export function generateSingleRing(
  center: Vec3,
  radius: number,
  ringWidth: number,
  ringThickness: number,
  ringPoints: number,
  direction?: Vec3,
): Mesh {
  const normal = computeRingNormal(direction);

  return generateFlatRing(
    center,
    normal,
    radius - ringWidth,
    radius,
    ringThickness,
    ringPoints,
  );
}
