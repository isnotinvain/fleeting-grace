# Fleeting Grace — Browser App Port Plan

## Overview

Port the existing Python-based 3-body simulation tool to a standalone browser application. No backend required — everything runs client-side. The Python math/simulation code will be rewritten in TypeScript. No Pyodide dependency.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Language | TypeScript (strict mode) |
| Framework | React 18+ |
| Build | Vite |
| Routing | React Router v6 |
| State management | Zustand |
| 3D rendering | React Three Fiber + @react-three/drei |
| Physics (shatter) | Rapier.js (@dimforge/rapier3d-compat) |
| Styling | Tailwind CSS v4 |
| Testing | Vitest |
| OBJ export | Custom (port of existing Python) |
| Hosting | GitHub Pages |
| CI/CD | GitHub Actions (build + deploy on push to main) |

---

## App Structure — Three Pages

### Page 1: Simulation Setup (`/`)

**Purpose:** Configure and run a batch of random 3-body simulations.

**Settings (user-adjustable, all have defaults from current `config.py`):**

| Setting | Default | Unit | Notes |
|---|---|---|---|
| Number of simulations | 50 | count | |
| Mass range | 0.1 – 150 | solar masses | min and max |
| Bounding sphere radius | 35 | AU | Bodies placed randomly within sphere (uniform volume sampling) |
| Max speed | 20 | km/s | Random direction, random magnitude 0–N |
| Max simulation time | 60 | years | |
| Time step | 5 | hours | |
| Escape radius | 150 | AU | |

**UI Elements:**
- Form with labeled range inputs for each setting
- "Run Simulations" button
- Progress indicator (e.g., "Running simulation 23/50...")
- Brief explanation text for new users

**Behavior:**
- Clicking "Run" generates N random initial conditions and runs each simulation
- Simulations run in a Web Worker to keep the UI responsive
- Each simulation is scored against all scoring functions
- On completion, navigates to the Grid page

---

### Page 2: Results Grid (`/results`)

**Purpose:** Browse, sort, and compare simulation results. Select one to export.

**Grid Display:**
- Default 4 columns x 3 rows (configurable via UI controls)
- Each cell contains:
  - Interactive R3F scene showing the simulation as 3D lines with start/end spheres (matching current viewer style)
  - Compact score breakdown (small colored bars, one per metric)
  - Termination reason label
  - "Export" button
  - "Save to favorites" button
- Pagination controls (prev/next page, page number display)

**Scoring Controls:**
- Sidebar or top panel listing all scoring functions
- Each has a weight slider: -10 to +10, default 1
- Changing weights re-sorts the grid in real time (no re-simulation)
- Reset button to restore all weights to 1

**Scoring Functions (ported from `scoring.py`):**
1. SpaceFilling
2. Tortuosity
3. CurvatureVariance
4. DirectionEntropy
5. Interweaving
6. Complexity
7. SweepingArcs
8. TotalDistance
9. Duration

Each scoring function implements a common interface:
```ts
interface ScoreFunction {
  readonly name: string;
  score(result: SimulationResult): number; // returns 0–1
}
```

Individual per-metric scores are computed once after simulation and cached. Re-sorting only recomputes the weighted sum.

**Navigation:**
- Clicking "Export" on a grid item navigates to the Export page for that simulation
- Back button returns to grid (preserving sort state and page position) (and saves settings chosen in export page for that sim)

---

### Page 3: Export (`/export/:simIndex`)

**Purpose:** Configure mesh generation settings and download OBJ file for one simulation.

**Display:**
- Large interactive R3F scene showing the full 3D mesh (tubes, spheres, armillary, arrows, shatter fragments)
- Scene updates live as the user changes settings
- OrbitControls for camera navigation

**Mesh Settings (user-adjustable):**

*General:*

| Setting | Default | Description |
|---|---|---|
| Tube segments | 64 | Cross-section resolution |
| Output size | 9 | Size of bounding sphere around the model in inches |

*Body Start Position:*

User selects a style for what renders at each body's starting position:

| Style | Description | Settings |
|---|---|---|
| None | Nothing rendered | — |
| Solid sphere | Simple solid sphere | Scale factor (default 6.0×), segments (default 64) |
| Armillary sphere | 3 orthogonal ring tubes | Scale factor (default 6.0×), ring thickness, ring segments, velocity stretch (default auto) |
| Ring | Single ring oriented along initial velocity | Scale factor (default 6.0×), ring thickness, ring segments |

