"""Physics simulation for 3-body gravitational system."""

from dataclasses import dataclass

import numpy as np

from fleeting_grace.config import (
    BOUNDING_BOX,
    COLLISION_RADIUS,
    DT,
    G,
    MAX_ATTEMPTS,
    MAX_STEPS,
    MIN_STEPS_TARGET,
    POSITION_RANGE,
    VELOCITY_SCALE,
)


@dataclass
class SimulationResult:
    trajectories: list  # list of np.ndarray, each shape (T, 3)
    reason: str  # reason for termination
    steps: int  # number of integration steps performed


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


def simulate_three_body(max_steps=MAX_STEPS, seed=None):
    """
    Run one random 3-body simulation and return the trajectories and stop reason.
    """
    positions, velocities, masses = random_initial_conditions(num_bodies=3, seed=seed)

    # Trajectories: list of lists; we'll convert to arrays at the end
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
        new_positions = positions + velocities * DT + 0.5 * acc * (DT**2)
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
