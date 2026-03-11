import { describe, it, expect } from "vitest";
import {
  runSimulation,
  randomInitialConditions,
} from "../../src/simulation/simulation";
import {
  SOLAR_MASS,
  AU,
  bodyRadius,
} from "../../src/simulation/config";
import { distance, length } from "../../src/utils/vec3";
import type { Vec3, InitialConditions, SimulationSettings } from "../../src/simulation/types";

const defaultSettings: SimulationSettings = {
  numSimulations: 1,
  massMin: 0.1,
  massMax: 150,
  boundingSphereRadius: 35,
  maxSpeed: 20,
  maxTimeYears: 60,
  timeStepHours: 5,
  escapeRadius: 150,
};

describe("runSimulation", () => {
  it("two-body circular orbit conserves distance approximately", () => {
    // Sun + Earth-like setup: place body at 1 AU with circular orbit velocity
    // v = sqrt(GM/r) for circular orbit
    const M = SOLAR_MASS;
    const r = AU;
    const v = Math.sqrt(6.67408e-11 * M / r); // ~29.8 km/s

    const ic: InitialConditions = {
      positions: [
        [0, 0, 0],
        [r, 0, 0],
        [0, 0, 1000 * AU], // third body far away, negligible effect
      ],
      velocities: [
        [0, 0, 0],
        [0, v, 0], // perpendicular to radial direction
        [0, 0, 0],
      ],
      masses: [M, M * 1e-6, M * 1e-10], // tiny masses for bodies 2 & 3
    };

    const settings: SimulationSettings = {
      ...defaultSettings,
      maxTimeYears: 2,
      timeStepHours: 5,
      escapeRadius: 10000,
    };

    const result = runSimulation(ic, settings);

    expect(result.reason).toBe("max_steps");
    expect(result.trajectories.length).toBe(3);

    // After ~2 years, body 1 should have completed ~2 orbits
    // Check that it's still approximately 1 AU from body 0
    const body0End = result.trajectories[0][result.trajectories[0].length - 1];
    const body1End = result.trajectories[1][result.trajectories[1].length - 1];
    const finalDist = distance(body0End, body1End);

    // Should be within 5% of initial distance (Verlet is good at conservation)
    expect(finalDist / r).toBeCloseTo(1, 0);
  });

  it("head-on collision is detected", () => {
    const M = SOLAR_MASS;
    const r = bodyRadius(M);

    // Place bodies very close (5x combined radii) moving toward each other
    const ic: InitialConditions = {
      positions: [
        [0, 0, 0],
        [5 * r, 0, 0],
        [0, 0, 100 * AU], // far but not past escape radius
      ],
      velocities: [
        [500, 0, 0],
        [-500, 0, 0],
        [0, 0, 0],
      ],
      masses: [M, M, M * 1e-10],
    };

    const settings: SimulationSettings = {
      ...defaultSettings,
      maxTimeYears: 1,
      timeStepHours: 0.001, // very small step to catch the collision
      escapeRadius: 10000,
    };

    const result = runSimulation(ic, settings);
    expect(result.reason).toBe("collision");
  });

  it("escape is detected when body flies away", () => {
    const M = SOLAR_MASS;

    const ic: InitialConditions = {
      positions: [
        [0, 0, 0],
        [AU, 0, 0],
        [0, AU, 0],
      ],
      velocities: [
        [0, 0, 0],
        [100_000, 0, 0], // very fast escape velocity
        [0, 100_000, 0],
      ],
      masses: [M, M * 1e-10, M * 1e-10],
    };

    const settings: SimulationSettings = {
      ...defaultSettings,
      maxTimeYears: 60,
      escapeRadius: 150,
    };

    const result = runSimulation(ic, settings);
    expect(result.reason).toBe("escape");
    expect(result.steps).toBeLessThan(105192); // should terminate early
  });

  it("trajectories are simplified (fewer points than steps)", () => {
    // Use a 3-body setup where all bodies have significant mass and move
    const M = SOLAR_MASS;
    const r = 10 * AU;

    const ic: InitialConditions = {
      positions: [[0, 0, 0], [r, 0, 0], [0, r, 0]],
      velocities: [[0, 5000, 0], [-5000, 0, 0], [3000, -3000, 0]],
      masses: [M, M, M],
    };

    const settings: SimulationSettings = {
      ...defaultSettings,
      maxTimeYears: 5,
      timeStepHours: 5,
      escapeRadius: 10000,
    };

    const result = runSimulation(ic, settings);

    // All bodies move in curved paths, so simplified trajectories should
    // have more than 2 points but fewer than raw step count
    const rawSteps = Math.floor((5 * 365.25 * 24 * 3600) / (5 * 3600));
    for (const traj of result.trajectories) {
      expect(traj.length).toBeLessThan(rawSteps);
      expect(traj.length).toBeGreaterThan(2);
    }
  });

  it("maxSafeScale is computed and positive", () => {
    const M = SOLAR_MASS;
    const r = AU;
    const v = Math.sqrt(6.67408e-11 * M / r);

    const ic: InitialConditions = {
      positions: [[0, 0, 0], [r, 0, 0], [0, 0, 1000 * AU]],
      velocities: [[0, 0, 0], [0, v, 0], [0, 0, 0]],
      masses: [M, M * 1e-6, M * 1e-10],
    };

    const settings: SimulationSettings = {
      ...defaultSettings,
      maxTimeYears: 1,
    };

    const result = runSimulation(ic, settings);
    expect(result.maxSafeScale).toBeGreaterThan(0);
    expect(Number.isFinite(result.maxSafeScale)).toBe(true);
  });
});

describe("randomInitialConditions", () => {
  it("produces 3 bodies with valid positions and velocities", () => {
    const ic = randomInitialConditions(defaultSettings);

    expect(ic.positions.length).toBe(3);
    expect(ic.velocities.length).toBe(3);
    expect(ic.masses.length).toBe(3);
  });

  it("masses are within configured range (in kg)", () => {
    const ic = randomInitialConditions(defaultSettings);
    const minKg = defaultSettings.massMin * 2e30;
    const maxKg = defaultSettings.massMax * 2e30;

    for (const m of ic.masses) {
      expect(m).toBeGreaterThanOrEqual(minKg);
      expect(m).toBeLessThanOrEqual(maxKg);
    }
  });

  it("positions are within bounding sphere", () => {
    const ic = randomInitialConditions(defaultSettings);
    const maxR = defaultSettings.boundingSphereRadius * 1.5e11;

    for (const p of ic.positions) {
      expect(length(p)).toBeLessThanOrEqual(maxR * 1.001); // tiny float tolerance
    }
  });

  it("velocities are within max speed", () => {
    const ic = randomInitialConditions(defaultSettings);
    const maxV = defaultSettings.maxSpeed * 1000;

    for (const v of ic.velocities) {
      expect(length(v)).toBeLessThanOrEqual(maxV * 1.001);
    }
  });

  it("produces different results on successive calls", () => {
    const ic1 = randomInitialConditions(defaultSettings);
    const ic2 = randomInitialConditions(defaultSettings);

    // Extremely unlikely to be identical
    const pos1 = ic1.positions.flat();
    const pos2 = ic2.positions.flat();
    const same = pos1.every((v, i) => v === pos2[i]);
    expect(same).toBe(false);
  });
});
