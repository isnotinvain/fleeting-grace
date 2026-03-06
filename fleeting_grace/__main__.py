"""Main entry point for running as a module: python -m fleeting_grace"""

import argparse

from fleeting_grace.config import MAX_RADIUS, OUTPUT_OBJ_FILE
from fleeting_grace.export import write_trajectories_to_obj
from fleeting_grace.mesh import simulate_from_base64
from fleeting_grace.scoring import (
    Complexity,
    CurvatureVariance,
    DirectionEntropy,
    Interweaving,
    SpaceFilling,
    SweepingArcs,
    Tortuosity,
    TotalDistance,
)
from fleeting_grace.search import format_simulation_info, random_search
from fleeting_grace.simulation import ICBounds, InitialConditions, run_simulation
from fleeting_grace.termination import TrajectoryTooLarge
from fleeting_grace.viewer import export_viewer_html


def _load_base64_file(path: str) -> list[str]:
    """Load base64-encoded trajectory strings from a file, ignoring comments and blank lines."""
    lines = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#"):
                lines.append(line)
    return lines


def main():
    parser = argparse.ArgumentParser(description="Find aesthetically interesting 3-body simulations")
    parser.add_argument("--no-viewer", action="store_true", help="Skip opening Three.js viewer")
    parser.add_argument("--mesh", action="store_true", help="Include 3D mesh views (tapered pipes) alongside line views")
    parser.add_argument("--no-export", action="store_true", help="Skip OBJ file export")
    parser.add_argument("-n", type=int, default=50, help="Number of random simulations (default: 50)")
    parser.add_argument("--load", type=str, metavar="FILE", help="Load base64-encoded trajectories from a file (one per line, # comments ignored)")
    parser.add_argument("--export-mesh", type=str, metavar="BASE64", help="Export a mesh from a single base64-encoded trajectory and exit")
    parser.add_argument("--export-mesh-format", type=str, default="obj", choices=["obj", "stl"], help="Mesh export format (default: obj)")
    parser.add_argument("--export-mesh-output", type=str, default=None, metavar="FILE", help="Mesh output path (default: trajectory_mesh.obj/stl)")
    parser.add_argument("--optimize", action="store_true", help="Run L-BFGS-B optimization from best random result")
    parser.add_argument("--optimize-iters", type=int, default=100, help="Max iterations for optimizer (default: 100)")
    parser.add_argument("--optimize-velocities-only", action="store_true", help="Only optimize velocities (faster, 9 params instead of 21)")
    parser.add_argument("--hillclimb", action="store_true", help="Run parallel hill climber from best random result")
    parser.add_argument("--hillclimb-iters", type=int, default=20, help="Hill climber iterations (default: 20)")
    args = parser.parse_args()

    # Export mesh from a single base64 and exit
    if args.export_mesh:
        from fleeting_grace.mesh import create_mesh_from_base64

        fmt = args.export_mesh_format
        output = args.export_mesh_output or f"trajectory_mesh.{fmt}"
        path = create_mesh_from_base64(args.export_mesh, output, format=fmt)
        print(f"Mesh written to: {path}")
        return

    # Score function: weighted combination of aesthetic metrics (all 0-1)
    score_fn = (
        0.0 * Tortuosity()
        + 0.0 * CurvatureVariance()
        + 0.0 * DirectionEntropy()
        + 0.0 * Interweaving()
        + 0.0 * Complexity()
        + 0.0 * TotalDistance()
        + 0.0 * SweepingArcs()
        + 1.0 * SpaceFilling()
    )

    termination = TrajectoryTooLarge(MAX_RADIUS)

    if args.load:
        # Load and re-simulate from saved base64 trajectories
        base64_lines = _load_base64_file(args.load)
        print(f"Loading {len(base64_lines)} trajectories from {args.load}...")
        results = []
        for i, b64 in enumerate(base64_lines, 1):
            sim_result = simulate_from_base64(b64)
            score, breakdown = score_fn.score_with_breakdown(sim_result)
            sim_result.score_breakdown = breakdown
            results.append((score, sim_result))
            print(f"  [{i}/{len(base64_lines)}] score={score:.4f}")
        best_score, sim_result = results[0]
    else:
        # Run random search
        results = random_search(score_fn=score_fn, n_samples=args.n, termination=termination)
        best_score, sim_result = results[0]  # Best result

    # Optionally run optimizer from best result
    if args.optimize and sim_result.initial_conditions is not None:
        print(f"\nOptimizing from best random result (score={best_score:.3f})...")

        bounds = ICBounds()
        lower, upper = bounds.to_si_bounds(num_bodies=3)

        eval_count = [0]
        optimization_steps = []  # Collect all intermediate results

        def objective(vec):
            eval_count[0] += 1
            ic = InitialConditions.from_vector(vec, num_bodies=3)
            result = run_simulation(ic, termination)
            score, breakdown = score_fn.score_with_breakdown(result)
            result.score_breakdown = breakdown
            optimization_steps.append((score, result))
            print(f"  eval {eval_count[0]}: score={score:.4f}")
            return score

        # Start from best random result
        full_start_vec = sim_result.initial_conditions.to_vector()

        # Run optimization
        import numpy as np
        from scipy.optimize import minimize

        from fleeting_grace.config import AU, SOLAR_MASS

        if args.optimize_velocities_only:
            # Only optimize velocities (indices 9-17), keep positions and masses fixed
            fixed_positions = full_start_vec[:9]
            fixed_masses = full_start_vec[18:]
            start_vec = full_start_vec[9:18]  # Just velocities
            opt_bounds = list(zip(lower[9:18], upper[9:18]))
            eps_vec = np.full(9, 1000)  # 1 km/s

            def make_full_vec(vel_vec):
                return np.concatenate([fixed_positions, vel_vec, fixed_masses])

            print(f"  Starting L-BFGS-B optimization (velocities only, 9 params, max {args.optimize_iters} iterations)...")

            opt_result = minimize(
                lambda x: -objective(make_full_vec(x)),
                start_vec,
                method="L-BFGS-B",
                bounds=opt_bounds,
                options={"maxiter": args.optimize_iters, "eps": eps_vec},
            )
            final_vec = make_full_vec(opt_result.x)
        else:
            # Optimize all 21 parameters
            start_vec = full_start_vec
            eps_positions = 0.1 * AU  # 0.1 AU per position component
            eps_velocities = 1000  # 1 km/s per velocity component
            eps_masses = 0.1 * SOLAR_MASS  # 0.1 solar masses
            eps_vec = np.concatenate(
                [
                    np.full(9, eps_positions),
                    np.full(9, eps_velocities),
                    np.full(3, eps_masses),
                ]
            )

            print(f"  Starting L-BFGS-B optimization (all params, max {args.optimize_iters} iterations)...")

            opt_result = minimize(
                lambda x: -objective(x),
                start_vec,
                method="L-BFGS-B",
                bounds=list(zip(lower, upper)),
                options={"maxiter": args.optimize_iters, "eps": eps_vec},
            )
            final_vec = opt_result.x

        print(f"  Optimization complete: {eval_count[0]} evaluations, converged={opt_result.success}")

        # Get final result
        final_ic = InitialConditions.from_vector(final_vec, num_bodies=3)
        sim_result = run_simulation(final_ic, termination)
        best_score, breakdown = score_fn.score_with_breakdown(sim_result)
        sim_result.score_breakdown = breakdown

        print(f"  Final score: {best_score:.4f} (was {results[0][0]:.4f})")

        # Use optimization steps for viewer (in order collected)
        results = optimization_steps

    # Parallel hill climber
    if args.hillclimb and sim_result.initial_conditions is not None:
        import os
        from concurrent.futures import ProcessPoolExecutor

        import numpy as np

        from fleeting_grace.hillclimb_worker import eval_candidate, init_worker

        print(f"\nHill climbing from best result (score={results[0][0] if results else best_score:.3f})...")

        # Perturbation settings
        angle_std = np.radians(0.4)
        magnitude_std = 0.1

        def perturb_velocity(vec, rng):
            """Perturb one random body's velocity by angle or magnitude."""
            new_vec = vec.copy()
            body = rng.integers(0, 3)  # Pick random body
            vel_start = 9 + body * 3  # Velocity indices: 9-11, 12-14, 15-17
            vel = new_vec[vel_start : vel_start + 3].copy()

            if rng.random() < 0.5:
                # Perturb angle: rotate velocity by small angle around random axis
                angle = rng.normal(0, angle_std)
                axis = rng.normal(0, 1, size=3)
                axis = axis / np.linalg.norm(axis)
                # Rodrigues rotation formula
                cos_a, sin_a = np.cos(angle), np.sin(angle)
                vel_rotated = vel * cos_a + np.cross(axis, vel) * sin_a + axis * np.dot(axis, vel) * (1 - cos_a)
                new_vec[vel_start : vel_start + 3] = vel_rotated
            else:
                # Perturb magnitude: scale speed by small factor
                factor = 1 + rng.normal(0, magnitude_std)
                factor = max(0.5, min(1.5, factor))  # Clamp to avoid extreme changes
                new_vec[vel_start : vel_start + 3] = vel * factor

            return new_vec

        current_vec = sim_result.initial_conditions.to_vector()
        current_score = best_score
        n_workers = os.cpu_count() or 4
        hillclimb_steps = [(current_score, sim_result)]  # Start with initial point

        # Create pool with initializer to set globals in worker processes
        with ProcessPoolExecutor(
            max_workers=n_workers,
            initializer=init_worker,
            initargs=(termination, score_fn),
        ) as pool:
            for iteration in range(args.hillclimb_iters):
                # Generate n_workers random perturbations
                rng = np.random.default_rng()
                candidates = []
                for _ in range(n_workers):
                    new_vec = perturb_velocity(current_vec, rng)
                    candidates.append(new_vec)

                # Evaluate all in parallel
                futures = [pool.submit(eval_candidate, c) for c in candidates]
                eval_results = [f.result() for f in futures]

                # Find best
                best_idx = max(range(len(eval_results)), key=lambda i: eval_results[i][0])
                best_candidate_score, best_candidate_result, best_candidate_vec = eval_results[best_idx]

                # Collect all for viewer
                for score, result, _ in eval_results:
                    hillclimb_steps.append((score, result))

                # Keep if better
                if best_candidate_score > current_score:
                    improvement = best_candidate_score - current_score
                    current_score = best_candidate_score
                    current_vec = best_candidate_vec
                    sim_result = best_candidate_result
                    print(f"  iter {iteration + 1}: score={current_score:.4f} (+{improvement:.4f})")
                else:
                    print(f"  iter {iteration + 1}: no improvement (best candidate {best_candidate_score:.4f})")

        print(f"  Hill climb complete: {len(hillclimb_steps)} evaluations")
        print(f"  Final score: {current_score:.4f}")

        # Use hill climb steps for viewer
        results = hillclimb_steps
        best_score = current_score

    # Display best result info
    print()
    print(format_simulation_info(sim_result))
    print()

    # Save OBJ file
    if not args.no_export:
        write_trajectories_to_obj(sim_result, OUTPUT_OBJ_FILE)
        print(f"OBJ file written to: {OUTPUT_OBJ_FILE}")

    # Open Three.js viewer with all results
    if not args.no_viewer:
        html_path = export_viewer_html(
            results,
            "trajectory_viewer.html",
            include_meshes=args.mesh,
        )
        print(f"Three.js viewer: {html_path}")


if __name__ == "__main__":
    main()
