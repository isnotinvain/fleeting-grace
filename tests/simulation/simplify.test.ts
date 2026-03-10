import { describe, it, expect } from "vitest";
import { simplifyTrajectory } from "../../src/simulation/simplify";
import type { Vec3 } from "../../src/simulation/types";

describe("simplifyTrajectory", () => {
  it("returns same points when 2 or fewer", () => {
    const pts: Vec3[] = [[0, 0, 0], [1, 1, 1]];
    expect(simplifyTrajectory(pts)).toEqual(pts);
  });

  it("returns same points for single point", () => {
    const pts: Vec3[] = [[5, 5, 5]];
    expect(simplifyTrajectory(pts)).toEqual(pts);
  });

  it("keeps all points of a straight line (only endpoints needed)", () => {
    // Points along a straight line should simplify to just endpoints
    const pts: Vec3[] = [];
    for (let i = 0; i <= 100; i++) {
      pts.push([i, i, i]);
    }
    const result = simplifyTrajectory(pts);
    expect(result.length).toBe(2);
    expect(result[0]).toEqual([0, 0, 0]);
    expect(result[1]).toEqual([100, 100, 100]);
  });

  it("preserves sharp corners", () => {
    // V-shape: a point far off the line between start and end
    const pts: Vec3[] = [
      [0, 0, 0],
      [50, 100, 0], // far from the start→end line
      [100, 0, 0],
    ];
    const result = simplifyTrajectory(pts, 1);
    expect(result.length).toBe(3);
  });

  it("reduces point count while preserving shape", () => {
    // Sine wave with many sample points
    const pts: Vec3[] = [];
    for (let i = 0; i <= 1000; i++) {
      const t = (i / 1000) * Math.PI * 4;
      pts.push([t, Math.sin(t), 0]);
    }
    const result = simplifyTrajectory(pts);
    // Should significantly reduce points but keep more than just endpoints
    expect(result.length).toBeGreaterThan(2);
    expect(result.length).toBeLessThan(pts.length);
  });

  it("always keeps first and last points", () => {
    const pts: Vec3[] = [
      [0, 0, 0],
      [1, 1000, 0],
      [2, 0, 0],
      [3, 1000, 0],
      [4, 0, 0],
    ];
    const result = simplifyTrajectory(pts);
    expect(result[0]).toEqual(pts[0]);
    expect(result[result.length - 1]).toEqual(pts[pts.length - 1]);
  });

  it("larger epsilon produces fewer points", () => {
    const pts: Vec3[] = [];
    for (let i = 0; i <= 100; i++) {
      const t = (i / 100) * Math.PI * 2;
      pts.push([Math.cos(t) * 100, Math.sin(t) * 100, 0]);
    }
    const small = simplifyTrajectory(pts, 0.1);
    const large = simplifyTrajectory(pts, 10);
    expect(large.length).toBeLessThanOrEqual(small.length);
  });

  it("returns new array (does not mutate input)", () => {
    const pts: Vec3[] = [[0, 0, 0], [1, 1, 1]];
    const result = simplifyTrajectory(pts);
    expect(result).not.toBe(pts);
  });
});