Additional start position options:
- Show velocity arrow: true/false (default true). Arrow length proportional to body speed.

*Body End Position:*

User selects a style for what renders at each body's ending position:

| Style | Description | Settings |
|---|---|---|
| None | Nothing rendered | — |
| Solid sphere | Simple solid sphere | Scale factor (default 6.0×), segments (default 64) |
| Exploding sphere | Voronoi-fractured sphere with physics sim (only available if sim ended in collision) | Scale factor (default 6.0×), segments (default 64), fragment count (default 10), physics steps (default 60) |

**Buttons:**
- "Download OBJ" — generates and downloads the .obj + .mtl files
- "Back to Grid" — returns to results page, remembering this sim's export settings

**Behavior:**
- Mesh is regenerated when settings change (debounced, ~300ms)
- Export settings per simulation are stored in Zustand and persist across page navigation
- End position "Exploding sphere" option is only selectable when the simulation ended in collision; otherwise it's grayed out with a tooltip explaining why

---

## State Management (Zustand)

```ts
interface AppState {
  // Page 1: Simulation config
  simulationSettings: SimulationSettings;

  // Simulation results (persisted after run)
  simulations: SimulationResult[];       // raw results (includes maxSafeScale per sim)
  perMetricScores: number[][];           // [simIndex][metricIndex]

  // Page 2: Scoring & grid
  scoringWeights: number[];              // one per scoring function, -10 to 10
  gridColumns: number;
  gridRows: number;

  // Page 3: Per-sim export settings
  exportSettings: Map<number, ExportSettings>;

  // Actions
  runSimulations: () => Promise<void>;
  setScoringWeight: (metricIndex: number, weight: number) => void;
  setExportSetting: (simIndex: number, settings: ExportSettings) => void;
  saveWorkspace: () => void;             // serialize to localStorage
  loadWorkspace: () => boolean;          // deserialize from localStorage
}
```

---

## Local Storage — Workspace Save/Load

**What gets saved:**
- `simulationSettings` — all Page 1 form values
- Initial conditions for every simulation (21 float64s each = positions + velocities + masses)
- `scoringWeights` — current weight for each scoring function
- `exportSettings` — per-sim mesh settings (Map<simIndex, ExportSettings>)
- `gridColumns`, `gridRows`

**What does NOT get saved (re-generated on load):**
- Trajectories (re-simulated from saved initial conditions)
- Per-metric scores (recomputed from trajectories)
- Mesh geometry (regenerated from settings)

**On load:** Re-run all simulations from saved ICs, recompute scores, restore UI state. Show a loading indicator during re-simulation.

---

## TypeScript Module Structure

The web app lives at the **repo root**, not in a subdirectory. The existing Python code in `fleeting_grace/` doesn't conflict with `src/`. When we're done, we delete the Python files (`fleeting_grace/`, `pyproject.toml`, `uv.lock`, `.python-version`) and nothing else needs to move.

