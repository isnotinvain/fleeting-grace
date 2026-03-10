"""Generate 3D mesh models from trajectories for 3D printing."""

import base64
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from fleeting_grace.config import AU, DT, MAX_RADIUS, MAX_STEPS
from fleeting_grace.simulation import InitialConditions, SimulationResult, compute_accelerations, compute_body_radius, run_simulation
from fleeting_grace.termination import TrajectoryTooLarge


@dataclass
class PipeSettings:
    """Settings for pipe/tube generation.

    Tube radii are computed automatically via physics-based scaling:
    the largest radii that don't create false collisions, proportional
    to each body's actual radius.
    """

    segments: int = 64  # Number of segments around the circumference


@dataclass
class SphereSettings:
    """Settings for endpoint spheres.

    Spheres are sized at `scale_factor` times the tube radius, proportional
    to body mass. If the simulation ends in a collision, the colliding
    spheres are backed up along their trajectories until just touching.
    """

    scale_factor: float = 2.0  # Sphere radius as a multiple of tube radius
    segments: int = 64  # Latitude/longitude segments
    show_start: bool = True  # Sphere at trajectory start
    show_end: bool = True  # Sphere at trajectory end


def decode_initial_conditions(base64_str: str) -> InitialConditions:
    """Decode a base64 string back into InitialConditions."""
    data = np.frombuffer(base64.b64decode(base64_str), dtype=np.float64)
    # Layout: positions (9) + velocities (9) + masses (3) = 21 floats
    positions = data[:9].reshape(3, 3)
    velocities = data[9:18].reshape(3, 3)
    masses = data[18:21]
    return InitialConditions(positions, velocities, masses)


def simulate_from_base64(
    base64_str: str,
    max_steps: int = MAX_STEPS,
) -> SimulationResult:
    """Recreate a simulation from a base64-encoded initial conditions string."""
    ic = decode_initial_conditions(base64_str)
    termination = TrajectoryTooLarge(MAX_RADIUS)
    return run_simulation(ic, termination, max_steps)



