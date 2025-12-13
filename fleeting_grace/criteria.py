"""Criteria system for evaluating simulation quality."""

from abc import ABC, abstractmethod

import numpy as np

from fleeting_grace.config import (
    AU,
    DEFAULT_BOUNDING_RADIUS,
    DT,
    MIN_STEPS_TARGET,
    YEAR_SECONDS,
)
from fleeting_grace.simulation import SimulationResult


class Criterion(ABC):
    """Abstract base class for simulation criteria."""

    @abstractmethod
    def should_terminate(
        self,
        positions: np.ndarray,  # (N, 3) current positions in meters
        velocities: np.ndarray,  # (N, 3) current velocities in m/s
        masses: np.ndarray,  # (N,) masses in kg
        step: int,  # Current timestep
    ) -> bool:
        """Return True if simulation should stop early based on criterion."""
        pass

    @abstractmethod
    def compute_fitness(self, sim_result: SimulationResult) -> float:
        """Compute final fitness score from completed simulation."""
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable name for this criterion."""
        pass


class BoundedSphereCriterion(Criterion):
    """
    Bodies must stay within a sphere of radius R for at least N steps.
    Terminates early if any body exits the sphere.
    """

    def __init__(
        self,
        radius: float = DEFAULT_BOUNDING_RADIUS,
        min_steps: int = MIN_STEPS_TARGET,
        center: np.ndarray | None = None,
    ):
        """
        Args:
            radius: Sphere radius in meters (default 100 AU)
            min_steps: Target minimum steps for bonus
            center: Center of sphere (default origin)
        """
        self.radius = radius
        self.min_steps = min_steps
        self.center = center if center is not None else np.zeros(3)

    def should_terminate(
        self,
        positions: np.ndarray,
        velocities: np.ndarray,
        masses: np.ndarray,
        step: int,
    ) -> bool:
        # Terminate if any body is outside the sphere
        distances = np.linalg.norm(positions - self.center, axis=1)
        return np.max(distances) > self.radius

    def compute_fitness(self, sim_result: SimulationResult) -> float:
        """Fitness based on duration with bonus for reaching target."""
        step_fitness = sim_result.steps / self.min_steps
        bonus = 2.0 if sim_result.steps >= self.min_steps else 0.0
        return step_fitness + bonus

    @property
    def name(self) -> str:
        radius_au = self.radius / AU
        min_time_years = self.min_steps * DT / YEAR_SECONDS
        return f"BoundedSphere(R={radius_au:.0f}AU, min_time={min_time_years:.0f}yr)"


class MinDurationCriterion(Criterion):
    """
    Simple criterion: rewards longer simulations.
    Never terminates early - lets simulation run until escape/collision.
    """

    def __init__(self, min_steps: int = MIN_STEPS_TARGET):
        self.min_steps = min_steps

    def should_terminate(
        self,
        positions: np.ndarray,
        velocities: np.ndarray,
        masses: np.ndarray,
        step: int,
    ) -> bool:
        # Never terminate early
        return False

    def compute_fitness(self, sim_result: SimulationResult) -> float:
        step_fitness = sim_result.steps / self.min_steps
        bonus = 2.0 if sim_result.steps >= self.min_steps else 0.0
        return step_fitness + bonus

    @property
    def name(self) -> str:
        min_time_years = self.min_steps * DT / YEAR_SECONDS
        return f"MinDuration(min_time={min_time_years:.0f}yr)"
