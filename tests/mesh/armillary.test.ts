import { describe, it, expect } from "vitest";
import { generateArmillary, generateSingleRing } from "../../src/mesh/armillary";
import type { Vec3 } from "../../src/simulation/types";

describe("generateArmillary", () => {
  it("generates 3 rings worth of geometry", () => {
    const mesh = generateArmillary([0, 0, 0], 1, 0.15, 0.05, 32);
    // 3 flat rings, each with 4 * segments vertices
    expect(mesh.vertices.length).toBeGreaterThan(100);
    expect(mesh.faces.length).toBeGreaterThan(100);
  });

  it("all face indices are valid", () => {
    const mesh = generateArmillary([0, 0, 0], 1, 0.15, 0.05, 16);
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
    const mesh = generateArmillary(center, 5, 0.5, 0.2, 16);

    let cx = 0, cy = 0, cz = 0;
    for (const v of mesh.vertices) {
      cx += v[0]; cy += v[1]; cz += v[2];
    }
    cx /= mesh.vertices.length;
    cy /= mesh.vertices.length;
    cz /= mesh.vertices.length;

    expect(cx).toBeCloseTo(center[0], 0);
    expect(cy).toBeCloseTo(center[1], 0);
    expect(cz).toBeCloseTo(center[2], 0);
  });

  it("supports direction parameter", () => {
    const mesh = generateArmillary(
      [0, 0, 0], 1, 0.15, 0.05, 16,
      [1, 0, 0],
    );
    expect(mesh.vertices.length).toBeGreaterThan(0);
    expect(mesh.faces.length).toBeGreaterThan(0);
  });
});

describe("generateSingleRing", () => {
  it("generates a single flat ring", () => {
    const mesh = generateSingleRing([0, 0, 0], 1, 0.15, 0.05, 32);
    // Single flat ring: 4 * segments vertices, 8 * segments faces
    expect(mesh.vertices.length).toBe(4 * 32);
    expect(mesh.faces.length).toBe(8 * 32);
  });

  it("all face indices are valid", () => {
    const mesh = generateSingleRing([0, 0, 0], 1, 0.15, 0.05, 16);
    const maxIdx = mesh.vertices.length - 1;
    for (const face of mesh.faces) {
      for (const idx of face) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThanOrEqual(maxIdx);
      }
    }
  });

  it("generates less geometry than armillary", () => {
    const ring = generateSingleRing([0, 0, 0], 1, 0.15, 0.05, 16);
    const armillary = generateArmillary([0, 0, 0], 1, 0.15, 0.05, 16);
    expect(ring.vertices.length).toBeLessThan(armillary.vertices.length);
    expect(ring.faces.length).toBeLessThan(armillary.faces.length);
  });
});
