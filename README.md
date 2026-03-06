# Fleeting Grace

Generates nice looking 3 Body Problem simulations and turns them into 3D models for 3D printing.

## Installation

```bash
uv sync
```

## Usage

### Basic random search

Run random simulations and open an interactive Three.js viewer:

```bash
uv run python -m fleeting_grace
```

### Options

```bash
# Run more random simulations (default: 50)
uv run python -m fleeting_grace -n 100

# Include 3D mesh views alongside line views
uv run python -m fleeting_grace --mesh

# Run L-BFGS-B optimization from best random result
uv run python -m fleeting_grace --optimize --optimize-iters 100

# Run parallel hill climber (perturbs velocity angles)
uv run python -m fleeting_grace --hillclimb --hillclimb-iters 20

# Skip viewer / skip OBJ export
uv run python -m fleeting_grace --no-viewer --no-export
```

### Viewer controls

- **Drag** to rotate
- **Scroll** to zoom
- **Right-drag** to pan
- **Arrow keys** to navigate between simulations
- **Save ICs** button copies initial conditions to clipboard

## Output

- `trajectory_viewer.html` - Interactive Three.js viewer
- `trajectories.obj` - 3D mesh for 3D printing (when using `--mesh`)

## License

[Fleeting Grace](https://github.com/isnotinvain/fleetig-grace) © 2025 by [Alexander Levenson](https://www.isnotinvain.com/) is licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)

![CC](https://mirrors.creativecommons.org/presskit/icons/cc.svg) ![BY](https://mirrors.creativecommons.org/presskit/icons/by.svg) ![NC](https://mirrors.creativecommons.org/presskit/icons/nc.svg) ![SA](https://mirrors.creativecommons.org/presskit/icons/sa.svg)
