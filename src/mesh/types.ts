/** Style options for the body start position marker. */
export type StartStyle = "none" | "solid_sphere" | "armillary" | "ring";

/** Style options for the body end position marker. */
export type EndStyle = "none" | "solid_sphere" | "exploding";

/** Settings for the body start position marker. */
export interface StartPositionSettings {
  style: StartStyle;
  scaleFactor: number;
  segments: number;
  /** Ring/armillary: radial band width as fraction of marker radius. */
  ringWidth: number;
  /** Ring/armillary: extrusion thickness as fraction of marker radius. */
  ringThickness: number;
  /** Whether to show a velocity arrow at the start. */
  showVelocityArrow: boolean;
}

/** Settings for the body end position marker. */
export interface EndPositionSettings {
  style: EndStyle;
  scaleFactor: number;
  segments: number;
  /** Exploding-specific: number of Voronoi fragments per body. */
  fragmentCount: number;
  /** Exploding-specific: physics simulation steps for fragment spread. */
  physicsSteps: number;
}

/** All export/mesh settings for a single simulation. */
export interface ExportSettings {
  tubeSegments: number;
  /** Output bounding sphere size in inches. */
  outputSize: number;
  start: StartPositionSettings;
  end: EndPositionSettings;
}

export const DEFAULT_START_SETTINGS: StartPositionSettings = {
  style: "armillary",
  scaleFactor: 6.0,
  segments: 64,
  ringWidth: 0.15,
  ringThickness: 0.05,
  showVelocityArrow: true,
};

export const DEFAULT_END_SETTINGS: EndPositionSettings = {
  style: "solid_sphere",
  scaleFactor: 6.0,
  segments: 64,
  fragmentCount: 10,
  physicsSteps: 60,
};

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  tubeSegments: 64,
  outputSize: 9,
  start: { ...DEFAULT_START_SETTINGS },
  end: { ...DEFAULT_END_SETTINGS },
};
