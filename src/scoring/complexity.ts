import type { ScoreFunction } from "./types";
import type { SimulationResult, Vec3 } from "../simulation/types";
import { sub, dot, length } from "../utils/vec3";

const SCALE = 128;

/**
 * Complexity: sum of angular changes between consecutive direction vectors.
 * Straight path → 0, chaotic → 1.
 */
export const complexity: ScoreFunction = {
  name: "Complexity",
  score(result: SimulationResult): number {
    let totalAngle = 0;

    for (const traj of result.trajectories) {
      if (traj.length < 3) continue;

      // Compute unit direction vectors, skipping zero-length segments
      const dirs: Vec3[] = [];
      for (let i = 1; i < traj.length; i++) {
        const seg = sub(traj[i], traj[i - 1]);
        const len = length(seg);
        if (len < 1e-10) continue;
        dirs.push([seg[0] / len, seg[1] / len, seg[2] / len]);
      }

      for (let i = 1; i < dirs.length; i++) {
        const cosAngle = Math.max(-1, Math.min(1, dot(dirs[i - 1], dirs[i])));
        totalAngle += Math.acos(cosAngle);
      }
    }

    return 1 - Math.exp(-totalAngle / SCALE);
  },
};
