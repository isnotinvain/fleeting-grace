"""Physics simulation for 3-body gravitational system using real physical units."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from fleeting_grace.config import (
    AU,
    BOUNDING_BOX,
    DT,
    MASS_RANGE_SOLAR,
    PLOT_POINTS,
    POSITION_RANGE_AU,
    SOLAR_MASS,
    SOLAR_RADIUS,
    VELOCITY_RANGE_KMS,
    G,
)


@dataclass
class SimulationResult:
    trajectories: list  # list of np.ndarray, each shape (T, 3) in meters
    reason: str  # reason for termination
    steps: int  # number of integration steps performed
    initial_conditions: InitialConditions | None = None  # the ICs that produced this result


@dataclass
class InitialConditions:
    """Initial conditions for simulation, stored in SI units (kg, m, m/s)."""

    positions: np.ndarray  # (N, 3) in meters
    velocities: np.ndarray  # (N, 3) in m/s
    masses: np.ndarray  # (N,) in kg

    def to_vector(self) -> np.ndarray:
        """Flatten to 1D vector for optimizer. Shape: (N*3 + N*3 + N,) = 21 for 3 bodies."""
        return np.concatenate([self.positions.flatten(), self.velocities.flatten(), self.masses])

    @classmethod
    def from_vector(cls, vec: np.ndarray, num_bodies: int = 3) -> InitialConditions:
        """Reconstruct from optimizer vector."""
        pos_end = num_bodies * 3
        vel_end = pos_end + num_bodies * 3

        positions = vec[:pos_end].reshape(num_bodies, 3)
        velocities = vec[pos_end:vel_end].reshape(num_bodies, 3)
        masses = vec[vel_end:]

        return cls(positions, velocities, masses)

    def to_display_units(self) -> dict:
        """Convert to user-friendly units for display."""
        return {
            "masses_solar": self.masses / SOLAR_MASS,
            "positions_au": self.positions / AU,
            "velocities_kms": self.velocities / 1000,
        }


@dataclass
class ICBounds:
    """Bounds for initial conditions in user-facing units (solar masses, AU, km/s)."""

    mass_range_solar: tuple[float, float] = MASS_RANGE_SOLAR
    position_range_au: tuple[float, float] = POSITION_RANGE_AU
    velocity_range_kms: tuple[float, float] = VELOCITY_RANGE_KMS

    def to_si_bounds(self, num_bodies: int = 3) -> tuple[np.ndarray, np.ndarray]:
        """Convert to SI units and return (lower_bounds, upper_bounds) arrays for optimizer."""
        # Position bounds (AU -> meters)
        pos_min = self.position_range_au[0] * AU
        pos_max = self.position_range_au[1] * AU

        # Velocity bounds (km/s -> m/s)
        vel_min = self.velocity_range_kms[0] * 1000
        vel_max = self.velocity_range_kms[1] * 1000

        # Mass bounds (solar masses -> kg)
        mass_min = self.mass_range_solar[0] * SOLAR_MASS
        mass_max = self.mass_range_solar[1] * SOLAR_MASS

        # Build bounds arrays: [pos_x1, pos_y1, pos_z1, ..., vel_x1, ..., mass1, ...]
        lower = np.concatenate(
            [
                np.full(num_bodies * 3, pos_min),  # positions
                np.full(num_bodies * 3, vel_min),  # velocities
                np.full(num_bodies, mass_min),  # masses
            ]
        )

        upper = np.concatenate(
            [
                np.full(num_bodies * 3, pos_max),  # positions
                np.full(num_bodies * 3, vel_max),  # velocities
                np.full(num_bodies, mass_max),  # masses
            ]
        )

        return lower, upper


def compute_body_radius(mass_kg: float) -> float:
    """Compute stellar radius using mass-radius relation: R = R_sun * (M/M_sun)^0.8."""
    mass_solar = mass_kg / SOLAR_MASS
    return SOLAR_RADIUS * (mass_solar ** 0.8)


def random_initial_conditions(num_bodies: int = 3, seed: int | None = None, bounds: ICBounds | None = None) -> InitialConditions:
    """
    Create random initial conditions in SI units.

    Args:
        num_bodies: Number of bodies (default 3)
        seed: Random seed for reproducibility
        bounds: ICBounds specifying ranges (uses defaults if None)

    Returns:
        InitialConditions with positions (m), velocities (m/s), masses (kg)
    """
    rng = np.random.default_rng(seed)

    if bounds is None:
        bounds = ICBounds()

    # Generate in user-facing units, then convert
    # Masses (solar masses -> kg)
    masses_solar = rng.uniform(bounds.mass_range_solar[0], bounds.mass_range_solar[1], size=num_bodies)
    masses = masses_solar * SOLAR_MASS

    # Positions (AU -> meters)
    positions_au = rng.uniform(bounds.position_range_au[0], bounds.position_range_au[1], size=(num_bodies, 3))
    positions = positions_au * AU

    # Velocities (km/s -> m/s)
    velocities_kms = rng.uniform(bounds.velocity_range_kms[0], bounds.velocity_range_kms[1], size=(num_bodies, 3))
    velocities = velocities_kms * 1000

    return InitialConditions(positions, velocities, masses)


def compute_accelerations(positions: np.ndarray, masses: np.ndarray) -> np.ndarray:
    """
    Compute gravitational accelerations on each body due to all others.

    positions: (N, 3) in meters
    masses:    (N,) in kg
    returns:   (N, 3) accelerations in m/s^2
    """
    num_bodies = positions.shape[0]
    acc = np.zeros_like(positions)

    for i in range(num_bodies):
        for j in range(num_bodies):
            if i == j:
                continue
            r_vec = positions[j] - positions[i]
            dist_sq = np.dot(r_vec, r_vec) + 1e-20  # small softening to avoid div-by-zero
            inv_dist3 = 1.0 / (dist_sq * np.sqrt(dist_sq))
            acc[i] += G * masses[j] * r_vec * inv_dist3

    return acc


def check_collision(positions: np.ndarray, masses: np.ndarray) -> bool:
    """
    Return True if any pair of bodies is closer than their combined radii.
    """
    num_bodies = positions.shape[0]
    for i in range(num_bodies):
        for j in range(i + 1, num_bodies):
            dist = np.linalg.norm(positions[i] - positions[j])
            collision_dist = compute_body_radius(masses[i]) + compute_body_radius(masses[j])
            if dist < collision_dist:
                return True
    return False


def check_escape(positions: np.ndarray, bound: float = BOUNDING_BOX) -> bool:
    """
    Return True if any body is outside the bounding sphere.
    """
    for pos in positions:
        if np.linalg.norm(pos) > bound:
            return True
    return False


def simulate_three_body(
    initial_conditions: InitialConditions | None = None,
    max_steps: int = PLOT_POINTS,
    seed: int | None = None,
    bounds: ICBounds | None = None,
) -> SimulationResult:
    """
    Run one 3-body simulation and return the trajectories and stop reason.

    Args:
        initial_conditions: Pre-specified ICs (if None, generates random ones)
        max_steps: Maximum integration steps
        seed: Random seed (only used if initial_conditions is None)
        bounds: ICBounds for random generation (only used if initial_conditions is None)

    Returns:
        SimulationResult with trajectories in meters
    """
    if initial_conditions is None:
        initial_conditions = random_initial_conditions(num_bodies=3, seed=seed, bounds=bounds)

    positions = initial_conditions.positions.copy()
    velocities = initial_conditions.velocities.copy()
    masses = initial_conditions.masses.copy()

    num_bodies = len(masses)

    # Trajectories: list of lists; we'll convert to arrays at the end
    traj = [[] for _ in range(num_bodies)]

    # Initial accelerations
    acc = compute_accelerations(positions, masses)

    reason = "max_steps_reached"
    steps = 0

    for step in range(max_steps):
        # Record positions
        for i in range(num_bodies):
            traj[i].append(positions[i].copy())

        # Velocity-Verlet integration
        new_positions = positions + velocities * DT + 0.5 * acc * (DT**2)
        new_acc = compute_accelerations(new_positions, masses)
        new_velocities = velocities + 0.5 * (acc + new_acc) * DT

        positions, velocities, acc = new_positions, new_velocities, new_acc

        # Check termination conditions
        if check_collision(positions, masses):
            reason = "collision"
            steps = step + 1
            break

        if check_escape(positions):
            reason = "escaped_bounding_box"
            steps = step + 1
            break

    else:
        # If we finished the loop without breaking
        steps = max_steps

    # Convert trajectories to arrays
    traj_arrays = [np.array(body_traj) for body_traj in traj]
    return SimulationResult(traj_arrays, reason, steps, initial_conditions)
