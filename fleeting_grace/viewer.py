"""Three.js-based 3D trajectory viewer."""

import base64
import json
import webbrowser
from pathlib import Path

import numpy as np

from fleeting_grace.config import AU
from fleeting_grace.simulation import SimulationResult


def _serialize_initial_conditions(sim_result: SimulationResult) -> str:
    """Serialize initial conditions to base64 for lossless reproduction."""
    if sim_result.initial_conditions is None:
        return "No initial conditions"

    ic = sim_result.initial_conditions
    data = np.concatenate([
        ic.positions.flatten(),
        ic.velocities.flatten(),
        ic.masses
    ]).astype(np.float64)
    return base64.b64encode(data.tobytes()).decode('ascii')


def export_viewer_html(
    results: list[tuple[float, SimulationResult]] | SimulationResult,
    output_path: str | Path = "trajectory_viewer.html",
    open_browser: bool = True,
) -> Path:
    """
    Generate a standalone HTML file with an interactive Three.js 3D viewer.

    Args:
        results: Single SimulationResult or list of (score, SimulationResult) tuples
        output_path: Where to save the HTML file
        open_browser: Whether to open the file in the default browser

    Returns:
        Path to the generated HTML file
    """
    output_path = Path(output_path)

    # Normalize input to list of (score, result) tuples
    if isinstance(results, SimulationResult):
        results = [(0.0, results)]

    # Build data for all simulations
    all_sims_data = []
    for score, sim_result in results:
        # Convert trajectories to JSON-serializable format (in AU)
        trajectories_data = []
        for traj in sim_result.trajectories:
            traj_au = np.asarray(traj) / AU
            trajectories_data.append(traj_au.tolist())

        # Compute bounds
        all_points = np.concatenate([np.asarray(t) / AU for t in sim_result.trajectories])
        center = np.mean(all_points, axis=0).tolist()
        max_extent = float(np.max(np.abs(all_points - np.array(center))) * 1.5)

        all_sims_data.append({
            "trajectories": trajectories_data,
            "center": center,
            "maxExtent": max_extent,
            "reason": sim_result.reason,
            "steps": sim_result.steps,
            "score": score,
            "scoreBreakdown": sim_result.score_breakdown,
            "base64": _serialize_initial_conditions(sim_result),
        })

    html_content = _generate_html(all_sims_data)
    output_path.write_text(html_content)

    if open_browser:
        webbrowser.open(f"file://{output_path.absolute()}")

    return output_path


def _generate_html(all_sims_data: list[dict]) -> str:
    """Generate the complete HTML content with embedded Three.js viewer."""

    sims_json = json.dumps(all_sims_data)

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>3-Body Trajectory Viewer</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0a0a0f;
            color: #fff;
            overflow: hidden;
        }}
        #container {{
            width: 100vw;
            height: 100vh;
        }}
        #info {{
            position: absolute;
            top: 20px;
            left: 20px;
            background: rgba(0, 0, 0, 0.8);
            padding: 15px 20px;
            border-radius: 8px;
            font-size: 14px;
            max-width: 320px;
            backdrop-filter: blur(10px);
        }}
        #info h1 {{
            font-size: 18px;
            margin-bottom: 10px;
            color: #fff;
        }}
        #info p {{
            margin: 5px 0;
            color: #aaa;
        }}
        #info .label {{
            color: #666;
        }}
        #info .value {{
            color: #fff;
        }}
        #scores {{
            margin-top: 15px;
            padding-top: 15px;
            border-top: 1px solid #333;
        }}
        .score-bar {{
            margin: 8px 0;
        }}
        .score-label {{
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            margin-bottom: 3px;
        }}
        .score-track {{
            height: 6px;
            background: #222;
            border-radius: 3px;
            overflow: hidden;
        }}
        .score-fill {{
            height: 100%;
            border-radius: 3px;
        }}
        .legend {{
            display: flex;
            gap: 15px;
            margin-top: 15px;
            padding-top: 15px;
            border-top: 1px solid #333;
        }}
        .legend-item {{
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
        }}
        .legend-color {{
            width: 10px;
            height: 10px;
            border-radius: 50%;
        }}
        #navigation {{
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: 10px;
            align-items: center;
        }}
        .nav-btn {{
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: #fff;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
        }}
        .nav-btn:hover {{
            background: rgba(255, 255, 255, 0.2);
        }}
        .nav-btn:disabled {{
            opacity: 0.3;
            cursor: not-allowed;
        }}
        #counter {{
            font-size: 14px;
            color: #888;
            min-width: 80px;
            text-align: center;
        }}
        #save-btn {{
            background: rgba(78, 205, 196, 0.2);
            border: 1px solid rgba(78, 205, 196, 0.4);
        }}
        #save-btn:hover {{
            background: rgba(78, 205, 196, 0.3);
        }}
        #controls {{
            position: absolute;
            bottom: 70px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 11px;
            color: #555;
        }}
        #toast {{
            position: fixed;
            bottom: 120px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(78, 205, 196, 0.9);
            color: #000;
            padding: 12px 24px;
            border-radius: 6px;
            font-size: 14px;
            opacity: 0;
            transition: opacity 0.3s;
            pointer-events: none;
        }}
        #toast.show {{
            opacity: 1;
        }}
    </style>
