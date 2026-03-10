import { useNavigate, useParams } from "react-router-dom";

export function ExportPage() {
  const navigate = useNavigate();
  const { simIndex } = useParams<{ simIndex: string }>();

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Export</h1>
          <p className="text-gray-400 mt-1">Simulation #{simIndex}</p>
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
          {/* General */}
          <SettingsSection title="General">
            <SettingRow label="Tube segments" value="64" />
            <SettingRow label="Output size (inches)" value="9" />
          </SettingsSection>

          {/* Body Start Position */}
          <SettingsSection title="Body Start Position">
            <div className="bg-gray-800 rounded p-2 mb-2">
              <span className="text-sm text-gray-300">Style: </span>
              <span className="text-sm text-cyan-400">Armillary Sphere</span>
            </div>
            <SettingRow label="Scale factor" value="6.0" />
            <SettingRow label="Ring thickness" value="auto" />
            <SettingRow label="Ring segments" value="64" />
            <SettingRow label="Velocity stretch" value="auto" />
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-gray-400">Show velocity arrow</span>
              <div className="w-8 h-4 bg-cyan-600 rounded-full" />
            </div>
          </SettingsSection>

          {/* Body End Position */}
          <SettingsSection title="Body End Position">
            <div className="bg-gray-800 rounded p-2 mb-2">
              <span className="text-sm text-gray-300">Style: </span>
              <span className="text-sm text-cyan-400">Exploding Sphere</span>
            </div>
            <SettingRow label="Scale factor" value="6.0" />
            <SettingRow label="Sphere segments" value="64" />
            <SettingRow label="Fragment count" value="10" />
            <SettingRow label="Physics steps" value="60" />
          </SettingsSection>

          {/* Actions */}
          <div className="space-y-3">
            <button className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold px-4 py-3 rounded-lg transition-colors">
              Download OBJ
            </button>
          </div>
        </div>

        {/* 3D scene placeholder */}
        <div className="flex-1 bg-gray-900 rounded-lg border border-gray-800 flex items-center justify-center min-h-[600px]">
          <span className="text-gray-700 text-lg">3D Mesh Scene</span>
        </div>
      </div>
    </div>
  );
}

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">
        {title}
      </h3>
      <div className="space-y-2 bg-gray-900 rounded-lg border border-gray-800 p-4">
        {children}
      </div>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-gray-400">{label}</span>
      <span className="text-sm text-gray-500 font-mono">{value}</span>
    </div>
  );
}
