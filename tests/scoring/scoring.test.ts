import { describe, it, expect } from "vitest";
import { spaceFilling } from "../../src/scoring/spaceFilling";
import { tortuosity } from "../../src/scoring/tortuosity";
import { curvatureVariance } from "../../src/scoring/curvatureVariance";
import { directionEntropy } from "../../src/scoring/directionEntropy";
import { interweaving } from "../../src/scoring/interweaving";
import { complexity } from "../../src/scoring/complexity";
import { sweepingArcs } from "../../src/scoring/sweepingArcs";
import { totalDistance } from "../../src/scoring/totalDistance";
import { duration } from "../../src/scoring/duration";
import { scoreFunctions } from "../../src/scoring/registry";
import type { SimulationResult, Vec3 } from "../../src/simulation/types";
// DEFAULT_SIMULATION_SETTINGS unused but kept for potential future use

/** Helper to create a minimal SimulationResult from trajectories. */
function makeResult(
  trajectories: Vec3[][],
  steps = 1000,
  reason: "collision" | "escape" | "max_steps" = "max_steps",
): SimulationResult {
  return {
    trajectories,
    rawTrajectories: trajectories,
    reason,
    steps,
    initialConditions: {
      positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
      velocities: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
      masses: [1, 1, 1],
    },
    maxSafeScale: 1,
  };
}

/** Generate a circular trajectory in the XY plane. */
function circleTrajectory(radius: number, numPoints: number): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 0; i < numPoints; i++) {
    const t = (i / numPoints) * Math.PI * 2;
    pts.push([radius * Math.cos(t), radius * Math.sin(t), 0]);
  }
  return pts;
}

/** Generate a straight-line trajectory. */
function straightLine(start: Vec3, end: Vec3, numPoints: number): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 0; i < numPoints; i++) {
    const t = i / (numPoints - 1);
    pts.push([
      start[0] + t * (end[0] - start[0]),
      start[1] + t * (end[1] - start[1]),
      start[2] + t * (end[2] - start[2]),
    ]);
  }
  return pts;
}

