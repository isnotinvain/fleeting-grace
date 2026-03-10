import type { Vec3 } from "../simulation/types";

/**
 * Normalize trajectories to fit within a unit sphere centered at the origin.
 * Returns new arrays — does not mutate input.
 */
export function normalizeTrajectories(trajectories: Vec3[][]): Vec3[][] {
  // Find bounding box across all trajectories
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const traj of trajectories) {
    for (const p of traj) {
      if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
      if (p[2] < minZ) minZ = p[2]; if (p[2] > maxZ) maxZ = p[2];
    }
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;

  const dx = maxX - minX;
  const dy = maxY - minY;
  const dz = maxZ - minZ;
  const scale = Math.max(dx, dy, dz) / 2;

  if (scale < 1e-10) {
    // All points at the same location
    return trajectories.map((traj) => traj.map(() => [0, 0, 0] as Vec3));
  }

  return trajectories.map((traj) =>
    traj.map((p) => [
      (p[0] - cx) / scale,
      (p[1] - cy) / scale,
      (p[2] - cz) / scale,
    ] as Vec3),
  );
}
