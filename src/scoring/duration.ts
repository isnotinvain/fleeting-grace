import type { ScoreFunction } from "./types";
import type { SimulationResult } from "../simulation/types";
import { YEAR_SECONDS } from "../simulation/config";

/**
 * Rewards longer simulations. Unlike the Python version which was unbounded,
 * we normalize to [0, 1] using exponential saturation.
 *
 * A 15-year simulation maps to ~0.63, matching the old min_steps_target.
 */
const SCALE_STEPS = 15 * YEAR_SECONDS / (5 * 3600); // ~26,298 steps (15 years at 5h step)

export const duration: ScoreFunction = {
  name: "Duration",
  score(result: SimulationResult): number {
    return 1 - Math.exp(-result.steps / SCALE_STEPS);
  },
};
