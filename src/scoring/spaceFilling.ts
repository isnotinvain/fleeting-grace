import type { ScoreFunction } from "./types";
import type { SimulationResult, Vec3 } from "../simulation/types";
import { distance } from "../utils/vec3";

const GRID_RESOLUTION = 10;

/**
 * SpaceFilling: measures what fraction of a bounding sphere's volume
 * is occupied by the trajectories.
 * Trajectories in a small region → 0, spread evenly through space → 1.
 */
export const spaceFilling: ScoreFunction = {
  name: "SpaceFilling",
  score(result: SimulationResult): number {
    // Collect all trajectory points
    const allPoints: Vec3[] = [];
    for (const traj of result.trajectories) {
      for (const p of traj) allPoints.push(p);
    }
    if (allPoints.length === 0) return 0;

    // Compute centroid
    let cx = 0, cy = 0, cz = 0;
    for (const p of allPoints) {
      cx += p[0]; cy += p[1]; cz += p[2];
    }
    const n = allPoints.length;
    const center: Vec3 = [cx / n, cy / n, cz / n];

    // Compute 95th percentile distance from centroid as bounding radius
    const distances = allPoints.map((p) => distance(p, center));
    distances.sort((a, b) => a - b);
    const idx95 = Math.floor(distances.length * 0.95);
    const radius = distances[Math.min(idx95, distances.length - 1)]!;
    if (radius < 1e-10) return 0;

    // Count cells inside the unit sphere
    const res = GRID_RESOLUTION;
    const halfDiag = (1 / res) * Math.sqrt(3);
    let cellsInSphere = 0;

    for (let ix = 0; ix < res; ix++) {
      for (let iy = 0; iy < res; iy++) {
        for (let iz = 0; iz < res; iz++) {
          const cx2 = (ix + 0.5 - res / 2) / (res / 2);
          const cy2 = (iy + 0.5 - res / 2) / (res / 2);
          const cz2 = (iz + 0.5 - res / 2) / (res / 2);
          const dist = Math.sqrt(cx2 * cx2 + cy2 * cy2 + cz2 * cz2);
          if (dist + halfDiag <= 1.0) cellsInSphere++;
        }
      }
    }

    if (cellsInSphere === 0) return 0;

    // Rasterize trajectory segments into the grid
    const occupied = new Uint8Array(res * res * res);
    const cellSize = (2 * radius) / res;

    for (const traj of result.trajectories) {
      for (let i = 0; i < traj.length; i++) {
        // For segments, sample along the segment
        const endIdx = i < traj.length - 1 ? i + 1 : i;
        const segLen = i < traj.length - 1 ? distance(traj[i]!, traj[endIdx]!) : 0;
        const nSamples = Math.max(1, Math.floor(segLen / cellSize * 2) + 1);

        for (let s = 0; s < nSamples; s++) {
          const t = nSamples === 1 ? 0 : s / (nSamples - 1);
          const pt: Vec3 = [
            traj[i]![0] + t * (traj[endIdx]![0] - traj[i]![0]),
            traj[i]![1] + t * (traj[endIdx]![1] - traj[i]![1]),
            traj[i]![2] + t * (traj[endIdx]![2] - traj[i]![2]),
          ];

          // Normalize to [-1, 1] then to grid indices
          const nx = (pt[0] - center[0]) / radius;
          const ny = (pt[1] - center[1]) / radius;
          const nz = (pt[2] - center[2]) / radius;

          const gx = Math.floor((nx + 1) * 0.5 * res);
          const gy = Math.floor((ny + 1) * 0.5 * res);
          const gz = Math.floor((nz + 1) * 0.5 * res);

          if (gx >= 0 && gx < res && gy >= 0 && gy < res && gz >= 0 && gz < res) {
            occupied[gx * res * res + gy * res + gz] = 1;
          }
        }
      }
    }

    // Count occupied cells that are inside the sphere
    let occupiedInSphere = 0;
    for (let ix = 0; ix < res; ix++) {
      for (let iy = 0; iy < res; iy++) {
        for (let iz = 0; iz < res; iz++) {
          if (!occupied[ix * res * res + iy * res + iz]) continue;
          const cx2 = (ix + 0.5 - res / 2) / (res / 2);
          const cy2 = (iy + 0.5 - res / 2) / (res / 2);
          const cz2 = (iz + 0.5 - res / 2) / (res / 2);
          const dist = Math.sqrt(cx2 * cx2 + cy2 * cy2 + cz2 * cz2);
          if (dist + halfDiag <= 1.0) occupiedInSphere++;
        }
      }
    }

    return occupiedInSphere / cellsInSphere;
  },
};
