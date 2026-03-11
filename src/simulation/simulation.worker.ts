import type { InitialConditions, SimulationResult, SimulationSettings } from "./types";
import { runSimulation, randomInitialConditions } from "./simulation";

export type WorkerRequest =
  | { type: "run"; settings: SimulationSettings }
  | { type: "replay"; settings: SimulationSettings; initialConditions: InitialConditions[] };

export type WorkerResponse =
  | { type: "progress"; done: number; total: number }
  | { type: "result"; simulations: SimulationResult[] };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  const { settings } = msg;

  const ics: InitialConditions[] =
    msg.type === "replay"
      ? msg.initialConditions
      : Array.from({ length: settings.numSimulations }, () => randomInitialConditions(settings));

  const total = ics.length;
  const results: SimulationResult[] = [];

  for (let i = 0; i < total; i++) {
    const result = runSimulation(ics[i]!, settings);
    results.push(result);

    const response: WorkerResponse = { type: "progress", done: i + 1, total };
    self.postMessage(response);
  }

  const response: WorkerResponse = { type: "result", simulations: results };
  self.postMessage(response);
};
