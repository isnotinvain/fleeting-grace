import type {
  Vec3,
  InitialConditions,
  SimulationResult,
  SimulationSettings,
  TerminationReason,
} from "./types";
import {
  auToMeters,
  bodyRadius,
  hoursToSeconds,
  kmsToMs,
  solarMassesToKg,
  yearsToSeconds,
} from "./config";
import { computeAccelerations } from "./gravity";
import { checkCollision, checkEscape } from "./termination";
import { simplifyTrajectory } from "./simplify";
import { distanceSq } from "../utils/vec3";

/**
 * Run a single 3-body simulation using Velocity-Verlet integration.
 *
 * Tracks pairwise close encounters using a sliding window to compute
 * maxSafeScale (the largest uniform body-radius scale factor that
 * wouldn't cause false collisions in the trajectory visualization).
 */
export function runSimulation(
  ic: InitialConditions,
  settings: SimulationSettings,
): SimulationResult {
  const dt = hoursToSeconds(settings.timeStepHours);
  const maxSteps = Math.floor(
    yearsToSeconds(settings.maxTimeYears) / dt,
  );
  const escapeRadius = auToMeters(settings.escapeRadius);

  const n = ic.masses.length;

  // Mutable state: positions and velocities as flat arrays for performance
  const pos: Vec3[] = ic.positions.map((p) => [...p] as Vec3);
  const vel: Vec3[] = ic.velocities.map((v) => [...v] as Vec3);
  const masses = ic.masses;

  // Record trajectories (raw, before simplification)
  const trajectories: Vec3[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    trajectories[i]!.push([...pos[i]!] as Vec3);
  }

  // Safe scale tracking: sliding window of pairwise distances
  // For 3 bodies there are 3 pairs: (0,1), (0,2), (1,2)
  const numPairs = (n * (n - 1)) / 2;
  const prevDist = new Float64Array(numPairs).fill(Infinity);
  const currDist = new Float64Array(numPairs);
  let minScaleFactor = Infinity;

  // Precompute base radii for each pair
  const pairRadii = new Float64Array(numPairs);
  let pairIdx = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      pairRadii[pairIdx] = bodyRadius(masses[i]!) + bodyRadius(masses[j]!);
      pairIdx++;
    }
  }

  let acc = computeAccelerations(pos, masses);
  let reason: TerminationReason | null = null;
  let step = 0;

  for (step = 1; step <= maxSteps; step++) {
    // Velocity-Verlet: update positions
    for (let i = 0; i < n; i++) {
      pos[i]![0] += vel[i]![0] * dt + 0.5 * acc[i]![0] * dt * dt;
      pos[i]![1] += vel[i]![1] * dt + 0.5 * acc[i]![1] * dt * dt;
      pos[i]![2] += vel[i]![2] * dt + 0.5 * acc[i]![2] * dt * dt;
    }

    // New accelerations
    const newAcc = computeAccelerations(pos, masses);

    // Update velocities
    for (let i = 0; i < n; i++) {
      vel[i]![0] += 0.5 * (acc[i]![0] + newAcc[i]![0]) * dt;
      vel[i]![1] += 0.5 * (acc[i]![1] + newAcc[i]![1]) * dt;
      vel[i]![2] += 0.5 * (acc[i]![2] + newAcc[i]![2]) * dt;
    }

    acc = newAcc;

    // Record positions
    for (let i = 0; i < n; i++) {
      trajectories[i]!.push([...pos[i]!] as Vec3);
    }

    // Compute pairwise distances and detect close-encounter minima
    pairIdx = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = Math.sqrt(distanceSq(pos[i]!, pos[j]!));
        currDist[pairIdx] = d;

        // Sliding window: if prevDist was a local minimum (less than both
        // the distance before it and the current distance), record it
        if (step >= 2 && prevDist[pairIdx]! < d) {
          const scaleFactor = prevDist[pairIdx]! / pairRadii[pairIdx]!;
          if (scaleFactor < minScaleFactor) {
            minScaleFactor = scaleFactor;
          }
        }

        prevDist[pairIdx] = d;
        pairIdx++;
      }
    }

    // Check termination
    if (checkCollision(pos, masses) !== null) {
      reason = "collision";
      break;
    }
    if (checkEscape(pos, escapeRadius)) {
      reason = "escape";
      break;
    }
  }

  if (reason === null) reason = "max_steps";

  // Simplify trajectories
  const simplified = trajectories.map((t) => simplifyTrajectory(t));

  return {
    trajectories: simplified,
    rawTrajectories: trajectories,
    reason,
    steps: step,
    initialConditions: ic,
    maxSafeScale: minScaleFactor === Infinity ? 1 : minScaleFactor,
  };
}

/**
 * Generate random initial conditions for a 3-body simulation.
 * Positions are uniformly distributed within a sphere.
 * Velocities have random direction and magnitude up to maxSpeed.
 */
export function randomInitialConditions(
  settings: SimulationSettings,
): InitialConditions {
  const masses: [number, number, number] = [
    randomInRange(settings.massMin, settings.massMax),
    randomInRange(settings.massMin, settings.massMax),
    randomInRange(settings.massMin, settings.massMax),
  ].map((m) => solarMassesToKg(m)) as [number, number, number];

  const radiusMeters = auToMeters(settings.boundingSphereRadius);
  const maxSpeedMs = kmsToMs(settings.maxSpeed);

  const positions: [Vec3, Vec3, Vec3] = [
    randomPointInSphere(radiusMeters),
    randomPointInSphere(radiusMeters),
    randomPointInSphere(radiusMeters),
  ];

  const velocities: [Vec3, Vec3, Vec3] = [
    randomVelocity(maxSpeedMs),
    randomVelocity(maxSpeedMs),
    randomVelocity(maxSpeedMs),
  ];

  return { positions, velocities, masses };
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Uniform random point inside a sphere using rejection sampling. */
function randomPointInSphere(radius: number): Vec3 {
  while (true) {
    const x = (Math.random() * 2 - 1) * radius;
    const y = (Math.random() * 2 - 1) * radius;
    const z = (Math.random() * 2 - 1) * radius;
    if (x * x + y * y + z * z <= radius * radius) {
      return [x, y, z];
    }
  }
}

/** Random velocity with uniform random direction and magnitude in [0, maxSpeed]. */
function randomVelocity(maxSpeed: number): Vec3 {
  // Random direction via Marsaglia method
  let x: number, y: number, s: number;
  do {
    x = Math.random() * 2 - 1;
    y = Math.random() * 2 - 1;
    s = x * x + y * y;
  } while (s >= 1 || s === 0);

  const z = 1 - 2 * s;
  const f = 2 * Math.sqrt(1 - s);
  const dx = x * f;
  const dy = y * f;
  const dz = z;

  const speed = Math.random() * maxSpeed;
  return [dx * speed, dy * speed, dz * speed];
}
