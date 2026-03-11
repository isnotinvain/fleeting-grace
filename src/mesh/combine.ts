import type { Mesh } from "./tube";

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