describe("registry", () => {
  it("has 9 scoring functions", () => {
    expect(scoreFunctions.length).toBe(9);
  });

  it("all have unique names", () => {
    const names = scoreFunctions.map((s) => s.name);
    expect(new Set(names).size).toBe(9);
  });

  it("all return values in [0, 1] for typical input", () => {
    const traj1 = circleTrajectory(1e11, 100);
    const traj2 = circleTrajectory(2e11, 100);
    const traj3 = straightLine([0, 0, 0], [3e11, 0, 0], 50);
    const result = makeResult([traj1, traj2, traj3], 50000);

    for (const fn of scoreFunctions) {
      const score = fn.score(result);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });
});

describe("totalDistance", () => {
  it("zero for empty trajectories", () => {
    expect(totalDistance.score(makeResult([[], [], []]))).toBe(0);
  });

  it("longer paths score higher", () => {
    const short = makeResult([straightLine([0, 0, 0], [1e12, 0, 0], 10)]);
    const long = makeResult([straightLine([0, 0, 0], [1e14, 0, 0], 10)]);
    expect(totalDistance.score(long)).toBeGreaterThan(totalDistance.score(short));
  });
});

describe("duration", () => {
  it("more steps scores higher", () => {
    const short = makeResult([[]], 100);
    const long = makeResult([[]], 100000);
    expect(duration.score(long)).toBeGreaterThan(duration.score(short));
  });

  it("zero steps gives 0", () => {
    expect(duration.score(makeResult([[]], 0))).toBe(0);
  });
});

describe("tortuosity", () => {
  it("straight line scores near 0", () => {
    const line = straightLine([0, 0, 0], [1e11, 0, 0], 100);
    expect(tortuosity.score(makeResult([line]))).toBeCloseTo(0, 2);
  });

  it("circle scores high (returns near start)", () => {
    const circle = circleTrajectory(1e11, 200);
    // Close the circle
    circle.push(circle[0]!);
    expect(tortuosity.score(makeResult([circle]))).toBeGreaterThan(0.9);
  });
});

describe("complexity", () => {
  it("straight line scores near 0", () => {
    const line = straightLine([0, 0, 0], [1e11, 0, 0], 100);
    expect(complexity.score(makeResult([line]))).toBeCloseTo(0, 2);
  });

  it("zigzag scores higher than straight line", () => {
    const line = straightLine([0, 0, 0], [1e11, 0, 0], 100);
    const zigzag: Vec3[] = [];
    for (let i = 0; i < 100; i++) {
      zigzag.push([i * 1e9, (i % 2) * 1e10, 0]);
    }
    expect(complexity.score(makeResult([zigzag]))).toBeGreaterThan(
      complexity.score(makeResult([line])),
    );
  });
});

describe("curvatureVariance", () => {
  it("constant curvature (circle) scores lower than variable curvature", () => {
    const circle = circleTrajectory(1e11, 200);
    // Zigzag has wildly varying curvature
    const varied: Vec3[] = [];
    for (let i = 0; i < 200; i++) {
      const t = i / 200;
      varied.push([
        t * 1e12,
        Math.sin(t * 50) * 1e10 * (1 + t * 5),
        Math.cos(t * 30) * 1e10,
      ]);
    }
    expect(curvatureVariance.score(makeResult([circle]))).toBeLessThan(
      curvatureVariance.score(makeResult([varied])),
    );
  });
});

describe("directionEntropy", () => {
  it("single direction scores near 0", () => {
    const line = straightLine([0, 0, 0], [1e11, 0, 0], 100);
    expect(directionEntropy.score(makeResult([line]))).toBeLessThan(0.1);
  });

  it("many directions score higher", () => {
    const circle = circleTrajectory(1e11, 200);
    const line = straightLine([0, 0, 0], [1e11, 0, 0], 100);
    expect(directionEntropy.score(makeResult([circle]))).toBeGreaterThan(
      directionEntropy.score(makeResult([line])),
    );
  });
});

describe("interweaving", () => {
  it("close trajectories score high", () => {
    const t1 = circleTrajectory(1e11, 100);
    const t2 = circleTrajectory(1.01e11, 100); // very close
    expect(interweaving.score(makeResult([t1, t2]))).toBeGreaterThan(0.5);
  });

  it("far trajectories score low", () => {
    const t1 = straightLine([0, 0, 0], [1e11, 0, 0], 50);
    const t2 = straightLine([0, 0, 1e14], [1e11, 0, 1e14], 50); // very far
    expect(interweaving.score(makeResult([t1, t2]))).toBeLessThan(0.1);
  });

  it("single trajectory returns 0", () => {
    expect(interweaving.score(makeResult([circleTrajectory(1e11, 100)]))).toBe(0);
  });
});

describe("spaceFilling", () => {
  it("single point scores 0", () => {
    expect(spaceFilling.score(makeResult([[[0, 0, 0]]]))).toBe(0);
  });

  it("spread-out trajectories score higher than concentrated ones", () => {
    const spread: Vec3[] = [];
    // Random-ish points filling a volume
    for (let i = 0; i < 100; i++) {
      const t = i / 100;
      spread.push([
        Math.sin(t * 17) * 1e11,
        Math.cos(t * 23) * 1e11,
        Math.sin(t * 31) * 1e11,
      ]);
    }
    const concentrated = straightLine([0, 0, 0], [1e11, 0, 0], 100);

    expect(spaceFilling.score(makeResult([spread]))).toBeGreaterThan(
      spaceFilling.score(makeResult([concentrated])),
    );
  });
});

describe("sweepingArcs", () => {
  it("tight circle scores lower than large circle", () => {
    const small = circleTrajectory(1e9, 100);
    const large = circleTrajectory(1e12, 100);
    expect(sweepingArcs.score(makeResult([large]))).toBeGreaterThan(
      sweepingArcs.score(makeResult([small])),
    );
  });
});
