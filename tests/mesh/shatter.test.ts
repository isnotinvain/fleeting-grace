import { describe, it, expect } from "vitest";
import {
  generateShatterFragments,
  simulateShatterPhysics,
  rayTriangleIntersect,
  rayMeshIntersect,
} from "../../src/mesh/shatter";
import type { Vec3 } from "../../src/simulation/types";

describe("generateShatterFragments", () => {
  it("produces the requested number of fragments (approximately)", () => {
    const frags = generateShatterFragments([0, 0, 0], 1, [1, 0, 0], 10, 3);
    // May be fewer if some cells have < 4 points, but should be close
    expect(frags.length).toBeGreaterThanOrEqual(7);
    expect(frags.length).toBeLessThanOrEqual(10);
  });

  it("all fragments have valid convex hulls", () => {
    const frags = generateShatterFragments([0, 0, 0], 1, [1, 0, 0], 8, 2);
    for (const frag of frags) {
      expect(frag.mesh.vertices.length).toBeGreaterThanOrEqual(4);
      expect(frag.mesh.faces.length).toBeGreaterThanOrEqual(4);
      // All face indices should be valid
      const maxIdx = frag.mesh.vertices.length - 1;
      for (const [a, b, c] of frag.mesh.faces) {
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(maxIdx);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(maxIdx);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(maxIdx);
      }
    }
  });

  it("fragment centroids are within the original sphere", () => {
    const center: Vec3 = [5, 3, -2];
    const radius = 2;
    const frags = generateShatterFragments(center, radius, [0, 1, 0], 8, 2);
    for (const frag of frags) {
      const dx = frag.centroid[0] - center[0];
      const dy = frag.centroid[1] - center[1];
      const dz = frag.centroid[2] - center[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      expect(dist).toBeLessThan(radius * 1.5); // some tolerance for convex hull expansion
    }
  });

  it("is deterministic with the same seed", () => {
    const a = generateShatterFragments([0, 0, 0], 1, [1, 0, 0], 10, 3, 42);
    const b = generateShatterFragments([0, 0, 0], 1, [1, 0, 0], 10, 3, 42);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].centroid).toEqual(b[i].centroid);
    }
  });

  it("produces different results with different seeds", () => {
    const a = generateShatterFragments([0, 0, 0], 1, [1, 0, 0], 10, 3, 42);
    const b = generateShatterFragments([0, 0, 0], 1, [1, 0, 0], 10, 3, 99);
    // At least some centroids should differ
    const anyDifferent = a.some(
      (f, i) =>
        i < b.length &&
        (f.centroid[0] !== b[i].centroid[0] ||
          f.centroid[1] !== b[i].centroid[1] ||
          f.centroid[2] !== b[i].centroid[2]),
    );
    expect(anyDifferent).toBe(true);
  });

  it("face normals point outward from centroid", () => {
    const frags = generateShatterFragments([0, 0, 0], 1, [1, 0, 0], 6, 2);
    for (const frag of frags) {
      const { vertices, faces } = frag.mesh;
      for (const [a, b, c] of faces) {
        const v0 = vertices[a];
        const e1: Vec3 = [vertices[b][0] - v0[0], vertices[b][1] - v0[1], vertices[b][2] - v0[2]];
        const e2: Vec3 = [vertices[c][0] - v0[0], vertices[c][1] - v0[1], vertices[c][2] - v0[2]];
        const normal: Vec3 = [
          e1[1] * e2[2] - e1[2] * e2[1],
          e1[2] * e2[0] - e1[0] * e2[2],
          e1[0] * e2[1] - e1[1] * e2[0],
        ];
        const toFace: Vec3 = [
          v0[0] - frag.centroid[0],
          v0[1] - frag.centroid[1],
          v0[2] - frag.centroid[2],
        ];
        const dotProduct = normal[0] * toFace[0] + normal[1] * toFace[1] + normal[2] * toFace[2];
        expect(dotProduct).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("simulateShatterPhysics", () => {
  it("returns displaced meshes for all fragments", () => {
    const fragsA = generateShatterFragments([0, 0, 0], 1, [1, 0, 0], 5, 1);
    const fragsB = generateShatterFragments([2, 0, 0], 1, [-1, 0, 0], 5, 1);
    const results = simulateShatterPhysics(fragsA, fragsB, [1, 0, 0], [-1, 0, 0], 30);
    expect(results.length).toBe(fragsA.length + fragsB.length);
  });

  it("fragments move away from their original positions", () => {
    const fragsA = generateShatterFragments([0, 0, 0], 1, [1, 0, 0], 5, 1);
    const fragsB = generateShatterFragments([3, 0, 0], 1, [-1, 0, 0], 5, 1);
    const results = simulateShatterPhysics(fragsA, fragsB, [1, 0, 0], [-1, 0, 0], 60);

    const allFrags = [...fragsA, ...fragsB];
    let totalDisplacement = 0;
    for (let i = 0; i < results.length; i++) {
      const origCentroid = allFrags[i].centroid;
      const newVerts = results[i].vertices;
      const newCentroid: Vec3 = [0, 0, 0];
      for (const v of newVerts) {
        newCentroid[0] += v[0];
        newCentroid[1] += v[1];
        newCentroid[2] += v[2];
      }
      newCentroid[0] /= newVerts.length;
      newCentroid[1] /= newVerts.length;
      newCentroid[2] /= newVerts.length;

      const dx = newCentroid[0] - origCentroid[0];
      const dy = newCentroid[1] - origCentroid[1];
      const dz = newCentroid[2] - origCentroid[2];
      totalDisplacement += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    // Average displacement should be > 0
    expect(totalDisplacement / results.length).toBeGreaterThan(0.01);
  });

  it("returns empty array for empty input", () => {
    const results = simulateShatterPhysics([], [], [1, 0, 0], [-1, 0, 0], 30);
    expect(results).toHaveLength(0);
  });

  it("preserves face topology (same faces, just moved vertices)", () => {
    const frags = generateShatterFragments([0, 0, 0], 1, [1, 0, 0], 4, 1);
    const results = simulateShatterPhysics(frags, [], [1, 0, 0], [0, 0, 0], 20);
    for (let i = 0; i < frags.length; i++) {
      expect(results[i].faces).toEqual(frags[i].mesh.faces);
      expect(results[i].vertices.length).toBe(frags[i].mesh.vertices.length);
    }
  });
});

describe("rayTriangleIntersect", () => {
  it("detects intersection with triangle in XY plane", () => {
    const origin: Vec3 = [0.25, 0.25, -5];
    const dir: Vec3 = [0, 0, 1];
    const v0: Vec3 = [0, 0, 0];
    const v1: Vec3 = [1, 0, 0];
    const v2: Vec3 = [0, 1, 0];
    const t = rayTriangleIntersect(origin, dir, v0, v1, v2);
    expect(t).toBeCloseTo(5, 5);
  });

  it("returns null for miss", () => {
    const origin: Vec3 = [5, 5, -1];
    const dir: Vec3 = [0, 0, 1];
    const v0: Vec3 = [0, 0, 0];
    const v1: Vec3 = [1, 0, 0];
    const v2: Vec3 = [0, 1, 0];
    expect(rayTriangleIntersect(origin, dir, v0, v1, v2)).toBeNull();
  });

  it("returns null for ray pointing away", () => {
    const origin: Vec3 = [0.25, 0.25, 5];
    const dir: Vec3 = [0, 0, 1]; // pointing away from triangle at z=0
    const v0: Vec3 = [0, 0, 0];
    const v1: Vec3 = [1, 0, 0];
    const v2: Vec3 = [0, 1, 0];
    expect(rayTriangleIntersect(origin, dir, v0, v1, v2)).toBeNull();
  });
});

describe("rayMeshIntersect", () => {
  it("finds nearest hit on a simple mesh", () => {
    const mesh = {
      vertices: [
        [0, 0, 0],
        [2, 0, 0],
        [0, 2, 0],
        [0, 0, 3], // second triangle further away
        [2, 0, 3],
        [0, 2, 3],
      ] as Vec3[],
      faces: [
        [0, 1, 2],
        [3, 4, 5],
      ] as [number, number, number][],
    };
    const hit = rayMeshIntersect([0.5, 0.5, -1], [0, 0, 1], mesh, 100);
    expect(hit).not.toBeNull();
    expect(hit![2]).toBeCloseTo(0, 5); // hits z=0 plane first
  });

  it("returns null when no intersection", () => {
    const mesh = {
      vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] as Vec3[],
      faces: [[0, 1, 2]] as [number, number, number][],
    };
    const hit = rayMeshIntersect([5, 5, -1], [0, 0, 1], mesh, 100);
    expect(hit).toBeNull();
  });
});
