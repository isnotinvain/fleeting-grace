import { create } from "zustand";
import type { SimulationResult, SimulationSettings } from "./simulation/types";
import { DEFAULT_SIMULATION_SETTINGS } from "./simulation/types";
import type { ExportSettings } from "./mesh/types";
import { DEFAULT_EXPORT_SETTINGS } from "./mesh/types";
import type { WorkerResponse } from "./simulation/simulation.worker";
import { scoreFunctions } from "./scoring/registry";

interface AppState {
  // Page 1: Simulation config
  simulationSettings: SimulationSettings;
  setSimulationSettings: (settings: Partial<SimulationSettings>) => void;

  // Simulation run state
  isRunning: boolean;
  progress: { done: number; total: number } | null;
  runSimulations: () => Promise<void>;

  // Simulation results
  simulations: SimulationResult[];
  /** Per-metric scores: perMetricScores[simIndex][metricIndex] */
  perMetricScores: number[][];

  // Page 2: Scoring & grid
  /** One weight per scoring function, range -10 to 10. */
  scoringWeights: number[];
  setScoringWeight: (metricIndex: number, weight: number) => void;
  resetScoringWeights: () => void;
  gridColumns: number;
  gridRows: number;
  setGridLayout: (columns: number, rows: number) => void;

  // Page 3: Per-sim export settings
  exportSettings: Record<number, ExportSettings>;
  getExportSettings: (simIndex: number) => ExportSettings;
  setExportSettings: (simIndex: number, settings: ExportSettings) => void;

  // Workspace persistence
  saveWorkspace: () => void;
  loadWorkspace: () => boolean;
}

/** Number of scoring functions (updated when scoring is implemented). */
const NUM_METRICS = 9;

export const useStore = create<AppState>((set, get) => ({
  // Page 1
  simulationSettings: { ...DEFAULT_SIMULATION_SETTINGS },
  setSimulationSettings: (partial) =>
    set((s) => ({
      simulationSettings: { ...s.simulationSettings, ...partial },
    })),

  // Simulation run state
  isRunning: false,
  progress: null,
  runSimulations: () => {
    return new Promise<void>((resolve) => {
      const settings = get().simulationSettings;
      set({ isRunning: true, progress: { done: 0, total: settings.numSimulations } });

      const worker = new Worker(
        new URL("./simulation/simulation.worker.ts", import.meta.url),
        { type: "module" },
      );

      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const msg = e.data;
        if (msg.type === "progress") {
          set({ progress: { done: msg.done, total: msg.total } });
        } else if (msg.type === "result") {
          // Compute per-metric scores for all simulations
          const perMetricScores = msg.simulations.map((sim) =>
            scoreFunctions.map((fn) => fn.score(sim)),
          );
          set({
            simulations: msg.simulations,
            perMetricScores,
            isRunning: false,
            progress: null,
          });
          worker.terminate();
          resolve();
        }
      };

      worker.postMessage({ type: "run", settings });
    });
  },

  // Results
  simulations: [],
  perMetricScores: [],

  // Page 2
  scoringWeights: Array<number>(NUM_METRICS).fill(1),
  setScoringWeight: (metricIndex, weight) =>
    set((s) => {
      const weights = [...s.scoringWeights];
      weights[metricIndex] = Math.max(-10, Math.min(10, weight));
      return { scoringWeights: weights };
    }),
  resetScoringWeights: () =>
    set({ scoringWeights: Array<number>(NUM_METRICS).fill(1) }),
  gridColumns: 4,
  gridRows: 3,
  setGridLayout: (columns, rows) => set({ gridColumns: columns, gridRows: rows }),

  // Page 3
  exportSettings: {},
  getExportSettings: (simIndex) => {
    const existing = get().exportSettings[simIndex];
    if (existing) return existing;
    return { ...DEFAULT_EXPORT_SETTINGS };
  },
  setExportSettings: (simIndex, settings) =>
    set((s) => ({
      exportSettings: { ...s.exportSettings, [simIndex]: settings },
    })),

  // Workspace
  saveWorkspace: () => {
    const s = get();
    const workspace = {
      simulationSettings: s.simulationSettings,
      initialConditions: s.simulations.map((sim) => sim.initialConditions),
      scoringWeights: s.scoringWeights,
      exportSettings: s.exportSettings,
      gridColumns: s.gridColumns,
      gridRows: s.gridRows,
    };
    localStorage.setItem("fleeting-grace-workspace", JSON.stringify(workspace));
  },
  loadWorkspace: () => {
    const raw = localStorage.getItem("fleeting-grace-workspace");
    if (!raw) return false;
    try {
      const workspace = JSON.parse(raw);
      set({
        simulationSettings: workspace.simulationSettings,
        scoringWeights: workspace.scoringWeights,
        exportSettings: workspace.exportSettings ?? {},
        gridColumns: workspace.gridColumns ?? 4,
        gridRows: workspace.gridRows ?? 3,
      });
      // TODO: Re-run simulations from workspace.initialConditions
      return true;
    } catch {
      return false;
    }
  },
}));
