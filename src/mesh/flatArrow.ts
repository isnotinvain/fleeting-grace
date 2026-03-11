import type { Vec3 } from "../simulation/types";
import type { Mesh } from "./tube";
import { normalize, cross, dot, length } from "../utils/vec3";

/**
 * Generate a flat extruded arrow with notched tip and notched tail.
 *
 * Tip: two barbs forming a pointed chevron (outer triangle with steeper
 * inner triangle cut out the back).
 * Tail: two fins with a V-notch between them (same idea, mirrored).
 * Shaft: flat bar connecting the two notches.
 *
 * @param origin      Base of the arrow (tail end)
 * @param direction   Direction the arrow points
 * @param totalLength Total length from tail tip to arrow tip
 * @param shaftWidth  Half-width of the shaft
 * @param tipLength   Length of the arrowhead section
 * @param tipWidth    Half-width of the arrowhead barbs
 * @param tipNotch    Depth of the notch cut into the back of the tip
 * @param tailLength  Length of the tail fin section
 * @param tailWidth   Half-width of the tail fins
 * @param tailNotch   Depth of the notch cut into the tail
 * @param thickness   Extrusion thickness of the flat arrow
 */
export function generateFlatArrow(
  origin: Vec3,
  direction: Vec3,
  totalLength: number,
  shaftWidth: number,
  tipLength: number,
  tipWidth: number,
  tipNotch: number,
  tailLength: number,
  tailWidth: number,
  tailNotch: number,
  thickness: number,
): Mesh {
  const dirLen = length(direction);
  if (dirLen < 1e-10) return { vertices: [], faces: [] };

  const fwd = normalize(direction);

  // Pick "up" as the most vertical direction perpendicular to fwd
  const seed: Vec3 = Math.abs(fwd[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const right = normalize(cross(fwd, seed));
  const up = cross(fwd, right);

  // Choose thickness direction: the one most perpendicular to world-up
  // so the flat face is most visible from typical viewing angles
  const worldUp: Vec3 = [0, 1, 0];
  const thicknessDir = Math.abs(dot(right, worldUp)) < Math.abs(dot(up, worldUp))
    ? right
    : up;
  const widthDir = Math.abs(dot(right, worldUp)) < Math.abs(dot(up, worldUp))
    ? up
    : right;

  // Define 2D profile points in (fwd, widthDir) plane.
  // Origin is at the tail tip, arrow points in +fwd.
  //
  // Profile (clockwise from arrow tip):
  //  0: tip point
  //  1: bottom barb outer
  //  2: bottom barb inner (tip notch, shaft junction)
  //  3: bottom shaft at tail junction
  //  4: bottom tail outer
  //  5: tail point
  //  6: top tail outer
  //  7: top shaft at tail junction
  //  8: top barb inner (tip notch, shaft junction)
  //  9: top barb outer

  const sw = shaftWidth;

  const profile2D: [number, number][] = [
    [totalLength, 0],                              // 0: tip
    [totalLength - tipLength, -tipWidth],           // 1: bottom barb outer
    [totalLength - tipLength + tipNotch, -sw],      // 2: bottom barb inner
    [tailLength - tailNotch, -sw],                  // 3: bottom shaft/tail junction
    [0, -tailWidth],                                // 4: bottom tail fin tip
    [tailNotch, 0],                                 // 5: tail notch center
    [0, tailWidth],                                 // 6: top tail fin tip
    [tailLength - tailNotch, sw],                   // 7: top shaft/tail junction
    [totalLength - tipLength + tipNotch, sw],       // 8: top barb inner
    [totalLength - tipLength, tipWidth],            // 9: top barb outer
  ];

  const halfT = thickness / 2;
  const nPts = profile2D.length;

  // Convert 2D profile to 3D top and bottom vertices
  const vertices: Vec3[] = [];

  // Top face vertices (0..nPts-1), then bottom face vertices (nPts..2*nPts-1)
  for (const sign of [1, -1]) {
    for (const [along, across] of profile2D) {
      vertices.push([
        origin[0] + along * fwd[0] + across * widthDir[0] + sign * halfT * thicknessDir[0],
        origin[1] + along * fwd[1] + across * widthDir[1] + sign * halfT * thicknessDir[1],
        origin[2] + along * fwd[2] + across * widthDir[2] + sign * halfT * thicknessDir[2],
      ]);
    }
  }

  const faces: [number, number, number][] = [];
  const top = 0;       // offset for top vertices
  const bot = nPts;    // offset for bottom vertices

  // Triangulate each region manually:
  // Tip: solid filled pentagon (0, 1, 2, 8, 9)
  // Shaft: quad (2, 3, 7, 8)
  // Tail: solid filled pentagon (5, 4, 3, 7, 6) — same shape as tip, less extreme
  const faceTriangles: [number, number, number][] = [
    [0, 1, 2],    // tip tri 1
    [0, 2, 8],    // tip tri 2
    [0, 8, 9],    // tip tri 3
    [2, 3, 7],    // shaft tri 1
    [2, 7, 8],    // shaft tri 2
    [5, 4, 3],    // tail tri 1
    [5, 3, 7],    // tail tri 2
    [5, 7, 6],    // tail tri 3
  ];

  // Top face (CCW when viewed from top)
  for (const [a, b, c] of faceTriangles) {
    faces.push([top + a, top + b, top + c]);
  }

  // Bottom face (reversed winding)
  for (const [a, b, c] of faceTriangles) {
    faces.push([bot + a, bot + c, bot + b]);
  }

  // Side walls: connect each edge of the outline between top and bottom
  const outline = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = 0; i < outline.length; i++) {
    const curr = outline[i];
    const next = outline[(i + 1) % outline.length];

    // Quad: top[curr], top[next], bot[next], bot[curr]
    faces.push([top + curr!, top + next!, bot + next!]);
    faces.push([top + curr!, bot + next!, bot + curr!]);
  }

  return { vertices, faces };
}
