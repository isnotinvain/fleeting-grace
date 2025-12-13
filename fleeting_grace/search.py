"""High-level search interface for finding optimal simulations."""

import os
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass

import numpy as np

from fleeting_grace.config import (
    DT,
    MAX_OPTIMIZER_ITERATIONS,
    MAX_RADIUS,
    MAX_STEPS,
    MIN_STEPS_TARGET,
    YEAR_SECONDS,
)
from fleeting_grace.optimizer import HybridOptimizer, Optimizer
from fleeting_grace.scoring import Duration, ScoreFunction
from fleeting_grace.simulation import (
    ICBounds,
    InitialConditions,
    SimulationResult,
    run_simulation,
)
from fleeting_grace.termination import (
    TerminationCondition,
    TrajectoryTooLarge,
)


@dataclass
class SearchResult:
    """Complete results from a search, including all intermediate simulations."""

    best: SimulationResult
    random_phase: list[SimulationResult]
    optimizer_phase: list[SimulationResult]


def evaluate_simulation(
    initial_conditions: InitialConditions,
    termination: TerminationCondition,
    score_fn: ScoreFunction,
    max_steps: int = MAX_STEPS,
    verbose: bool = False,
) -> tuple[float, SimulationResult]:
    """
    Run simulation with given initial conditions and evaluate.

    Args:
        initial_conditions: Initial positions, velocities, masses
        termination: Condition for early termination
        score_fn: Function to compute fitness score
        max_steps: Maximum integration steps
        verbose: Print progress updates during simulation

    Returns:
        (fitness, SimulationResult)
    """
    sim_result = run_simulation(initial_conditions, termination, max_steps, verbose)
    fitness = score_fn.score(sim_result)
    return fitness, sim_result


def find_optimal_simulation(
    termination: TerminationCondition,
    score_fn: ScoreFunction,
    optimizer: Optimizer,
    bounds: ICBounds | None = None,
    max_iterations: int = MAX_OPTIMIZER_ITERATIONS,
    max_steps: int = MAX_STEPS,
) -> SimulationResult:
    """
    Find a simulation that optimizes the given score function.

    Args:
        termination: Condition for early termination
        score_fn: Function to compute fitness score
        optimizer: Optimizer to use
        bounds: Initial condition bounds (uses defaults if None)
        max_iterations: Maximum optimizer iterations
        max_steps: Maximum simulation steps

    Returns:
        SimulationResult for the best simulation found
    """
    if bounds is None:
        bounds = ICBounds()

    # Get SI unit bounds for optimizer
    lower, upper = bounds.to_si_bounds(num_bodies=3)

    # Track evaluation count and best result
    eval_count = [0]
    best_so_far = [float("-inf")]
    best_result = [None]

    def objective(vec: np.ndarray) -> float:
        eval_count[0] += 1
        ic = InitialConditions.from_vector(vec, num_bodies=3)
        fitness, result = evaluate_simulation(ic, termination, score_fn, max_steps)

        # Update best
        if fitness > best_so_far[0]:
            best_so_far[0] = fitness
            best_result[0] = result

        # Show progress
        years = result.steps * DT / YEAR_SECONDS
        print(f"  [{eval_count[0]:3d}] fitness={fitness:5.2f}  duration={years:5.1f}yr  outcome={result.reason}")

        return fitness

    print(f"Starting optimization with {optimizer.name}")
    print(f"Termination: {termination.name}")
    print(f"Scoring: {score_fn.name}")
    print()

    # Run optimization
    opt_result = optimizer.optimize(objective, (lower, upper), max_iterations)

    print("\nOptimization complete:")
    print(f"  Iterations: {opt_result.iterations}")
    print(f"  Evaluations: {opt_result.evaluations}")
    print(f"  Best fitness: {opt_result.best_fitness:.2f}")

    return best_result[0]


def _run_one_simulation(args: tuple) -> tuple[float, SimulationResult]:
    """Worker function for parallel simulation. Must be top-level for pickling."""
    vec, termination, score_fn, max_steps = args
    ic = InitialConditions.from_vector(vec, num_bodies=3)
    sim_result = run_simulation(ic, termination, max_steps)
    fitness, breakdown = score_fn.score_with_breakdown(sim_result)
    sim_result.score_breakdown = breakdown
    return fitness, sim_result


