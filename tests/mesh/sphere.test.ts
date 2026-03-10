import { describe, it, expect } from "vitest";
import { generateSphere } from "../../src/mesh/sphere";
import { length, sub } from "../../src/utils/vec3";
import type { Vec3 } from "../../src/simulation/types";

describe("generateSphere", () => {
  it("has correct vertex count: 2 poles + (segments-1)*segments", () => {
    const mesh = generateSphere([0, 0, 0], 1, 16);
    expect(mesh.vertices).toHaveLength(2 + 15 * 16);
  });

  it("all vertices are at the correct radius from center", () => {
    const center: Vec3 = [5, 10, 15];
    const radius = 3;
    const mesh = generateSphere(center, radius, 16);
    for (const v of mesh.vertices) {
      const dist = length(sub(v, center));
      expect(dist).toBeCloseTo(radius, 5);
    }
  });

  it("all face indices are valid", () => {
    const mesh = generateSphere([0, 0, 0], 1, 12);
    const maxIdx = mesh.vertices.length - 1;
    for (const face of mesh.faces) {
      for (const idx of face) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThanOrEqual(maxIdx);
      }
    }
  });

  it("Euler characteristic V - E + F = 2 (topological sphere)", () => {
    const mesh = generateSphere([0, 0, 0], 1, 16);
    const V = mesh.vertices.length;
    const F = mesh.faces.length;
    // For triangulated sphere: E = (3F)/2
    const E = (3 * F) / 2;
    expect(V - E + F).toBe(2);
  });

  it("south pole is at center - [0,0,radius]", () => {
    const mesh = generateSphere([1, 2, 3], 5, 8);
    expect(mesh.vertices[0]).toEqual([1, 2, -2]);
  });

  it("north pole is at center + [0,0,radius]", () => {
    const mesh = generateSphere([1, 2, 3], 5, 8);
    const last = mesh.vertices[mesh.vertices.length - 1];
    expect(last).toEqual([1, 2, 8]);
  });
});
