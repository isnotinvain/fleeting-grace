/** Initial conditions for a 3-body simulation, stored in SI units. */
export interface InitialConditions {
  /** Body positions in meters, shape [3][3] */
  positions: [Vec3, Vec3, Vec3];
  /** Body velocities in m/s, shape [3][3] */
  velocities: [Vec3, Vec3, Vec3];
  /** Body masses in kg, shape [3] */
  masses: [number, number, number];
}

/** A 3D vector as a tuple. */
export type Vec3 = [number, number, number];

/** Result of running a single simulation. */
export interface SimulationResult {
  /** Simplified trajectories per body, each an array of Vec3 positions in meters. */
  trajectories: Vec3[][];
  /** Why the simulation ended. */
  reason: TerminationReason;
  /** Number of integration steps performed. */
  steps: number;
  /** The initial conditions that produced this result. */
  initialConditions: InitialConditions;
  /** Largest uniform scale factor for body radii that avoids false collisions. */
  maxSafeScale: number;
}

export type TerminationReason = "collision" | "escape" | "max_steps";

/** User-facing simulation settings (friendly units). */
export interface SimulationSettings {
  /** Number of random simulations to run. */
  numSimulations: number;
  /** Min body mass in solar masses. */
  massMin: number;
  /** Max body mass in solar masses. */
  massMax: number;
  /** Bounding sphere radius for initial positions, in AU. */
  boundingSphereRadius: number;
  /** Max initial speed in km/s. */
  maxSpeed: number;
  /** Max simulation duration in years. */
  maxTimeYears: number;
  /** Integration time step in hours. */
  timeStepHours: number;
  /** Escape detection radius in AU. */
  escapeRadius: number;
}

export const DEFAULT_SIMULATION_SETTINGS: SimulationSettings = {
  numSimulations: 50,
  massMin: 0.1,
  massMax: 150,
  boundingSphereRadius: 35,
  maxSpeed: 20,
  maxTimeYears: 60,
  timeStepHours: 5,
  escapeRadius: 150,
};
