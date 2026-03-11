import type { InitialConditions } from "../simulation/types";

/**
 * Decode a base64-encoded initial condition string.
 * Format: 21 float64 values = positions[9] + velocities[9] + masses[3],
 * all in SI units (meters, m/s, kg). Compatible with the Python project.
 */
export function decodeInitialConditions(base64Str: string): InitialConditions {
  const binary = atob(base64Str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const data = new Float64Array(bytes.buffer);
  if (data.length !== 21) {
    throw new Error(`Expected 21 float64 values, got ${data.length}`);
  }
  return {
    positions: [
      [data[0], data[1], data[2]],
      [data[3], data[4], data[5]],
      [data[6], data[7], data[8]],
    ],
    velocities: [
      [data[9], data[10], data[11]],
      [data[12], data[13], data[14]],
      [data[15], data[16], data[17]],
    ],
    masses: [data[18], data[19], data[20]],
  };
}

/**
 * Encode initial conditions to base64, matching the Python project format.
 */
export function encodeInitialConditions(ic: InitialConditions): string {
  const data = new Float64Array(21);
  for (let b = 0; b < 3; b++) {
    for (let d = 0; d < 3; d++) {
      data[b * 3 + d] = ic.positions[b][d];
      data[9 + b * 3 + d] = ic.velocities[b][d];
    }
    data[18 + b] = ic.masses[b];
  }
  const bytes = new Uint8Array(data.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Encode initial conditions to URL-safe base64 (no +, /, or = padding). */
export function encodeInitialConditionsUrlSafe(ic: InitialConditions): string {
  return encodeInitialConditions(ic)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Decode URL-safe base64 initial conditions. */
export function decodeInitialConditionsUrlSafe(urlSafe: string): InitialConditions {
  // Restore standard base64
  let b64 = urlSafe.replace(/-/g, "+").replace(/_/g, "/");
  // Re-add padding
  while (b64.length % 4 !== 0) b64 += "=";
  return decodeInitialConditions(b64);
}
