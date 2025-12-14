"""Three.js-based 3D trajectory viewer."""

import json
import webbrowser
from pathlib import Path

import numpy as np

from fleeting_grace.config import AU
from fleeting_grace.simulation import SimulationResult


def export_viewer_html(
    sim_result: SimulationResult,
    output_path: str | Path = "trajectory_viewer.html",
    open_browser: bool = True,
) -> Path:
    """
    Generate a standalone HTML file with an interactive Three.js 3D viewer.

    Args:
        sim_result: The simulation result to visualize
        output_path: Where to save the HTML file
        open_browser: Whether to open the file in the default browser

    Returns:
        Path to the generated HTML file
    """
    output_path = Path(output_path)

    # Convert trajectories to JSON-serializable format (in AU for nicer numbers)
    trajectories_data = []
    for traj in sim_result.trajectories:
        traj_au = np.asarray(traj) / AU
        trajectories_data.append(traj_au.tolist())

    # Compute bounds for camera positioning
    all_points = np.concatenate([np.asarray(t) / AU for t in sim_result.trajectories])
    center = np.mean(all_points, axis=0)
    max_extent = np.max(np.abs(all_points - center)) * 1.5

    html_content = _generate_html(
        trajectories_data,
        center.tolist(),
        float(max_extent),
        sim_result.reason,
        sim_result.steps,
        sim_result.score_breakdown,
    )

    output_path.write_text(html_content)

    if open_browser:
        webbrowser.open(f"file://{output_path.absolute()}")

    return output_path


def _generate_html(
    trajectories: list,
    center: list,
    max_extent: float,
    reason: str,
    steps: int,
    score_breakdown: dict | None,
) -> str:
    """Generate the complete HTML content with embedded Three.js viewer."""

    trajectories_json = json.dumps(trajectories)
    center_json = json.dumps(center)
    scores_json = json.dumps(score_breakdown) if score_breakdown else "null"

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
            background: rgba(0, 0, 0, 0.7);
            padding: 15px 20px;
            border-radius: 8px;
            font-size: 14px;
            max-width: 300px;
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
            font-size: 12px;
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
            transition: width 0.3s ease;
        }}
        #controls {{
            position: absolute;
            bottom: 20px;
            left: 20px;
            background: rgba(0, 0, 0, 0.7);
            padding: 15px 20px;
            border-radius: 8px;
            font-size: 12px;
            color: #666;
        }}
        .legend {{
            display: flex;
            gap: 15px;
            margin-top: 10px;
        }}
        .legend-item {{
            display: flex;
            align-items: center;
            gap: 6px;
        }}
        .legend-color {{
            width: 12px;
            height: 12px;
            border-radius: 50%;
        }}
    </style>
</head>
<body>
    <div id="container"></div>

    <div id="info">
        <h1>3-Body Simulation</h1>
        <p><span class="label">Termination:</span> {reason}</p>
        <p><span class="label">Steps:</span> {steps:,}</p>
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

    <div id="controls">
        <strong>Controls:</strong> Drag to rotate | Scroll to zoom | Right-drag to pan
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

        // Embedded data
        const trajectories = {trajectories_json};
        const center = {center_json};
        const maxExtent = {max_extent};
        const scores = {scores_json};

        // Colors for each body
        const colors = [0xff6b6b, 0x4ecdc4, 0xffe66d];

        // Setup
        const container = document.getElementById('container');
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0a0f);

        const camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.1,
            maxExtent * 100
        );
        camera.position.set(
            center[0] + maxExtent * 1.5,
            center[1] + maxExtent * 1.2,
            center[2] + maxExtent * 1.5
        );

        const renderer = new THREE.WebGLRenderer({{ antialias: true }});
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(renderer.domElement);

        // Controls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(center[0], center[1], center[2]);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.update();

        // Grid helper
        const gridSize = maxExtent * 2;
        const gridHelper = new THREE.GridHelper(gridSize, 20, 0x333333, 0x222222);
        gridHelper.position.set(center[0], Math.min(...trajectories.flat().map(p => p[1])) - 1, center[2]);
        scene.add(gridHelper);

        // Axes helper
        const axesHelper = new THREE.AxesHelper(maxExtent * 0.3);
        axesHelper.position.set(center[0] - maxExtent, center[1] - maxExtent, center[2] - maxExtent);
        scene.add(axesHelper);

        // Add trajectories as lines
        trajectories.forEach((traj, i) => {{
            const points = traj.map(p => new THREE.Vector3(p[0], p[1], p[2]));
            const geometry = new THREE.BufferGeometry().setFromPoints(points);

            const material = new THREE.LineBasicMaterial({{
                color: colors[i % colors.length],
                linewidth: 2,
            }});

            const line = new THREE.Line(geometry, material);
            scene.add(line);

            // Add sphere at start position
            const startGeom = new THREE.SphereGeometry(maxExtent * 0.02, 16, 16);
            const startMat = new THREE.MeshBasicMaterial({{ color: colors[i % colors.length] }});
            const startSphere = new THREE.Mesh(startGeom, startMat);
            startSphere.position.set(points[0].x, points[0].y, points[0].z);
            scene.add(startSphere);

            // Add smaller sphere at end position
            const endGeom = new THREE.SphereGeometry(maxExtent * 0.01, 16, 16);
            const endMat = new THREE.MeshBasicMaterial({{ color: colors[i % colors.length], opacity: 0.5, transparent: true }});
            const endSphere = new THREE.Mesh(endGeom, endMat);
            endSphere.position.set(points[points.length - 1].x, points[points.length - 1].y, points[points.length - 1].z);
            scene.add(endSphere);
        }});

        // Ambient light
        scene.add(new THREE.AmbientLight(0xffffff, 0.5));

        // Render scores
        if (scores) {{
            const scoresDiv = document.getElementById('scores');
            const scoreColors = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#a29bfe', '#fd79a8', '#81ecec', '#ffeaa7'];
            let i = 0;
            for (const [name, value] of Object.entries(scores)) {{
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
    </script>
</body>
</html>
'''
