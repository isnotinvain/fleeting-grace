"""Worker functions for parallel hill climber (separate module for pickling)."""

from fleeting_grace.simulation import InitialConditions, run_simulation

# Global variables set by initializer
_termination = None
_score_fn = None


def init_worker(termination, score_fn):
    """Initialize worker process with required objects."""
    global _termination, _score_fn
    _termination = termination
    _score_fn = score_fn


def eval_candidate(vec):
    """Evaluate a single candidate (top-level for pickling)."""
    ic = InitialConditions.from_vector(vec, num_bodies=3)
    result = run_simulation(ic, _termination)
    score, breakdown = _score_fn.score_with_breakdown(result)
    result.score_breakdown = breakdown
    return score, result, vec
