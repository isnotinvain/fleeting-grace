"""Scoring functions for evaluating simulation quality."""

from abc import ABC, abstractmethod

import numpy as np

from fleeting_grace.config import DT, MIN_STEPS_TARGET, YEAR_SECONDS
from fleeting_grace.simulation import SimulationResult


class ScoreFunction(ABC):
    """Base class for simulation scoring functions."""

    @abstractmethod
    def score(self, sim_result: SimulationResult) -> float:
        """Compute fitness score for a completed simulation."""
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable name for this score function."""
        pass

    def __add__(self, other: "ScoreFunction") -> "Sum":
        return Sum(self, other)

    def __mul__(self, weight: float) -> "Weighted":
        return Weighted((self, weight))

    def __rmul__(self, weight: float) -> "Weighted":
        return Weighted((self, weight))


class Duration(ScoreFunction):
    """Score based on simulation duration."""

    def __init__(self, min_steps: int = MIN_STEPS_TARGET, bonus: float = 2.0):
        self.min_steps = min_steps
        self.bonus = bonus

    def score(self, sim_result: SimulationResult) -> float:
        base = sim_result.steps / self.min_steps
        b = self.bonus if sim_result.steps >= self.min_steps else 0.0
        return base + b

    @property
    def name(self) -> str:
        min_years = self.min_steps * DT / YEAR_SECONDS
        return f"Duration(min={min_years:.0f}yr)"


class SpaceFilling(ScoreFunction):
    """Score based on how much of the bounding volume is filled by trajectories."""

    def __init__(self, grid_resolution: int = 20, sample_stride: int = 100):
        """
        Args:
            grid_resolution: Grid divisions per axis (20 = 8000 voxels)
            sample_stride: Sample every Nth point to speed up computation
        """
        self.grid_resolution = grid_resolution
        self.sample_stride = sample_stride

    def score(self, sim_result: SimulationResult) -> float:
        trajectories = sim_result.trajectories
        if not trajectories or all(len(t) == 0 for t in trajectories):
            return 0.0

        # Compute bounding box from all trajectory points
        all_points = []
        for traj in trajectories:
            if len(traj) > 0:
                # Sample every Nth point
                all_points.append(traj[:: self.sample_stride])

        if not all_points:
            return 0.0

        all_pts = np.concatenate(all_points, axis=0)
        bbox_min = np.min(all_pts, axis=0)
        bbox_max = np.max(all_pts, axis=0)
        bbox_size = bbox_max - bbox_min

        # Handle degenerate cases
        if np.any(bbox_size <= 0):
            bbox_size = np.maximum(bbox_size, 1e-10)

        # Discretize into grid cells
        occupied_cells = set()
        for pt in all_pts:
            normalized = (pt - bbox_min) / bbox_size
            normalized = np.clip(normalized, 0, 0.9999)
            indices = tuple((normalized * self.grid_resolution).astype(int))
            occupied_cells.add(indices)

        # Coverage ratio
        total_cells = self.grid_resolution ** 3
        coverage = len(occupied_cells) / total_cells

        return coverage

    @property
    def name(self) -> str:
        return f"SpaceFilling(grid={self.grid_resolution}³)"


class Weighted(ScoreFunction):
    """Weighted combination of score functions."""

    def __init__(self, *pairs: tuple[ScoreFunction, float]):
        self.pairs = list(pairs)

    def score(self, sim_result: SimulationResult) -> float:
        return sum(fn.score(sim_result) * weight for fn, weight in self.pairs)

    def __add__(self, other: "ScoreFunction") -> "Weighted":
        if isinstance(other, Weighted):
            return Weighted(*self.pairs, *other.pairs)
        return Weighted(*self.pairs, (other, 1.0))

    def __mul__(self, weight: float) -> "Weighted":
        # Scale all weights
        return Weighted(*[(fn, w * weight) for fn, w in self.pairs])

    def __rmul__(self, weight: float) -> "Weighted":
        return self.__mul__(weight)

    @property
    def name(self) -> str:
        parts = [f"{weight:.1f}*{fn.name}" for fn, weight in self.pairs]
        return f"Weighted({', '.join(parts)})"


class Sum(ScoreFunction):
    """Sum of score functions (unweighted)."""

    def __init__(self, *fns: ScoreFunction):
        self.fns = list(fns)

    def score(self, sim_result: SimulationResult) -> float:
        return sum(fn.score(sim_result) for fn in self.fns)

    def __add__(self, other: "ScoreFunction") -> "Sum":
        if isinstance(other, Sum):
            return Sum(*self.fns, *other.fns)
        return Sum(*self.fns, other)

    @property
    def name(self) -> str:
        return " + ".join(fn.name for fn in self.fns)
