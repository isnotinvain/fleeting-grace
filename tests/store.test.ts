import { describe, it, expect } from "vitest";
import { decodeInitialConditions, encodeInitialConditions } from "../src/utils/base64ic";
import type { InitialConditions } from "../src/simulation/types";

describe("base64 initial conditions", () => {
  it("round-trips a known initial condition", () => {
    const ic: InitialConditions = {
      positions: [
        [1e11, 2e11, 3e11],
        [4e11, 5e11, 6e11],
        [7e11, 8e11, 9e11],
      ],
      velocities: [
        [1000, 2000, 3000],
        [4000, 5000, 6000],
        [7000, 8000, 9000],
      ],
      masses: [1.989e30, 3.978e30, 5.967e30],
    };

    const encoded = encodeInitialConditions(ic);
    const decoded = decodeInitialConditions(encoded);

    for (let b = 0; b < 3; b++) {
      for (let d = 0; d < 3; d++) {
        expect(decoded.positions[b][d]).toBe(ic.positions[b][d]);
        expect(decoded.velocities[b][d]).toBe(ic.velocities[b][d]);
      }
      expect(decoded.masses[b]).toBe(ic.masses[b]);
    }
  });

  it("rejects invalid base64 (wrong length)", () => {
    const data = new Float64Array(10);
    const bytes = new Uint8Array(data.buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const encoded = btoa(binary);
    expect(() => decodeInitialConditions(encoded)).toThrow("Expected 21");
  });

  it("produces exactly 224 base64 characters", () => {
    const ic: InitialConditions = {
      positions: [[0, 0, 0], [1, 1, 1], [2, 2, 2]],
      velocities: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
      masses: [1e30, 1e30, 1e30],
    };
    const encoded = encodeInitialConditions(ic);
    // 21 float64 = 168 bytes → ceil(168/3)*4 = 224 base64 chars
    expect(encoded.length).toBe(224);
  });
});