def random_search(
    termination: TerminationCondition | None = None,
    score_fn: ScoreFunction | None = None,
    bounds: ICBounds | None = None,
    max_steps: int = MAX_STEPS,
    n_samples: int = 50,
    n_workers: int | None = None,
) -> list[tuple[float, SimulationResult]]:
    """
    Run random simulations in parallel and return sorted by score (best first).

    Args:
        termination: Condition for early termination (defaults to TrajectoryTooLarge)
        score_fn: Function to compute fitness (defaults to Duration)
        bounds: Initial condition bounds
        max_steps: Max simulation steps
        n_samples: Number of random simulations to run
        n_workers: Number of parallel workers (defaults to CPU count)

    Returns:
        List of (score, SimulationResult) tuples sorted by score (best first)
    """
    if termination is None:
        termination = TrajectoryTooLarge(MAX_RADIUS)

    if score_fn is None:
        score_fn = Duration(min_steps=MIN_STEPS_TARGET)

    if bounds is None:
        bounds = ICBounds()

    if n_workers is None:
        n_workers = os.cpu_count() or 4

    lower, upper = bounds.to_si_bounds(num_bodies=3)
    rng = np.random.default_rng()

    # Generate all random initial condition vectors upfront
    vecs = [rng.uniform(lower, upper) for _ in range(n_samples)]

    print(f"Running {n_samples} random simulations on {n_workers} workers...")
    print(f"Termination: {termination.name}")
    print(f"Scoring: {score_fn.name}")
    print()

    # Run in parallel with progress reporting
    args_list = [(vec, termination, score_fn, max_steps) for vec in vecs]
    results_with_scores: list[tuple[float, SimulationResult]] = []

    with ProcessPoolExecutor(max_workers=n_workers) as pool:
        futures = [pool.submit(_run_one_simulation, args) for args in args_list]

        for i, future in enumerate(as_completed(futures)):
            fitness, result = future.result()
            results_with_scores.append((fitness, result))
            years = result.steps * DT / YEAR_SECONDS
            print(f"  [{i + 1:3d}/{n_samples}] score={fitness:5.2f}  duration={years:5.1f}yr  outcome={result.reason}")

    # Sort by score (highest first)
    results_with_scores.sort(key=lambda x: x[0], reverse=True)

    print(f"\nBest score: {results_with_scores[0][0]:.2f}")
    print(f"Worst score: {results_with_scores[-1][0]:.2f}")

    return results_with_scores


def find_long_simulation_optimized(
    min_steps: int = MIN_STEPS_TARGET,
    max_iterations: int = MAX_OPTIMIZER_ITERATIONS,
) -> SimulationResult:
    """
    Convenience function: find a long-running simulation using hybrid optimization.

    Simulations end via collision or trajectory leaving bounding sphere.
    Fitness is based purely on duration - longer is better.

    Args:
        min_steps: Minimum target steps for bonus fitness
        max_iterations: Max optimizer iterations

    Returns:
        SimulationResult for the best simulation found
    """
    termination = TrajectoryTooLarge(MAX_RADIUS)
    score_fn = Duration(min_steps=min_steps)
    optimizer = HybridOptimizer()
    return find_optimal_simulation(termination, score_fn, optimizer, max_iterations=max_iterations)


