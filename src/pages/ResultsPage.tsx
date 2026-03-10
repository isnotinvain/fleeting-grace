import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { scoreFunctions } from "../scoring/registry";
import { SimulationScene } from "../components/SimulationScene";

export function ResultsPage() {
  const navigate = useNavigate();
  const simulations = useStore((s) => s.simulations);
  const perMetricScores = useStore((s) => s.perMetricScores);
  const scoringWeights = useStore((s) => s.scoringWeights);
  const setScoringWeight = useStore((s) => s.setScoringWeight);
  const resetScoringWeights = useStore((s) => s.resetScoringWeights);
  const gridColumns = useStore((s) => s.gridColumns);
  const gridRows = useStore((s) => s.gridRows);

  const [page, setPage] = useState(0);
  const perPage = gridColumns * gridRows;

  // Compute weighted scores and sort indices
  const sortedIndices = useMemo(() => {
    if (perMetricScores.length === 0) return [];
    const weighted = perMetricScores.map((scores, simIdx) => {
      let total = 0;
      for (let i = 0; i < scores.length; i++) {
        total += scores[i] * scoringWeights[i];
      }
      return { simIdx, total };
    });
    weighted.sort((a, b) => b.total - a.total);
    return weighted.map((w) => w.simIdx);
  }, [perMetricScores, scoringWeights]);

  const totalPages = Math.max(1, Math.ceil(sortedIndices.length / perPage));
  const pageIndices = sortedIndices.slice(page * perPage, (page + 1) * perPage);

  if (simulations.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 text-white p-8 flex flex-col items-center justify-center">
        <p className="text-gray-400 mb-4">No simulations yet.</p>
        <button
          onClick={() => navigate("/")}
          className="text-cyan-500 hover:text-cyan-400"
        >
          Go to Setup
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Results</h1>
          <p className="text-gray-400 mt-1">
            {simulations.length} simulations — sorted by weighted score
          </p>
        </div>
        <button
          onClick={() => navigate("/")}
          className="text-gray-400 hover:text-white transition-colors"
        >
          Back to Setup
        </button>
      </div>

      <div className="flex gap-8">
        {/* Scoring panel */}
        <div className="w-64 shrink-0">
          <h2 className="text-lg font-semibold mb-4">Scoring Weights</h2>
          <div className="space-y-3">
            {scoreFunctions.map((fn, i) => (
              <div key={fn.name} className="bg-gray-900 rounded-lg p-3 border border-gray-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-300">{fn.name}</span>
                  <span className="text-xs text-gray-500 font-mono w-6 text-right">
                    {scoringWeights[i]}
                  </span>
                </div>
                <input
                  type="range"
                  min={-10}
                  max={10}
                  step={1}
                  value={scoringWeights[i]}
                  onChange={(e) => setScoringWeight(i, Number(e.target.value))}
                  className="w-full h-1.5 appearance-none bg-gray-800 rounded-full cursor-pointer accent-cyan-500"
                />
              </div>
            ))}
          </div>
          <button
            onClick={resetScoringWeights}
            className="mt-4 text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            Reset all weights
          </button>
        </div>

        {/* Grid */}
        <div className="flex-1">
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: `repeat(${gridColumns}, 1fr)` }}
          >
            {pageIndices.map((simIdx) => {
              const sim = simulations[simIdx];
              const scores = perMetricScores[simIdx];
              return (
                <div
                  key={simIdx}
                  className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden"
                >
                  {/* 3D scene */}
                  <div className="aspect-square border-b border-gray-800">
                    <SimulationScene trajectories={sim.trajectories} />
                  </div>

                  {/* Score bars */}
                  <div className="p-3 space-y-1.5">
                    <div className="flex gap-1">
                      {scores.map((score, j) => (
                        <div
                          key={j}
                          className="h-1.5 flex-1 bg-gray-800 rounded-full"
                          title={`${scoreFunctions[j].name}: ${(score * 100).toFixed(0)}%`}
                        >
                          <div
                            className="h-full bg-cyan-500 rounded-full"
                            style={{ width: `${score * 100}%` }}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">{sim.reason}</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => navigate(`/export/${simIdx}`)}
                          className="text-xs text-cyan-500 hover:text-cyan-400 transition-colors"
                        >
                          Export
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="text-gray-500 hover:text-white disabled:text-gray-700 transition-colors"
              >
                Previous
              </button>
              <span className="text-gray-400 text-sm">
                Page {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                className="text-gray-500 hover:text-white disabled:text-gray-700 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
