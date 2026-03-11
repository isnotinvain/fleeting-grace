import type { Vec3 } from "../simulation/types";
import type { Mesh } from "./tube";

/**
 * Generate a UV sphere mesh.
 * Structure: south pole + (segments-1) interior rings + north pole.
 */
export function generateSphere(
  center: Vec3,
  radius: number,
  segments: number,
): Mesh {
  const vertices: Vec3[] = [];
  const faces: [number, number, number][] = [];

  // South pole
  vertices.push([center[0], center[1], center[2] - radius]);

  // Interior rings
  for (let i = 1; i < segments; i++) {
    const lat = (Math.PI * i) / segments - Math.PI / 2;
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);
    for (let j = 0; j < segments; j++) {
      const lon = (2 * Math.PI * j) / segments;
      vertices.push([
        center[0] + radius * cosLat * Math.cos(lon),
        center[1] + radius * cosLat * Math.sin(lon),
        center[2] + radius * sinLat,
      ]);
    }
  }

  // North pole
  const northIdx = vertices.length;
  vertices.push([center[0], center[1], center[2] + radius]);

  // South pole fan
  for (let j = 0; j < segments; j++) {
    faces.push([0, 1 + j, 1 + ((j + 1) % segments)]);
  }

  // Interior quads
  for (let i = 0; i < segments - 2; i++) {
    const ringBase = 1 + i * segments;
    const nextBase = 1 + (i + 1) * segments;
    for (let j = 0; j < segments; j++) {
      const j1 = (j + 1) % segments;
      faces.push([ringBase + j, nextBase + j, ringBase + j1]);
      faces.push([ringBase + j1, nextBase + j, nextBase + j1]);
    }
  }

  // North pole fan
  const lastRingBase = 1 + (segments - 2) * segments;
  for (let j = 0; j < segments; j++) {
    faces.push([northIdx, lastRingBase + ((j + 1) % segments), lastRingBase + j]);
  }

  return { vertices, faces };
}
