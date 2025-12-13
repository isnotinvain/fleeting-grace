"""Configuration constants for the simulation using real physical units."""

# =============================================================================
# Physical Constants
# =============================================================================
G = 6.67408e-11  # Gravitational constant (N*m^2/kg^2)
SOLAR_MASS = 2e30  # kg per solar mass
AU = 1.5e11  # meters per AU
YEAR_SECONDS = 365.25 * 24 * 3600  # seconds per year

# =============================================================================
# Simulation Parameters
# =============================================================================
MAX_TIME_YEARS = 60  # Maximum simulation duration in years
DT = 5 * 3600  # Time step: 5 hours in seconds
MAX_STEPS = int(MAX_TIME_YEARS * YEAR_SECONDS / DT)  # ~105,192 steps

# =============================================================================
# Boundaries
# =============================================================================
MAX_RADIUS = 150 * AU  # Escape detection threshold (meters)

# Stellar radius calculation (realistic)
# Using mass-radius relation: R = R_sun * (M/M_sun)^0.8
SOLAR_RADIUS = 7e8  # meters (radius of the sun)

# =============================================================================
# Initial Condition Ranges (user-facing units)
# =============================================================================
MASS_RANGE_SOLAR = (0.1, 150)  # Solar masses
POSITION_RANGE_AU = (-35, 35)  # AU from origin (wider to accommodate body radii)
VELOCITY_RANGE_KMS = (-20, 20)  # km/s (higher than ThreeBodyBot's ±7 to compensate for larger distances)

# =============================================================================
# Optimizer Settings
# =============================================================================
CMAES_SIGMA0 = 0.3  # Initial step size for CMA-ES
HYBRID_RANDOM_SAMPLES = 50  # Random samples before optimization
HYBRID_CMAES_STARTS = 1  # Number of CMA-ES runs from best random samples
HYBRID_CMAES_ITERATIONS = 10  # Iterations per CMA-ES run
MAX_OPTIMIZER_ITERATIONS = 100  # Total optimization iterations


# =============================================================================
# Criterion Settings
# =============================================================================
DEFAULT_BOUNDING_RADIUS = 100 * AU  # Default sphere radius for bounded criterion (meters)
MIN_TIME_YEARS = 15  # Minimum desired simulation duration in years
MIN_STEPS_TARGET = int(MIN_TIME_YEARS * YEAR_SECONDS / DT)  # Converted to steps
EARLY_WEIGHT_DECAY = 0.9999  # Weight decay per step for early timestep emphasis

# =============================================================================
# Export Settings (Tube/mesh for 3D printing)
# =============================================================================
PATH_TUBE_RADIUS = 0.05 * AU  # Radius of the pipe around each path (meters)
TUBE_SEGMENTS = 8  # Number of segments around the circle (8-16 is reasonable)
PATH_SAMPLE_STRIDE = 100  # Use every Nth point to keep mesh size manageable

OUTPUT_OBJ_FILE = "three_body_paths.obj"