```
fleeting-grace/                         # repo root
├── index.html                          # Vite entry
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── package.json
├── PLAN.md
├── .github/
│   └── workflows/
│       └── deploy.yml                  # GitHub Pages CI/CD
├── public/
│   └── CNAME                           # fleeting-grace.symphonicpositronic.com
├── src/
│   ├── main.tsx                    # React entry point
│   ├── App.tsx                     # Router setup
│   ├── store.ts                    # Zustand store
│   │
│   ├── pages/
│   │   ├── SetupPage.tsx           # Page 1: simulation config
│   │   ├── ResultsPage.tsx         # Page 2: grid + scoring
│   │   └── ExportPage.tsx          # Page 3: mesh settings + download
│   │
│   ├── components/
│   │   ├── SimulationScene.tsx     # R3F scene for line rendering (grid items)
│   │   ├── MeshScene.tsx           # R3F scene for full mesh rendering (export)
│   │   ├── ScoreBreakdown.tsx      # Compact score bars
│   │   ├── ScoringPanel.tsx        # Weight sliders for all metrics
│   │   ├── GridCell.tsx            # Single grid item (scene + scores + button)
│   │   ├── Pagination.tsx          # Page navigation
│   │   └── SettingsForm.tsx        # Reusable form controls
│   │
│   ├── simulation/
│   │   ├── types.ts                # InitialConditions, SimulationResult, etc.
│   │   ├── config.ts               # Physical constants, defaults
│   │   ├── simulation.ts           # Verlet integration, collision detection
│   │   ├── simplify.ts             # Douglas-Peucker trajectory simplification
│   │   ├── termination.ts          # Escape/collision termination conditions
│   │   └── simulation.worker.ts    # Web Worker for running sims off main thread
│   │
│   ├── scoring/
│   │   ├── types.ts                # ScoreFunction interface
│   │   ├── registry.ts             # All scoring functions, registration
│   │   ├── spaceFilling.ts
│   │   ├── tortuosity.ts
│   │   ├── curvatureVariance.ts
│   │   ├── directionEntropy.ts
│   │   ├── interweaving.ts
│   │   ├── complexity.ts
│   │   ├── sweepingArcs.ts
│   │   ├── totalDistance.ts
│   │   └── duration.ts
│   │
│   ├── mesh/
│   │   ├── types.ts                # PipeSettings, SphereSettings, etc.
│   │   ├── frenet.ts               # Frenet-Serret frame computation
│   │   ├── tube.ts                 # Tube mesh generation
│   │   ├── sphere.ts               # UV sphere generation
│   │   ├── arrow.ts                # Velocity arrow generation
│   │   ├── armillary.ts            # Armillary sphere generation
│   │   ├── shatter.ts              # Voronoi fragmentation + Rapier physics
│   │   ├── pipeline.ts             # Full mesh generation pipeline
│   │   └── exportObj.ts            # OBJ + MTL string generation + download
│   │
│   └── utils/
│       ├── normalize.ts            # Trajectory normalization
│       ├── base64.ts               # IC serialization (for workspace save)
│       └── vec3.ts                 # Lightweight 3D vector math helpers
│
└── tests/
    ├── simulation/
    │   ├── simulation.test.ts
    │   ├── simplify.test.ts
    │   └── termination.test.ts
    ├── scoring/
    │   ├── spaceFilling.test.ts
    │   ├── tortuosity.test.ts
    │   ├── complexity.test.ts
    │   └── ...                     # one per scoring function
    ├── mesh/
    │   ├── tube.test.ts
    │   ├── sphere.test.ts
    │   ├── frenet.test.ts
    │   ├── exportObj.test.ts
    │   └── ...
    └── store.test.ts
│
│   # Existing Python code (coexists during development, delete when done)
├── fleeting_grace/                     # Python package (DELETE LATER)
├── pyproject.toml                      # Python config (DELETE LATER)
├── uv.lock                             # Python lockfile (DELETE LATER)
└── .python-version                     # Python version (DELETE LATER)
```

---

## Porting Notes — Python to TypeScript

### Simulation (`simulation.py` → `simulation/`)
- Velocity-Verlet integration is straightforward — nested loops over 3 bodies
- Use `Float64Array` for trajectory storage (matches numpy float64 precision)
- `compute_accelerations`: 3-body O(N²) gravity with softening — direct port
- `check_collision`: pairwise distance vs. combined radii — direct port
- `compute_body_radius`: `R = R_sun * (M/M_sun)^0.8` — one-liner
- `random_initial_conditions`: use `Math.random()` with ranges
- Runs in a Web Worker; posts progress updates back to main thread
- **Single-pass safe scale computation** (replaces the old 2-pass approach):
  - During the simulation loop, track pairwise distances at each step using a 3-sample sliding window per pair
  - When `d[i-1] > d[i] < d[i+1]`, a close-encounter local minimum is detected
  - For each minimum, compute `scale_factor = distance / combined_base_radii`
  - The tightest encounter (smallest scale factor) becomes `maxSafeScale`
  - This value is stored directly in `SimulationResult` — no replay needed
  - Proportions between body radii are always preserved (scale factor applies uniformly)

### Simplification (`simplify.py` → `simulation/simplify.ts`)
- Douglas-Peucker is already a standalone function, no numpy needed beyond basic array ops
- Stack-based iteration (no recursion) — direct port

### Scoring (`scoring.py` → `scoring/`)
- Each function is self-contained, maps SimulationResult → number in [0, 1]
- Replace `np.linalg.norm` with manual `Math.sqrt(x*x + y*y + z*z)`
- Replace `np.cross`, `np.dot` with helper functions in `utils/vec3.ts`
- `SpaceFilling` uses a voxel grid — port the triple loop + set-based occupancy
- `DirectionEntropy` uses `arctan2`, `arccos`, binning — all available in JS Math

