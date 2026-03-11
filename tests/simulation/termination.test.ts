import { describe, it, expect } from "vitest";
import {
  checkCollision,
  checkEscape,
  checkTermination,
} from "../../src/simulation/termination";
import { SOLAR_MASS, AU, bodyRadius } from "../../src/simulation/config";
import type { Vec3 } from "../../src/simulation/types";

describe("checkCollision", () => {
  const mass = SOLAR_MASS;

  it("returns null when bodies are far apart", () => {
    const positions: Vec3[] = [
      [0, 0, 0],
      [AU, 0, 0],
      [0, AU, 0],
    ];
    expect(checkCollision(positions, [mass, mass, mass])).toBeNull();
  });

  it("detects collision when bodies overlap", () => {
    const r = bodyRadius(mass);
    // Place two bodies closer than their combined radii
    const positions: Vec3[] = [
      [0, 0, 0],
      [r, 0, 0], // distance = r, combined radii = 2r → collision
      [AU, 0, 0],
    ];
    expect(checkCollision(positions, [mass, mass, mass])).toEqual([0, 1]);
  });

  it("no collision at exactly combined radii + epsilon", () => {
    const r = bodyRadius(mass);
    const positions: Vec3[] = [
      [0, 0, 0],
      [2 * r + 1, 0, 0], // just outside combined radii
      [AU, 0, 0],
    ];
    expect(checkCollision(positions, [mass, mass, mass])).toBeNull();
  });
});

describe("checkEscape", () => {
  const escapeRadius = 150 * AU;

  it("returns false when all bodies are within radius", () => {
    const positions: Vec3[] = [
      [0, 0, 0],
      [AU, 0, 0],
      [0, AU, 0],
    ];
    expect(checkEscape(positions, escapeRadius)).toBe(false);
  });

  it("returns true when a body exceeds escape radius", () => {
    const positions: Vec3[] = [
      [0, 0, 0],
      [200 * AU, 0, 0],
      [0, AU, 0],
    ];
    expect(checkEscape(positions, escapeRadius)).toBe(true);
  });

  it("checks distance from origin in all dimensions", () => {
    // Body at (100, 100, 100) AU → distance ≈ 173 AU > 150 AU
    const positions: Vec3[] = [
      [0, 0, 0],
      [0, 0, 0],
      [100 * AU, 100 * AU, 100 * AU],
    ];
    expect(checkEscape(positions, escapeRadius)).toBe(true);
  });
});

describe("checkTermination", () => {
  const mass = SOLAR_MASS;
  const masses = [mass, mass, mass];
  const escapeRadius = 150 * AU;
  const farApart: Vec3[] = [
    [0, 0, 0],
    [AU, 0, 0],
    [0, AU, 0],
  ];

  it("returns null when simulation should continue", () => {
    expect(checkTermination(farApart, masses, 0, 100000, escapeRadius)).toBeNull();
  });

  it("returns collision when bodies overlap", () => {
    const r = bodyRadius(mass);
    const positions: Vec3[] = [[0, 0, 0], [r, 0, 0], [AU, 0, 0]];
    expect(checkTermination(positions, masses, 0, 100000, escapeRadius)).toBe("collision");
  });

  it("returns escape when body exceeds radius", () => {
    const positions: Vec3[] = [[0, 0, 0], [200 * AU, 0, 0], [0, AU, 0]];
    expect(checkTermination(positions, masses, 0, 100000, escapeRadius)).toBe("escape");
  });

  it("returns max_steps when step limit reached", () => {
    expect(checkTermination(farApart, masses, 100000, 100000, escapeRadius)).toBe("max_steps");
  });

  it("collision takes priority over escape", () => {
    const r = bodyRadius(mass);
    const positions: Vec3[] = [[0, 0, 0], [r, 0, 0], [200 * AU, 0, 0]];
    expect(checkTermination(positions, masses, 0, 100000, escapeRadius)).toBe("collision");
  });
});
