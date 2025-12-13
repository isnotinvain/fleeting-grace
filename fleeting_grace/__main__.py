"""Main entry point for running as a module: python -m fleeting_grace"""

import argparse

from fleeting_grace.config import OUTPUT_OBJ_FILE
from fleeting_grace.export import write_trajectories_to_obj
from fleeting_grace.preview import preview_simulation_grid, preview_trajectories_matplotlib
from fleeting_grace.search import (
    find_long_simulation_optimized,
    find_optimal_simulation_with_history,
    format_simulation_info,
)


def main():
    parser = argparse.ArgumentParser(description="Find aesthetically interesting 3-body simulations")
    parser.add_argument("--preview", action="store_true", help="Show matplotlib 3D preview of best result")
    parser.add_argument("--grid", action="store_true", help="Show grid view of all search results")
    parser.add_argument("--no-export", action="store_true", help="Skip OBJ file export")
    args = parser.parse_args()

    # Find a "good" long-lived simulation using optimization
    print("Searching for aesthetically interesting 3-body simulation...")
    print()

    if args.grid:
        # Use version that collects all intermediate results
        search_result = find_optimal_simulation_with_history()
        sim_result = search_result.best

        # Show grids
        print("\nShowing random phase results...")
        preview_simulation_grid(search_result.random_phase, title="Random Phase Simulations")

        if search_result.optimizer_phase:
            print("\nShowing optimizer phase results...")
            preview_simulation_grid(search_result.optimizer_phase, title="Optimizer Phase Simulations")
    else:
        sim_result = find_long_simulation_optimized()

    # Display results with real physical units
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
