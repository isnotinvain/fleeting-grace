"""Trajectory simplification using Douglas-Peucker algorithm for 3D curves."""

import numpy as np


def _point_line_distances(points: np.ndarray, start: np.ndarray, end: np.ndarray) -> np.ndarray:
    """
    Compute perpendicular distances from points to line segment (vectorized).

    Args:
        points: (N, 3) array of points
        start: (3,) line segment start
        end: (3,) line segment end

    Returns:
        (N,) array of distances
    """
    line_vec = end - start
    line_len_sq = np.dot(line_vec, line_vec)

    if line_len_sq < 1e-20:
        # Start and end are the same point
        return np.linalg.norm(points - start, axis=1)

    # Project points onto line, get parameter t
    t = np.dot(points - start, line_vec) / line_len_sq
    # Clamp to [0, 1] for segment
    t = np.clip(t, 0, 1)
    # Closest points on segment
    closest = start + np.outer(t, line_vec)
    # Distances
    return np.linalg.norm(points - closest, axis=1)


def _douglas_peucker_indices(points: np.ndarray, epsilon: float) -> list[int]:
    """
    Douglas-Peucker algorithm returning indices of points to keep.
    """
    n = len(points)
    if n <= 2:
        return list(range(n))

    # Use a stack-based approach to avoid recursion limits
    keep = np.zeros(n, dtype=bool)
    keep[0] = True
    keep[-1] = True

    stack = [(0, n - 1)]

    while stack:
        start, end = stack.pop()

        if end - start <= 1:
            continue

        # Compute distances for all points between start and end
        segment = points[start + 1 : end]
        distances = _point_line_distances(segment, points[start], points[end])

        # Find max distance
        max_idx_local = np.argmax(distances)
        max_dist = distances[max_idx_local]
        max_idx = start + 1 + max_idx_local

        if max_dist > epsilon:
            keep[max_idx] = True
            stack.append((start, max_idx))
            stack.append((max_idx, end))

    return np.where(keep)[0].tolist()


def simplify_trajectory(
    points: np.ndarray,
    epsilon: float | None = None,
) -> np.ndarray:
    """
    Simplify a 3D trajectory using Douglas-Peucker algorithm.

    Args:
        points: (N, 3) array of trajectory points
        epsilon: Maximum deviation from line (default: 0.1% of trajectory diagonal)

    Returns:
        Simplified (M, 3) array where M <= N
    """
    if len(points) <= 2:
        return points

    # Compute bounding box diagonal for default epsilon
    if epsilon is None:
        bbox_min = np.min(points, axis=0)
        bbox_max = np.max(points, axis=0)
        diagonal = np.linalg.norm(bbox_max - bbox_min)

        if diagonal < 1e-10:
            return points[:1]  # All points are the same

        epsilon = diagonal * 0.0001  # 0.01% of diagonal

    indices = _douglas_peucker_indices(points, epsilon)
    return points[indices]
