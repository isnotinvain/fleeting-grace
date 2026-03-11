import type { SimulationResult } from "../simulation/types";

/** A scoring function that evaluates a simulation result. */
export interface ScoreFunction {
  /** Human-readable name for this metric. */
  readonly name: string;
  /** Compute a score in [0, 1] for the given simulation result. */
  score(result: SimulationResult): number;
}
