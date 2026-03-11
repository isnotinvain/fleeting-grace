import type { ScoreFunction } from "./types";
import type { SimulationResult } from "../simulation/types";
import { sub, length } from "../utils/vec3";

const N_BINS = 20;
const MAX_ENTROPY = Math.log(N_BINS * N_BINS);

/**
 * DirectionEntropy: Shannon entropy of direction vectors binned on a sphere.
 * Single direction → 0, uniformly distributed directions → 1.
 */
export const directionEntropy: ScoreFunction = {
  name: "DirectionEntropy",
  score(result: SimulationResult): number {
    if (MAX_ENTROPY <= 0) return 0;

    const bins = new Uint32Array(N_BINS * N_BINS);
    let totalSamples = 0;

    for (const traj of result.trajectories) {
      for (let i = 1; i < traj.length; i++) {
        const seg = sub(traj[i]!, traj[i - 1]!);
        const len = length(seg);
        if (len < 1e-10) continue;

        // Unit direction vector
        const dx = seg[0] / len;
        const dy = seg[1] / len;
        const dz = seg[2] / len;

        // Spherical coordinates
        const theta = Math.atan2(dy, dx); // [-π, π]
        const phi = Math.acos(Math.max(-1, Math.min(1, dz))); // [0, π]

        // Bin indices
        const thetaBin = Math.floor(((theta + Math.PI) / (2 * Math.PI)) * N_BINS) % N_BINS;
        const phiBin = Math.min(N_BINS - 1, Math.floor((phi / Math.PI) * N_BINS));
        const binIdx = thetaBin * N_BINS + phiBin;

        bins[binIdx] = (bins[binIdx] ?? 0) + 1;
        totalSamples++;
      }
    }

    if (totalSamples === 0) return 0;

    // Shannon entropy
    let entropy = 0;
    for (let i = 0; i < bins.length; i++) {
      if ((bins[i] ?? 0) === 0) continue;
      const p = bins[i]! / totalSamples;
      entropy -= p * Math.log(p);
    }

    return entropy / MAX_ENTROPY;
  },
};
