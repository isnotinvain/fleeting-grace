import type { ScoreFunction } from "./types";
import type { SimulationResult, Vec3 } from "../simulation/types";
import { distance } from "../utils/vec3";

const SCALE = 1e14;

function pathLength(trajectory: Vec3[]): number {
  let total = 0;
  for (let i = 1; i < trajectory.length; i++) {
    total += distance(trajectory[i - 1], trajectory[i]);
  }
  return total;
}

export const totalDistance: ScoreFunction = {
  name: "TotalDistance",
  score(result: SimulationResult): number {
    let total = 0;
    for (const traj of result.trajectories) {
      if (traj.length >= 2) total += pathLength(traj);
    }
    return 1 - Math.exp(-total / SCALE);
  },
};
