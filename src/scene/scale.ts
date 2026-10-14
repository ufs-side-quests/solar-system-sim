import type { MajorBodyDefinition } from "../physics/solar-system";
import { ASTRONOMICAL_UNIT_M } from "../physics/solar-system";

export const MINIMUM_RESOLVABLE_BODY_DIAMETER_CSS_PIXELS = 1;

// Readable radii keep the true size order: every planet and moon scales by the
// square root of its true radius, so Jupiter stays larger than Earth and Earth
// larger than Mars. Earth is drawn at 0.02 AU.
const ENHANCED_EARTH_RADIUS_AU = 0.02;
const EARTH_MEAN_RADIUS_M = 6_371_008.4;
// The square-root law would draw the Sun far wider than Mercury's orbit, so the
// Sun takes a fixed radius: larger than Jupiter (0.066 AU) and clear of Mercury
// at perihelion (0.3075 AU) under the neighbour gap rule below.
const ENHANCED_SUN_RADIUS_AU = 0.1;
// Two neighbouring natural bodies together fill at most this fraction of the
// distance between their centres. Each takes a share in proportion to its
// readable radius, so the larger body stays larger.
export const NEIGHBOUR_SEPARATION_FILL = 0.4;

function enhancedRadiusAu(body: MajorBodyDefinition): number {
  if (body.type === "star") {
    return ENHANCED_SUN_RADIUS_AU;
  }
  return (
    ENHANCED_EARTH_RADIUS_AU * Math.sqrt(body.meanRadiusM / EARTH_MEAN_RADIUS_M)
  );
}

export function displayedRadiusAu(
  body: MajorBodyDefinition,
  visibilityBoost: number,
): number {
  if (
    !Number.isFinite(visibilityBoost) ||
    visibilityBoost < 0 ||
    visibilityBoost > 1
  ) {
    throw new Error("Body size boost must be between 0 and 1");
  }
  const physicalRadiusAu = body.meanRadiusM / ASTRONOMICAL_UNIT_M;
  return (
    physicalRadiusAu *
    Math.pow(enhancedRadiusAu(body) / physicalRadiusAu, visibilityBoost)
  );
}

export type DisplayNeighbour = {
  readonly distanceAu: number;
  // A natural body drawn with a radius, or undefined for a catalogue moon that
  // is drawn as a point.
  readonly body: MajorBodyDefinition | undefined;
};

// The factor, at most 1, on a body's readable radius that keeps it and each
// neighbour within NEIGHBOUR_SEPARATION_FILL of their separation. Only natural
// bodies are neighbours: spacecraft and fictional objects never limit a size.
export function neighbourClearanceScale(
  body: MajorBodyDefinition,
  neighbours: readonly DisplayNeighbour[],
): number {
  const ownRadiusAu = enhancedRadiusAu(body);
  let scale = 1;
  for (const neighbour of neighbours) {
    if (!Number.isFinite(neighbour.distanceAu) || neighbour.distanceAu <= 0) {
      throw new Error("Neighbour distance must be positive and finite");
    }
    const neighbourRadiusAu =
      neighbour.body === undefined ? 0 : enhancedRadiusAu(neighbour.body);
    scale = Math.min(
      scale,
      (NEIGHBOUR_SEPARATION_FILL * neighbour.distanceAu) /
        (ownRadiusAu + neighbourRadiusAu),
    );
  }
  return scale;
}

export function nonOverlappingDisplayedRadiusAu(
  body: MajorBodyDefinition,
  visibilityBoost: number,
  clearanceScale: number,
): number {
  if (
    !Number.isFinite(clearanceScale) ||
    clearanceScale <= 0 ||
    clearanceScale > 1
  ) {
    throw new Error("Clearance scale must be in (0, 1]");
  }
  const physicalRadiusAu = body.meanRadiusM / ASTRONOMICAL_UNIT_M;
  return Math.max(
    physicalRadiusAu,
    Math.min(
      displayedRadiusAu(body, visibilityBoost),
      enhancedRadiusAu(body) * clearanceScale,
    ),
  );
}

export function isPhysicalBodyResolvable(radiusCssPixels: number): boolean {
  if (!Number.isFinite(radiusCssPixels) || radiusCssPixels < 0) {
    throw new Error("Physical body radius must be finite and non-negative");
  }
  return radiusCssPixels * 2 >= MINIMUM_RESOLVABLE_BODY_DIAMETER_CSS_PIXELS;
}
