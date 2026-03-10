"""Scoring functions for evaluating simulation quality."""

from __future__ import annotations

from abc import ABC, abstractmethod

import numpy as np

from fleeting_grace.config import DT, MIN_STEPS_TARGET, YEAR_SECONDS
from fleeting_grace.simulation import SimulationResult

# NOTE: maybe add convex hull volume as a score too


class ScoreFunction(ABC):
    """Base class for simulation scoring functions."""

    @abstractmethod
    def score(self, sim_result: SimulationResult) -> float:
        """Compute fitness score for a completed simulation."""
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable name for this score function."""
        pass

    def score_with_breakdown(self, sim_result: SimulationResult) -> tuple[float, dict[str, float]]:
        """Compute score and return breakdown of raw component scores.

        Returns:
            (total_score, {component_name: raw_score_0_to_1})

        The breakdown shows raw unweighted scores for visualization.
        """
        s = self.score(sim_result)
        return s, {self.name: s}

    def __add__(self, other: ScoreFunction) -> Sum:
        return Sum(self, other)

    def __mul__(self, weight: float) -> Weighted:
        return Weighted((self, weight))

    def __rmul__(self, weight: float) -> Weighted:
        return Weighted((self, weight))


class Duration(ScoreFunction):
    """Score based on simulation duration."""

    def __init__(self, min_steps: int = MIN_STEPS_TARGET, bonus: float = 2.0):
        self.min_steps = min_steps
        self.bonus = bonus

    def score(self, sim_result: SimulationResult) -> float:
        base = sim_result.steps / self.min_steps
        b = self.bonus if sim_result.steps >= self.min_steps else 0.0
        return base + b

    @property
    def name(self) -> str:
        min_years = self.min_steps * DT / YEAR_SECONDS
        return f"Duration(min={min_years:.0f}yr)"


class SpaceFilling(ScoreFunction):
    """Score based on how much of the bounding sphere is filled by trajectories.

    Uses the actual bounding sphere of the trajectories (not a fixed sphere).
    Measures how "sphere-shaped" the overall trajectory distribution is.
    Samples along line segments to properly rasterize the trajectory paths.
    """

    def __init__(self, grid_resolution: int = 10):
        """
        Args:
            grid_resolution: Grid divisions per axis (10 = ~500 cells in sphere)
        """
        self.grid_resolution = grid_resolution

    def score(self, sim_result: SimulationResult) -> float:
        trajectories = sim_result.trajectories
        if not trajectories or all(len(t) == 0 for t in trajectories):
            return 0.0

        valid_trajs = [np.asarray(traj) for traj in trajectories if len(traj) > 0]
        if not valid_trajs:
            return 0.0

        all_pts = np.concatenate(valid_trajs, axis=0)

        # Compute bounding sphere using 95th percentile distance (not max)
        # This avoids a single outlier point defining a huge mostly-empty sphere
        center = np.mean(all_pts, axis=0)
        distances = np.linalg.norm(all_pts - center, axis=1)
        radius = np.percentile(distances, 95)

        if radius < 1e-10:
            return 0.0

        # Pre-compute which grid cells are fully inside the sphere
        cells_in_sphere = set()
        half_res = self.grid_resolution / 2
        # Half-diagonal of a cell (to check if entire cell is inside sphere)
        cell_half_diag = (1.0 / self.grid_resolution) * (3**0.5)
        for ix in range(self.grid_resolution):
            for iy in range(self.grid_resolution):
                for iz in range(self.grid_resolution):
                    # Cell center position (normalized to [-1, 1])
                    cx = (ix + 0.5 - half_res) / half_res
                    cy = (iy + 0.5 - half_res) / half_res
                    cz = (iz + 0.5 - half_res) / half_res
                    # Is entire cell inside unit sphere? (center + half-diagonal < 1)
                    dist_from_center = (cx * cx + cy * cy + cz * cz) ** 0.5
                    if dist_from_center + cell_half_diag <= 1.0:
                        cells_in_sphere.add((ix, iy, iz))

        total_cells_in_sphere = len(cells_in_sphere)
        if total_cells_in_sphere == 0:
            return 0.0

        # Cell size in normalized coordinates
        cell_size = 2.0 / self.grid_resolution

        # Rasterize trajectory line segments into grid cells
        occupied_cells = set()

        for traj in valid_trajs:
            for i in range(len(traj) - 1):
                p1 = (traj[i] - center) / radius  # Normalize to [-1, 1]
                p2 = (traj[i + 1] - center) / radius

                # Sample along segment - use enough samples to hit every cell
                segment_length = np.linalg.norm(p2 - p1)
                n_samples = max(2, int(segment_length / cell_size * 2) + 1)

                for t in np.linspace(0, 1, n_samples):
                    pt = p1 + t * (p2 - p1)
                    # Map to grid indices [0, grid_resolution)
                    indices = ((pt + 1) * 0.5 * self.grid_resolution).astype(int)
                    indices = np.clip(indices, 0, self.grid_resolution - 1)
                    cell = tuple(indices)
                    if cell in cells_in_sphere:
                        occupied_cells.add(cell)

        # Coverage ratio
        coverage = len(occupied_cells) / total_cells_in_sphere

        return coverage

    @property
    def name(self) -> str:
        return "SpaceFilling"


class Weighted(ScoreFunction):
    """Weighted combination of score functions."""

    def __init__(self, *pairs: tuple[ScoreFunction, float]):
        self.pairs = list(pairs)

    def score(self, sim_result: SimulationResult) -> float:
        return sum(fn.score(sim_result) * weight for fn, weight in self.pairs)

    def score_with_breakdown(self, sim_result: SimulationResult) -> tuple[float, dict[str, float]]:
        """Compute weighted total and return raw unweighted component scores."""
        breakdown = {}
        total = 0.0
        for fn, weight in self.pairs:
            raw_score = fn.score(sim_result)
            breakdown[fn.name] = raw_score
            total += raw_score * weight
        return total, breakdown

    def __add__(self, other: ScoreFunction) -> Weighted:
        if isinstance(other, Weighted):
            return Weighted(*self.pairs, *other.pairs)
        return Weighted(*self.pairs, (other, 1.0))

    def __mul__(self, weight: float) -> Weighted:
        # Scale all weights
        return Weighted(*[(fn, w * weight) for fn, w in self.pairs])

    def __rmul__(self, weight: float) -> Weighted:
        return self.__mul__(weight)

    @property
    def name(self) -> str:
        parts = [f"{weight:.2f}*{fn.name}" for fn, weight in self.pairs]
        return f"Weighted({', '.join(parts)})"


class Sum(ScoreFunction):
    """Sum of score functions (unweighted)."""

    def __init__(self, *fns: ScoreFunction):
        self.fns = list(fns)

    def score(self, sim_result: SimulationResult) -> float:
        return sum(fn.score(sim_result) for fn in self.fns)

    def __add__(self, other: ScoreFunction) -> Sum:
        if isinstance(other, Sum):
            return Sum(*self.fns, *other.fns)
        return Sum(*self.fns, other)

    @property
    def name(self) -> str:
        return " + ".join(fn.name for fn in self.fns)


class Tortuosity(ScoreFunction):
    """Score based on path complexity: path_length / displacement.

    A straight line scores 0, highly tangled paths approach 1.
    Computed per-body and averaged.
    """

    def score(self, sim_result: SimulationResult) -> float:
        trajectories = sim_result.trajectories
        if not trajectories:
            return 0.0

        tortuosities = []
        for traj in trajectories:
            if len(traj) < 2:
                continue
            traj = np.asarray(traj)

            # Path length: sum of segment lengths
            segments = np.diff(traj, axis=0)
            path_length = np.sum(np.linalg.norm(segments, axis=1))

            # Displacement: straight-line distance start to end
            displacement = np.linalg.norm(traj[-1] - traj[0])

            if displacement < 1e-10:
                # Returned to start = very tortuous
                tortuosities.append(1.0)
            else:
                t = path_length / displacement
                # Map [1, ∞) to [0, 1) using 1 - 1/t
                tortuosities.append(1.0 - 1.0 / t)

        return np.mean(tortuosities) if tortuosities else 0.0

    @property
    def name(self) -> str:
        return "Tortuosity"


class CurvatureVariance(ScoreFunction):
    """Score based on variety of curvatures (mix of tight loops and sweeping arcs).

    High variance in curvature = interesting variety = higher score.
    Uses coefficient of variation, normalized to 0-1.
    """

    def __init__(self, scale: float = 2.0):
        """
        Args:
            scale: CV value that maps to ~0.63 (1 - 1/e). Higher = more tolerant.
        """
        self.scale = scale

    def score(self, sim_result: SimulationResult) -> float:
        trajectories = sim_result.trajectories
        if not trajectories:
            return 0.0

        all_curvatures = []
        for traj in trajectories:
            if len(traj) < 3:
                continue
            traj = np.asarray(traj)

            # Compute curvature at each interior point
            # Curvature = |v × a| / |v|³ where v=velocity, a=acceleration
            # Approximate with finite differences
            v1 = traj[1:-1] - traj[:-2]  # velocity before
            v2 = traj[2:] - traj[1:-1]  # velocity after

            # Cross product magnitude (for curvature direction change)
            cross = np.cross(v1, v2)
            cross_mag = np.linalg.norm(cross, axis=1)

            # Average velocity magnitude
            v_mag = (np.linalg.norm(v1, axis=1) + np.linalg.norm(v2, axis=1)) / 2
            v_mag = np.maximum(v_mag, 1e-10)

            # Curvature approximation
            curvatures = cross_mag / (v_mag**2)
            all_curvatures.extend(curvatures)

        if len(all_curvatures) < 2:
            return 0.0

        all_curvatures = np.array(all_curvatures)
        mean_curv = np.mean(all_curvatures)
        if mean_curv < 1e-10:
            return 0.0

        # Coefficient of variation
        cv = np.std(all_curvatures) / mean_curv

        # Map to 0-1 using exponential saturation
        return 1.0 - np.exp(-cv / self.scale)

    @property
    def name(self) -> str:
        return "CurvatureVariance"


class DirectionEntropy(ScoreFunction):
    """Score based on unpredictability of direction changes.

    Discretizes 3D directions into bins on a sphere, computes Shannon entropy.
    Normalized to 0-1 where 1 = maximum entropy (all directions equally likely).
    """

    def __init__(self, n_bins: int = 20):
        """
        Args:
            n_bins: Approximate number of direction bins (actual is n_bins² / 2).
        """
        self.n_bins = n_bins

    def score(self, sim_result: SimulationResult) -> float:
        trajectories = sim_result.trajectories
        if not trajectories:
            return 0.0

        all_directions = []
        for traj in trajectories:
            if len(traj) < 2:
                continue
            traj = np.asarray(traj)

            # Direction vectors
            segments = np.diff(traj, axis=0)
            lengths = np.linalg.norm(segments, axis=1, keepdims=True)
            lengths = np.maximum(lengths, 1e-10)
            directions = segments / lengths
            all_directions.append(directions)

        if not all_directions:
            return 0.0

        all_dirs = np.concatenate(all_directions, axis=0)

        # Discretize directions using spherical coordinates
        # theta = azimuth [0, 2π), phi = polar [0, π]
        x, y, z = all_dirs[:, 0], all_dirs[:, 1], all_dirs[:, 2]
        theta = np.arctan2(y, x)  # [-π, π]
        phi = np.arccos(np.clip(z, -1, 1))  # [0, π]

        # Bin indices
        theta_bins = ((theta + np.pi) / (2 * np.pi) * self.n_bins).astype(int) % self.n_bins
        phi_bins = (phi / np.pi * self.n_bins).astype(int)
        phi_bins = np.clip(phi_bins, 0, self.n_bins - 1)

        # Combined bin index
        bin_indices = theta_bins * self.n_bins + phi_bins

        # Count occurrences
        counts = np.bincount(bin_indices, minlength=self.n_bins**2)
        counts = counts[counts > 0]  # Only non-empty bins

        # Shannon entropy
        probs = counts / counts.sum()
        entropy = -np.sum(probs * np.log(probs))

        # Normalize by max entropy (uniform distribution over all possible bins)
        max_entropy = np.log(self.n_bins**2)

        return entropy / max_entropy if max_entropy > 0 else 0.0

    @property
    def name(self) -> str:
        return "DirectionEntropy"


class Interweaving(ScoreFunction):
    """Score based on how much the trajectories interweave with each other.

    Measures average proximity between different bodies' trajectories.
    Close encounters = higher score. Trajectories that diverge immediately = low score.
    """

    def __init__(self, sample_points: int = 100):
        """
        Args:
            sample_points: Number of points to sample per trajectory for distance calc.
        """
        self.sample_points = sample_points

    def score(self, sim_result: SimulationResult) -> float:
        trajectories = sim_result.trajectories
        if len(trajectories) < 2:
            return 0.0

        # Get valid trajectories and compute overall scale
        valid_trajs = [np.asarray(t) for t in trajectories if len(t) > 0]
        if len(valid_trajs) < 2:
            return 0.0

        # Compute bounding box scale
        all_pts = np.concatenate(valid_trajs, axis=0)
        bbox_size = np.max(all_pts, axis=0) - np.min(all_pts, axis=0)
        scale = np.linalg.norm(bbox_size)
        if scale < 1e-10:
            return 0.0

        # Sample points from each trajectory
        sampled = []
        for traj in valid_trajs:
            if len(traj) <= self.sample_points:
                sampled.append(traj)
            else:
                indices = np.linspace(0, len(traj) - 1, self.sample_points, dtype=int)
                sampled.append(traj[indices])

        # Compute pairwise minimum distances
        min_distances = []
        for i in range(len(sampled)):
            for j in range(i + 1, len(sampled)):
                # For each point in traj i, find min distance to any point in traj j
                for pt in sampled[i]:
                    dists = np.linalg.norm(sampled[j] - pt, axis=1)
                    min_distances.append(np.min(dists))

        if not min_distances:
            return 0.0

        # Average minimum distance, normalized by scale
        avg_min_dist = np.mean(min_distances) / scale

        # Map to 0-1: close = 1, far = 0
        # Using exponential decay: exp(-distance * factor)
        return np.exp(-avg_min_dist * 5.0)

    @property
    def name(self) -> str:
        return "Interweaving"


class Complexity(ScoreFunction):
    """Score based on total angular change (how much turning happens).

    Measures sum of all direction changes in radians, normalized.
    Simple straight-line crash = 0, spaghetti chaos = 1.
    """

    def __init__(self, scale: float = 128.0):
        """
        Args:
            scale: Total radians that maps to ~0.63 (1 - 1/e). Default 128 = ~20 full loops.
        """
        self.scale = scale

    def score(self, sim_result: SimulationResult) -> float:
        trajectories = sim_result.trajectories
        if not trajectories:
            return 0.0

        total_angle = 0.0
        for traj in trajectories:
            if len(traj) < 3:
                continue
            traj = np.asarray(traj)

            # Direction vectors between consecutive points
            segments = np.diff(traj, axis=0)
            lengths = np.linalg.norm(segments, axis=1)

            # Skip zero-length segments
            valid = lengths > 1e-10
            if np.sum(valid) < 2:
                continue

            segments = segments[valid]
            lengths = lengths[valid]

            # Normalize to unit vectors
            directions = segments / lengths[:, np.newaxis]

            # Angle between consecutive direction vectors
            # cos(angle) = dot(d1, d2), angle = arccos(dot)
            for i in range(len(directions) - 1):
                dot = np.clip(np.dot(directions[i], directions[i + 1]), -1, 1)
                angle = np.arccos(dot)
                total_angle += angle

        # Normalize using exponential saturation
        # scale=50 means 50 radians (~8 full turns) maps to 0.63
        return 1.0 - np.exp(-total_angle / self.scale)

    @property
    def name(self) -> str:
        return "Complexity"


class SweepingArcs(ScoreFunction):
    """Score based on sum of (segment_length × radius_of_curvature).

    Rewards long paths at large radii. Tight loops contribute little,
    big sweeping arcs contribute a lot.
    """

    def __init__(self, scale: float = 1e15):
        """
        Args:
            scale: Sum value (m²) that maps to ~0.63. Default 1e15.
        """
        self.scale = scale

    def score(self, sim_result: SimulationResult) -> float:
        trajectories = sim_result.trajectories
        if not trajectories:
            return 0.0

        total = 0.0
        for traj in trajectories:
            if len(traj) < 3:
                continue
            traj = np.asarray(traj)

            # Segment lengths
            segments = np.diff(traj, axis=0)
            seg_lengths = np.linalg.norm(segments, axis=1)

            # Curvature at interior points
            v1 = traj[1:-1] - traj[:-2]
            v2 = traj[2:] - traj[1:-1]

            cross = np.cross(v1, v2)
            cross_mag = np.linalg.norm(cross, axis=1)

            v_mag = (np.linalg.norm(v1, axis=1) + np.linalg.norm(v2, axis=1)) / 2
            v_mag = np.maximum(v_mag, 1e-10)

            curvatures = cross_mag / (v_mag**2)
            curvatures = np.maximum(curvatures, 1e-30)  # Avoid div by zero
            radii = 1.0 / curvatures

            # Cap radii to avoid infinity (straight lines)
            radii = np.minimum(radii, 1e15)  # ~670 AU max

            # Sum of (avg_segment_length × radius) for each interior point
            for i, radius in enumerate(radii):
                seg_len = (seg_lengths[i] + seg_lengths[i + 1]) / 2
                total += seg_len * radius

        return 1.0 - np.exp(-total / self.scale)

    @property
    def name(self) -> str:
        return "SweepingArcs"


class TotalDistance(ScoreFunction):
    """Score based on total distance traveled by all bodies.

    Sums path lengths across all trajectories, normalized by scale.
    """

    def __init__(self, scale: float = 1e14):
        """
        Args:
            scale: Distance in meters that maps to ~0.63. Default 1e14 (~670 AU total).
        """
        self.scale = scale

    def score(self, sim_result: SimulationResult) -> float:
        trajectories = sim_result.trajectories
        if not trajectories:
            return 0.0

        total_dist = 0.0
        for traj in trajectories:
            if len(traj) < 2:
                continue
            traj = np.asarray(traj)
            segments = np.diff(traj, axis=0)
            total_dist += np.sum(np.linalg.norm(segments, axis=1))

        return 1.0 - np.exp(-total_dist / self.scale)

    @property
    def name(self) -> str:
        return "TotalDistance"


class Target(ScoreFunction):
    """Wrapper that rewards scores close to a target value.

    Uses gaussian-like falloff: exp(-((score - target) / sigma)^2)
    Score of 1.0 when exactly at target, falls off as distance increases.
    """

    def __init__(self, score_fn: ScoreFunction, target: float, sigma: float = 0.2):
        """
        Args:
            score_fn: The underlying score function (should return 0-1)
            target: Desired value (0-1)
            sigma: Controls falloff width. 0.2 means ~0.6 score at ±0.2 from target.
        """
        self.score_fn = score_fn
        self.target = target
        self.sigma = sigma

    def score(self, sim_result: SimulationResult) -> float:
        raw = self.score_fn.score(sim_result)
        distance = abs(raw - self.target)
        return np.exp(-((distance / self.sigma) ** 2))

    def score_with_breakdown(self, sim_result: SimulationResult) -> tuple[float, dict[str, float]]:
        """Return both the target-adjusted score and the raw underlying score."""
        raw = self.score_fn.score(sim_result)
        adjusted = np.exp(-((abs(raw - self.target) / self.sigma) ** 2))
        # Breakdown shows the RAW score so you can see the actual value
        return adjusted, {self.score_fn.name: raw}

    @property
    def name(self) -> str:
        return f"{self.score_fn.name}@{self.target:.1f}"
