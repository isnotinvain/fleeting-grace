import { describe, it, expect } from "vitest";
import {
  add,
  sub,
  scale,
  dot,
  cross,
  lengthSq,
  length,
  normalize,
  distance,
  distanceSq,
  addScaled,
} from "../../src/utils/vec3";
import type { Vec3 } from "../../src/simulation/types";

describe("vec3", () => {
  it("add", () => {
    expect(add([1, 2, 3], [4, 5, 6])).toEqual([5, 7, 9]);
  });

  it("sub", () => {
    expect(sub([4, 5, 6], [1, 2, 3])).toEqual([3, 3, 3]);
  });

  it("scale", () => {
    expect(scale([1, 2, 3], 2)).toEqual([2, 4, 6]);
  });

  it("dot", () => {
    expect(dot([1, 0, 0], [0, 1, 0])).toBe(0);
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32);
  });

  it("cross produces orthogonal vector", () => {
    const a: Vec3 = [1, 0, 0];
    const b: Vec3 = [0, 1, 0];
    expect(cross(a, b)).toEqual([0, 0, 1]);
    expect(cross(b, a)).toEqual([0, 0, -1]);
  });

  it("cross of parallel vectors is zero", () => {
    expect(cross([2, 0, 0], [5, 0, 0])).toEqual([0, 0, 0]);
  });

  it("lengthSq", () => {
    expect(lengthSq([3, 4, 0])).toBe(25);
  });

  it("length", () => {
    expect(length([3, 4, 0])).toBe(5);
  });

  it("normalize", () => {
    const n = normalize([3, 0, 0]);
    expect(n).toEqual([1, 0, 0]);
  });

  it("normalize zero vector returns zero", () => {
    expect(normalize([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it("normalize produces unit length", () => {
    const n = normalize([1, 2, 3]);
    expect(length(n)).toBeCloseTo(1, 10);
  });

  it("distance", () => {
    expect(distance([0, 0, 0], [3, 4, 0])).toBe(5);
  });

  it("distanceSq", () => {
    expect(distanceSq([0, 0, 0], [3, 4, 0])).toBe(25);
  });

  it("addScaled", () => {
    expect(addScaled([1, 2, 3], [10, 20, 30], 0.5)).toEqual([6, 12, 18]);
  });
});
