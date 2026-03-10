import type { Vec3 } from "../simulation/types";
import type { Mesh } from "./tube";
import { generateTube } from "./tube";
import { normalize, addScaled, length } from "../utils/vec3";

/**
 * Generate an arrow mesh (cylinder shaft + cone tip).
 */
export function generateArrow(
  origin: Vec3,
  direction: Vec3,
  shaftLength: number,
  shaftRadius: number,
  coneLength: number,
  coneRadius: number,
  segments: number,
): Mesh {
  const dirLen = length(direction);
  if (dirLen < 1e-10) return { vertices: [], faces: [] };

  const dir = normalize(direction);
  const shaftEnd = addScaled(origin, dir, shaftLength);
  const coneTip = addScaled(shaftEnd, dir, coneLength);

  // Shaft: constant-radius tube
  const shaft = generateTube([origin, shaftEnd], shaftRadius, shaftRadius, segments);

  // Cone: tapers to near-zero
  const cone = generateTube([shaftEnd, coneTip], coneRadius, 1e-6, segments);

  // Combine meshes
  return combineMeshes(shaft, cone);
}

/** Combine two meshes, offsetting face indices of the second. */
export function combineMeshes(a: Mesh, b: Mesh): Mesh {
  const offset = a.vertices.length;
  return {
    vertices: [...a.vertices, ...b.vertices],
    faces: [
      ...a.faces,
      ...b.faces.map(
        (f) => [f[0] + offset, f[1] + offset, f[2] + offset] as [number, number, number],
      ),
    ],
  };
}
