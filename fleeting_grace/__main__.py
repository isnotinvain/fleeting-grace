"""Main entry point for running as a module: python -m fleeting_grace"""

import argparse

from fleeting_grace.config import MAX_RADIUS, OUTPUT_OBJ_FILE
from fleeting_grace.export import write_trajectories_to_obj
from fleeting_grace.scoring import Complexity, CurvatureVariance, DirectionEntropy, Interweaving, SweepingArcs, TotalDistance, Tortuosity
from fleeting_grace.search import format_simulation_info, random_search
from fleeting_grace.termination import TrajectoryTooLarge
from fleeting_grace.viewer import export_viewer_html


def main():
    parser = argparse.ArgumentParser(description="Find aesthetically interesting 3-body simulations")
    parser.add_argument("--no-viewer", action="store_true", help="Skip opening Three.js viewer")
    parser.add_argument("--mesh", action="store_true", help="Include 3D mesh views (tapered pipes) alongside line views")
    parser.add_argument("--no-export", action="store_true", help="Skip OBJ file export")
    parser.add_argument("-n", type=int, default=50, help="Number of random simulations (default: 50)")
    args = parser.parse_args()

    # Score function: weighted combination of aesthetic metrics (all 0-1)
    score_fn = (
        0.14 * Tortuosity() +
        0.14 * CurvatureVariance() +
        0.14 * DirectionEntropy() +
        0.14 * Interweaving() +
        0.14 * Complexity() +
        0.14 * TotalDistance() +
        0.14 * SweepingArcs()
    )

    # Run random search
    results = random_search(score_fn=score_fn, n_samples=args.n, termination=TrajectoryTooLarge(MAX_RADIUS))
    best_score, sim_result = results[0]  # Best result

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
