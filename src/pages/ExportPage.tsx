import { useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useStore } from "../store";
import { MeshScene } from "../components/MeshScene";
import { generateAllMeshes } from "../mesh/pipeline";
import { generateObj, generateMtl, downloadFile } from "../mesh/exportObj";
import type { ExportSettings, StartStyle, EndStyle } from "../mesh/types";

export function ExportPage() {
  const navigate = useNavigate();
  const { simIndex: simIndexStr } = useParams<{ simIndex: string }>();
  const simIndex = Number(simIndexStr);

  const simulations = useStore((s) => s.simulations);
  const getExportSettings = useStore((s) => s.getExportSettings);
  const setExportSettings = useStore((s) => s.setExportSettings);

  const sim = simulations[simIndex];
  const settings = getExportSettings(simIndex);

  const update = useCallback(
    (partial: Partial<ExportSettings>) => {
      setExportSettings(simIndex, { ...settings, ...partial });
    },
    [simIndex, settings, setExportSettings],
  );

  const meshes = useMemo(() => {
    if (!sim) return [];
    return generateAllMeshes(sim, settings);
  }, [sim, settings]);

  const handleDownload = useCallback(() => {
    const obj = generateObj(meshes, "model.mtl");
    const mtl = generateMtl();
    downloadFile(obj, "model.obj");
    setTimeout(() => downloadFile(mtl, "model.mtl"), 100);
  }, [meshes]);

  if (!sim) {
    return (
      <div className="min-h-screen bg-gray-950 text-white p-8 flex flex-col items-center justify-center">
        <p className="text-gray-400 mb-4">Simulation not found.</p>
        <button onClick={() => navigate("/results")} className="text-cyan-500">
          Back to Results
        </button>
      </div>
    );
  }

  const isCollision = sim.reason === "collision";

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Export</h1>
          <p className="text-gray-400 mt-1">
            Simulation #{simIndex} — {sim.reason} after {sim.steps} steps
          </p>
        </div>
        <button
          onClick={() => navigate("/results")}
          className="text-gray-400 hover:text-white transition-colors"
        >
          Back to Results
        </button>
      </div>

      <div className="flex gap-8">
        {/* Settings panel */}
        <div className="w-72 shrink-0 space-y-6">
          <SettingsSection title="General">
            <NumberSetting
              label="Tube segments"
              value={settings.tubeSegments}
              onChange={(v) => update({ tubeSegments: v })}
              min={4} max={128} step={4}
            />
            <NumberSetting
              label="Output size (inches)"
              value={settings.outputSize}
              onChange={(v) => update({ outputSize: v })}
              min={1} max={24} step={0.5}
            />
          </SettingsSection>

          <SettingsSection title="Body Start Position">
            <SelectSetting
              label="Style"
              value={settings.start.style}
              options={[
                { value: "none", label: "None" },
                { value: "solid_sphere", label: "Solid Sphere" },
                { value: "armillary", label: "Armillary Sphere" },
                { value: "ring", label: "Ring" },
              ]}
              onChange={(v) => update({ start: { ...settings.start, style: v as StartStyle } })}
            />
            {settings.start.style !== "none" && (
              <>
                <NumberSetting
                  label="Scale factor"
                  value={settings.start.scaleFactor}
                  onChange={(v) => update({ start: { ...settings.start, scaleFactor: v } })}
                  min={0.5} max={20} step={0.5}
                />
                <NumberSetting
                  label="Segments"
                  value={settings.start.segments}
                  onChange={(v) => update({ start: { ...settings.start, segments: v } })}
                  min={4} max={128} step={4}
                />
              </>
            )}
            <ToggleSetting
              label="Show velocity arrow"
              value={settings.start.showVelocityArrow}
              onChange={(v) => update({ start: { ...settings.start, showVelocityArrow: v } })}
            />
          </SettingsSection>

          <SettingsSection title="Body End Position">
            <SelectSetting
              label="Style"
              value={settings.end.style}
              options={[
                { value: "none", label: "None" },
                { value: "solid_sphere", label: "Solid Sphere" },
                { value: "exploding", label: "Exploding Sphere", disabled: !isCollision },
              ]}
              onChange={(v) => update({ end: { ...settings.end, style: v as EndStyle } })}
            />
            {settings.end.style !== "none" && (
              <>
                <NumberSetting
                  label="Scale factor"
                  value={settings.end.scaleFactor}
                  onChange={(v) => update({ end: { ...settings.end, scaleFactor: v } })}
                  min={0.5} max={20} step={0.5}
                />
                <NumberSetting
                  label="Segments"
                  value={settings.end.segments}
                  onChange={(v) => update({ end: { ...settings.end, segments: v } })}
                  min={4} max={128} step={4}
                />
                {settings.end.style === "exploding" && (
                  <>
                    <NumberSetting
                      label="Fragment count"
                      value={settings.end.fragmentCount}
                      onChange={(v) => update({ end: { ...settings.end, fragmentCount: v } })}
                      min={4} max={30} step={1}
                    />
                    <NumberSetting
                      label="Physics steps"
                      value={settings.end.physicsSteps}
                      onChange={(v) => update({ end: { ...settings.end, physicsSteps: v } })}
                      min={10} max={200} step={10}
                    />
                  </>
                )}
              </>
            )}
          </SettingsSection>

          <button
            onClick={handleDownload}
            className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold px-4 py-3 rounded-lg transition-colors"
          >
            Download OBJ
          </button>
        </div>

        {/* 3D mesh preview */}
        <div className="flex-1 bg-gray-900 rounded-lg border border-gray-800 min-h-[600px]">
          <MeshScene meshes={meshes} />
        </div>
      </div>
    </div>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">{title}</h3>
      <div className="space-y-2 bg-gray-900 rounded-lg border border-gray-800 p-4">{children}</div>
    </div>
  );
}

function NumberSetting({
  label, value, onChange, min, max, step,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-gray-400">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min} max={max} step={step}
        className="bg-gray-800 text-white text-right font-mono px-2 py-0.5 rounded border border-gray-700 w-20 text-sm focus:border-cyan-500 focus:outline-none"
      />
    </div>
  );
}

function SelectSetting({
  label, value, options, onChange,
}: {
  label: string; value: string;
  options: { value: string; label: string; disabled?: boolean }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-gray-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-gray-800 text-white text-sm px-2 py-0.5 rounded border border-gray-700 focus:border-cyan-500 focus:outline-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ToggleSetting({
  label, value, onChange,
}: {
  label: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-gray-400">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`w-8 h-4 rounded-full transition-colors ${value ? "bg-cyan-600" : "bg-gray-700"}`}
      >
        <div
          className={`w-3 h-3 rounded-full bg-white transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`}
        />
      </button>
    </div>
  );
}
