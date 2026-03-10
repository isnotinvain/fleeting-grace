import type { ScoreFunction } from "./types";
import { spaceFilling } from "./spaceFilling";
import { tortuosity } from "./tortuosity";
import { curvatureVariance } from "./curvatureVariance";
import { directionEntropy } from "./directionEntropy";
import { interweaving } from "./interweaving";
import { complexity } from "./complexity";
import { sweepingArcs } from "./sweepingArcs";
import { totalDistance } from "./totalDistance";
import { duration } from "./duration";

/**
 * All scoring functions in display order.
 * The index in this array matches the metricIndex used in perMetricScores.
 */
export const scoreFunctions: ScoreFunction[] = [
  spaceFilling,
  tortuosity,
  curvatureVariance,
  directionEntropy,
  interweaving,
  complexity,
  sweepingArcs,
  totalDistance,
  duration,
];
