"""OBJ file export for trajectory meshes."""

import numpy as np

from fleeting_grace.config import PATH_SAMPLE_STRIDE, PATH_TUBE_RADIUS, TUBE_SEGMENTS
from fleeting_grace.simulation import SimulationResult


def write_trajectories_to_obj(sim_result: SimulationResult, filename: str):
    """
    Writes trajectories as tube meshes into a Wavefront OBJ file.

    For each body:
      - Downsamples its trajectory (to keep things sane)
      - Builds a tube (generalized cylinder) along the path
      - Outputs vertices + quad faces

    The result is a proper 3D "pipe" you can render directly.
    """
    trajectories = sim_result.trajectories

    with open(filename, "w") as f:
        f.write("# Three-body trajectories as tubes\n")
        f.write(f"# Reason for termination: {sim_result.reason}\n")
        f.write(f"# Steps: {sim_result.steps}\n\n")

        vertex_offset = 1  # OBJ indices are 1-based

        for body_index, traj in enumerate(trajectories):
            if len(traj) < 2:
                continue

            # Downsample trajectory to keep vertex count manageable
            traj_arr = np.asarray(traj)
            sampled = traj_arr[::PATH_SAMPLE_STRIDE]
            if len(sampled) < 2:
                sampled = traj_arr  # fallback if path is very short

            points = sampled
            n_points = len(points)

            # Compute tangents along the path
            tangents = np.zeros_like(points)
            for i in range(n_points):
                if i == 0:
                    dir_vec = points[1] - points[0]
                elif i == n_points - 1:
                    dir_vec = points[-1] - points[-2]
                else:
                    dir_vec = points[i + 1] - points[i - 1]

                norm = np.linalg.norm(dir_vec)
                if norm == 0.0:
                    tangents[i] = np.array([0.0, 0.0, 1.0])
                else:
                    tangents[i] = dir_vec / norm

            # Build circle (ring) around each point, oriented by a local frame
            up_ref = np.array([0.0, 0.0, 1.0])
            body_rings = []  # list of [vertex_index,...] for each ring

            f.write(f"g body_{body_index}\n")

            for i in range(n_points):
                p = points[i]
                t = tangents[i]

                # If tangent is almost parallel to up_ref, pick a different up
                if abs(np.dot(t, up_ref)) > 0.9:
                    up_ref = np.array([1.0, 0.0, 0.0])

                # Normal and binormal for local frame
                n = np.cross(t, up_ref)
                n_norm = np.linalg.norm(n)
                if n_norm == 0.0:
                    n = np.array([1.0, 0.0, 0.0])
                    n_norm = 1.0
                n = n / n_norm
                b = np.cross(t, n)

                ring_indices = []
                for k in range(TUBE_SEGMENTS):
                    angle = 2.0 * np.pi * k / TUBE_SEGMENTS
                    offset = PATH_TUBE_RADIUS * (np.cos(angle) * n + np.sin(angle) * b)
                    v = p + offset
                    f.write(f"v {v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n")
                    ring_indices.append(vertex_offset)
                    vertex_offset += 1

                body_rings.append(ring_indices)

            # Connect rings with quad faces to make the tube
            for i in range(len(body_rings) - 1):
                ring1 = body_rings[i]
                ring2 = body_rings[i + 1]
                for k in range(TUBE_SEGMENTS):
                    v1 = ring1[k]
                    v2 = ring1[(k + 1) % TUBE_SEGMENTS]
                    v3 = ring2[(k + 1) % TUBE_SEGMENTS]
                    v4 = ring2[k]
                    # quad face
                    f.write(f"f {v1} {v2} {v3} {v4}\n")

            f.write("\n")
