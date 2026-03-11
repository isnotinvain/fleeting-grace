import type { Vec3 } from "./types";
import { G } from "./config";

/** Small softening term to avoid division by zero in force computation. */
const SOFTENING_SQ = 1e-20;

/**
 * Compute gravitational accelerations for all bodies.
 *
 * For each body i, acceleration = sum over j≠i of:
 *   G × m_j × (r_j - r_i) / |r_j - r_i|³
 */
export function computeAccelerations(
  positions: Vec3[],
  masses: number[],
): Vec3[] {
  const n = positions.length;
  const acc: Vec3[] = Array.from({ length: n }, () => [0, 0, 0]);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = positions[j]![0] - positions[i]![0];
      const dy = positions[j]![1] - positions[i]![1];
      const dz = positions[j]![2] - positions[i]![2];

      const distSq = dx * dx + dy * dy + dz * dz + SOFTENING_SQ;
      const dist = Math.sqrt(distSq);
      const invDist3 = 1 / (distSq * dist);

      // Force on i due to j (and Newton's third law for j due to i)
      const fx = dx * invDist3;
      const fy = dy * invDist3;
      const fz = dz * invDist3;

      const gMj = G * masses[j]!;
      acc[i]![0] += fx * gMj;
      acc[i]![1] += fy * gMj;
      acc[i]![2] += fz * gMj;

      const gMi = G * masses[i]!;
      acc[j]![0] -= fx * gMi;
      acc[j]![1] -= fy * gMi;
      acc[j]![2] -= fz * gMi;
    }
  }

  return acc;
}
