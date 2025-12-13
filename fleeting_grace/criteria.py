"""Criteria system for evaluating simulation quality."""

from abc import ABC, abstractmethod
from dataclasses import dataclass

import numpy as np

from fleeting_grace.config import (
    AU,
    DEFAULT_BOUNDING_RADIUS,
    DT,
    EARLY_WEIGHT_DECAY,
    MIN_STEPS_TARGET,
    YEAR_SECONDS,
)


@dataclass
class CriterionResult:
    """Result of evaluating a criterion at a single timestep."""

    satisfied: bool  # Is the criterion satisfied at this step?
    score: float  # Continuous score (higher = better)
    should_terminate: bool  # Should we stop the simulation?


class Criterion(ABC):
    """Abstract base class for simulation criteria."""

    @abstractmethod
    def evaluate_step(
        self,
        positions: np.ndarray,  # (N, 3) current positions in meters
        velocities: np.ndarray,  # (N, 3) current velocities in m/s
        masses: np.ndarray,  # (N,) masses in kg
        step: int,  # Current timestep
    ) -> CriterionResult:
        """Evaluate criterion at a single timestep."""
        pass

    @abstractmethod
    def compute_fitness(
        self,
        step_results: list[CriterionResult],
        total_steps_run: int,
        termination_reason: str,
    ) -> float:
        """Compute final fitness score from all step evaluations."""
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable name for this criterion."""
        pass


class BoundedSphereCriterion(Criterion):
    """
    Bodies must stay within a sphere of radius R for at least N steps.

    Fitness rewards:
    - More steps before any body exits
    - Bodies staying closer to center (margin within sphere)
    - Early timesteps weighted more heavily (configurable)
    """

    def __init__(
        self,
        radius: float = DEFAULT_BOUNDING_RADIUS,
        min_steps: int = MIN_STEPS_TARGET,
        early_weight_decay: float = EARLY_WEIGHT_DECAY,
        center: np.ndarray | None = None,
    ):
        """
        Args:
            radius: Sphere radius in meters (default 100 AU)
            min_steps: Target minimum steps (default ~150k for 15 years)
            early_weight_decay: Weight = decay^step (default 0.9999)
            center: Center of sphere (default origin)
        """
        self.radius = radius
        self.min_steps = min_steps
        self.early_weight_decay = early_weight_decay
        self.center = center if center is not None else np.zeros(3)

    def evaluate_step(
        self,
        positions: np.ndarray,
        velocities: np.ndarray,
        masses: np.ndarray,
        step: int,
    ) -> CriterionResult:
        # Compute distance from center for each body
        distances = np.linalg.norm(positions - self.center, axis=1)
        max_distance = np.max(distances)

        inside_sphere = max_distance <= self.radius

        # Score: how much margin we have (normalized to [0, 1])
        # 1.0 = all bodies at center, 0.0 = touching boundary
        margin = max(0, (self.radius - max_distance) / self.radius)

        # Weight by step (early steps matter more)
        weight = self.early_weight_decay**step
        weighted_score = margin * weight

        return CriterionResult(
            satisfied=inside_sphere,
            score=weighted_score,
            should_terminate=not inside_sphere,
        )

    def compute_fitness(
        self,
        step_results: list[CriterionResult],
        total_steps_run: int,
        termination_reason: str,
    ) -> float:
        """
        Fitness = steps_run / min_steps + accumulated_margin_score + bonus

        - Primary: number of steps before exit (normalized by target)
        - Secondary: accumulated margin scores (weighted by step)
        - Bonus if we reached min_steps
        """
        # Base fitness: normalized steps (1.0 = reached target)
        step_fitness = total_steps_run / self.min_steps

        # Accumulated margin scores (already weighted by step)
        accumulated_score = sum(r.score for r in step_results) / max(1, len(step_results))

        # Bonus for reaching target
        bonus = 2.0 if total_steps_run >= self.min_steps else 0.0

        # Combine: steps are primary, margin is secondary
        return step_fitness + 0.1 * accumulated_score + bonus

    @property
    def name(self) -> str:
        radius_au = self.radius / AU
        min_time_years = self.min_steps * DT / YEAR_SECONDS
        return f"BoundedSphere(R={radius_au:.0f}AU, min_time={min_time_years:.0f}yr)"


class MinDurationCriterion(Criterion):
    """
    Simple criterion: simulation must run for at least N steps.
    No spatial constraints - just rewards longer simulations.
    """

    def __init__(self, min_steps: int = MIN_STEPS_TARGET):
        self.min_steps = min_steps

    def evaluate_step(
        self,
        positions: np.ndarray,
        velocities: np.ndarray,
        masses: np.ndarray,
        step: int,
    ) -> CriterionResult:
        # Never terminates early - let simulation run until escape/collision
        return CriterionResult(satisfied=True, score=1.0, should_terminate=False)

    def compute_fitness(
        self,
        step_results: list[CriterionResult],
        total_steps_run: int,
        termination_reason: str,
    ) -> float:
        # Pure duration-based fitness
        step_fitness = total_steps_run / self.min_steps
        bonus = 2.0 if total_steps_run >= self.min_steps else 0.0
        return step_fitness + bonus

    @property
    def name(self) -> str:
        min_time_years = self.min_steps * DT / YEAR_SECONDS
        return f"MinDuration(min_time={min_time_years:.0f}yr)"