def find_optimal_simulation_with_history(
    termination: TerminationCondition | None = None,
    score_fn: ScoreFunction | None = None,
    bounds: ICBounds | None = None,
    max_steps: int = MAX_STEPS,
    n_random: int = 50,
    n_cmaes_starts: int = 1,
    cmaes_iterations: int = 10,
) -> SearchResult:
    """
    Find optimal simulation and return all intermediate results for visualization.

    Args:
        termination: Condition for early termination (defaults to TrajectoryTooLarge)
        score_fn: Function to compute fitness (defaults to Duration)
        bounds: Initial condition bounds
        max_steps: Max simulation steps
        n_random: Number of random samples
        n_cmaes_starts: Number of CMA-ES refinement runs
        cmaes_iterations: Iterations per CMA-ES run

    Returns:
        SearchResult with best simulation and all intermediate results
    """
    if termination is None:
        termination = TrajectoryTooLarge(MAX_RADIUS)

    if score_fn is None:
        score_fn = Duration(min_steps=MIN_STEPS_TARGET)

    if bounds is None:
        bounds = ICBounds()

    # Get SI unit bounds
    lower, upper = bounds.to_si_bounds(num_bodies=3)

    # Storage for all results
    random_results: list[SimulationResult] = []
    optimizer_results: list[SimulationResult] = []
    current_phase = ["random"]  # Mutable container to track phase

    eval_count = [0]
    best_fitness = [float("-inf")]
    best_result = [None]

    def objective(vec: np.ndarray) -> float:
        eval_count[0] += 1
        ic = InitialConditions.from_vector(vec, num_bodies=3)
        fitness, result = evaluate_simulation(ic, termination, score_fn, max_steps)

        # Store result in appropriate phase list
        if current_phase[0] == "random":
            random_results.append(result)
        else:
            optimizer_results.append(result)

        # Track best
        if fitness > best_fitness[0]:
            best_fitness[0] = fitness
            best_result[0] = result

        # Show progress
        years = result.steps * DT / YEAR_SECONDS
        phase_label = "R" if current_phase[0] == "random" else "O"
        print(f"  [{phase_label}{eval_count[0]:3d}] fitness={fitness:5.2f}  duration={years:5.1f}yr  outcome={result.reason}")

        return fitness

    print(f"Starting search with {n_random} random samples + CMA-ES refinement")
    print(f"Termination: {termination.name}")
    print(f"Scoring: {score_fn.name}")
    print()

    # Phase 1: Random sampling
    print(f"Phase 1: Random sampling ({n_random} samples)...")
    rng = np.random.default_rng()
    random_samples_with_fitness = []

    for _ in range(n_random):
        x = rng.uniform(lower, upper)
        fitness = objective(x)
        random_samples_with_fitness.append((x, fitness))

    # Sort by fitness for CMA-ES starting points
    random_samples_with_fitness.sort(key=lambda t: t[1], reverse=True)
    best_random = random_samples_with_fitness[0][1]
    print(f"\nBest from random sampling: fitness={best_random:.2f}")

    # Phase 2: CMA-ES refinement
    current_phase[0] = "optimizer"
    print(f"\nPhase 2: CMA-ES refinement (top {n_cmaes_starts} candidates)...")

    import cma

    for i in range(min(n_cmaes_starts, len(random_samples_with_fitness))):
        start_x, start_fitness = random_samples_with_fitness[i]
        print(f"\n  CMA-ES run {i + 1}/{n_cmaes_starts} (starting from fitness={start_fitness:.2f}):")

        bounds_range = np.mean(upper - lower)
        sigma = 0.2 * bounds_range

        opts = {
            "bounds": [lower.tolist(), upper.tolist()],
            "maxiter": cmaes_iterations,
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

        print(f"    CMA-ES run {i + 1} complete: fitness={-es.result.fbest:.2f}")

    duration_years = best_result[0].steps * DT / YEAR_SECONDS
    print(f"\nSearch complete: {len(random_results)} random + {len(optimizer_results)} optimizer evaluations")
    print(f"Best result: {duration_years:.1f} years, {best_result[0].reason}")

    return SearchResult(
        best=best_result[0],
        random_phase=random_results,
        optimizer_phase=optimizer_results,
    )


def format_simulation_info(result: SimulationResult) -> str:
    """Format simulation results with real physical units for display."""
    if result.initial_conditions is None:
        return "No initial conditions recorded."

    ic = result.initial_conditions
    display = ic.to_display_units()

    masses = display["masses_solar"]
    positions = display["positions_au"]
    velocities = display["velocities_kms"]

    duration_years = result.steps * DT / YEAR_SECONDS

    lines = [
        "=" * 60,
        "SIMULATION RESULTS",
        "=" * 60,
        "",
        "Initial Conditions:",
        f"  Body 1: {masses[0]:6.1f} M_sun at ({positions[0][0]:+6.1f}, {positions[0][1]:+6.1f}, {positions[0][2]:+6.1f}) AU",
        f"          velocity ({velocities[0][0]:+5.1f}, {velocities[0][1]:+5.1f}, {velocities[0][2]:+5.1f}) km/s",
        f"  Body 2: {masses[1]:6.1f} M_sun at ({positions[1][0]:+6.1f}, {positions[1][1]:+6.1f}, {positions[1][2]:+6.1f}) AU",
        f"          velocity ({velocities[1][0]:+5.1f}, {velocities[1][1]:+5.1f}, {velocities[1][2]:+5.1f}) km/s",
        f"  Body 3: {masses[2]:6.1f} M_sun at ({positions[2][0]:+6.1f}, {positions[2][1]:+6.1f}, {positions[2][2]:+6.1f}) AU",
        f"          velocity ({velocities[2][0]:+5.1f}, {velocities[2][1]:+5.1f}, {velocities[2][2]:+5.1f}) km/s",
        "",
        f"Duration: {duration_years:.1f} years ({result.steps:,} integration steps)",
        f"Outcome: {result.reason}",
        "=" * 60,
    ]

    return "\n".join(lines)
