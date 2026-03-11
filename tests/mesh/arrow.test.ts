import { describe, it, expect } from "vitest";
import { combineMeshes } from "../../src/mesh/combine";
import { generateFlatArrow } from "../../src/mesh/flatArrow";
import type { Vec3 } from "../../src/simulation/types";

describe("combineMeshes", () => {
  it("offsets face indices correctly", () => {
    const a = {
      vertices: [[0, 0, 0], [1, 0, 0]] as Vec3[],
      faces: [[0, 1, 0]] as [number, number, number][],
    };
    const b = {
      vertices: [[2, 0, 0], [3, 0, 0]] as Vec3[],
      faces: [[0, 1, 0]] as [number, number, number][],
    };
    const combined = combineMeshes(a, b);
    expect(combined.vertices).toHaveLength(4);
    expect(combined.faces[1]).toEqual([2, 3, 2]);
  });
});

describe("generateFlatArrow", () => {
  it("returns empty for zero-length direction", () => {
    const mesh = generateFlatArrow(
      [0, 0, 0], [0, 0, 0],
      2, 0.1, 0.5, 0.3, 0.15, 0.3, 0.2, 0.1, 0.1,
    );
    expect(mesh.vertices).toHaveLength(0);
  });

  it("produces vertices and faces", () => {
    const mesh = generateFlatArrow(
      [0, 0, 0], [1, 0, 0],
      2, 0.1, 0.5, 0.3, 0.15, 0.3, 0.2, 0.1, 0.1,
    );
    // 10 profile points × 2 (top + bottom) = 20 vertices
    expect(mesh.vertices).toHaveLength(20);
    // 8 face tris × 2 (top + bottom) + 10 side edges × 2 tris = 36
    expect(mesh.faces).toHaveLength(36);
  });

  it("all face indices are valid", () => {
    const mesh = generateFlatArrow(
      [0, 0, 0], [0, 1, 0],
      3, 0.1, 0.8, 0.4, 0.25, 0.5, 0.3, 0.15, 0.1,
    );
    const maxIdx = mesh.vertices.length - 1;
    for (const face of mesh.faces) {
      for (const idx of face) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThanOrEqual(maxIdx);
      }
    }
  });

  it("geometry extends along the given direction", () => {
    const mesh = generateFlatArrow(
      [0, 0, 0], [0, 0, 1],
      4, 0.1, 1, 0.3, 0.3, 0.6, 0.2, 0.2, 0.1,
    );
    // Tip should be near z=4
    const maxZ = Math.max(...mesh.vertices.map((v) => v[2]));
    expect(maxZ).toBeCloseTo(4, 0);
  });
});
