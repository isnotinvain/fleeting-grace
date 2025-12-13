"""Main entry point for running as a module: python -m fleeting_grace"""

import argparse

from fleeting_grace.config import OUTPUT_OBJ_FILE
from fleeting_grace.export import write_trajectories_to_obj
from fleeting_grace.preview import preview_simulation_grid, preview_trajectories_matplotlib
from fleeting_grace.scoring import Duration, SpaceFilling, Weighted
from fleeting_grace.search import format_simulation_info, random_search


def main():
    parser = argparse.ArgumentParser(description="Find aesthetically interesting 3-body simulations")
    parser.add_argument("--preview", action="store_true", help="Show matplotlib 3D preview of best result")
    parser.add_argument("--no-grid", action="store_true", help="Skip grid view")
    parser.add_argument("--no-export", action="store_true", help="Skip OBJ file export")
    parser.add_argument("-n", type=int, default=50, help="Number of random simulations (default: 50)")
    args = parser.parse_args()

    # Score function: balance duration and space-filling
    score_fn = Weighted((Duration(), 0.3), (SpaceFilling(), 0.7))

    # Run random search
    results = random_search(score_fn=score_fn, n_samples=args.n)
    best_score, sim_result = results[0]  # Best result

    # Show grid of results (sorted by score)
    if not args.no_grid:
        print("\nShowing results (sorted by score, best first)...")
        preview_simulation_grid(results, title="Random Search Results")

    # Display best result info
    print()
    print(format_simulation_info(sim_result))
    print()

    # Save OBJ file
    if not args.no_export:
        write_trajectories_to_obj(sim_result, OUTPUT_OBJ_FILE)
        print(f"OBJ file written to: {OUTPUT_OBJ_FILE}")

    # Show preview if requested
    if args.preview:
        print("Showing Matplotlib 3D preview window...")
        preview_trajectories_matplotlib(sim_result)


if __name__ == "__main__":
    main()
