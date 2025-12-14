"""Debug visualizer for SpaceFilling metric - shows trajectory lines + voxel grid."""

import json
import webbrowser
from pathlib import Path

import numpy as np

from fleeting_grace.scoring import SpaceFilling
from fleeting_grace.simulation import SimulationResult

# Get default grid resolution from SpaceFilling
DEFAULT_GRID_RESOLUTION = SpaceFilling().grid_resolution


def visualize_space_filling(
    sim_result: SimulationResult,
    grid_resolution: int | None = None,
    output_path: str = "debug_space_filling.html",
) -> Path:
    """Generate a debug visualization of the SpaceFilling metric.

    Shows:
    - Trajectory lines
    - All cells in the bounding sphere (wireframe)
    - Occupied cells (solid)
    """
    if grid_resolution is None:
        grid_resolution = DEFAULT_GRID_RESOLUTION

    output_path = Path(output_path)

    trajectories = sim_result.trajectories
    valid_trajs = [np.asarray(traj) for traj in trajectories if len(traj) > 0]

    if not valid_trajs:
        print("No valid trajectories")
        return output_path

    all_pts = np.concatenate(valid_trajs, axis=0)

    # Compute bounding sphere (same as SpaceFilling)
    center = np.mean(all_pts, axis=0)
    distances = np.linalg.norm(all_pts - center, axis=1)
    radius = np.percentile(distances, 95)

    # Normalize trajectories to [-1, 1]
    traj_data = []
    for traj in valid_trajs:
        normalized = (traj - center) / radius
        traj_data.append(normalized.tolist())

    # Compute cells fully inside sphere
    cells_in_sphere = []
    half_res = grid_resolution / 2
    cell_size = 2.0 / grid_resolution
    cell_half_diag = (1.0 / grid_resolution) * (3 ** 0.5)

    for ix in range(grid_resolution):
        for iy in range(grid_resolution):
            for iz in range(grid_resolution):
                cx = (ix + 0.5 - half_res) / half_res
                cy = (iy + 0.5 - half_res) / half_res
                cz = (iz + 0.5 - half_res) / half_res
                dist_from_center = (cx * cx + cy * cy + cz * cz) ** 0.5
                if dist_from_center + cell_half_diag <= 1.0:
                    cells_in_sphere.append((ix, iy, iz))

    cells_in_sphere_set = set(cells_in_sphere)

    # Compute occupied cells (same algorithm as SpaceFilling)
    occupied_cells = set()

    for traj in valid_trajs:
        for i in range(len(traj) - 1):
            p1 = (traj[i] - center) / radius
            p2 = (traj[i + 1] - center) / radius

            segment_length = np.linalg.norm(p2 - p1)
            n_samples = max(2, int(segment_length / cell_size * 2) + 1)

            for t in np.linspace(0, 1, n_samples):
                pt = p1 + t * (p2 - p1)
                indices = ((pt + 1) * 0.5 * grid_resolution).astype(int)
                indices = np.clip(indices, 0, grid_resolution - 1)
                cell = tuple(indices)
                if cell in cells_in_sphere_set:
                    occupied_cells.add(cell)

    # Convert cells to center positions for visualization
    def cell_to_center(ix, iy, iz):
        x = (ix + 0.5) / grid_resolution * 2 - 1
        y = (iy + 0.5) / grid_resolution * 2 - 1
        z = (iz + 0.5) / grid_resolution * 2 - 1
        return [x, y, z]

    empty_cells = [cell_to_center(*c) for c in cells_in_sphere_set if c not in occupied_cells]
    filled_cells = [cell_to_center(*c) for c in occupied_cells]

    coverage = len(occupied_cells) / len(cells_in_sphere) if cells_in_sphere else 0

    html = generate_debug_html(
        traj_data,
        empty_cells,
        filled_cells,
        cell_size,
        coverage,
        len(cells_in_sphere),
    )

    output_path.write_text(html)
    webbrowser.open(f"file://{output_path.absolute()}")

    print(f"SpaceFilling debug: {len(occupied_cells)}/{len(cells_in_sphere)} cells = {coverage:.1%}")
    return output_path


