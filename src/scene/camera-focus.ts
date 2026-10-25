import { Vector3 } from "three";

import type { MajorBodyDefinition } from "../physics/solar-system";
import {
  SATURN_MAIN_RING_OUTER_RADIUS_KM,
  URANUS_MAIN_RING_OUTER_RADIUS_KM,
} from "./ring-system";
import { displayedRadiusAu } from "./scale";

const DISPLAY_RADIUS_CLEARANCE = 4;
const MAXIMUM_ENHANCED_FOCUS_SCALE = 12;
const FOCUS_DISTANCE_TO_NEAR_PLANE_RATIO = 64;

const RING_SYSTEM_OUTER_RADIUS_KM: Readonly<Record<string, number>> = {
  saturn: SATURN_MAIN_RING_OUTER_RADIUS_KM,
  // Frame the resolvable main rings by default. Nu and Mu remain physically
  // present but are extremely diffuse and can be reached by zooming out.
  uranus: URANUS_MAIN_RING_OUTER_RADIUS_KM,
};

// The radius of everything a body shows, its rings included, when the body
// itself is drawn with the given radius.
export function visualExtentAu(
  body: MajorBodyDefinition,
  drawnRadiusAu: number,
): number {
  const ringOuterRadiusKm = RING_SYSTEM_OUTER_RADIUS_KM[body.id];
  if (ringOuterRadiusKm === undefined) {
    return drawnRadiusAu;
  }
  return (drawnRadiusAu * (ringOuterRadiusKm * 1_000)) / body.meanRadiusM;
}

function displayedVisualExtentAu(
  body: MajorBodyDefinition,
  visibilityBoost: number,
): number {
  return visualExtentAu(body, displayedRadiusAu(body, visibilityBoost));
}

function physicalVisualExtentAu(body: MajorBodyDefinition): number {
  return displayedVisualExtentAu(body, 0);
}

export function focusDistanceAu(
  body: MajorBodyDefinition,
  visibilityBoost: number,
): number {
  const physicalExtent = physicalVisualExtentAu(body);
  const displayedExtent = Math.min(
    displayedVisualExtentAu(body, visibilityBoost),
    physicalExtent * MAXIMUM_ENHANCED_FOCUS_SCALE,
  );
  return displayedExtent * DISPLAY_RADIUS_CLEARANCE;
}

export function focusNearPlaneAu(
  focusDistance: number,
  maximumNearPlane: number,
): number {
  if (!Number.isFinite(focusDistance) || focusDistance <= 0) {
    throw new Error("Focus distance must be positive and finite");
  }
  if (!Number.isFinite(maximumNearPlane) || maximumNearPlane <= 0) {
    throw new Error("Maximum near plane must be positive and finite");
  }
  return Math.min(
    maximumNearPlane,
    focusDistance / FOCUS_DISTANCE_TO_NEAR_PLANE_RATIO,
  );
}

// A catalogue moon has no radius, so the camera frames it with its parent:
// seen across the line between them, the parent sits half way from the
// centre to the edge of the narrower side of the view.
export function catalogueMoonFocusDistanceAu(
  separationAu: number,
  verticalFovDeg: number,
  aspect: number,
): number {
  if (!Number.isFinite(separationAu) || separationAu <= 0) {
    throw new Error("Catalogue moon separation must be positive and finite");
  }
  if (!Number.isFinite(aspect) || aspect <= 0) {
    throw new Error("Camera aspect must be positive and finite");
  }
  const halfHeightRad = (verticalFovDeg * Math.PI) / 360;
  const halfNarrowRad = Math.min(
    halfHeightRad,
    Math.atan(Math.tan(halfHeightRad) * aspect),
  );
  return separationAu / Math.tan(halfNarrowRad / 2);
}

// A camera distance tuned for a landscape view. The field of view is vertical,
// so in a portrait view the camera moves out by the aspect ratio: the region
// that fits the landscape height then fits the portrait width.
export function portraitFitDistanceAu(
  distanceAu: number,
  aspect: number,
): number {
  if (!Number.isFinite(aspect) || aspect <= 0) {
    throw new Error("Camera aspect must be positive and finite");
  }
  return distanceAu / Math.min(1, aspect);
}

// A model seen from straight down the Sun line shows no shadows and reads
// flat. The camera turns sideways and north off that line to a phase angle of
// about 40 degrees: about 88% of the visible side stays sunlit, so the view
// is still the sunlit side, and the shadows show the shape.
const MODEL_VIEW_SIDE_OFFSET = 0.75;
const MODEL_VIEW_NORTH_OFFSET = 0.35;

export function sunlitModelViewDirection(
  sunDirection: Vector3,
  north: Vector3,
): Vector3 {
  const sun = sunDirection.clone().normalize();
  const side = sun.clone().cross(north).normalize();
  const up = north.clone().addScaledVector(sun, -north.dot(sun)).normalize();
  return sun
    .addScaledVector(side, MODEL_VIEW_SIDE_OFFSET)
    .addScaledVector(up, MODEL_VIEW_NORTH_OFFSET)
    .normalize();
}
