#!/usr/bin/env python3
"""
Random 3-body gravity simulation in 3D.

Now with a search loop:
- Repeatedly tries random initial conditions
- Keeps the first simulation that lasts at least MIN_STEPS_TARGET steps
  (i.e., collision/escape happens after that many steps, or not at all)
- Exports that run's trajectories as OBJ
- Shows a Matplotlib 3D preview
"""

import numpy as np
from dataclasses import dataclass

# Matplotlib imports for preview
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D  # noqa: F401 (needed to activate 3D)

# -----------------------------
# Configuration
# -----------------------------

# Tube / mesh export settings
PATH_TUBE_RADIUS = 0.05   # Radius of the pipe around each path
TUBE_SEGMENTS = 8         # Number of segments around the circle (8–16 is reasonable)
PATH_SAMPLE_STRIDE = 10   # Use every Nth point to keep mesh size manageable


G = 1.0                  # Gravitational constant (arbitrary units)
DT = 0.01                # Time step
MAX_STEPS = 200_000      # Hard cap on number of integration steps **per simulation**

BOUNDING_BOX = 5     # Stop if |x|, |y|, or |z| exceeds this
COLLISION_RADIUS = 0.05  # Consider bodies "collided" if closer than this

POSITION_RANGE = 1.0     # Initial positions in [-POSITION_RANGE, POSITION_RANGE]
VELOCITY_SCALE = 0.2     # Scale of initial random velocities

OUTPUT_OBJ_FILE = "three_body_paths.obj"

# New: search parameters
MIN_STEPS_TARGET = 3_000   # We want a trajectory surviving at least this many steps
MAX_ATTEMPTS = 100          # Max number of random tries before giving up


@dataclass
class SimulationResult:
    trajectories: list   # list of np.ndarray, each shape (T, 3)
    reason: str          # reason for termination
    steps: int           # number of integration steps performed


# -----------------------------
# Physics helpers
# -----------------------------

def random_initial_conditions(num_bodies=3, seed=None):
    """
    Create random initial positions and velocities for num_bodies.
    Masses are set to 1 for all bodies by default.
    """
    rng = np.random.default_rng(seed)

    # Random positions in a cube around the origin
    positions = rng.uniform(-POSITION_RANGE, POSITION_RANGE, size=(num_bodies, 3))

    # Small random velocities
    velocities = rng.normal(0.0, VELOCITY_SCALE, size=(num_bodies, 3))

    # Equal masses (you can randomize if you want)
    masses = np.ones(num_bodies)

    return positions, velocities, masses


def compute_accelerations(positions, masses):
    """
    Compute gravitational accelerations on each body due to all others.

    positions: (N, 3)
    masses:    (N,)
    returns:   (N, 3) accelerations
    """
    num_bodies = positions.shape[0]
    acc = np.zeros_like(positions)

    for i in range(num_bodies):
        for j in range(num_bodies):
            if i == j:
                continue
            r_vec = positions[j] - positions[i]
            dist_sq = np.dot(r_vec, r_vec) + 1e-9  # small softening to avoid div-by-zero
            inv_dist3 = 1.0 / (dist_sq * np.sqrt(dist_sq))
            acc[i] += G * masses[j] * r_vec * inv_dist3

    return acc


def check_collision(positions, collision_radius):
    """
    Return True if any pair of bodies is closer than collision_radius.
    """
    num_bodies = positions.shape[0]
    for i in range(num_bodies):
        for j in range(i + 1, num_bodies):
            if np.linalg.norm(positions[i] - positions[j]) < collision_radius:
                return True
    return False


def check_escape(positions, bound):
    """
    Return True if any body is outside the axis-aligned cube:
    [-bound, bound]^3 in any coordinate.
    """
    return bool(np.any(np.abs(positions) > bound))


# -----------------------------
# Single simulation
# -----------------------------

