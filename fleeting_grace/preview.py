"""Matplotlib 3D preview of trajectories."""

import base64
import math

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.widgets import Button
from mpl_toolkits.mplot3d import Axes3D  # noqa: F401 (needed to activate 3D)

from fleeting_grace.config import AU, DT, YEAR_SECONDS
from fleeting_grace.simulation import SimulationResult, compute_body_radius


def _compute_trajectory_bounds(trajectories: list) -> tuple[np.ndarray, float]:
    """Compute centroid and bounding radius of all trajectory points."""
    all_points = []
    for traj in trajectories:
        if len(traj) > 0:
            all_points.extend(np.asarray(traj))
    if not all_points:
        return np.zeros(3), 1.0
    all_pts = np.array(all_points)
    centroid = np.mean(all_pts, axis=0)
    distances = np.linalg.norm(all_pts - centroid, axis=1)
    return centroid, np.max(distances)


def preview_trajectories_matplotlib(sim_result: SimulationResult):
    """
    Show a 3D Matplotlib preview of the trajectories.
    Coordinates are displayed in AU for readability.
    Scroll wheel zooms in/out.
    """
    trajectories = sim_result.trajectories

    # Compute actual bounding sphere of trajectories
    centroid_m, bounding_radius_m = _compute_trajectory_bounds(trajectories)
    centroid_au = centroid_m / AU
    bounding_radius_au = bounding_radius_m / AU

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

    # Get masses for body radius calculation
    masses = sim_result.initial_conditions.masses if sim_result.initial_conditions else None

    # Plot each body's path (convert from meters to AU for display)
    for i, traj in enumerate(trajectories):
        if len(traj) == 0:
            continue
        traj = np.asarray(traj) / AU  # Convert to AU
        ax.plot(traj[:, 0], traj[:, 1], traj[:, 2], color=colors[i % len(colors)], label=f"Body {i + 1}", linewidth=0.5)

        # Draw spheres at start (wireframe) and end (solid) positions
        # Visual scale factor (bodies are tiny at realistic radii)
        if masses is not None:
            radius_m = compute_body_radius(masses[i])
            radius_au = radius_m / AU * 25  # 25x visual inflation
            u = np.linspace(0, 2 * np.pi, 20)
            v = np.linspace(0, np.pi, 10)

            # Wireframe at starting position
            x_start = traj[0, 0] + radius_au * np.outer(np.cos(u), np.sin(v))
            y_start = traj[0, 1] + radius_au * np.outer(np.sin(u), np.sin(v))
            z_start = traj[0, 2] + radius_au * np.outer(np.ones(np.size(u)), np.cos(v))
            ax.plot_wireframe(x_start, y_start, z_start, color=colors[i % len(colors)], alpha=0.5, linewidth=0.5)

            # Solid sphere at ending position
            x_end = traj[-1, 0] + radius_au * np.outer(np.cos(u), np.sin(v))
            y_end = traj[-1, 1] + radius_au * np.outer(np.sin(u), np.sin(v))
            z_end = traj[-1, 2] + radius_au * np.outer(np.ones(np.size(u)), np.cos(v))
            ax.plot_surface(x_end, y_end, z_end, color=colors[i % len(colors)], alpha=0.8)

    # Draw bounding sphere wireframe centered at trajectory centroid
    u = np.linspace(0, 2 * np.pi, 30)
    v = np.linspace(0, np.pi, 15)
    x_sphere = centroid_au[0] + bounding_radius_au * np.outer(np.cos(u), np.sin(v))
    y_sphere = centroid_au[1] + bounding_radius_au * np.outer(np.sin(u), np.sin(v))
    z_sphere = centroid_au[2] + bounding_radius_au * np.outer(np.ones(np.size(u)), np.cos(v))
    ax.plot_wireframe(x_sphere, y_sphere, z_sphere, color="gray", alpha=0.3, linewidth=0.5)

    # Set view to show full bounding sphere with padding, centered on centroid
    view_range = bounding_radius_au * 1.2
    ax.set_xlim(centroid_au[0] - view_range, centroid_au[0] + view_range)
    ax.set_ylim(centroid_au[1] - view_range, centroid_au[1] + view_range)
    ax.set_zlim(centroid_au[2] - view_range, centroid_au[2] + view_range)

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


def _serialize_initial_conditions(sim_result: SimulationResult) -> str:
    """Serialize initial conditions to base64 for lossless reproduction."""
    if sim_result.initial_conditions is None:
        return "No initial conditions"

    ic = sim_result.initial_conditions
    # Pack as raw bytes: positions (9 floats) + velocities (9 floats) + masses (3 floats) = 21 float64s
    data = np.concatenate([
        ic.positions.flatten(),
        ic.velocities.flatten(),
        ic.masses
    ]).astype(np.float64)
    return base64.b64encode(data.tobytes()).decode('ascii')


