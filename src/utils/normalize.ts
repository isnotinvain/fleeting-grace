import type { Vec3 } from "../simulation/types";

export interface BoundingBox {
  cx: number; cy: number; cz: number;
  scale: number;
}

/**
 * Compute the bounding box (center + half-extent scale) for a set of trajectories.
 */
export function computeBoundingBox(trajectories: Vec3[][]): BoundingBox {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const traj of trajectories) {
    for (const p of traj) {
      if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
      if (p[2] < minZ) minZ = p[2]; if (p[2] > maxZ) maxZ = p[2];
    }
  }

  const dx = maxX - minX;
  const dy = maxY - minY;
  const dz = maxZ - minZ;

  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    cz: (minZ + maxZ) / 2,
    scale: Math.max(dx, dy, dz) / 2,
  };
}

/**
 * Compute the normalization scale factor for a set of trajectories.
 * This is half the max bounding-box extent.
 */
export function normalizationScale(trajectories: Vec3[][]): number {
  return computeBoundingBox(trajectories).scale;
}

/**
 * Normalize trajectories to fit within a unit sphere centered at the origin.
 * Optionally accepts a precomputed bounding box so multiple trajectory sets
 * can be normalized with the same transform.
 */
export function normalizeTrajectories(trajectories: Vec3[][], bbox?: BoundingBox): Vec3[][] {
  const { cx, cy, cz, scale } = bbox ?? computeBoundingBox(trajectories);

  if (scale < 1e-10) {
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
