import type { Vec3, TerminationReason } from "./types";
import { bodyRadius } from "./config";
import { distanceSq } from "../utils/vec3";

/**
 * Check if any pair of bodies has collided (distance < combined radii).
 * Returns the indices of the colliding pair, or null if no collision.
 */
export function checkCollision(
  positions: Vec3[],
  masses: number[],
): [number, number] | null {
  const n = positions.length;
  for (let i = 0; i < n; i++) {
    const ri = bodyRadius(masses[i]);
    for (let j = i + 1; j < n; j++) {
      const rj = bodyRadius(masses[j]);
      const combinedRadius = ri + rj;
      if (distanceSq(positions[i], positions[j]) < combinedRadius * combinedRadius) {
        return [i, j];
      }
    }
  }
  return null;
}

/**
 * Check if any body has escaped beyond the given radius from the origin.
 */
export function checkEscape(
  positions: Vec3[],
  escapeRadiusMeters: number,
): boolean {
  const escapeRadiusSq = escapeRadiusMeters * escapeRadiusMeters;
  for (const pos of positions) {
    if (pos[0] * pos[0] + pos[1] * pos[1] + pos[2] * pos[2] > escapeRadiusSq) {
      return true;
    }
  }
  return false;
}

/**
 * Determine the termination reason for the current simulation state.
 * Returns null if the simulation should continue.
 */
export function checkTermination(
  positions: Vec3[],
  masses: number[],
  step: number,
  maxSteps: number,
  escapeRadiusMeters: number,
): TerminationReason | null {
  if (checkCollision(positions, masses) !== null) return "collision";
  if (checkEscape(positions, escapeRadiusMeters)) return "escape";
  if (step >= maxSteps) return "max_steps";
  return null;
}