def _compute_frenet_frame(points: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Compute Frenet-Serret frame (tangent, normal, binormal) at each point."""
    n_points = len(points)

    # Tangent vectors (forward difference, normalized)
    tangents = np.zeros_like(points)
    for i in range(n_points - 1):
        tangents[i] = points[i + 1] - points[i]
    tangents[-1] = tangents[-2]  # Copy last

    # Normalize tangents
    lengths = np.linalg.norm(tangents, axis=1, keepdims=True)
    lengths = np.maximum(lengths, 1e-10)
    tangents = tangents / lengths

    # Initial normal - find a vector not parallel to first tangent
    if abs(tangents[0][0]) < 0.9:
        initial_normal = np.cross(tangents[0], [1, 0, 0])
    else:
        initial_normal = np.cross(tangents[0], [0, 1, 0])
    initial_normal = initial_normal / np.linalg.norm(initial_normal)

    # Propagate frame along curve (rotation minimizing frame)
    normals = np.zeros_like(points)
    binormals = np.zeros_like(points)

    normals[0] = initial_normal
    binormals[0] = np.cross(tangents[0], normals[0])

    for i in range(1, n_points):
        # Project previous normal onto plane perpendicular to current tangent
        n_proj = normals[i - 1] - np.dot(normals[i - 1], tangents[i]) * tangents[i]
        n_len = np.linalg.norm(n_proj)
        if n_len > 1e-10:
            normals[i] = n_proj / n_len
        else:
            normals[i] = normals[i - 1]
        binormals[i] = np.cross(tangents[i], normals[i])

    return tangents, normals, binormals


def _generate_tube_mesh(
    points: np.ndarray,
    start_radius: float,
    end_radius: float,
    segments: int = 12,
) -> tuple[np.ndarray, np.ndarray]:
    """Generate a tube mesh along a path.

    Args:
        points: Path points
        start_radius: Radius at the start of the tube
        end_radius: Radius at the end of the tube
        segments: Number of segments around the circumference

    Returns:
        vertices: (N, 3) array of vertex positions
        faces: (M, 3) array of triangle indices
    """
    n_points = len(points)
    n_segments = segments

    if n_points < 2:
        return np.array([]), np.array([])

    # Get Frenet frame
    tangents, normals, binormals = _compute_frenet_frame(points)

    # Generate vertices - a ring of vertices at each point along the path
    vertices = []

    for i, point in enumerate(points):
        # Interpolate radius for taper
        t = i / (n_points - 1) if n_points > 1 else 0
        radius = start_radius * (1 - t) + end_radius * t

        # Generate ring of vertices
        for j in range(n_segments):
            angle = 2 * np.pi * j / n_segments
            # Position on circle in local frame
            local_offset = radius * (np.cos(angle) * normals[i] + np.sin(angle) * binormals[i])
            vertex = point + local_offset
            vertices.append(vertex)

    vertices = np.array(vertices)

    # Generate faces - connect adjacent rings with triangles
    faces = []

    for i in range(n_points - 1):
        for j in range(n_segments):
            # Current ring indices
            curr_base = i * n_segments
            next_base = (i + 1) * n_segments

            # Vertex indices
            v0 = curr_base + j
            v1 = curr_base + (j + 1) % n_segments
            v2 = next_base + j
            v3 = next_base + (j + 1) % n_segments

            # Two triangles per quad
            faces.append([v0, v2, v1])
            faces.append([v1, v2, v3])

    # Cap the ends
    # Start cap (winding must oppose tube body's ring edge direction)
    start_center_idx = len(vertices)
    vertices = np.vstack([vertices, points[0]])
    for j in range(n_segments):
        v0 = j
        v1 = (j + 1) % n_segments
        faces.append([start_center_idx, v0, v1])

    # End cap (winding must oppose tube body's ring edge direction)
    end_center_idx = len(vertices)
    vertices = np.vstack([vertices, points[-1]])
    end_base = (n_points - 1) * n_segments
    for j in range(n_segments):
        v0 = end_base + j
        v1 = end_base + (j + 1) % n_segments
        faces.append([end_center_idx, v1, v0])

    return vertices, np.array(faces)


def _generate_sphere_mesh(
    center: np.ndarray,
    radius: float,
    segments: int = 16,
) -> tuple[np.ndarray, np.ndarray]:
    """Generate a UV sphere mesh with proper pole vertices."""
    vertices = []
    faces = []

    # South pole vertex (index 0)
    vertices.append(center + np.array([0.0, 0.0, -radius]))

    # Interior rings (excluding poles)
    for i in range(1, segments):
        lat = np.pi * i / segments - np.pi / 2
        for j in range(segments):
            lon = 2 * np.pi * j / segments
            x = radius * np.cos(lat) * np.cos(lon)
            y = radius * np.cos(lat) * np.sin(lon)
            z = radius * np.sin(lat)
            vertices.append(center + np.array([x, y, z]))

    # North pole vertex (last index)
    north_pole_idx = len(vertices)
    vertices.append(center + np.array([0.0, 0.0, radius]))

    vertices = np.array(vertices)

    # South pole fan: connect pole (0) to first ring (indices 1..segments)
    for j in range(segments):
        v0 = 1 + j
        v1 = 1 + (j + 1) % segments
        faces.append([0, v0, v1])

    # Interior quads between rings
    for i in range(segments - 2):
        ring_base = 1 + i * segments
        next_ring_base = 1 + (i + 1) * segments
        for j in range(segments):
            v0 = ring_base + j
            v1 = ring_base + (j + 1) % segments
            v2 = next_ring_base + j
            v3 = next_ring_base + (j + 1) % segments
            faces.append([v0, v2, v1])
            faces.append([v1, v2, v3])

    # North pole fan: connect last ring to pole
    last_ring_base = 1 + (segments - 2) * segments
    for j in range(segments):
        v0 = last_ring_base + j
        v1 = last_ring_base + (j + 1) % segments
        faces.append([north_pole_idx, v1, v0])

    return vertices, np.array(faces)


def _generate_armillary_mesh(
    center: np.ndarray,
    radius: float,
    ring_thickness: float | None = None,
    ring_points: int = 64,
    tube_segments: int = 8,
) -> tuple[np.ndarray, np.ndarray]:
    """Generate an armillary sphere (3 orthogonal ring tubes)."""
    if ring_thickness is None:
        ring_thickness = radius * 0.1

    all_verts = []
    all_faces = []
    offset = 0

    # 3 great circles in XY, XZ, YZ planes
    for axis in range(3):
        # Generate circular path
        angles = np.linspace(0, 2 * np.pi, ring_points, endpoint=False)
        path = np.zeros((ring_points, 3))
        if axis == 0:  # XY plane
            path[:, 0] = np.cos(angles) * radius
            path[:, 1] = np.sin(angles) * radius
        elif axis == 1:  # XZ plane
            path[:, 0] = np.cos(angles) * radius
            path[:, 2] = np.sin(angles) * radius
        else:  # YZ plane
            path[:, 1] = np.cos(angles) * radius
            path[:, 2] = np.sin(angles) * radius
        path += center

        # Close the loop by appending the first few points
        path = np.vstack([path, path[:2]])

        verts, faces = _generate_tube_mesh(path, ring_thickness, ring_thickness, tube_segments)
        if len(verts) > 0:
            all_verts.append(verts)
            all_faces.append(faces + offset)
            offset += len(verts)

    if not all_verts:
        return np.array([]), np.array([])

    return np.vstack(all_verts), np.vstack(all_faces)


def _compute_max_safe_scale(ic: InitialConditions, n_steps: int) -> float:
    """Find the largest body-radius scale factor that doesn't create new collisions.

    Replays the simulation physics, finds all close-encounter local minima,
    and returns the smallest scale factor (= tightest constraint). Terminal
    collisions don't appear as local minima since the sim stops there, so
    they're naturally excluded.
    """
    positions = ic.positions.copy()
    velocities = ic.velocities.copy()
    masses = ic.masses.copy()
    body_radii = [compute_body_radius(m) for m in masses]
    acc = compute_accelerations(positions, masses)

    # Record pairwise distances at each step
    pairs = [(0, 1), (0, 2), (1, 2)]
    pair_dists: dict[tuple[int, int], list[float]] = {p: [] for p in pairs}

    for step in range(n_steps):
        for i, j in pairs:
            dist = float(np.linalg.norm(positions[i] - positions[j]))
            pair_dists[(i, j)].append(dist)

        new_positions = positions + velocities * DT + 0.5 * acc * (DT**2)
        new_acc = compute_accelerations(new_positions, masses)
        new_velocities = velocities + 0.5 * (acc + new_acc) * DT
        positions, velocities, acc = new_positions, new_velocities, new_acc

    # Find local minima (close encounters) and their scale factors
    encounters = []
    for (a, b), dists in pair_dists.items():
        combined_radius = body_radii[a] + body_radii[b]
        for i in range(1, len(dists) - 1):
            if dists[i] < dists[i - 1] and dists[i] < dists[i + 1]:
                scale_factor = dists[i] / combined_radius
                encounters.append((scale_factor, i, a, b))

    if not encounters:
        return 1.0

    encounters.sort()
    return encounters[0][0]


def _truncate_at_collision(
    traj_a: np.ndarray,
    traj_b: np.ndarray,
    sphere_radius_a: float,
    sphere_radius_b: float,
) -> tuple[np.ndarray, np.ndarray]:
    """Truncate both trajectories so their endpoint spheres just touch.

    Walks both trajectories backwards (by equal fraction) until the distance
    between them equals the sum of sphere radii. Returns truncated copies
    ending at the just-touching positions.
    """
    sum_radii = sphere_radius_a + sphere_radius_b

    # Check if they even overlap at the end
    if np.linalg.norm(traj_a[-1] - traj_b[-1]) >= sum_radii:
        return traj_a, traj_b

    def interp(traj: np.ndarray, t: float) -> np.ndarray:
        idx = t * (len(traj) - 1)
        i = int(idx)
        if i >= len(traj) - 1:
            return traj[-1]
        frac = idx - i
        return traj[i] * (1 - frac) + traj[i + 1] * frac

    # Binary search for the t where distance = sum_radii
    t_lo, t_hi = 0.0, 1.0
    for _ in range(50):
        t_mid = (t_lo + t_hi) / 2
        dist = np.linalg.norm(interp(traj_a, t_mid) - interp(traj_b, t_mid))
        if dist < sum_radii:
            t_hi = t_mid
        else:
            t_lo = t_mid

    t = (t_lo + t_hi) / 2

    # Truncate: keep points up to the index before t, then append the interpolated point
    cut_a = int(t * (len(traj_a) - 1))
    cut_b = int(t * (len(traj_b) - 1))
    trunc_a = np.vstack([traj_a[: cut_a + 1], interp(traj_a, t)[np.newaxis, :]])
    trunc_b = np.vstack([traj_b[: cut_b + 1], interp(traj_b, t)[np.newaxis, :]])
    return trunc_a, trunc_b


def generate_trajectory_mesh(
    sim_result: SimulationResult,
    pipe_settings: PipeSettings | None = None,
    sphere_settings: SphereSettings | None = None,
    scale: float = 100.0,
    colors: list[str] | None = None,
) -> tuple[list[np.ndarray], list[np.ndarray], list[str]]:
    """Generate meshes for all trajectories.

    Args:
        sim_result: Simulation result containing trajectories
        pipe_settings: Settings for tube generation
        sphere_settings: Settings for endpoint spheres
        scale: Output scale (max extent will be this value)
        colors: Optional list of color names for each body

    Returns:
        all_vertices: List of vertex arrays (one per mesh)
        all_faces: List of face arrays (one per mesh)
        mesh_names: List of mesh names
    """
    if pipe_settings is None:
        pipe_settings = PipeSettings()
    if sphere_settings is None:
        sphere_settings = SphereSettings()
    if colors is None:
        colors = ["red", "cyan", "yellow"]

    # First, normalize all trajectories together to maintain relative positions
    all_points = []
    for traj in sim_result.trajectories:
        traj_au = np.asarray(traj) / AU
        all_points.append(traj_au)

    combined = np.concatenate(all_points, axis=0)
    center = np.mean(combined, axis=0)
    max_extent = np.max(np.abs(combined - center))

    # Get body radii in AU
    body_radii_au = []
    for mass in sim_result.initial_conditions.masses:
        radius_meters = compute_body_radius(mass)
        body_radii_au.append(radius_meters / AU)

    # Normalize all trajectories
    normalized_trajectories = []
    for traj in sim_result.trajectories:
        traj_au = np.asarray(traj) / AU
        if max_extent > 0:
            traj_normalized = (traj_au - center) / max_extent * scale
        else:
            traj_normalized = traj_au - center
        normalized_trajectories.append(traj_normalized)

    # Physics-based tube radii: largest that don't create false collisions
    safe_scale = _compute_max_safe_scale(
        sim_result.initial_conditions,
        sim_result.steps,
    )
    tube_radii = [r_au / max_extent * scale * safe_scale for r_au in body_radii_au]
    sphere_radii = [r * sphere_settings.scale_factor for r in tube_radii]
    print(f"[auto-radius] scale={safe_scale:.2f}x, tube radii: {', '.join(f'{r:.4f}' for r in tube_radii)}")

    # Truncate colliding trajectories so endpoint spheres just touch
    if sim_result.reason == "collision" and sphere_settings.show_end:
        end_positions = [t[-1] for t in normalized_trajectories]
        n_bodies = len(normalized_trajectories)
        min_dist = float("inf")
        col_a, col_b = 0, 1
        for a in range(n_bodies):
            for b in range(a + 1, n_bodies):
                dist = float(np.linalg.norm(end_positions[a] - end_positions[b]))
                if dist < min_dist:
                    min_dist = dist
                    col_a, col_b = a, b

        if min_dist < sphere_radii[col_a] + sphere_radii[col_b]:
            normalized_trajectories[col_a], normalized_trajectories[col_b] = _truncate_at_collision(
                normalized_trajectories[col_a],
                normalized_trajectories[col_b],
                sphere_radii[col_a],
                sphere_radii[col_b],
            )

    all_vertices = []
    all_faces = []
    mesh_names = []

    for i, traj_normalized in enumerate(normalized_trajectories):
        color_name = colors[i % len(colors)]

        tube_verts, tube_faces = _generate_tube_mesh(
            traj_normalized,
            tube_radii[i],
            tube_radii[i],
            pipe_settings.segments,
        )
        if len(tube_verts) > 0:
            all_vertices.append(tube_verts)
            all_faces.append(tube_faces)
            mesh_names.append(f"trajectory_{i + 1}_{color_name}")

        if sphere_settings.show_start and len(traj_normalized) > 0:
            arm_verts, arm_faces = _generate_armillary_mesh(
                traj_normalized[0], sphere_radii[i],
            )
            if len(arm_verts) > 0:
                all_vertices.append(arm_verts)
                all_faces.append(arm_faces)
                mesh_names.append(f"start_{i + 1}_{color_name}")

        if sphere_settings.show_end and len(traj_normalized) > 0:
            sphere_verts, sphere_faces = _generate_sphere_mesh(
                traj_normalized[-1], sphere_radii[i], sphere_settings.segments,
            )
            all_vertices.append(sphere_verts)
            all_faces.append(sphere_faces)
            mesh_names.append(f"end_{i + 1}_{color_name}")

    return all_vertices, all_faces, mesh_names


def _material_name_for_mesh(mesh_name: str) -> str:
    """Determine material name from mesh name (e.g. 'trajectory_1_red' -> 'body_1')."""
    if "_1_" in mesh_name:
        return "body_1"
    elif "_2_" in mesh_name:
        return "body_2"
    elif "_3_" in mesh_name:
        return "body_3"
    return "body_1"


# Colors matching the viewer: red, cyan, yellow
_BODY_MATERIALS = {
    "body_1": (1.0, 0.42, 0.42),  # #ff6b6b
    "body_2": (0.31, 0.80, 0.77),  # #4ecdc4
    "body_3": (1.0, 0.90, 0.43),  # #ffe66d
}


def _write_mtl_file(mtl_path: Path) -> None:
    """Write a .mtl material library file with body colors."""
    lines = [
        "# 3-Body Trajectory Materials",
        "# Generated by fleeting-grace",
        "",
    ]
    for name, (r, g, b) in _BODY_MATERIALS.items():
        lines.append(f"newmtl {name}")
        lines.append(f"Kd {r:.4f} {g:.4f} {b:.4f}")
        lines.append("Ka 0.1000 0.1000 0.1000")
        lines.append("Ks 0.3000 0.3000 0.3000")
        lines.append("Ns 50.0000")
        lines.append("d 1.0000")
        lines.append("")
    mtl_path.write_text("\n".join(lines))


def export_mesh_to_obj(
    all_vertices: list[np.ndarray],
    all_faces: list[np.ndarray],
    mesh_names: list[str],
    output_path: str | Path,
) -> Path:
    """Export meshes to OBJ format with an accompanying .mtl material file.

    Args:
        all_vertices: List of vertex arrays
        all_faces: List of face arrays
        mesh_names: List of mesh/group names
        output_path: Output file path

    Returns:
        Path to the written file
    """
    output_path = Path(output_path)
    mtl_path = output_path.with_suffix(".mtl")

    _write_mtl_file(mtl_path)

    lines = [
        "# 3-Body Trajectory Mesh",
        "# Generated by fleeting-grace",
        f"mtllib {mtl_path.name}",
        "",
    ]

    vertex_offset = 0

    for vertices, faces, name in zip(all_vertices, all_faces, mesh_names):
        if len(vertices) == 0:
            continue

        material = _material_name_for_mesh(name)
        lines.append(f"o {name}")
        lines.append(f"g {name}")
        lines.append(f"usemtl {material}")

        # Write vertices
        for v in vertices:
            lines.append(f"v {v[0]:.6f} {v[1]:.6f} {v[2]:.6f}")

        # Write faces (OBJ is 1-indexed)
        for f in faces:
            lines.append(f"f {f[0] + 1 + vertex_offset} {f[1] + 1 + vertex_offset} {f[2] + 1 + vertex_offset}")

        lines.append("")
        vertex_offset += len(vertices)

    output_path.write_text("\n".join(lines))
    return output_path


def export_mesh_to_stl(
    all_vertices: list[np.ndarray],
    all_faces: list[np.ndarray],
    mesh_names: list[str],
    output_path: str | Path,
) -> Path:
    """Export meshes to binary STL format.

    Args:
        all_vertices: List of vertex arrays
        all_faces: List of face arrays
        mesh_names: List of mesh names (used in header)
        output_path: Output file path

    Returns:
        Path to the written file
    """
    output_path = Path(output_path)

    # Count total triangles
    total_triangles = sum(len(f) for f in all_faces)

    with open(output_path, "wb") as f:
        # Header (80 bytes)
        header = b"Binary STL - fleeting-grace 3-body trajectory"
        header = header.ljust(80, b"\0")
        f.write(header)

        # Triangle count (4 bytes, uint32)
        f.write(np.uint32(total_triangles).tobytes())

        # Write triangles
        for vertices, faces in zip(all_vertices, all_faces):
            if len(vertices) == 0:
                continue

            for face in faces:
                v0, v1, v2 = vertices[face[0]], vertices[face[1]], vertices[face[2]]

                # Compute normal
                edge1 = v1 - v0
                edge2 = v2 - v0
                normal = np.cross(edge1, edge2)
                norm_len = np.linalg.norm(normal)
                if norm_len > 0:
                    normal = normal / norm_len

                # Write normal (3 floats)
                f.write(np.float32(normal).tobytes())

                # Write vertices (3 x 3 floats)
                f.write(np.float32(v0).tobytes())
                f.write(np.float32(v1).tobytes())
                f.write(np.float32(v2).tobytes())

                # Attribute byte count (2 bytes, usually 0)
                f.write(np.uint16(0).tobytes())

    return output_path


def create_mesh_from_base64(
    base64_str: str,
    output_path: str | Path = "trajectory_mesh.obj",
    pipe_settings: PipeSettings | None = None,
    sphere_settings: SphereSettings | None = None,
    scale: float = 100.0,
    format: str = "obj",
) -> Path:
    """One-stop function: decode base64, simulate, generate mesh, export.

    Args:
        base64_str: Base64-encoded initial conditions
        output_path: Output file path
        pipe_settings: Settings for tubes
        sphere_settings: Settings for endpoint spheres
        scale: Output scale
        format: "obj" or "stl"

    Returns:
        Path to exported file
    """
    # Simulate
    sim_result = simulate_from_base64(base64_str)

    # Generate meshes
    all_vertices, all_faces, mesh_names = generate_trajectory_mesh(
        sim_result,
        pipe_settings=pipe_settings,
        sphere_settings=sphere_settings,
        scale=scale,
    )

    # Export
    output_path = Path(output_path)
    if format.lower() == "stl":
        if not output_path.suffix.lower() == ".stl":
            output_path = output_path.with_suffix(".stl")
        return export_mesh_to_stl(all_vertices, all_faces, mesh_names, output_path)
    else:
        if not output_path.suffix.lower() == ".obj":
            output_path = output_path.with_suffix(".obj")
        return export_mesh_to_obj(all_vertices, all_faces, mesh_names, output_path)


def create_mesh_from_result(
    sim_result: SimulationResult,
    output_path: str | Path = "trajectory_mesh.obj",
    pipe_settings: PipeSettings | None = None,
    sphere_settings: SphereSettings | None = None,
    scale: float = 100.0,
    format: str = "obj",
) -> Path:
    """Generate mesh from a SimulationResult.

    Args:
        sim_result: Simulation result
        output_path: Output file path
        pipe_settings: Settings for tubes
        sphere_settings: Settings for endpoint spheres
        scale: Output scale
        format: "obj" or "stl"

    Returns:
        Path to exported file
    """
    # Generate meshes
    all_vertices, all_faces, mesh_names = generate_trajectory_mesh(
        sim_result,
        pipe_settings=pipe_settings,
        sphere_settings=sphere_settings,
        scale=scale,
    )

    # Export
    output_path = Path(output_path)
    if format.lower() == "stl":
        if not output_path.suffix.lower() == ".stl":
            output_path = output_path.with_suffix(".stl")
        return export_mesh_to_stl(all_vertices, all_faces, mesh_names, output_path)
    else:
        if not output_path.suffix.lower() == ".obj":
            output_path = output_path.with_suffix(".obj")
        return export_mesh_to_obj(all_vertices, all_faces, mesh_names, output_path)
