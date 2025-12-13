"""Matplotlib 3D preview of trajectories."""

import base64
import math

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.widgets import Button
from mpl_toolkits.mplot3d import Axes3D, axes3d  # noqa: F401 (needed to activate 3D)

from fleeting_grace.config import AU, DT, YEAR_SECONDS
from fleeting_grace.simulation import SimulationResult, compute_body_radius

# Patch matplotlib 3D axes to suppress toolbar bug with Python 3.14
_original_button_release = axes3d.Axes3D._button_release


def _patched_button_release(self, event):
    try:
        _original_button_release(self, event)
    except (AttributeError, TypeError):
        pass  # Ignore toolbar-related errors


axes3d.Axes3D._button_release = _patched_button_release


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


def preview_simulation_grid(
    sim_results: list[SimulationResult] | list[tuple[float, SimulationResult]],
    title: str = "Simulations",
):
    """
    Show a 2x2 grid of simulation results with pagination and scroll zoom.

    Args:
        sim_results: List of SimulationResult or (score, SimulationResult) tuples
        title: Window title
    """
    if len(sim_results) == 0:
        print("No simulations to display")
        return

    # Handle both formats: list of results or list of (score, result) tuples
    if isinstance(sim_results[0], tuple):
        scores = [s for s, _ in sim_results]
        sim_results = [r for _, r in sim_results]
    else:
        scores = None

    n = len(sim_results)

    per_page = 4  # 2x2 grid
    total_pages = math.ceil(n / per_page)
    current_page = [0]  # Mutable container for closure

    fig = plt.figure(figsize=(9, 8))
    axes = []
    save_buttons = []
    save_btn_axes = []

    # Scroll wheel zoom for all 3D axes
    def on_scroll(event):
        for ax in axes:
            if event.inaxes == ax:
                scale = 1.2 if event.button == "down" else 1 / 1.2
                xlim = ax.get_xlim()
                ylim = ax.get_ylim()
                zlim = ax.get_zlim()
                ax.set_xlim([x * scale for x in xlim])
                ax.set_ylim([y * scale for y in ylim])
                ax.set_zlim([z * scale for z in zlim])
                fig.canvas.draw_idle()
                break

    fig.canvas.mpl_connect("scroll_event", on_scroll)

    def render_page(page_num):
        # Clear previous content
        for ax in axes:
            ax.remove()
        for btn_ax in save_btn_axes:
            btn_ax.remove()
        axes.clear()
        save_buttons.clear()
        save_btn_axes.clear()

        start_idx = page_num * per_page
        end_idx = min(start_idx + per_page, n)
        page_results = sim_results[start_idx:end_idx]

        fig.suptitle(f"{title} (Page {page_num + 1}/{total_pages})", fontsize=12)

        for i, sim_result in enumerate(page_results):
            global_idx = start_idx + i

            # Create 3D subplot in 2x2 grid
            ax = fig.add_subplot(2, 2, i + 1, projection="3d")
            axes.append(ax)
            _plot_simulation_on_axis(ax, sim_result, show_bounding_sphere=True)

            # Override title to include score if available
            duration_years = sim_result.steps * DT / YEAR_SECONDS
            if scores is not None:
                ax.set_title(f"#{global_idx + 1} score={scores[global_idx]:.2f} | {duration_years:.1f}yr", fontsize=8)
            else:
                ax.set_title(f"#{global_idx + 1} | {duration_years:.1f}yr, {sim_result.reason}", fontsize=8)

            # Add save button below each plot
            bbox = ax.get_position()
            btn_ax = fig.add_axes([bbox.x0, bbox.y0 - 0.03, bbox.width, 0.025])
            save_btn_axes.append(btn_ax)

            def make_save_callback(sr, idx):
                def callback(event):
                    print(f"\n{'='*60}")
                    print(f"Simulation {idx + 1} Initial Conditions")
                    print(f"{'='*60}")
                    print(f"Base64: {_serialize_initial_conditions(sr)}")
                    print(f"{'='*60}\n")
                return callback

            btn = Button(btn_ax, f"Save #{global_idx + 1}", color='lightgray', hovercolor='lightblue')
            btn.on_clicked(make_save_callback(sim_result, global_idx))
            save_buttons.append(btn)

        fig.canvas.draw_idle()

    def next_page(event):
        if current_page[0] < total_pages - 1:
            current_page[0] += 1
            render_page(current_page[0])

    def prev_page(event):
        if current_page[0] > 0:
            current_page[0] -= 1
            render_page(current_page[0])

    # Navigation buttons at bottom
    prev_ax = fig.add_axes([0.3, 0.01, 0.15, 0.03])
    next_ax = fig.add_axes([0.55, 0.01, 0.15, 0.03])

    prev_btn = Button(prev_ax, '< Previous', color='lightgray', hovercolor='lightblue')
    next_btn = Button(next_ax, 'Next >', color='lightgray', hovercolor='lightblue')

    prev_btn.on_clicked(prev_page)
    next_btn.on_clicked(next_page)

    # Initial render
    plt.subplots_adjust(top=0.93, bottom=0.08, hspace=0.35, wspace=0.2)
    render_page(0)

    plt.show()

    return prev_btn, next_btn, save_buttons  # Keep references alive
