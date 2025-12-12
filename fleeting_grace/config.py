"""Configuration constants for the simulation."""

# Tube / mesh export settings
PATH_TUBE_RADIUS = 0.05  # Radius of the pipe around each path
TUBE_SEGMENTS = 8  # Number of segments around the circle (8–16 is reasonable)
PATH_SAMPLE_STRIDE = 10  # Use every Nth point to keep mesh size manageable

G = 1.0  # Gravitational constant (arbitrary units)
DT = 0.01  # Time step
MAX_STEPS = 200_000  # Hard cap on number of integration steps **per simulation**

BOUNDING_BOX = 5  # Stop if |x|, |y|, or |z| exceeds this
COLLISION_RADIUS = 0.05  # Consider bodies "collided" if closer than this

POSITION_RANGE = 1.0  # Initial positions in [-POSITION_RANGE, POSITION_RANGE]
VELOCITY_SCALE = 0.2  # Scale of initial random velocities

OUTPUT_OBJ_FILE = "three_body_paths.obj"

# Search parameters
MIN_STEPS_TARGET = 3_000  # We want a trajectory surviving at least this many steps
MAX_ATTEMPTS = 100  # Max number of random tries before giving up
