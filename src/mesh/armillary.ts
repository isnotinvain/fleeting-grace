import type { Vec3 } from "../simulation/types";
import type { Mesh } from "./tube";
import { generateFlatRing } from "./flatRing";
import { combineMeshes } from "./arrow";
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
 * Generate a single flat ring that touches the path direction,
 * choosing the most vertical of the two candidate rings.
 *
 * The two rings whose planes contain the path direction have normals
 * `right` and `up`. We pick the one whose normal is most horizontal
 * (smallest |dot(normal, worldUp)|), so the ring itself is most vertical.
 */
export function generateSingleRing(
  center: Vec3,
  radius: number,
  ringWidth: number,
  ringThickness: number,
  ringPoints: number,
  direction?: Vec3,
): Mesh {
  let fwd: Vec3;
  if (direction && length(direction) >= 1e-10) {
    fwd = normalize(direction);
  } else {
    fwd = [0, 0, 1];
  }

  const seed: Vec3 = Math.abs(fwd[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const right = normalize(cross(fwd, seed));
  const up = cross(fwd, right);

  // Pick the normal that is most horizontal (ring most vertical)
  const worldUp: Vec3 = [0, 1, 0];
  const normal = Math.abs(dot(right, worldUp)) < Math.abs(dot(up, worldUp))
    ? right
    : up;

  return generateFlatRing(
    center,
    normal,
    radius - ringWidth / 2,
    radius + ringWidth / 2,
    ringThickness,
    ringPoints,
  );
}
