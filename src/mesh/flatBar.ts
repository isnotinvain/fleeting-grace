import type { Vec3 } from "../simulation/types";
import type { Mesh } from "./tube";
import { addScaled } from "../utils/vec3";

/**
 * Generate a flat rectangular bar (extruded rectangle) between two points.
 *
 * @param start      Start point (center of the start face)
 * @param end        End point (center of the end face)
 * @param widthDir   Direction of the bar's width
 * @param halfWidth  Half-width of the bar
 * @param thicknessDir Direction of the bar's thickness
 * @param halfThickness Half-thickness of the bar
 */
export function generateFlatBar(
  start: Vec3,
  end: Vec3,
  widthDir: Vec3,
  halfWidth: number,
  thicknessDir: Vec3,
  halfThickness: number,
): Mesh {
  // 8 corner vertices of the box
  const vertices: Vec3[] = [];
  for (const pt of [start, end]) {
    for (const ws of [-1, 1]) {
      for (const ts of [-1, 1]) {
        vertices.push(addScaled(
          addScaled(pt, widthDir, ws * halfWidth),
          thicknessDir,
          ts * halfThickness,
        ));
      }
    }
  }

  // Vertex layout:
  //   0: start, -w, -t    1: start, -w, +t
  //   2: start, +w, -t    3: start, +w, +t
  //   4: end,   -w, -t    5: end,   -w, +t
  //   6: end,   +w, -t    7: end,   +w, +t

  const faces: [number, number, number][] = [
    // Start cap
    [0, 2, 3], [0, 3, 1],
    // End cap
    [4, 5, 7], [4, 7, 6],
    // -width side
    [0, 1, 5], [0, 5, 4],
    // +width side
    [2, 6, 7], [2, 7, 3],
    // -thickness side
    [0, 4, 6], [0, 6, 2],
    // +thickness side
    [1, 3, 7], [1, 7, 5],
  ];

  return { vertices, faces };
}
