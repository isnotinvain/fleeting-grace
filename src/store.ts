import { create } from "zustand";
import type {
  InitialConditions,
  SimulationResult,
  SimulationSettings,
} from "./simulation/types";
import { DEFAULT_SIMULATION_SETTINGS } from "./simulation/types";
import type { ExportSettings } from "./mesh/types";
import { DEFAULT_EXPORT_SETTINGS } from "./mesh/types";
import type { WorkerResponse } from "./simulation/simulation.worker";
import { scoreFunctions } from "./scoring/registry";
import { decodeInitialConditions } from "./utils/base64ic";

interface AppState {
  // Page 1: Simulation config
  simulationSettings: SimulationSettings;
  setSimulationSettings: (settings: Partial<SimulationSettings>) => void;

  // Simulation run state
  isRunning: boolean;
  progress: { done: number; total: number } | null;
  /** Run new random simulations. */
  runSimulations: () => Promise<void>;
  /** Replay simulations from saved initial conditions. */
  replaySimulations: (ics: InitialConditions[]) => Promise<void>;
  /** Decode a base64 IC string, run the sim, and append to current results. */
  addSimulationFromBase64: (base64Str: string) => Promise<void>;

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
  hasSavedWorkspace: boolean;
  saveWorkspace: () => void;
  loadWorkspace: () => Promise<boolean>;
  clearWorkspace: () => void;
}

/** Number of scoring functions. */
const NUM_METRICS = 9;

const STORAGE_KEY = "fleeting-grace-workspace";

function runWorker(
  settings: SimulationSettings,
  ics: InitialConditions[] | null,
  onProgress: (done: number, total: number) => void,
): Promise<SimulationResult[]> {
  return new Promise((resolve) => {
    const worker = new Worker(
      new URL("./simulation/simulation.worker.ts", import.meta.url),
      { type: "module" },
    );

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === "progress") {
        onProgress(msg.done, msg.total);
      } else if (msg.type === "result") {
        worker.terminate();
        resolve(msg.simulations);
      }
    };

    if (ics) {
      worker.postMessage({ type: "replay", settings, initialConditions: ics });
    } else {
      worker.postMessage({ type: "run", settings });
    }
  });
}

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

  runSimulations: async () => {
    const settings = get().simulationSettings;
    set({ isRunning: true, progress: { done: 0, total: settings.numSimulations } });

    const simulations = await runWorker(settings, null, (done, total) => {
      set({ progress: { done, total } });
    });

    const perMetricScores = simulations.map((sim) =>
      scoreFunctions.map((fn) => fn.score(sim)),
    );
    set({ simulations, perMetricScores, isRunning: false, progress: null });
  },

  replaySimulations: async (ics: InitialConditions[]) => {
    const settings = get().simulationSettings;
    set({ isRunning: true, progress: { done: 0, total: ics.length } });

    const simulations = await runWorker(settings, ics, (done, total) => {
      set({ progress: { done, total } });
    });

    const perMetricScores = simulations.map((sim) =>
      scoreFunctions.map((fn) => fn.score(sim)),
    );
    set({ simulations, perMetricScores, isRunning: false, progress: null });
  },

  addSimulationFromBase64: async (base64Str: string) => {
    const ic = decodeInitialConditions(base64Str);
    const settings = get().simulationSettings;
    set({ isRunning: true, progress: { done: 0, total: 1 } });

    const newSims = await runWorker(settings, [ic], (done, total) => {
      set({ progress: { done, total } });
    });

    const existing = get().simulations;
    const existingScores = get().perMetricScores;
    const newScores = newSims.map((sim) =>
      scoreFunctions.map((fn) => fn.score(sim)),
    );
    set({
      simulations: [...existing, ...newSims],
      perMetricScores: [...existingScores, ...newScores],
      isRunning: false,
      progress: null,
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
  hasSavedWorkspace: localStorage.getItem(STORAGE_KEY) !== null,

  saveWorkspace: () => {
    const s = get();
    if (s.simulations.length === 0) return;
    const workspace = {
      simulationSettings: s.simulationSettings,
      initialConditions: s.simulations.map((sim) => sim.initialConditions),
      scoringWeights: s.scoringWeights,
      exportSettings: s.exportSettings,
      gridColumns: s.gridColumns,
      gridRows: s.gridRows,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    set({ hasSavedWorkspace: true });
  },

  loadWorkspace: async () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    try {
      const workspace = JSON.parse(raw);
      set({
        simulationSettings: workspace.simulationSettings,
        scoringWeights: workspace.scoringWeights ?? Array<number>(NUM_METRICS).fill(1),
        exportSettings: workspace.exportSettings ?? {},
        gridColumns: workspace.gridColumns ?? 4,
        gridRows: workspace.gridRows ?? 3,
      });
      if (workspace.initialConditions?.length > 0) {
        await get().replaySimulations(workspace.initialConditions);
      }
      return true;
    } catch {
      return false;
    }
  },

  clearWorkspace: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ hasSavedWorkspace: false });
  },
}));

// Expose store for E2E tests (Playwright can't reliably set React-controlled inputs)
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__store = useStore;
}