### Mesh (`mesh.py` → `mesh/`)
- `_compute_frenet_frame` → `frenet.ts`: propagate normal along curve, direct port
- `_generate_tube_mesh` → `tube.ts`: ring vertices + quad faces, direct port
- `_generate_sphere_mesh` → `sphere.ts`: UV sphere, direct port
- `_generate_armillary_mesh` → `armillary.ts`: 3 ring tubes with velocity stretch
- `_generate_arrow_mesh` → `arrow.ts`: shaft tube + cone tube
- `_generate_shatter_fragments` → `shatter.ts`: replace scipy ConvexHull/cKDTree with:
  - Voronoi seed placement (same logic, just Math.random)
  - Nearest-seed assignment (replace cKDTree with brute-force — only 5000 points × ~10 seeds)
  - ConvexHull: use a JS implementation (e.g., `quickhull3d` npm package, ~3KB)
- `_simulate_shatter_physics` → `shatter.ts`: replace MuJoCo with Rapier.js
  - Create rigid bodies from fragment meshes
  - Set initial velocities
  - Step N frames, read back transforms
- `_compute_max_safe_scale` → **removed**: now computed inline during the simulation loop (single-pass, stored in `SimulationResult.maxSafeScale`)
- `export_mesh_to_obj` → `exportObj.ts`: generate OBJ + MTL as strings, trigger browser download

### Viewer (`viewer.py` → replaced by React components)
- No longer generating an HTML string — this becomes React components
- `SimulationScene.tsx`: R3F component for line rendering (grid items)
- `MeshScene.tsx`: R3F component for mesh rendering (export page)
- Same colors: `#ff6b6b` (red), `#4ecdc4` (cyan), `#ffe66d` (yellow)

---

## Web Worker Strategy

Simulations are CPU-intensive (~105k steps × 3 bodies). Run them off the main thread:

```
Main Thread                          Web Worker
─────────────                        ──────────
postMessage({                  →     Receives settings + ICs
  type: 'run',                       Runs simulation loop
  settings, ics                      Posts progress: { done: 23, total: 50 }
})                             ←     Posts result: { trajectories, reason, steps }
```

- Single worker, simulations run sequentially within it
- Progress messages update the UI (Page 1 progress bar)
- Worker file: `simulation.worker.ts` imports from `simulation/` modules

---

## Testing Policy

**Tests are written alongside each implementation, not after.** Every phase that adds math, simulation, scoring, or geometry code includes unit tests for that code in the same phase. No function ships without its tests.

**Browser verification is part of the iteration loop.** In addition to running unit tests, use Chrome browser automation (via Claude in Chrome) to visually check work in the running dev server as you go. This means: run `npm run dev`, open the app in Chrome, and verify that UI changes look correct, interactions work, and there are no console errors. Don't rely solely on unit tests — visual confirmation catches layout issues, rendering bugs, and integration problems that tests miss.

What gets tested:
- All simulation functions (integration, collision detection, body radius, IC generation)
- Trajectory simplification (Douglas-Peucker)
- All 9 scoring functions (known inputs → expected outputs)
- All geometry generators (tube, sphere, armillary, arrow, ring — verify vertex counts, face winding, expected positions)
- Frenet frame computation
- Safe scale computation
- OBJ export (verify output string format)
- Voronoi fragmentation + shatter pipeline
- Vec3 math helpers
- Workspace serialization/deserialization (save → load round-trip)

What does NOT need tests:
- React components / UI rendering (no browser-based tests)
- Web Worker message passing
- Three.js / R3F rendering

---

## Build Order

### Phase 1: Skeleton (current step)
- Vite + React + TypeScript + Tailwind project scaffolding
- React Router with 3 pages (placeholder content)
- Zustand store with type definitions (no logic yet)
- Package.json with all dependencies
- Placeholder boxes where 3D scenes and complex UI elements will go
- Basic navigation between pages works
- Vitest configured and one trivial test passes

### Phase 2: Simulation Engine
- Port `config.ts`, `types.ts`, `simulation.ts`, `simplify.ts`, `termination.ts`
- Port `utils/vec3.ts` helpers
- Web Worker setup
- **Tests:** `compute_accelerations`, `check_collision`, `compute_body_radius`, `run_simulation` (known 2-body orbit sanity check), `simplify_trajectory` (point reduction + shape preservation), `vec3` helpers
- Page 1 form wired up → runs simulations → stores results

