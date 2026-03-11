import { describe, it, expect } from "vitest";
import { DEFAULT_SIMULATION_SETTINGS } from "../src/simulation/types";

describe("project setup", () => {
  it("has sensible default simulation settings", () => {
    expect(DEFAULT_SIMULATION_SETTINGS.numSimulations).toBe(50);
    expect(DEFAULT_SIMULATION_SETTINGS.massMin).toBeGreaterThan(0);
    expect(DEFAULT_SIMULATION_SETTINGS.massMax).toBeGreaterThan(
      DEFAULT_SIMULATION_SETTINGS.massMin,
    );
  });
});
