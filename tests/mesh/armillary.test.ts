import { describe, it, expect } from "vitest";
import { generateArmillary } from "../../src/mesh/armillary";
import type { Vec3 } from "../../src/simulation/types";

describe("generateArmillary", () => {
  it("generates 3 rings worth of geometry", () => {
    const mesh = generateArmillary([0, 0, 0], 1, 0.1, 8, 32);
    // Each ring: (32+2) path points × 8 segments + 2 caps = 274 vertices
    // 3 rings total → substantial geometry
    expect(mesh.vertices.length).toBeGreaterThan(100);
    expect(mesh.faces.length).toBeGreaterThan(100);
  });

  it("all face indices are valid", () => {
    const mesh = generateArmillary([0, 0, 0], 1, 0.1, 6, 16);
    const maxIdx = mesh.vertices.length - 1;
    for (const face of mesh.faces) {
      for (const idx of face) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThanOrEqual(maxIdx);
      }
    }
  });

  it("geometry is centered around the given center", () => {
    const center: Vec3 = [10, 20, 30];
    const mesh = generateArmillary(center, 5, 0.5, 6, 16);

    // Compute centroid of all vertices
    let cx = 0, cy = 0, cz = 0;
    for (const v of mesh.vertices) {
      cx += v[0]; cy += v[1]; cz += v[2];
    }
    cx /= mesh.vertices.length;
    cy /= mesh.vertices.length;
    cz /= mesh.vertices.length;

    // Centroid should be near the specified center
    expect(cx).toBeCloseTo(center[0], 0);
    expect(cy).toBeCloseTo(center[1], 0);
    expect(cz).toBeCloseTo(center[2], 0);
  });

  it("supports direction and stretch parameters", () => {
    const mesh = generateArmillary(
      [0, 0, 0], 1, 0.1, 6, 16,
      [1, 0, 0], // direction
      2.0,       // stretch
    );
    expect(mesh.vertices.length).toBeGreaterThan(0);
    expect(mesh.faces.length).toBeGreaterThan(0);
  });
});
