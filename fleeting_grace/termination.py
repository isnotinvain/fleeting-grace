"""Termination conditions for simulations."""

from abc import ABC, abstractmethod

import numpy as np

from fleeting_grace.config import AU, BOUNDING_BOX


class TerminationCondition(ABC):
    """Base class for simulation termination conditions."""

    @abstractmethod
    def check(
        self,
        positions: np.ndarray,
        velocities: np.ndarray,
        masses: np.ndarray,
        step: int,
    ) -> bool:
        """Return True if simulation should terminate."""
        pass

    def reset(self):
        """Reset state for new simulation. Override for stateful conditions."""
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable name for this condition."""
        pass

    def __or__(self, other: "TerminationCondition") -> "Or":
        return Or(self, other)

    def __and__(self, other: "TerminationCondition") -> "And":
        return And(self, other)


class Escape(TerminationCondition):
    """Terminate if any body exceeds a distance from origin."""

    def __init__(self, radius: float = BOUNDING_BOX):
        self.radius = radius

    def check(self, positions, velocities, masses, step) -> bool:
        distances = np.linalg.norm(positions, axis=1)
        return np.max(distances) > self.radius

    @property
    def name(self) -> str:
        return f"Escape({self.radius / AU:.0f}AU)"


class TrajectoryTooLarge(TerminationCondition):
    """Terminate if the bounding sphere of all trajectory points exceeds a radius."""

    def __init__(self, radius: float = BOUNDING_BOX):
        self.radius = radius
        self._bbox_min = np.full(3, np.inf)
        self._bbox_max = np.full(3, -np.inf)

    def reset(self):
        self._bbox_min = np.full(3, np.inf)
        self._bbox_max = np.full(3, -np.inf)

    def check(self, positions, velocities, masses, step) -> bool:
        for pos in positions:
            self._bbox_min = np.minimum(self._bbox_min, pos)
            self._bbox_max = np.maximum(self._bbox_max, pos)
        diagonal = np.linalg.norm(self._bbox_max - self._bbox_min)
        return diagonal / 2 > self.radius

    @property
    def name(self) -> str:
        return f"TrajectoryTooLarge({self.radius / AU:.0f}AU)"


class Or(TerminationCondition):
    """Terminate if any of the conditions are met."""

    def __init__(self, *conditions: TerminationCondition):
        self.conditions = conditions

    def reset(self):
        for c in self.conditions:
            c.reset()

    def check(self, positions, velocities, masses, step) -> bool:
        return any(c.check(positions, velocities, masses, step) for c in self.conditions)

    @property
    def name(self) -> str:
        names = " | ".join(c.name for c in self.conditions)
        return f"({names})"


class And(TerminationCondition):
    """Terminate only if all conditions are met."""

    def __init__(self, *conditions: TerminationCondition):
        self.conditions = conditions

    def reset(self):
        for c in self.conditions:
            c.reset()

    def check(self, positions, velocities, masses, step) -> bool:
        return all(c.check(positions, velocities, masses, step) for c in self.conditions)

    @property
    def name(self) -> str:
        names = " & ".join(c.name for c in self.conditions)
        return f"({names})"