def _plot_simulation_on_axis(ax, sim_result: SimulationResult, show_bounding_sphere: bool = True):
    """Plot a simulation result on a given 3D axis."""
    trajectories = sim_result.trajectories
    colors = ["#e41a1c", "#377eb8", "#4daf4a"]

    # Compute actual bounding sphere
    centroid_m, bounding_radius_m = _compute_trajectory_bounds(trajectories)
    centroid_au = centroid_m / AU
    bounding_radius_au = max(bounding_radius_m / AU, 1.0)  # Minimum 1 AU for visibility

    masses = sim_result.initial_conditions.masses if sim_result.initial_conditions else None

    for i, traj in enumerate(trajectories):
        if len(traj) == 0:
            continue
        traj = np.asarray(traj) / AU
        ax.plot(traj[:, 0], traj[:, 1], traj[:, 2], color=colors[i % len(colors)], linewidth=0.5)

        if masses is not None:
            radius_m = compute_body_radius(masses[i])
            radius_au = radius_m / AU * 25
            u = np.linspace(0, 2 * np.pi, 12)
            v = np.linspace(0, np.pi, 6)

            # Wireframe at start
            x_start = traj[0, 0] + radius_au * np.outer(np.cos(u), np.sin(v))
            y_start = traj[0, 1] + radius_au * np.outer(np.sin(u), np.sin(v))
            z_start = traj[0, 2] + radius_au * np.outer(np.ones(np.size(u)), np.cos(v))
            ax.plot_wireframe(x_start, y_start, z_start, color=colors[i % len(colors)], alpha=0.5, linewidth=0.3)

            # Solid at end
            x_end = traj[-1, 0] + radius_au * np.outer(np.cos(u), np.sin(v))
            y_end = traj[-1, 1] + radius_au * np.outer(np.sin(u), np.sin(v))
            z_end = traj[-1, 2] + radius_au * np.outer(np.ones(np.size(u)), np.cos(v))
            ax.plot_surface(x_end, y_end, z_end, color=colors[i % len(colors)], alpha=0.8)

    if show_bounding_sphere:
        u = np.linspace(0, 2 * np.pi, 20)
        v = np.linspace(0, np.pi, 10)
        x_sphere = centroid_au[0] + bounding_radius_au * np.outer(np.cos(u), np.sin(v))
        y_sphere = centroid_au[1] + bounding_radius_au * np.outer(np.sin(u), np.sin(v))
        z_sphere = centroid_au[2] + bounding_radius_au * np.outer(np.ones(np.size(u)), np.cos(v))
        ax.plot_wireframe(x_sphere, y_sphere, z_sphere, color="gray", alpha=0.2, linewidth=0.3)

    # Set view centered on trajectory centroid
    view_range = bounding_radius_au * 1.2
    ax.set_xlim(centroid_au[0] - view_range, centroid_au[0] + view_range)
    ax.set_ylim(centroid_au[1] - view_range, centroid_au[1] + view_range)
    ax.set_zlim(centroid_au[2] - view_range, centroid_au[2] + view_range)
    ax.set_box_aspect([1, 1, 1])
    ax.set_axis_off()

    # Title with duration
    duration_years = sim_result.steps * DT / YEAR_SECONDS
    ax.set_title(f"{duration_years:.1f}yr, {sim_result.reason}", fontsize=8)


def preview_simulation_grid(sim_results: list[SimulationResult], title: str = "Simulations"):
    """
    Show a grid of simulation results, each with independent 3D rotation and a save button.

    Args:
        sim_results: List of SimulationResult objects to display
        title: Window title
    """
    n = len(sim_results)
    if n == 0:
        print("No simulations to display")
        return

    # Calculate grid dimensions
    cols = min(4, n)
    rows = math.ceil(n / cols)

    # Create figure with extra space for buttons
    fig = plt.figure(figsize=(4 * cols, 4 * rows + 0.5 * rows))
    fig.suptitle(title, fontsize=12)

    axes = []
    buttons = []

    for i, sim_result in enumerate(sim_results):
        # Create 3D subplot - leave space at bottom for button
        ax = fig.add_subplot(rows, cols, i + 1, projection="3d")
        axes.append(ax)

        _plot_simulation_on_axis(ax, sim_result, show_bounding_sphere=True)

        # Add button below each plot
        # Calculate button position based on subplot position
        bbox = ax.get_position()
        btn_ax = fig.add_axes([bbox.x0, bbox.y0 - 0.04, bbox.width, 0.03])

        # Create callback that captures this simulation's data
        def make_callback(sr, idx):
            def callback(event):
                print(f"\n{'='*60}")
                print(f"Simulation {idx + 1} Initial Conditions")
                print(f"{'='*60}")
                print(f"Base64: {_serialize_initial_conditions(sr)}")
                print(f"{'='*60}\n")
            return callback

        btn = Button(btn_ax, f"Save #{i+1}", color='lightgray', hovercolor='lightblue')
        btn.on_clicked(make_callback(sim_result, i))
        buttons.append(btn)  # Keep reference to prevent garbage collection

    plt.tight_layout()
    plt.subplots_adjust(top=0.95, bottom=0.05, hspace=0.3)
    plt.show()

    return buttons  # Return to keep references alive
