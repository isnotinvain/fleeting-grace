import { useNavigate } from "react-router-dom";

export function ResultsPage() {
  const navigate = useNavigate();

  // Placeholder grid: 4 columns x 3 rows
  const columns = 4;
  const rows = 3;
  const cells = Array.from({ length: columns * rows }, (_, i) => i);

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Results</h1>
          <p className="text-gray-400 mt-1">
            50 simulations — sorted by weighted score
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
            {PLACEHOLDER_METRICS.map((name) => (
              <div key={name} className="bg-gray-900 rounded-lg p-3 border border-gray-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-300">{name}</span>
                  <span className="text-xs text-gray-500 font-mono">1</span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full">
                  <div className="h-full w-[55%] bg-cyan-600 rounded-full" />
                </div>
              </div>
            ))}
          </div>
          <button className="mt-4 text-sm text-gray-500 hover:text-gray-300 transition-colors">
            Reset all weights
          </button>
        </div>

        {/* Grid */}
        <div className="flex-1">
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
          >
            {cells.map((i) => (
              <div
                key={i}
                className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden"
              >
                {/* 3D scene placeholder */}
                <div className="aspect-square bg-gray-900 flex items-center justify-center border-b border-gray-800">
                  <span className="text-gray-700 text-sm">3D Scene</span>
                </div>

                {/* Score bars placeholder */}
                <div className="p-3 space-y-1.5">
                  <div className="flex gap-1">
                    {PLACEHOLDER_METRICS.slice(0, 5).map((_, j) => (
                      <div key={j} className="h-1 flex-1 bg-gray-800 rounded-full">
                        <div
                          className="h-full bg-cyan-600 rounded-full"
                          style={{ width: `${30 + Math.random() * 60}%` }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">collision</span>
                    <div className="flex gap-2">
                      <button className="text-xs text-gray-500 hover:text-yellow-400 transition-colors">
                        Save
                      </button>
                      <button
                        onClick={() => navigate(`/export/${i}`)}
                        className="text-xs text-cyan-500 hover:text-cyan-400 transition-colors"
                      >
                        Export
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-center gap-4 mt-6">
            <button className="text-gray-500 hover:text-white transition-colors">
              Previous
            </button>
            <span className="text-gray-400 text-sm">Page 1 / 5</span>
            <button className="text-gray-500 hover:text-white transition-colors">
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const PLACEHOLDER_METRICS = [
  "SpaceFilling",
  "Tortuosity",
  "CurvatureVariance",
  "DirectionEntropy",
  "Interweaving",
  "Complexity",
  "SweepingArcs",
  "TotalDistance",
  "Duration",
];
