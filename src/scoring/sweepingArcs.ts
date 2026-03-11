import type { ScoreFunction } from "./types";
import type { SimulationResult } from "../simulation/types";
import { sub, cross, length, distance } from "../utils/vec3";

const SCALE = 1e15;
const MAX_RADIUS = 1e15;

/**
 * SweepingArcs: rewards long path segments at large radii of curvature.
 * Tight loops → 0, large graceful arcs → 1.
 */
export const sweepingArcs: ScoreFunction = {
  name: "SweepingArcs",
  score(result: SimulationResult): number {
    let total = 0;

    for (const traj of result.trajectories) {
      if (traj.length < 3) continue;

      for (let i = 1; i < traj.length - 1; i++) {
        const v1 = sub(traj[i]!, traj[i - 1]!);
        const v2 = sub(traj[i + 1]!, traj[i]!);
        const v1Len = length(v1);
        const v2Len = length(v2);
        const avgSpeed = (v1Len + v2Len) / 2;
        if (avgSpeed < 1e-10) continue;

        const kappa = Math.max(1e-30, length(cross(v1, v2)) / (avgSpeed * avgSpeed));
        const radius = Math.min(1 / kappa, MAX_RADIUS);

        const segLen = (distance(traj[i - 1]!, traj[i]!) + distance(traj[i]!, traj[i + 1]!)) / 2;
        total += segLen * radius;
      }
    }

    return 1 - Math.exp(-total / SCALE);
  },
};