</head>
<body>
    <div id="container"></div>

    <div id="info">
        <h1>Simulation <span id="sim-num">1</span></h1>
        <p><span class="label">Score:</span> <span class="value" id="total-score">0.00</span></p>
        <p><span class="label">Termination:</span> <span class="value" id="reason">-</span></p>
        <p><span class="label">Steps:</span> <span class="value" id="steps">-</span></p>
        <div id="scores"></div>
        <div class="legend">
            <div class="legend-item">
                <div class="legend-color" style="background: #ff6b6b;"></div>
                <span>Body 1</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: #4ecdc4;"></div>
                <span>Body 2</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: #ffe66d;"></div>
                <span>Body 3</span>
            </div>
        </div>
    </div>

    <div id="controls">Drag to rotate · Scroll to zoom · Right-drag to pan</div>

    <div id="navigation">
        <button class="nav-btn" id="prev-btn">← Previous</button>
        <span id="counter">1 / 1</span>
        <button class="nav-btn" id="next-btn">Next →</button>
        <button class="nav-btn" id="save-btn">Save ICs</button>
    </div>

    <div id="toast">Copied to clipboard!</div>

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

        // Embedded data
        const allSims = {sims_json};
        let currentIndex = 0;

        // Colors for each body
        const colors = [0xff6b6b, 0x4ecdc4, 0xffe66d];
        const scoreColors = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#a29bfe', '#fd79a8', '#81ecec', '#ffeaa7'];

        // Setup
        const container = document.getElementById('container');
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0a0f);

        const camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.001,
            10000
        );

        const renderer = new THREE.WebGLRenderer({{ antialias: true }});
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(renderer.domElement);

        // Controls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;

        // Track objects we add so we can remove them
        let sceneObjects = [];

        function clearScene() {{
            sceneObjects.forEach(obj => scene.remove(obj));
            sceneObjects = [];
        }}

        function loadSimulation(index) {{
            clearScene();
            const sim = allSims[index];

            // Update camera
            const center = sim.center;
            const maxExtent = sim.maxExtent;

            camera.far = maxExtent * 100;
            camera.near = maxExtent * 0.0001;
            camera.updateProjectionMatrix();

            camera.position.set(
                center[0] + maxExtent * 1.5,
                center[1] + maxExtent * 1.2,
                center[2] + maxExtent * 1.5
            );
            controls.target.set(center[0], center[1], center[2]);
            controls.update();

            // Grid helper
            const gridSize = maxExtent * 2;
            const gridHelper = new THREE.GridHelper(gridSize, 20, 0x333333, 0x222222);
            const minY = Math.min(...sim.trajectories.flat().map(p => p[1]));
            gridHelper.position.set(center[0], minY - maxExtent * 0.1, center[2]);
            scene.add(gridHelper);
            sceneObjects.push(gridHelper);

            // Axes helper
            const axesHelper = new THREE.AxesHelper(maxExtent * 0.3);
            axesHelper.position.set(center[0] - maxExtent, center[1] - maxExtent, center[2] - maxExtent);
            scene.add(axesHelper);
            sceneObjects.push(axesHelper);

            // Add trajectories
            sim.trajectories.forEach((traj, i) => {{
                const points = traj.map(p => new THREE.Vector3(p[0], p[1], p[2]));
                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                const material = new THREE.LineBasicMaterial({{
                    color: colors[i % colors.length],
                    linewidth: 2,
                }});
                const line = new THREE.Line(geometry, material);
                scene.add(line);
                sceneObjects.push(line);

                // Start sphere
                const startGeom = new THREE.SphereGeometry(maxExtent * 0.02, 16, 16);
                const startMat = new THREE.MeshBasicMaterial({{ color: colors[i % colors.length] }});
                const startSphere = new THREE.Mesh(startGeom, startMat);
                startSphere.position.copy(points[0]);
                scene.add(startSphere);
                sceneObjects.push(startSphere);

                // End sphere
                const endGeom = new THREE.SphereGeometry(maxExtent * 0.01, 16, 16);
                const endMat = new THREE.MeshBasicMaterial({{ color: colors[i % colors.length], opacity: 0.5, transparent: true }});
                const endSphere = new THREE.Mesh(endGeom, endMat);
                endSphere.position.copy(points[points.length - 1]);
                scene.add(endSphere);
                sceneObjects.push(endSphere);
            }});

            // Update UI
            document.getElementById('sim-num').textContent = index + 1;
            document.getElementById('total-score').textContent = sim.score.toFixed(3);
            document.getElementById('reason').textContent = sim.reason;
            document.getElementById('steps').textContent = sim.steps.toLocaleString();
            document.getElementById('counter').textContent = `${{index + 1}} / ${{allSims.length}}`;

            // Update score bars
            const scoresDiv = document.getElementById('scores');
            scoresDiv.innerHTML = '';
            if (sim.scoreBreakdown) {{
                let i = 0;
                for (const [name, value] of Object.entries(sim.scoreBreakdown)) {{
                    const color = scoreColors[i % scoreColors.length];
                    scoresDiv.innerHTML += `
                        <div class="score-bar">
                            <div class="score-label">
                                <span>${{name}}</span>
                                <span>${{value.toFixed(2)}}</span>
                            </div>
                            <div class="score-track">
                                <div class="score-fill" style="width: ${{value * 100}}%; background: ${{color}};"></div>
                            </div>
                        </div>
                    `;
                    i++;
                }}
            }}

            // Update navigation buttons
            document.getElementById('prev-btn').disabled = index === 0;
            document.getElementById('next-btn').disabled = index === allSims.length - 1;
        }}

        // Navigation
        document.getElementById('prev-btn').addEventListener('click', () => {{
            if (currentIndex > 0) {{
                currentIndex--;
                loadSimulation(currentIndex);
            }}
        }});

        document.getElementById('next-btn').addEventListener('click', () => {{
            if (currentIndex < allSims.length - 1) {{
                currentIndex++;
                loadSimulation(currentIndex);
            }}
        }});

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {{
            if (e.key === 'ArrowLeft' && currentIndex > 0) {{
                currentIndex--;
                loadSimulation(currentIndex);
            }} else if (e.key === 'ArrowRight' && currentIndex < allSims.length - 1) {{
                currentIndex++;
                loadSimulation(currentIndex);
            }}
        }});

        // Save button
        document.getElementById('save-btn').addEventListener('click', () => {{
            const sim = allSims[currentIndex];
            const text = `Simulation ${{currentIndex + 1}} Initial Conditions\\nBase64: ${{sim.base64}}`;

            navigator.clipboard.writeText(sim.base64).then(() => {{
                const toast = document.getElementById('toast');
                toast.classList.add('show');
                setTimeout(() => toast.classList.remove('show'), 2000);
            }}).catch(() => {{
                // Fallback: show in console
                console.log('='.repeat(60));
                console.log(`Simulation ${{currentIndex + 1}} Initial Conditions`);
                console.log('='.repeat(60));
                console.log(`Base64: ${{sim.base64}}`);
                console.log('='.repeat(60));
                alert('Copied to console (check developer tools)');
            }});
        }});

        // Ambient light
        scene.add(new THREE.AmbientLight(0xffffff, 0.5));

        // Animation loop
        function animate() {{
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }}
        animate();

        // Handle resize
        window.addEventListener('resize', () => {{
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }});

        // Initial load
        loadSimulation(0);
    </script>
</body>
</html>
'''
