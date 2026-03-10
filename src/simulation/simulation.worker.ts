import type { InitialConditions, SimulationResult, SimulationSettings } from "./types";
import { runSimulation, randomInitialConditions } from "./simulation";

export type WorkerRequest = {
  type: "run";
  settings: SimulationSettings;
};

export type WorkerResponse =
  | { type: "progress"; done: number; total: number }
  | { type: "result"; simulations: SimulationResult[] };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { settings } = e.data;
  const total = settings.numSimulations;
  const results: SimulationResult[] = [];

  for (let i = 0; i < total; i++) {
    const ic = randomInitialConditions(settings);
    const result = runSimulation(ic, settings);
    results.push(result);

    const response: WorkerResponse = { type: "progress", done: i + 1, total };
    self.postMessage(response);
  }

  const response: WorkerResponse = { type: "result", simulations: results };
  self.postMessage(response);
};
