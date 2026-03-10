import { useNavigate } from "react-router-dom";
import { useStore } from "../store";

export function SetupPage() {
  const navigate = useNavigate();
  const settings = useStore((s) => s.simulationSettings);
  const setSettings = useStore((s) => s.setSimulationSettings);
  const runSimulations = useStore((s) => s.runSimulations);
  const isRunning = useStore((s) => s.isRunning);
  const progress = useStore((s) => s.progress);

  const handleRun = async () => {
    await runSimulations();
    navigate("/results");
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <h1 className="text-3xl font-bold mb-4">Fleeting Grace</h1>
      <p className="text-gray-400 mb-8">
        Generate 3-body gravitational simulations and turn them into 3D models.
      </p>

      <div className="max-w-xl space-y-6 mb-8">
        <h2 className="text-xl font-semibold">Simulation Settings</h2>

        <div className="space-y-4">
          <NumberField
            label="Number of simulations"
            value={settings.numSimulations}
            onChange={(v) => setSettings({ numSimulations: v })}
            min={1}
            max={500}
            step={1}
          />
          <RangeField
            label="Mass range (solar masses)"
            min={settings.massMin}
            max={settings.massMax}
            onMinChange={(v) => setSettings({ massMin: v })}
            onMaxChange={(v) => setSettings({ massMax: v })}
            step={0.1}
          />
          <NumberField
            label="Bounding sphere radius (AU)"
            value={settings.boundingSphereRadius}
            onChange={(v) => setSettings({ boundingSphereRadius: v })}
            min={1}
            max={500}
            step={1}
          />
          <NumberField
            label="Max speed (km/s)"
            value={settings.maxSpeed}
            onChange={(v) => setSettings({ maxSpeed: v })}
            min={1}
            max={1000}
            step={1}
          />
          <NumberField
            label="Max simulation time (years)"
            value={settings.maxTimeYears}
            onChange={(v) => setSettings({ maxTimeYears: v })}
            min={1}
            max={200}
            step={1}
          />
          <NumberField
            label="Time step (hours)"
            value={settings.timeStepHours}
            onChange={(v) => setSettings({ timeStepHours: v })}
            min={0.1}
            max={24}
            step={0.1}
          />
          <NumberField
            label="Escape radius (AU)"
            value={settings.escapeRadius}
            onChange={(v) => setSettings({ escapeRadius: v })}
            min={10}
            max={1000}
            step={10}
          />
        </div>
      </div>

      <button
        onClick={handleRun}
        disabled={isRunning}
        className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-lg transition-colors"
      >
        {isRunning ? "Running..." : "Run Simulations"}
      </button>

      {progress && (
        <div className="mt-4 max-w-xl">
          <div className="flex justify-between text-sm text-gray-400 mb-1">
            <span>Running simulation {progress.done} / {progress.total}</span>
            <span>{Math.round((progress.done / progress.total) * 100)}%</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div
              className="bg-cyan-500 h-2 rounded-full transition-all duration-150"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <div className="flex items-center justify-between bg-gray-900 rounded-lg p-4 border border-gray-800">
      <label className="text-gray-300">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="bg-gray-800 text-white text-right font-mono px-3 py-1 rounded border border-gray-700 w-24 focus:border-cyan-500 focus:outline-none"
      />
    </div>
  );
}

function RangeField({
  label,
  min,
  max,
  onMinChange,
  onMaxChange,
  step,
}: {
  label: string;
  min: number;
  max: number;
  onMinChange: (v: number) => void;
  onMaxChange: (v: number) => void;
  step: number;
}) {
  return (
    <div className="flex items-center justify-between bg-gray-900 rounded-lg p-4 border border-gray-800">
      <label className="text-gray-300">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={min}
          onChange={(e) => onMinChange(Number(e.target.value))}
          step={step}
          className="bg-gray-800 text-white text-right font-mono px-3 py-1 rounded border border-gray-700 w-20 focus:border-cyan-500 focus:outline-none"
        />
        <span className="text-gray-500">–</span>
        <input
          type="number"
          value={max}
          onChange={(e) => onMaxChange(Number(e.target.value))}
          step={step}
          className="bg-gray-800 text-white text-right font-mono px-3 py-1 rounded border border-gray-700 w-20 focus:border-cyan-500 focus:outline-none"
        />
      </div>
    </div>
  );
}
