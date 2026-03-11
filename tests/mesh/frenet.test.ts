import { describe, it, expect } from "vitest";
import { computeFrenetFrames } from "../../src/mesh/frenet";
import { dot, length, cross } from "../../src/utils/vec3";
import type { Vec3 } from "../../src/simulation/types";

describe("computeFrenetFrames", () => {
  it("returns empty for fewer than 2 points", () => {
    const result = computeFrenetFrames([[0, 0, 0]]);
    expect(result.tangents).toHaveLength(0);
  });

  it("produces orthonormal frames for a straight line", () => {
    const points: Vec3[] = Array.from({ length: 10 }, (_, i) => [i, 0, 0]);
    const { tangents, normals, binormals } = computeFrenetFrames(points);

    expect(tangents).toHaveLength(10);

    for (let i = 0; i < 10; i++) {
      // All tangents point along +x
      expect(tangents[i]![0]).toBeCloseTo(1, 5);

      // Each frame is orthonormal
      expect(length(tangents[i]!)).toBeCloseTo(1, 5);
      expect(length(normals[i]!)).toBeCloseTo(1, 5);
      expect(length(binormals[i]!)).toBeCloseTo(1, 5);

      expect(dot(tangents[i]!, normals[i]!)).toBeCloseTo(0, 5);
      expect(dot(tangents[i]!, binormals[i]!)).toBeCloseTo(0, 5);
      expect(dot(normals[i]!, binormals[i]!)).toBeCloseTo(0, 5);
    }
  });

  it("produces orthonormal frames for a circle", () => {
    const points: Vec3[] = Array.from({ length: 100 }, (_, i) => {
      const t = (i / 100) * Math.PI * 2;
      return [Math.cos(t), Math.sin(t), 0] as Vec3;
    });
    const { tangents, normals, binormals } = computeFrenetFrames(points);

    for (let i = 0; i < tangents.length; i++) {
      expect(length(tangents[i]!)).toBeCloseTo(1, 3);
      expect(length(normals[i]!)).toBeCloseTo(1, 3);
      expect(length(binormals[i]!)).toBeCloseTo(1, 3);
      expect(dot(tangents[i]!, normals[i]!)).toBeCloseTo(0, 3);
    }
  });

  it("binormal = tangent × normal (right-hand rule)", () => {
    const points: Vec3[] = Array.from({ length: 20 }, (_, i) => {
      const t = (i / 20) * Math.PI;
      return [Math.cos(t), Math.sin(t), t * 0.1] as Vec3;
    });
    const { tangents, normals, binormals } = computeFrenetFrames(points);

    for (let i = 0; i < tangents.length; i++) {
      const expected = cross(tangents[i]!, normals[i]!);
      expect(binormals[i]![0]).toBeCloseTo(expected[0], 5);
      expect(binormals[i]![1]).toBeCloseTo(expected[1], 5);
      expect(binormals[i]![2]).toBeCloseTo(expected[2], 5);
    }
  });

  it("normals vary smoothly (no abrupt flips)", () => {
    const points: Vec3[] = Array.from({ length: 50 }, (_, i) => {
      const t = (i / 50) * Math.PI * 2;
      return [Math.cos(t) * 10, Math.sin(t) * 10, t] as Vec3;
    });
    const { normals } = computeFrenetFrames(points);

    for (let i = 1; i < normals.length; i++) {
      // Adjacent normals should be similar (dot product close to 1)
      expect(dot(normals[i - 1]!, normals[i]!)).toBeGreaterThan(0.9);
    }
  });
});
