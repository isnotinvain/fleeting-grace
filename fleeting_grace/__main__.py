"""Main entry point for running as a module: python -m fleeting_grace"""

from fleeting_grace.config import MAX_ATTEMPTS, MIN_STEPS_TARGET, OUTPUT_OBJ_FILE
from fleeting_grace.export import write_trajectories_to_obj
from fleeting_grace.preview import preview_trajectories_matplotlib
from fleeting_grace.simulation import find_long_simulation


def main():
    # Find a "good" long-lived simulation
    sim_result = find_long_simulation(MIN_STEPS_TARGET, MAX_ATTEMPTS)

    # Save and preview it
    write_trajectories_to_obj(sim_result, OUTPUT_OBJ_FILE)
    print(f"\nUsing simulation: steps={sim_result.steps}, reason={sim_result.reason}")
    print(f"OBJ file written to: {OUTPUT_OBJ_FILE}")
    print("Showing Matplotlib 3D preview window...")

    preview_trajectories_matplotlib(sim_result)


if __name__ == "__main__":
    main()
