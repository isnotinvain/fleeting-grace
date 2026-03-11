import type { Vec3 } from "../simulation/types";
import type { Mesh } from "./tube";
import { normalize, cross } from "../utils/vec3";

/**
 * Generate a flat ring (annulus / washer shape) mesh.
 *
 * @param center  Center of the ring
 * @param normal  Normal vector of the ring plane
 * @param innerRadius  Inner radius of the annulus
 * @param outerRadius  Outer radius of the annulus
 * @param thickness  Thickness of the ring (height of the "coin")
 * @param segments  Number of divisions around the circle
 */
export function generateFlatRing(
  center: Vec3,
  normal: Vec3,
  innerRadius: number,
  outerRadius: number,
  thickness: number,
  segments: number,
): Mesh {
  const n = normalize(normal);

  // Build orthonormal basis
  const seed: Vec3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = normalize(cross(n, seed));
  const v = cross(n, u);

  const halfT = thickness / 2;
  const vertices: Vec3[] = [];
  const faces: [number, number, number][] = [];

  // Generate vertices: 4 rings of points
  // Ring 0: outer top, Ring 1: inner top, Ring 2: outer bottom, Ring 3: inner bottom
  for (let ring = 0; ring < 4; ring++) {
    const r = ring % 2 === 0 ? outerRadius : innerRadius;
    const h = ring < 2 ? halfT : -halfT;
    for (let i = 0; i < segments; i++) {
      const angle = (2 * Math.PI * i) / segments;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      vertices.push([
        center[0] + r * (cos * u[0] + sin * v[0]) + h * n[0],
        center[1] + r * (cos * u[1] + sin * v[1]) + h * n[1],
        center[2] + r * (cos * u[2] + sin * v[2]) + h * n[2],
      ]);
    }
  }

  const outerTop = 0;
  const innerTop = segments;
  const outerBot = segments * 2;
  const innerBot = segments * 3;

  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;

    // Top face (outer to inner)
    faces.push([outerTop + i, outerTop + j, innerTop + j]);
    faces.push([outerTop + i, innerTop + j, innerTop + i]);

    // Bottom face (inner to outer, reversed winding)
    faces.push([outerBot + i, innerBot + i, innerBot + j]);
    faces.push([outerBot + i, innerBot + j, outerBot + j]);

    // Outer wall
    faces.push([outerTop + i, outerBot + i, outerBot + j]);
    faces.push([outerTop + i, outerBot + j, outerTop + j]);

    // Inner wall (reversed winding)
    faces.push([innerTop + i, innerTop + j, innerBot + j]);
    faces.push([innerTop + i, innerBot + j, innerBot + i]);
  }

  return { vertices, faces };
}