### Phase 3: Scoring
- Port all 9 scoring functions
- Registry + interface
- **Tests:** Each scoring function tested with crafted inputs (e.g., straight line → tortuosity ≈ 0, circle → high tortuosity; uniform spread → high space filling; etc.)
- Page 2 scoring panel with weight sliders, live re-sorting

### Phase 4: Grid Rendering
- `SimulationScene.tsx` — R3F line rendering with start/end spheres
- `GridCell.tsx` — scene + score bars + export button
- Pagination
- Grid layout controls (columns/rows)

### Phase 5: Mesh Generation
- Port Frenet frame, tube, sphere, arrow, armillary, ring generation
- `safeScale.ts` — physics-based radius computation
- `pipeline.ts` — full mesh generation pipeline
- **Tests:** Frenet frame orthonormality, tube vertex count = points × segments + 2 caps, sphere topology (Euler characteristic), arrow = shaft + cone, armillary = 3 rings, OBJ export string format

### Phase 6: Export Page
- `MeshScene.tsx` — full mesh rendering
- Settings panel wired to mesh regeneration (debounced)
- OBJ + MTL generation and download
- **Tests:** OBJ round-trip (generate → parse → verify vertex/face counts and group names)

### Phase 7: Shatter / Collision Physics
- Voronoi fragmentation (with quickhull3d for ConvexHull)
- Rapier.js rigid body simulation
- Integration into mesh pipeline + export page
- **Tests:** Fragment generation produces correct count, fragments cover the sphere volume, physics sim moves fragments outward from impact point

### Phase 8: Local Storage + Polish
- Workspace save/load
- Per-sim export settings persistence
- Loading states, error handling, responsive layout
- Final visual polish
- **Tests:** Save/load round-trip preserves all settings and ICs

---

## Key Decisions & Rationale

1. **TypeScript over Pyodide**: Avoids 10-20MB download, simpler debugging, better performance for numeric loops via JIT.
2. **React Three Fiber over raw Three.js**: Declarative 3D scenes that respond to React state changes — ideal for settings panels that update the 3D view.
3. **Zustand over Redux/Context**: Minimal boilerplate, works well with React and outside React (e.g., in callbacks), good TypeScript support.
4. **Rapier over Cannon/Ammo**: Best API + performance balance. WASM-based, well-maintained.
5. **Vitest over Jest**: Native ESM support, fast, works out of the box with Vite.
6. **One scoring function per file**: Easy to add/remove scoring functions without touching other code. Registry pattern for auto-discovery.
7. **Web Worker for simulation only**: Mesh generation is fast enough to run on main thread with debouncing. Only the simulation loop (potentially seconds) needs offloading.
8. **quickhull3d for ConvexHull**: Tiny dependency (~3KB), replaces scipy.spatial.ConvexHull for the shatter feature. Brute-force nearest-seed replaces cKDTree (trivial at this scale).
9. **HashRouter over BrowserRouter**: GitHub Pages doesn't support server-side routing rewrites. HashRouter (`/#/results`, `/#/export/3`) works without any server config.

---

## GitHub Pages Deployment

**Custom domain:** `fleeting-grace.symphonicpositronic.com`

**Routing:** Use `HashRouter` instead of `BrowserRouter`. GitHub Pages serves a single `index.html` and doesn't support catch-all rewrites, so paths like `/results` would 404 on refresh. Hash routing (`/#/results`) avoids this entirely.

**Vite config:**
- Set `base: '/'` (custom domain is at the root, no subpath needed)

**GitHub Actions workflow** (`.github/workflows/deploy.yml`):
- Triggers on push to `main`
- Steps: checkout → install deps → run tests → build → deploy to `gh-pages` branch
- Uses `actions/deploy-pages` or `peaceiris/actions-gh-pages`

**Custom domain setup:**
- `public/CNAME` file containing `fleeting-grace.symphonicpositronic.com`
- DNS: CNAME record for `fleeting-grace.symphonicpositronic.com` → `<username>.github.io`
- Enable "Enforce HTTPS" in repo GitHub Pages settings

**Phase 1 includes:**
- `vite.config.ts` with `base: '/'`
- `HashRouter` in `App.tsx`
- `public/CNAME` file
- `.github/workflows/deploy.yml` workflow file
- Skeleton deploys and is accessible at the custom domain from day one