def generate_debug_html(
    trajectories: list,
    empty_cells: list,
    filled_cells: list,
    cell_size: float,
    coverage: float,
    total_cells: int,
) -> str:
    """Generate the HTML visualization."""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>SpaceFilling Debug</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            background: #1a1a2e;
            color: #fff;
            overflow: hidden;
        }}
        #container {{ width: 100vw; height: 100vh; }}
        #info {{
            position: absolute;
            top: 20px;
            left: 20px;
            background: rgba(0,0,0,0.8);
            padding: 15px 20px;
            border-radius: 8px;
            font-size: 14px;
        }}
        #info h1 {{ font-size: 18px; margin-bottom: 10px; }}
        .stat {{ margin: 5px 0; }}
        .filled {{ color: #4ecdc4; }}
        .empty {{ color: #666; }}
        #controls {{
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.8);
            padding: 10px 20px;
            border-radius: 8px;
            display: flex;
            gap: 20px;
        }}
        label {{ display: flex; align-items: center; gap: 8px; cursor: pointer; }}
    </style>
</head>
<body>
    <div id="container"></div>
    <div id="info">
        <h1>SpaceFilling Debug</h1>
        <p class="stat">Coverage: <strong>{coverage:.1%}</strong></p>
        <p class="stat filled">Filled cells: {len(filled_cells)}</p>
        <p class="stat empty">Empty cells: {len(empty_cells)}</p>
        <p class="stat">Total in sphere: {total_cells}</p>
    </div>
    <div id="controls">
        <label><input type="checkbox" id="showTrajectories" checked> Trajectories</label>
        <label><input type="checkbox" id="showFilled" checked> Filled cells</label>
        <label><input type="checkbox" id="showEmpty" checked> Empty cells</label>
        <label><input type="checkbox" id="showSphere" checked> Bounding sphere</label>
    </div>

    <script type="importmap">
    {{
        "imports": {{
            "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
            "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
        }}
    }}
    </script>

    <script type="module">
        import * as THREE from 'three';
        import {{ OrbitControls }} from 'three/addons/controls/OrbitControls.js';

        const trajectories = {json.dumps(trajectories)};
        const emptyCells = {json.dumps(empty_cells)};
        const filledCells = {json.dumps(filled_cells)};
        const cellSize = {cell_size};

        // Setup
        const container = document.getElementById('container');
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a2e);

        const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 100);
        camera.position.set(2.5, 2, 2.5);

        const renderer = new THREE.WebGLRenderer({{ antialias: true }});
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        // Lights
        scene.add(new THREE.AmbientLight(0xffffff, 0.5));
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(2, 3, 2);
        scene.add(dirLight);

        // Groups for toggling
        const trajGroup = new THREE.Group();
        const filledGroup = new THREE.Group();
        const emptyGroup = new THREE.Group();
        const sphereGroup = new THREE.Group();
        scene.add(trajGroup, filledGroup, emptyGroup, sphereGroup);

        // Colors
        const colors = [0xff6b6b, 0x4ecdc4, 0xffe66d];

        // Trajectories
        trajectories.forEach((traj, i) => {{
            const points = traj.map(p => new THREE.Vector3(p[0], p[1], p[2]));
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({{ color: colors[i % colors.length], linewidth: 2 }});
            trajGroup.add(new THREE.Line(geometry, material));
        }});

        // Cell geometry (reused)
        const boxGeom = new THREE.BoxGeometry(cellSize * 0.9, cellSize * 0.9, cellSize * 0.9);
        const wireGeom = new THREE.EdgesGeometry(new THREE.BoxGeometry(cellSize, cellSize, cellSize));

        // Filled cells
        const filledMat = new THREE.MeshStandardMaterial({{
            color: 0x4ecdc4,
            transparent: true,
            opacity: 0.6
        }});
        filledCells.forEach(pos => {{
            const mesh = new THREE.Mesh(boxGeom, filledMat);
            mesh.position.set(pos[0], pos[1], pos[2]);
            filledGroup.add(mesh);
        }});

        // Empty cells (wireframe only)
        const wireMat = new THREE.LineBasicMaterial({{ color: 0x444444 }});
        emptyCells.forEach(pos => {{
            const wire = new THREE.LineSegments(wireGeom, wireMat);
            wire.position.set(pos[0], pos[1], pos[2]);
            emptyGroup.add(wire);
        }});

        // Bounding sphere
        const sphereGeom = new THREE.SphereGeometry(1, 32, 32);
        const sphereMat = new THREE.MeshBasicMaterial({{
            color: 0xffffff,
            wireframe: true,
            transparent: true,
            opacity: 0.1
        }});
        sphereGroup.add(new THREE.Mesh(sphereGeom, sphereMat));

        // Toggle controls
        document.getElementById('showTrajectories').addEventListener('change', e => {{
            trajGroup.visible = e.target.checked;
        }});
        document.getElementById('showFilled').addEventListener('change', e => {{
            filledGroup.visible = e.target.checked;
        }});
        document.getElementById('showEmpty').addEventListener('change', e => {{
            emptyGroup.visible = e.target.checked;
        }});
        document.getElementById('showSphere').addEventListener('change', e => {{
            sphereGroup.visible = e.target.checked;
        }});

        // Animation
        function animate() {{
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }}
        animate();

        // Resize
        window.addEventListener('resize', () => {{
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }});
    </script>
</body>
</html>
"""


if __name__ == "__main__":
    # Quick test - run a simulation and visualize
    from fleeting_grace.config import MAX_RADIUS
    from fleeting_grace.simulation import random_initial_conditions, run_simulation
    from fleeting_grace.termination import TrajectoryTooLarge

    print("Running simulation...")
    ic = random_initial_conditions()
    result = run_simulation(ic, TrajectoryTooLarge(MAX_RADIUS))
    print(f"Simulation done: {result.steps} steps, {result.reason}")

    visualize_space_filling(result)
