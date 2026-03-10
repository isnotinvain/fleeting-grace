import { describe, it, expect } from "vitest";
import { generateArrow, combineMeshes } from "../../src/mesh/arrow";
import type { Vec3 } from "../../src/simulation/types";

describe("generateArrow", () => {
  it("returns empty for zero-length direction", () => {
    const mesh = generateArrow([0, 0, 0], [0, 0, 0], 1, 0.1, 0.3, 0.2, 8);
    expect(mesh.vertices).toHaveLength(0);
  });

  it("produces shaft + cone vertices", () => {
    const mesh = generateArrow([0, 0, 0], [1, 0, 0], 2, 0.1, 0.5, 0.2, 8);
    // Shaft: 2 pts × 8 seg + 2 caps = 18
    // Cone: 2 pts × 8 seg + 2 caps = 18
    expect(mesh.vertices).toHaveLength(18 + 18);
  });

  it("all face indices are valid", () => {
    const mesh = generateArrow([0, 0, 0], [0, 1, 0], 3, 0.1, 0.5, 0.2, 12);
    const maxIdx = mesh.vertices.length - 1;
    for (const face of mesh.faces) {
      for (const idx of face) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThanOrEqual(maxIdx);
      }
    }
  });

  it("cone tip approaches the expected endpoint", () => {
    const mesh = generateArrow([0, 0, 0], [0, 0, 1], 2, 0.1, 1, 0.2, 8);
    // Arrow goes from [0,0,0] along +z, shaft 2 units + cone 1 unit = tip at z≈3
    // The cone cap center should be the last vertex of the cone portion
    const lastVertex = mesh.vertices[mesh.vertices.length - 1];
    expect(lastVertex[2]).toBeCloseTo(3, 1);
  });
});

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
    expect(combined.faces[1]).toEqual([2, 3, 2]); // offset by 2
  });
});
