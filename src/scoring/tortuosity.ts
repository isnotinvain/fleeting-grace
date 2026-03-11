import type { ScoreFunction } from "./types";
import type { SimulationResult } from "../simulation/types";
import { distance } from "../utils/vec3";

/**
 * Tortuosity: ratio of path length to displacement, mapped to [0, 1].
 * Straight line → 0, highly curved/returning path → 1.
 */
export const tortuosity: ScoreFunction = {
  name: "Tortuosity",
  score(result: SimulationResult): number {
    let sum = 0;
    let count = 0;

    for (const traj of result.trajectories) {
      if (traj.length < 2) continue;

      let pathLen = 0;
      for (let i = 1; i < traj.length; i++) {
        pathLen += distance(traj[i - 1]!, traj[i]!);
      }

      const displacement = distance(traj[0]!, traj[traj.length - 1]!);

      if (displacement < 1e-10) {
        sum += 1;
      } else {
        const ratio = pathLen / displacement;
        sum += 1 - 1 / ratio;
      }
      count++;
    }

    return count > 0 ? sum / count : 0;
  },
};
