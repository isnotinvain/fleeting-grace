import { describe, it, expect } from "vitest";
import { generateTube } from "../../src/mesh/tube";
import type { Vec3 } from "../../src/simulation/types";

describe("generateTube", () => {
  const straightPath: Vec3[] = [
    [0, 0, 0],
    [1, 0, 0],
    [2, 0, 0],
  ];

  it("returns empty for fewer than 2 points", () => {
    const mesh = generateTube([[0, 0, 0]], 1, 1, 8);
    expect(mesh.vertices).toHaveLength(0);
    expect(mesh.faces).toHaveLength(0);
  });

  it("generates correct vertex count: points × segments + 2 caps", () => {
    const mesh = generateTube(straightPath, 1, 1, 8);
    // 3 points × 8 segments + 2 cap centers = 26
    expect(mesh.vertices).toHaveLength(3 * 8 + 2);
  });

  it("generates correct face count", () => {
    const mesh = generateTube(straightPath, 1, 1, 8);
    // Body: (3-1) × 8 × 2 = 32 triangles
    // Start cap: 8 triangles
    // End cap: 8 triangles
    // Total: 48
    expect(mesh.faces).toHaveLength(48);
  });

  it("all face indices are valid", () => {
    const mesh = generateTube(straightPath, 0.5, 0.5, 12);
    const maxIdx = mesh.vertices.length - 1;
    for (const face of mesh.faces) {
      for (const idx of face) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThanOrEqual(maxIdx);
      }
    }
  });

  it("supports tapering (different start/end radius)", () => {
    const mesh = generateTube(straightPath, 2, 0.5, 8);
    // First ring should be at larger radius than last ring
    const firstRingDist = Math.sqrt(
      mesh.vertices[0][1] ** 2 + mesh.vertices[0][2] ** 2,
    );
    const lastRingIdx = (straightPath.length - 1) * 8;
    const lastRingDist = Math.sqrt(
      mesh.vertices[lastRingIdx][1] ** 2 + mesh.vertices[lastRingIdx][2] ** 2,
    );
    expect(firstRingDist).toBeGreaterThan(lastRingDist);
  });

  it("ring vertices are equidistant from the path", () => {
    const mesh = generateTube(straightPath, 1, 1, 16);
    // Check first ring (around point [0,0,0]) — all should be at radius 1
    for (let j = 0; j < 16; j++) {
      const v = mesh.vertices[j];
      const dist = Math.sqrt(v[1] * v[1] + v[2] * v[2]);
      expect(dist).toBeCloseTo(1, 3);
    }
  });

  it("works with a curved path", () => {
    const curve: Vec3[] = Array.from({ length: 20 }, (_, i) => {
      const t = (i / 19) * Math.PI;
      return [Math.cos(t), Math.sin(t), 0] as Vec3;
    });
    const mesh = generateTube(curve, 0.1, 0.1, 8);
    expect(mesh.vertices.length).toBe(20 * 8 + 2);
    expect(mesh.faces.length).toBe(19 * 8 * 2 + 8 + 8);
  });
});