def simulate_three_body(max_steps=MAX_STEPS, seed=None):
    """
    Run one random 3-body simulation and return the trajectories and stop reason.
    """
    positions, velocities, masses = random_initial_conditions(num_bodies=3, seed=seed)

    # Trajectories: list of lists; we’ll convert to arrays at the end
    traj = [[] for _ in range(3)]

    # Initial accelerations
    acc = compute_accelerations(positions, masses)

    reason = "max_steps_reached"
    steps = 0

    for step in range(max_steps):
        # Record positions
        for i in range(3):
            traj[i].append(positions[i].copy())

        # Velocity-Verlet integration
        new_positions = positions + velocities * DT + 0.5 * acc * (DT ** 2)
        new_acc = compute_accelerations(new_positions, masses)
        new_velocities = velocities + 0.5 * (acc + new_acc) * DT

        positions, velocities, acc = new_positions, new_velocities, new_acc

        # Check termination conditions
        if check_collision(positions, COLLISION_RADIUS):
            reason = "collision"
            steps = step + 1
            break

        if check_escape(positions, BOUNDING_BOX):
            reason = "escaped_bounding_box"
            steps = step + 1
            break

    else:
        # If we finished the loop without breaking
        steps = max_steps

    # Convert trajectories to arrays
    traj_arrays = [np.array(body_traj) for body_traj in traj]
    return SimulationResult(traj_arrays, reason, steps)


# -----------------------------
# Search for a "long" simulation
# -----------------------------

def find_long_simulation(min_steps=MIN_STEPS_TARGET, max_attempts=MAX_ATTEMPTS):
    """
    Try random initial conditions until we find a simulation
    that lasts at least `min_steps` steps.

    Returns the first SimulationResult that meets the criterion.
    If none do within max_attempts, returns the best (longest) one found.
    """
    best_result = None

    for attempt in range(1, max_attempts + 1):
        sim_result = simulate_three_body()
        print(f"Attempt {attempt}: steps={sim_result.steps}, reason={sim_result.reason}")

        if best_result is None or sim_result.steps > best_result.steps:
            best_result = sim_result

        if sim_result.steps >= min_steps:
            print(f"Found a simulation lasting at least {min_steps} steps.")
            return sim_result

    print(f"Did not find a simulation with >= {min_steps} steps.")
    print("Returning the longest one found instead.")
    return best_result


# -----------------------------
# OBJ Export
# -----------------------------

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


# -----------------------------
# Matplotlib preview
# -----------------------------

def preview_trajectories_matplotlib(sim_result: SimulationResult):
    """
    Show a 3D Matplotlib preview of the trajectories.
    """
    trajectories = sim_result.trajectories

    fig = plt.figure()
    ax = fig.add_subplot(111, projection="3d")

    # Plot each body's path
    for traj in trajectories:
        if len(traj) == 0:
            continue
        traj = np.asarray(traj)
        ax.plot(traj[:, 0], traj[:, 1], traj[:, 2])

    # Make axes roughly equal so orbits aren't squashed
    all_points = np.vstack(trajectories)
    mins = all_points.min(axis=0)
    maxs = all_points.max(axis=0)
    centers = 0.5 * (mins + maxs)
    max_range = 0.5 * np.max(maxs - mins)

    ax.set_xlim(centers[0] - max_range, centers[0] + max_range)
    ax.set_ylim(centers[1] - max_range, centers[1] + max_range)
    ax.set_zlim(centers[2] - max_range, centers[2] + max_range)

    ax.set_xlabel("X")
    ax.set_ylabel("Y")
    ax.set_zlabel("Z")
    ax.set_title(f"3-body trajectories ({sim_result.reason}, steps={sim_result.steps})")

    plt.tight_layout()
    plt.show()


# -----------------------------
# Main entry point
# -----------------------------

def main():
    # Find a "good" long-lived simulation
    sim_result = find_long_simulation(MIN_STEPS_TARGET, MAX_ATTEMPTS)

    # Save and preview it
    write_trajectories_to_obj(sim_result, OUTPUT_OBJ_FILE)
    print(f"\nUsing simulation: steps={sim_result.steps}, reason={sim_result.reason}")
    print(f"OBJ file written to: {OUTPUT_OBJ_FILE}")
    print("Showing Matplotlib 3D preview window...")

    preview_trajectories_matplotlib(sim_result)


if __name__ == "__main__":
    main()
