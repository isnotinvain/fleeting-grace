"""Matplotlib 3D preview of trajectories."""

import matplotlib.pyplot as plt
import numpy as np
from mpl_toolkits.mplot3d import Axes3D  # noqa: F401 (needed to activate 3D)

from fleeting_grace.simulation import SimulationResult


def preview_trajectories_matplotlib(sim_result: SimulationResult):
    """
    Show a 3D Matplotlib preview of the trajectories.
    """
    trajectories = sim_result.trajectories

    fig = plt.figure()
    ax = fig.add_subplot(111, projection="3d")

    # Plot each body's path
    for traj in trajectories:
        if len(traj) == 0:
            continue
        traj = np.asarray(traj)
        ax.plot(traj[:, 0], traj[:, 1], traj[:, 2])

    # Make axes roughly equal so orbits aren't squashed
    all_points = np.vstack(trajectories)
    mins = all_points.min(axis=0)
    maxs = all_points.max(axis=0)
    centers = 0.5 * (mins + maxs)
    max_range = 0.5 * np.max(maxs - mins)

    ax.set_xlim(centers[0] - max_range, centers[0] + max_range)
    ax.set_ylim(centers[1] - max_range, centers[1] + max_range)
    ax.set_zlim(centers[2] - max_range, centers[2] + max_range)

    ax.set_xlabel("X")
    ax.set_ylabel("Y")
    ax.set_zlabel("Z")
    ax.set_title(f"3-body trajectories ({sim_result.reason}, steps={sim_result.steps})")

    plt.tight_layout()
    plt.show()
