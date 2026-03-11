import type { ScoreFunction } from "./types";
import type { SimulationResult } from "../simulation/types";
import { sub, cross, length } from "../utils/vec3";

const SCALE = 2;

/**
 * CurvatureVariance: coefficient of variation of curvature values,
 * mapped to [0, 1]. Uniform curvature → 0, highly variable → 1.
 */
export const curvatureVariance: ScoreFunction = {
  name: "CurvatureVariance",
  score(result: SimulationResult): number {
    const curvatures: number[] = [];

    for (const traj of result.trajectories) {
      if (traj.length < 3) continue;

      for (let i = 1; i < traj.length - 1; i++) {
        const v1 = sub(traj[i]!, traj[i - 1]!);
        const v2 = sub(traj[i + 1]!, traj[i]!);
        const v1Len = length(v1);
        const v2Len = length(v2);
        const avgSpeed = (v1Len + v2Len) / 2;
        if (avgSpeed < 1e-10) continue;

        const crossLen = length(cross(v1, v2));
        const kappa = crossLen / (avgSpeed * avgSpeed);
        curvatures.push(kappa);
      }
    }

    if (curvatures.length < 2) return 0;

    const mean = curvatures.reduce((a, b) => a + b, 0) / curvatures.length;
    if (mean < 1e-10) return 0;

    let variance = 0;
    for (const k of curvatures) {
      const d = k - mean;
      variance += d * d;
    }
    variance /= curvatures.length;

    const cv = Math.sqrt(variance) / mean;
    return 1 - Math.exp(-cv / SCALE);
  },
};
