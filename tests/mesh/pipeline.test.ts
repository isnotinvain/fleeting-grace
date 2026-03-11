import { describe, it, expect } from "vitest";
import { generateAllMeshes } from "../../src/mesh/pipeline";
import { DEFAULT_EXPORT_SETTINGS } from "../../src/mesh/types";
import type { SimulationResult, Vec3 } from "../../src/simulation/types";
import { SOLAR_MASS, AU } from "../../src/simulation/config";

function makeResult(): SimulationResult {
  // Simple 3-body result with some trajectory data
  const traj1: Vec3[] = [];
  const traj2: Vec3[] = [];
  const traj3: Vec3[] = [];
  for (let i = 0; i < 50; i++) {
    const t = (i / 49) * Math.PI * 2;
    traj1.push([Math.cos(t) * AU, Math.sin(t) * AU, 0]);
    traj2.push([Math.cos(t + 2) * AU * 0.5, Math.sin(t + 2) * AU * 0.5, AU * 0.3]);
    traj3.push([0, 0, Math.sin(t) * AU * 0.2]);
  }

  return {
    trajectories: [traj1, traj2, traj3],
    reason: "max_steps",
    steps: 10000,
    initialConditions: {
      positions: [traj1[0]!, traj2[0]!, traj3[0]!],
      velocities: [[0, 20000, 0], [-15000, 0, 0], [0, 0, 10000]],
      masses: [SOLAR_MASS, 0.5 * SOLAR_MASS, 2 * SOLAR_MASS],
    },
    maxSafeScale: 5,
  };
}

describe("generateAllMeshes", () => {
  it("produces meshes for each body", async () => {
    const meshes = await generateAllMeshes(makeResult(), DEFAULT_EXPORT_SETTINGS);
    // Should have path, start marker, arrow, and end marker for each of 3 bodies
    expect(meshes.length).toBeGreaterThanOrEqual(3);
  });

  it("all meshes have valid names and materials", async () => {
    const meshes = await generateAllMeshes(makeResult(), DEFAULT_EXPORT_SETTINGS);
    for (const m of meshes) {
      expect(m.name).toBeTruthy();
      expect(m.material).toMatch(/^(tlon|uqbar|orbis_tertius)$/);
    }
  });

  it("all face indices are valid within each mesh", async () => {
    const meshes = await generateAllMeshes(makeResult(), DEFAULT_EXPORT_SETTINGS);
    for (const { mesh } of meshes) {
      const maxIdx = mesh.vertices.length - 1;
      for (const face of mesh.faces) {
        for (const idx of face) {
          expect(idx).toBeGreaterThanOrEqual(0);
          expect(idx).toBeLessThanOrEqual(maxIdx);
        }
      }
    }
  });

  it("respects start style = none", async () => {
    const settings = {
      ...DEFAULT_EXPORT_SETTINGS,
      start: { ...DEFAULT_EXPORT_SETTINGS.start, style: "none" as const, showVelocityArrow: false },
    };
    const meshes = await generateAllMeshes(makeResult(), settings);
    const startMeshes = meshes.filter((m) => m.name.startsWith("start_"));
    expect(startMeshes).toHaveLength(0);
  });

  it("respects end style = none", async () => {
    const settings = {
      ...DEFAULT_EXPORT_SETTINGS,
      end: { ...DEFAULT_EXPORT_SETTINGS.end, style: "none" as const },
    };
    const meshes = await generateAllMeshes(makeResult(), settings);
    const endMeshes = meshes.filter((m) => m.name.startsWith("end_"));
    expect(endMeshes).toHaveLength(0);
  });

  it("includes velocity arrows when enabled", async () => {
    const meshes = await generateAllMeshes(makeResult(), DEFAULT_EXPORT_SETTINGS);
    const arrows = meshes.filter((m) => m.name.startsWith("arrow_"));
    expect(arrows.length).toBeGreaterThan(0);
  });

  it("generates exploding fragments for collision results", async () => {
    const result = makeResult();
    // Make bodies 1 and 2 end at the same spot (collision)
    const collisionResult: SimulationResult = {
      ...result,
      reason: "collision",
      trajectories: [
        result.trajectories[0]!,
        // Body 2 ends near body 1's endpoint
        [...result.trajectories[1]!.slice(0, -1), result.trajectories[0]![result.trajectories[0]!.length - 1]!],
        result.trajectories[2]!,
      ],
    };
    const settings = {
      ...DEFAULT_EXPORT_SETTINGS,
      end: { ...DEFAULT_EXPORT_SETTINGS.end, style: "exploding" as const, fragmentCount: 6, physicsSteps: 20 },
    };
    const meshes = await generateAllMeshes(collisionResult, settings);
    const endMeshes = meshes.filter((m) => m.name.startsWith("end_"));
    const strutMeshes = meshes.filter((m) => m.name.startsWith("strut_"));
    // Should have fragment meshes for both colliding bodies
    expect(endMeshes.length).toBeGreaterThan(0);
    // Should have support struts
    expect(strutMeshes.length).toBeGreaterThan(0);
    // All face indices valid
    for (const { mesh } of [...endMeshes, ...strutMeshes]) {
      const maxIdx = mesh.vertices.length - 1;
      for (const face of mesh.faces) {
        for (const idx of face) {
          expect(idx).toBeGreaterThanOrEqual(0);
          expect(idx).toBeLessThanOrEqual(maxIdx);
        }
      }
    }
  });

  it("exploding style is ignored for non-collision results", async () => {
    const settings = {
      ...DEFAULT_EXPORT_SETTINGS,
      end: { ...DEFAULT_EXPORT_SETTINGS.end, style: "exploding" as const },
    };
    const meshes = await generateAllMeshes(makeResult(), settings); // reason = "max_steps"
    const endMeshes = meshes.filter((m) => m.name.startsWith("end_"));
    expect(endMeshes).toHaveLength(0);
  });
});
