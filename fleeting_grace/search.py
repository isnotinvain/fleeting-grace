"""High-level search interface for finding optimal simulations."""

import sys
from dataclasses import dataclass

import numpy as np

from fleeting_grace.config import (
    DT,
    MAX_OPTIMIZER_ITERATIONS,
    MIN_STEPS_TARGET,
    PLOT_POINTS,
    PROBE_STEPS,
    YEAR_SECONDS,
)
from fleeting_grace.criteria import Criterion, MinDurationCriterion
from fleeting_grace.optimizer import HybridOptimizer, Optimizer
from fleeting_grace.simulation import (
    ICBounds,
    InitialConditions,
    SimulationResult,
    TrajectoryBounds,
    check_collision,
    compute_accelerations,
)


@dataclass
class SearchResult:
    """Complete results from a search, including all intermediate simulations."""

    best: SimulationResult
    random_phase: list[SimulationResult]
    optimizer_phase: list[SimulationResult]


def evaluate_simulation(
    initial_conditions: InitialConditions,
    criterion: Criterion,
    max_steps: int = PLOT_POINTS,
    verbose: bool = False,
    max_trajectory_radius: float | None = None,
) -> tuple[float, SimulationResult]:
    """
    Run simulation with given initial conditions and evaluate against criterion.

    Args:
        initial_conditions: Initial positions, velocities, masses
        criterion: Criterion to evaluate against
        max_steps: Maximum integration steps
        verbose: Print progress updates during simulation
        max_trajectory_radius: Stop if trajectory bounding sphere exceeds this

    Returns:
        (fitness, SimulationResult)
    """
    from fleeting_grace.config import BOUNDING_BOX

    if max_trajectory_radius is None:
        max_trajectory_radius = BOUNDING_BOX

    positions = initial_conditions.positions.copy()
    velocities = initial_conditions.velocities.copy()
    masses = initial_conditions.masses.copy()

    num_bodies = len(masses)

    # Storage for trajectories and criterion results
    trajectories = [[] for _ in range(num_bodies)]
    step_results = []

    # Track bounding sphere of all trajectory points
    traj_bounds = TrajectoryBounds(max_radius=max_trajectory_radius)

    # Initial accelerations
    acc = compute_accelerations(positions, masses)

    termination_reason = "max_steps_reached"
    steps_run = 0

    # Progress tracking
    progress_interval = max(1, max_steps // 10)

    for step in range(max_steps):
        # Print progress
        if verbose and step > 0 and step % progress_interval == 0:
            pct = 100 * step // max_steps
            years = step * DT / YEAR_SECONDS
            print(f"      Simulating... {pct}% ({years:.1f} years)    ", end="\r")
            sys.stdout.flush()
        # Record positions
        for i in range(num_bodies):
            trajectories[i].append(positions[i].copy())

        # Add to trajectory bounds tracking and check limit
        if traj_bounds.add_positions(positions):
            termination_reason = "trajectory_too_large"
            steps_run = step + 1
            break

        # Evaluate criterion at this step
        result = criterion.evaluate_step(positions, velocities, masses, step)
        step_results.append(result)

        # Check if criterion wants to terminate
        if result.should_terminate:
            termination_reason = "criterion_terminated"
            steps_run = step + 1
            break

        # Velocity-Verlet integration
        new_positions = positions + velocities * DT + 0.5 * acc * (DT**2)
        new_acc = compute_accelerations(new_positions, masses)
        new_velocities = velocities + 0.5 * (acc + new_acc) * DT

        positions, velocities, acc = new_positions, new_velocities, new_acc

        # Check collision
        if check_collision(positions, masses):
            termination_reason = "collision"
            steps_run = step + 1
            break

    else:
        # If we finished the loop without breaking
        steps_run = max_steps

    # Compute final fitness
    fitness = criterion.compute_fitness(step_results, steps_run, termination_reason)

    # Convert trajectories to arrays
    traj_arrays = [np.array(t) for t in trajectories]
    sim_result = SimulationResult(traj_arrays, termination_reason, steps_run, initial_conditions)

    return fitness, sim_result


def find_optimal_simulation(
    criterion: Criterion,
    optimizer: Optimizer,
    bounds: ICBounds | None = None,
    max_iterations: int = MAX_OPTIMIZER_ITERATIONS,
    max_steps: int = PLOT_POINTS,
) -> SimulationResult:
    """
    Find a simulation that optimizes the given criterion.

    Args:
        criterion: Criterion to optimize for
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

    # Create objective function with progress updates
    # Use shorter probe simulations during optimization for speed
    probe_steps = min(PROBE_STEPS, max_steps)

    def objective(vec: np.ndarray) -> float:
        eval_count[0] += 1
        ic = InitialConditions.from_vector(vec, num_bodies=3)
        fitness, result = evaluate_simulation(ic, criterion, probe_steps)

        # Update best
        if fitness > best_so_far[0]:
            best_so_far[0] = fitness

        # Show progress
        years = result.steps * DT / YEAR_SECONDS
        print(f"  [{eval_count[0]:3d}] fitness={fitness:5.2f}  duration={years:5.1f}yr  outcome={result.reason}")

        return fitness

    print(f"Starting optimization with {optimizer.name}")
    print(f"Criterion: {criterion.name}")
    print()

    # Run optimization
    opt_result = optimizer.optimize(objective, (lower, upper), max_iterations)

    # Reconstruct best initial conditions and run full simulation with verbose output
    print("\nRunning final simulation with best parameters...")
    best_ic = InitialConditions.from_vector(opt_result.best_vector, num_bodies=3)
    _, sim_result = evaluate_simulation(best_ic, criterion, max_steps, verbose=True)
    print()  # Clear the progress line

    print("Optimization complete:")
    print(f"  Iterations: {opt_result.iterations}")
    print(f"  Evaluations: {opt_result.evaluations}")
    print(f"  Best fitness: {opt_result.best_fitness:.2f}")

    return sim_result


def find_long_simulation_optimized(
    min_steps: int = MIN_STEPS_TARGET,
    max_iterations: int = MAX_OPTIMIZER_ITERATIONS,
) -> SimulationResult:
    """
    Convenience function: find a long-running simulation using hybrid optimization.

    Simulations end naturally via collision or escape (leaving 150 AU bounding box).
    Fitness is based purely on duration - longer is better.

    Args:
        min_steps: Minimum target steps for bonus fitness
        max_iterations: Max optimizer iterations

    Returns:
        SimulationResult for the best simulation found
    """
    criterion = MinDurationCriterion(min_steps=min_steps)
    optimizer = HybridOptimizer()
    return find_optimal_simulation(criterion, optimizer, max_iterations=max_iterations)


def find_optimal_simulation_with_history(
    criterion: Criterion | None = None,
    optimizer: Optimizer | None = None,
    bounds: ICBounds | None = None,
    max_iterations: int = MAX_OPTIMIZER_ITERATIONS,
    max_steps: int = PLOT_POINTS,
    n_random: int = 50,
    n_cmaes_starts: int = 1,
    cmaes_iterations: int = 10,
) -> SearchResult:
    """
    Find optimal simulation and return all intermediate results for visualization.

    Args:
        criterion: Criterion to optimize for (defaults to MinDurationCriterion)
        optimizer: Optimizer to use (defaults to HybridOptimizer with given params)
        bounds: Initial condition bounds
        max_iterations: Max optimizer iterations
        max_steps: Max simulation steps for final result
        n_random: Number of random samples
        n_cmaes_starts: Number of CMA-ES refinement runs
        cmaes_iterations: Iterations per CMA-ES run

    Returns:
        SearchResult with best simulation and all intermediate results
    """
    if criterion is None:
        criterion = MinDurationCriterion(min_steps=MIN_STEPS_TARGET)

    if bounds is None:
        bounds = ICBounds()

    # Get SI unit bounds
    lower, upper = bounds.to_si_bounds(num_bodies=3)
    probe_steps = min(PROBE_STEPS, max_steps)

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
        fitness, result = evaluate_simulation(ic, criterion, probe_steps)

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
    print(f"Criterion: {criterion.name}")
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

    # Run full simulation with best parameters
    print("\nRunning final simulation with best parameters...")
    best_ic = best_result[0].initial_conditions
    _, final_result = evaluate_simulation(best_ic, criterion, max_steps, verbose=True)
    print()

    duration_years = final_result.steps * DT / YEAR_SECONDS
    print(f"Search complete: {len(random_results)} random + {len(optimizer_results)} optimizer evaluations")
    print(f"Best result: {duration_years:.1f} years, {final_result.reason}")

    return SearchResult(
        best=final_result,
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
