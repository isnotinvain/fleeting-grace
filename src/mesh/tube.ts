import type { Vec3 } from "../simulation/types";
import { computeFrenetFrames } from "./frenet";

export interface Mesh {
  vertices: Vec3[];
  faces: [number, number, number][];
}

/**
 * Generate a tube mesh along a path with circular cross-sections.
 * Supports tapering from startRadius to endRadius.
 */
export function generateTube(
  points: Vec3[],
  startRadius: number,
  endRadius: number,
  segments: number,
): Mesh {
  if (points.length < 2) return { vertices: [], faces: [] };

  const { normals, binormals } = computeFrenetFrames(points);
  const nPts = points.length;
  const vertices: Vec3[] = [];
  const faces: [number, number, number][] = [];

  // Generate ring vertices
  for (let i = 0; i < nPts; i++) {
    const t = nPts === 1 ? 0 : i / (nPts - 1);
    const radius = startRadius * (1 - t) + endRadius * t;
    const p = points[i];
    const n = normals[i];
    const b = binormals[i];

    for (let j = 0; j < segments; j++) {
      const angle = (2 * Math.PI * j) / segments;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      vertices.push([
        p[0] + radius * (cos * n[0] + sin * b[0]),
        p[1] + radius * (cos * n[1] + sin * b[1]),
        p[2] + radius * (cos * n[2] + sin * b[2]),
      ]);
    }
  }

  // Generate quad faces between adjacent rings
  for (let i = 0; i < nPts - 1; i++) {
    const currBase = i * segments;
    const nextBase = (i + 1) * segments;
    for (let j = 0; j < segments; j++) {
      const j1 = (j + 1) % segments;
      const v0 = currBase + j;
      const v1 = currBase + j1;
      const v2 = nextBase + j;
      const v3 = nextBase + j1;
      faces.push([v0, v2, v1]);
      faces.push([v1, v2, v3]);
    }
  }

  // Start cap
  const startCenter = vertices.length;
  vertices.push([...points[0]]);
  for (let j = 0; j < segments; j++) {
    faces.push([startCenter, j, (j + 1) % segments]);
  }

  // End cap
  const endCenter = vertices.length;
  vertices.push([...points[nPts - 1]]);
  const lastBase = (nPts - 1) * segments;
  for (let j = 0; j < segments; j++) {
    faces.push([endCenter, lastBase + (j + 1) % segments, lastBase + j]);
  }

  return { vertices, faces };
}
