"""Matplotlib 3D preview of trajectories."""

import matplotlib.pyplot as plt
import numpy as np
from mpl_toolkits.mplot3d import Axes3D  # noqa: F401 (needed to activate 3D)

from fleeting_grace.config import AU, BOUNDING_BOX, DT, YEAR_SECONDS
from fleeting_grace.simulation import SimulationResult


def preview_trajectories_matplotlib(sim_result: SimulationResult):
    """
    Show a 3D Matplotlib preview of the trajectories.
    Coordinates are displayed in AU for readability.
    """
    trajectories = sim_result.trajectories

    fig = plt.figure(figsize=(10, 8))
    ax = fig.add_subplot(111, projection="3d")

    colors = ["#e41a1c", "#377eb8", "#4daf4a"]  # Red, blue, green

    # Plot each body's path (convert from meters to AU for display)
    for i, traj in enumerate(trajectories):
        if len(traj) == 0:
            continue
        traj = np.asarray(traj) / AU  # Convert to AU
        ax.plot(traj[:, 0], traj[:, 1], traj[:, 2], color=colors[i % len(colors)], label=f"Body {i + 1}", linewidth=0.5)

        # Mark starting position
        ax.scatter([traj[0, 0]], [traj[0, 1]], [traj[0, 2]], color=colors[i % len(colors)], s=50, marker="o")

    # Make axes roughly equal so orbits aren't squashed
    all_points = np.vstack([np.asarray(t) / AU for t in trajectories])
    mins = all_points.min(axis=0)
    maxs = all_points.max(axis=0)
    centers = 0.5 * (mins + maxs)
    max_range = 0.5 * np.max(maxs - mins)

    # Add some padding
    max_range = max(max_range, 1.0)  # At least 1 AU range

    ax.set_xlim(centers[0] - max_range, centers[0] + max_range)
    ax.set_ylim(centers[1] - max_range, centers[1] + max_range)
    ax.set_zlim(centers[2] - max_range, centers[2] + max_range)

    # Draw bounding sphere wireframe
    bounding_radius_au = BOUNDING_BOX / AU
    u = np.linspace(0, 2 * np.pi, 20)
    v = np.linspace(0, np.pi, 10)
    x_sphere = bounding_radius_au * np.outer(np.cos(u), np.sin(v))
    y_sphere = bounding_radius_au * np.outer(np.sin(u), np.sin(v))
    z_sphere = bounding_radius_au * np.outer(np.ones(np.size(u)), np.cos(v))
    ax.plot_wireframe(x_sphere, y_sphere, z_sphere, color="gray", alpha=0.1, linewidth=0.5)

    ax.set_xlabel("X (AU)")
    ax.set_ylabel("Y (AU)")
    ax.set_zlabel("Z (AU)")

    # Calculate duration in years
    duration_years = sim_result.steps * DT / YEAR_SECONDS

    ax.set_title(f"3-body simulation: {duration_years:.1f} years, {sim_result.reason}")
    ax.legend(loc="upper left")

    plt.tight_layout()
    plt.show()
