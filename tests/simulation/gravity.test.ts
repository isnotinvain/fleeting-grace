import { describe, it, expect } from "vitest";
import { computeAccelerations } from "../../src/simulation/gravity";
import { G, SOLAR_MASS, AU } from "../../src/simulation/config";
import { length } from "../../src/utils/vec3";
import type { Vec3 } from "../../src/simulation/types";

describe("computeAccelerations", () => {
  it("two bodies attract each other along the line between them", () => {
    const positions: Vec3[] = [
      [0, 0, 0],
      [AU, 0, 0],
    ];
    const masses = [SOLAR_MASS, SOLAR_MASS];
    const acc = computeAccelerations(positions, masses);

    // Body 0 should accelerate toward body 1 (+x)
    expect(acc[0][0]).toBeGreaterThan(0);
    expect(acc[0][1]).toBeCloseTo(0, 10);
    expect(acc[0][2]).toBeCloseTo(0, 10);

    // Body 1 should accelerate toward body 0 (-x)
    expect(acc[1][0]).toBeLessThan(0);

    // Equal masses → equal and opposite accelerations
    expect(acc[0][0]).toBeCloseTo(-acc[1][0], 10);
  });

  it("matches known Earth-Sun acceleration", () => {
    // Earth orbits Sun at 1 AU. Expected centripetal acceleration ≈ 0.0059 m/s²
    const positions: Vec3[] = [
      [0, 0, 0],
      [AU, 0, 0],
    ];
    const masses = [SOLAR_MASS, 5.972e24]; // Sun + Earth

    const acc = computeAccelerations(positions, masses);

    // Earth's acceleration toward Sun (body 1 toward body 0)
    const earthAcc = Math.abs(acc[1][0]);
    expect(earthAcc).toBeCloseTo(0.00593, 3);
  });

  it("Newton's third law: m1*a1 = -m2*a2", () => {
    const positions: Vec3[] = [
      [0, 0, 0],
      [AU, 0, 0],
    ];
    const m1 = SOLAR_MASS;
    const m2 = 0.5 * SOLAR_MASS;
    const masses = [m1, m2];
    const acc = computeAccelerations(positions, masses);

    // F = m*a should be equal and opposite
    expect(m1 * acc[0][0]).toBeCloseTo(-(m2 * acc[1][0]), 5);
  });

  it("three bodies: acceleration is sum of pairwise contributions", () => {
    const positions: Vec3[] = [
      [0, 0, 0],
      [AU, 0, 0],
      [0, AU, 0],
    ];
    const masses = [SOLAR_MASS, SOLAR_MASS, SOLAR_MASS];
    const acc = computeAccelerations(positions, masses);

    // Body 0 should be pulled toward both body 1 (+x) and body 2 (+y)
    expect(acc[0][0]).toBeGreaterThan(0);
    expect(acc[0][1]).toBeGreaterThan(0);

    // By symmetry, the x-pull from body 1 equals the y-pull from body 2
    expect(acc[0][0]).toBeCloseTo(acc[0][1], 10);
  });

  it("acceleration scales inversely with distance squared", () => {
    const masses = [SOLAR_MASS, SOLAR_MASS];
    const acc1 = computeAccelerations([[0, 0, 0], [AU, 0, 0]], masses);
    const acc2 = computeAccelerations([[0, 0, 0], [2 * AU, 0, 0]], masses);

    // At 2x distance, acceleration should be ~1/4
    const ratio = length(acc1[0]) / length(acc2[0]);
    expect(ratio).toBeCloseTo(4, 1);
  });
});
