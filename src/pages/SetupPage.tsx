import { useNavigate } from "react-router-dom";

export function SetupPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <h1 className="text-3xl font-bold mb-8">Fleeting Grace</h1>
      <p className="text-gray-400 mb-8">
        Generate 3-body gravitational simulations and turn them into 3D models.
      </p>

      {/* Simulation settings */}
      <div className="max-w-xl space-y-6 mb-8">
        <h2 className="text-xl font-semibold">Simulation Settings</h2>

        <div className="space-y-4">
          <SettingPlaceholder label="Number of simulations" value="50" />
          <SettingPlaceholder label="Mass range (solar masses)" value="0.1 – 150" />
          <SettingPlaceholder label="Bounding sphere radius (AU)" value="35" />
          <SettingPlaceholder label="Max speed (km/s)" value="20" />
          <SettingPlaceholder label="Max simulation time (years)" value="60" />
          <SettingPlaceholder label="Time step (hours)" value="5" />
          <SettingPlaceholder label="Escape radius (AU)" value="150" />
        </div>
      </div>

      <button
        onClick={() => navigate("/results")}
        className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
      >
        Run Simulations
      </button>
    </div>
  );
}

function SettingPlaceholder({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between bg-gray-900 rounded-lg p-4 border border-gray-800">
      <span className="text-gray-300">{label}</span>
      <span className="text-gray-500 font-mono">{value}</span>
    </div>
  );
}
