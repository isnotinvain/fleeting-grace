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
    Scroll wheel zooms in/out.
    """
    trajectories = sim_result.trajectories

    fig = plt.figure(figsize=(10, 8))
    ax = fig.add_subplot(111, projection="3d")

    # Scroll wheel zoom
    def on_scroll(event):
        if event.inaxes != ax:
            return
        scale = 1.2 if event.button == "down" else 1 / 1.2
        xlim = ax.get_xlim()
        ylim = ax.get_ylim()
        zlim = ax.get_zlim()
        ax.set_xlim([x * scale for x in xlim])
        ax.set_ylim([y * scale for y in ylim])
        ax.set_zlim([z * scale for z in zlim])
        fig.canvas.draw_idle()

    fig.canvas.mpl_connect("scroll_event", on_scroll)

    colors = ["#e41a1c", "#377eb8", "#4daf4a"]  # Red, blue, green

    # Plot each body's path (convert from meters to AU for display)
    for i, traj in enumerate(trajectories):
        if len(traj) == 0:
            continue
        traj = np.asarray(traj) / AU  # Convert to AU
        ax.plot(traj[:, 0], traj[:, 1], traj[:, 2], color=colors[i % len(colors)], label=f"Body {i + 1}", linewidth=0.5)

        # Mark starting position
        ax.scatter([traj[0, 0]], [traj[0, 1]], [traj[0, 2]], color=colors[i % len(colors)], s=50, marker="o")

    # Draw bounding sphere wireframe
    bounding_radius_au = BOUNDING_BOX / AU
    u = np.linspace(0, 2 * np.pi, 30)
    v = np.linspace(0, np.pi, 15)
    x_sphere = bounding_radius_au * np.outer(np.cos(u), np.sin(v))
    y_sphere = bounding_radius_au * np.outer(np.sin(u), np.sin(v))
    z_sphere = bounding_radius_au * np.outer(np.ones(np.size(u)), np.cos(v))
    ax.plot_wireframe(x_sphere, y_sphere, z_sphere, color="gray", alpha=0.3, linewidth=0.5)

    # Set view to show full bounding sphere with padding
    view_range = bounding_radius_au * 1.1
    ax.set_xlim(-view_range, view_range)
    ax.set_ylim(-view_range, view_range)
    ax.set_zlim(-view_range, view_range)

    # Equal aspect ratio so sphere looks like a sphere
    ax.set_box_aspect([1, 1, 1])

    # Hide axes and grid
    ax.set_axis_off()

    # Calculate duration in years
    duration_years = sim_result.steps * DT / YEAR_SECONDS

    ax.set_title(f"3-body simulation: {duration_years:.1f} years, {sim_result.reason}")
    ax.legend(loc="upper left")

    plt.tight_layout()
    plt.show()
