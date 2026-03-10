import type { ScoreFunction } from "./types";
import type { SimulationResult, Vec3 } from "../simulation/types";
import { distanceSq } from "../utils/vec3";

const SAMPLE_POINTS = 100;

/**
 * Interweaving: measures how close trajectories come to each other.
 * Close trajectories → 1, far apart → 0.
 */
export const interweaving: ScoreFunction = {
  name: "Interweaving",
  score(result: SimulationResult): number {
    const trajs = result.trajectories.filter((t) => t.length > 0);
    if (trajs.length < 2) return 0;

    // Compute bounding box diagonal for scale
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const traj of trajs) {
      for (const p of traj) {
        if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
        if (p[2] < minZ) minZ = p[2]; if (p[2] > maxZ) maxZ = p[2];
      }
    }
    const dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ;
    const scale = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (scale < 1e-10) return 0;

    // Sample points from each trajectory
    const sampled = trajs.map((t) => sampleTrajectory(t, SAMPLE_POINTS));

    // Compute average minimum distance between all pairs
    let totalMinDist = 0;
    let pairCount = 0;

    for (let i = 0; i < sampled.length; i++) {
      for (let j = i + 1; j < sampled.length; j++) {
        for (const p of sampled[i]) {
          let minDSq = Infinity;
          for (const q of sampled[j]) {
            const dsq = distanceSq(p, q);
            if (dsq < minDSq) minDSq = dsq;
          }
          totalMinDist += Math.sqrt(minDSq);
          pairCount++;
        }
        // Also check from j to i
        for (const p of sampled[j]) {
          let minDSq = Infinity;
          for (const q of sampled[i]) {
            const dsq = distanceSq(p, q);
            if (dsq < minDSq) minDSq = dsq;
          }
          totalMinDist += Math.sqrt(minDSq);
          pairCount++;
        }
      }
    }

    if (pairCount === 0) return 0;

    const avgMinDist = totalMinDist / pairCount / scale;
    return Math.exp(-avgMinDist * 5);
  },
};

function sampleTrajectory(traj: Vec3[], maxPoints: number): Vec3[] {
  if (traj.length <= maxPoints) return traj;
  const result: Vec3[] = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round((i / (maxPoints - 1)) * (traj.length - 1));
    result.push(traj[idx]);
  }
  return result;
}
