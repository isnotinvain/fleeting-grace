"""Optimizer system for finding good initial conditions."""

from abc import ABC, abstractmethod
from collections.abc import Callable
from dataclasses import dataclass

import numpy as np

from fleeting_grace.config import (
    CMAES_SIGMA0,
    HYBRID_CMAES_ITERATIONS,
    HYBRID_CMAES_STARTS,
    HYBRID_RANDOM_SAMPLES,
)


@dataclass
class OptimizationResult:
    """Result of an optimization run."""

    best_vector: np.ndarray
    best_fitness: float
    iterations: int
    evaluations: int
    converged: bool
    history: list[float] | None = None


class Optimizer(ABC):
    """Abstract base class for all optimization strategies."""

    @abstractmethod
    def optimize(
        self,
        objective: Callable[[np.ndarray], float],
        bounds: tuple[np.ndarray, np.ndarray],
        max_iterations: int = 100,
    ) -> OptimizationResult:
        """
        Run optimization.

        Args:
            objective: Function to MAXIMIZE (higher = better fitness)
            bounds: (lower_bounds, upper_bounds) arrays
            max_iterations: Maximum iterations/evaluations

        Returns:
            OptimizationResult with best solution found
        """
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable name for this optimizer."""
        pass


class RandomSearchOptimizer(Optimizer):
    """
    Pure random search - samples random points and keeps the best.
    Equivalent to the original find_long_simulation() behavior.
    """

    def __init__(self, seed: int | None = None):
        self.seed = seed

    def optimize(
        self,
        objective: Callable[[np.ndarray], float],
        bounds: tuple[np.ndarray, np.ndarray],
        max_iterations: int = 100,
    ) -> OptimizationResult:
        rng = np.random.default_rng(self.seed)
        lower, upper = bounds

        best_vector = None
        best_fitness = float("-inf")
        history = []

        for i in range(max_iterations):
            # Sample random point within bounds
            x = rng.uniform(lower, upper)
            fitness = objective(x)
            history.append(fitness)

            if fitness > best_fitness:
                best_fitness = fitness
                best_vector = x.copy()

        return OptimizationResult(
            best_vector=best_vector,
            best_fitness=best_fitness,
            iterations=max_iterations,
            evaluations=max_iterations,
            converged=False,  # Random search doesn't "converge"
            history=history,
        )

    @property
    def name(self) -> str:
        return "RandomSearch"


class CMAESOptimizer(Optimizer):
    """
    CMA-ES (Covariance Matrix Adaptation Evolution Strategy) optimizer.
    Ideal for derivative-free optimization of chaotic systems.
    """

    def __init__(
        self,
        sigma0: float = CMAES_SIGMA0,
        population_size: int | None = None,
        seed: int | None = None,
    ):
        """
        Args:
            sigma0: Initial step size (relative to bounds range)
            population_size: Population size (None = auto based on dimension)
            seed: Random seed for reproducibility
        """
        self.sigma0 = sigma0
        self.population_size = population_size
        self.seed = seed

    def optimize(
        self,
        objective: Callable[[np.ndarray], float],
        bounds: tuple[np.ndarray, np.ndarray],
        max_iterations: int = 100,
    ) -> OptimizationResult:
        import cma

        lower, upper = bounds

        # Generate random starting point within bounds
        rng = np.random.default_rng(self.seed)
        initial_guess = rng.uniform(lower, upper)

        # Scale sigma0 by the average bounds range
        bounds_range = np.mean(upper - lower)
        sigma = self.sigma0 * bounds_range

        opts = {
            "bounds": [lower.tolist(), upper.tolist()],
            "maxiter": max_iterations,
            "verbose": -9,  # Suppress CMA-ES output
            "seed": self.seed if self.seed is not None else np.random.randint(0, 2**31),
        }
        if self.population_size:
            opts["popsize"] = self.population_size

        # CMA-ES minimizes, so we negate our objective
        def neg_objective(x):
            return -objective(x)

        es = cma.CMAEvolutionStrategy(initial_guess, sigma, opts)

        history = []
        evaluations = 0

        while not es.stop():
            solutions = es.ask()
            fitnesses = [neg_objective(x) for x in solutions]
            es.tell(solutions, fitnesses)
            evaluations += len(solutions)
            history.append(-es.result.fbest)  # Store positive fitness

        result = es.result
        return OptimizationResult(
            best_vector=result.xbest,
            best_fitness=-result.fbest,  # Negate back to positive
            iterations=result.iterations,
            evaluations=evaluations,
            converged=bool(es.stop()),
            history=history,
        )

    @property
    def name(self) -> str:
        return f"CMA-ES(sigma0={self.sigma0})"


class HybridOptimizer(Optimizer):
    """
    Hybrid optimization strategy:
    1. Random sampling phase to find promising regions
    2. CMA-ES refinement from best random samples
    """

    def __init__(
        self,
        n_random_samples: int = HYBRID_RANDOM_SAMPLES,
        n_cmaes_starts: int = HYBRID_CMAES_STARTS,
        cmaes_iterations: int = HYBRID_CMAES_ITERATIONS,
        seed: int | None = None,
    ):
        """
        Args:
            n_random_samples: Number of random samples in phase 1
            n_cmaes_starts: Number of CMA-ES runs from best samples
            cmaes_iterations: Iterations per CMA-ES run
            seed: Random seed for reproducibility
        """
        self.n_random_samples = n_random_samples
        self.n_cmaes_starts = n_cmaes_starts
        self.cmaes_iterations = cmaes_iterations
        self.seed = seed

    def optimize(
        self,
        objective: Callable[[np.ndarray], float],
        bounds: tuple[np.ndarray, np.ndarray],
        max_iterations: int = 100,
    ) -> OptimizationResult:
        import cma

        rng = np.random.default_rng(self.seed)
        lower, upper = bounds

        # Phase 1: Random sampling
        print(f"Phase 1: Random sampling ({self.n_random_samples} samples)...")
        random_samples = []
        for i in range(self.n_random_samples):
            x = rng.uniform(lower, upper)
            fitness = objective(x)
            random_samples.append((x, fitness))

        # Sort by fitness (descending - higher is better)
        random_samples.sort(key=lambda t: t[1], reverse=True)
        best_random = random_samples[0][1]
        print(f"\nBest from random sampling: fitness={best_random:.2f}")

        # Phase 2: CMA-ES from top samples
        print(f"\nPhase 2: CMA-ES refinement (top {self.n_cmaes_starts} candidates)...")
        best_result = None
        total_evaluations = self.n_random_samples

        for i in range(min(self.n_cmaes_starts, len(random_samples))):
            start_x, start_fitness = random_samples[i]
            print(f"\n  CMA-ES run {i + 1}/{self.n_cmaes_starts} (starting from fitness={start_fitness:.2f}):")

            # Scale sigma by bounds range
            bounds_range = np.mean(upper - lower)
            sigma = 0.2 * bounds_range  # Smaller sigma for refinement

            opts = {
                "bounds": [lower.tolist(), upper.tolist()],
                "maxiter": self.cmaes_iterations,
                "verbose": -9,
                "seed": rng.integers(0, 2**31),
            }

            def neg_objective(x):
                return -objective(x)

            es = cma.CMAEvolutionStrategy(start_x, sigma, opts)

            while not es.stop():
                solutions = es.ask()
                fitnesses = [neg_objective(x) for x in solutions]
                es.tell(solutions, fitnesses)
                total_evaluations += len(solutions)

            result_fitness = -es.result.fbest
            print(f"    CMA-ES run {i + 1} complete: fitness={result_fitness:.2f}")

            if best_result is None or result_fitness > best_result.best_fitness:
                best_result = OptimizationResult(
                    best_vector=es.result.xbest,
                    best_fitness=result_fitness,
                    iterations=es.result.iterations,
                    evaluations=total_evaluations,
                    converged=True,
                    history=None,
                )

        print(f"\nBest after optimization: fitness={best_result.best_fitness:.2f}")
        return best_result

    @property
    def name(self) -> str:
        return f"Hybrid(random={self.n_random_samples}, cmaes_starts={self.n_cmaes_starts})"
