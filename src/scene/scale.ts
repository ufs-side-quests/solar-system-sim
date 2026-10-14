import type { MajorBodyDefinition } from "../physics/solar-system";
import { ASTRONOMICAL_UNIT_M } from "../physics/solar-system";
import { PARENT_BODY_ID } from "./body-facts";

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

// The largest factor on two readable radii that keeps the pair within
// NEIGHBOUR_SEPARATION_FILL of their separation. A catalogue moon drawn as a
// point has a readable radius of 0.
export function pairClearanceScale(
  ownEnhancedAu: number,
  otherEnhancedAu: number,
  distanceAu: number,
): number {
  if (!Number.isFinite(distanceAu) || distanceAu <= 0) {
    throw new Error("Neighbour distance must be positive and finite");
  }
  return (
    (NEIGHBOUR_SEPARATION_FILL * distanceAu) / (ownEnhancedAu + otherEnhancedAu)
  );
}

export type OrreryPosition = Readonly<{ x: number; y: number; z: number }>;

export type OrreryCatalogueMoon = Readonly<{ id: string; parentId: string }>;

export type OrreryLayout = Readonly<{
  // One factor, at most 1, on every readable radius. A shared factor keeps the
  // true size order of everything drawn.
  clearanceScale: number;
  radiusAuById: ReadonlyMap<string, number>;
  // Moons outside the focused system that would crowd an enlarged body, for
  // example the Moon inside an enlarged Earth. They are not drawn.
  hiddenIds: ReadonlySet<string>;
}>;

function distanceAu(a: OrreryPosition, b: OrreryPosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function requiredPosition(
  positions: ReadonlyMap<string, OrreryPosition>,
  bodyId: string,
): OrreryPosition {
  const position = positions.get(bodyId);
  if (position === undefined) {
    throw new Error(`Scene position is missing body ${bodyId}`);
  }
  return position;
}

// Natural bodies form systems: the Sun, and each planet or dwarf planet with
// its moons. The scale rule takes the Sun, every planet and dwarf planet, and
// every moon of the open (focused) system; their pairs fill at most
// NEIGHBOUR_SEPARATION_FILL of their separation. All bodies share the smallest
// pair factor. A moon of any other system is hidden when it and an enlarged
// body would fill more than that fraction. Spacecraft and fictional objects
// never take part.
export function orreryLayout(
  bodies: readonly MajorBodyDefinition[],
  catalogueMoons: readonly OrreryCatalogueMoon[],
  positions: ReadonlyMap<string, OrreryPosition>,
  openSystemId: string | undefined,
  visibilityBoost: number,
): OrreryLayout {
  if (
    openSystemId !== undefined &&
    !bodies.some(
      (body) =>
        body.id === openSystemId &&
        (body.type === "planet" || body.type === "dwarf-planet"),
    )
  ) {
    throw new Error(`Open system ${openSystemId} is not a planet system`);
  }
  const isInOpenSystem = (body: MajorBodyDefinition): boolean => {
    if (body.type !== "moon") {
      return true;
    }
    const parentId = PARENT_BODY_ID[body.id];
    if (parentId === undefined) {
      throw new Error(`Moon ${body.id} has no parent body`);
    }
    return parentId === openSystemId;
  };
  const sized = bodies.filter(isInOpenSystem).map((body) => ({
    enhancedAu: enhancedRadiusAu(body),
    position: requiredPosition(positions, body.id),
  }));
  // A catalogue moon of another system cannot limit the scale, and one without
  // a state is not drawn.
  const openCatalogueMoonPositions: OrreryPosition[] = [];
  for (const moon of catalogueMoons) {
    const position = positions.get(moon.id);
    if (moon.parentId === openSystemId && position !== undefined) {
      openCatalogueMoonPositions.push(position);
    }
  }
  let clearanceScale = 1;
  for (const entry of sized) {
    for (const other of sized) {
      if (other !== entry) {
        clearanceScale = Math.min(
          clearanceScale,
          pairClearanceScale(
            entry.enhancedAu,
            other.enhancedAu,
            distanceAu(entry.position, other.position),
          ),
        );
      }
    }
    for (const moonPosition of openCatalogueMoonPositions) {
      clearanceScale = Math.min(
        clearanceScale,
        pairClearanceScale(
          entry.enhancedAu,
          0,
          distanceAu(entry.position, moonPosition),
        ),
      );
    }
  }

  const drawn = bodies.map((body) => {
    const radiusAu = nonOverlappingDisplayedRadiusAu(
      body,
      visibilityBoost,
      clearanceScale,
    );
    return {
      body,
      position: requiredPosition(positions, body.id),
      radiusAu,
      enlarged: radiusAu > body.meanRadiusM / ASTRONOMICAL_UNIT_M,
    };
  });
  // True radii never need hiding. A pair with an enlarged body may fill at
  // most NEIGHBOUR_SEPARATION_FILL of its separation, which also leaves room
  // for the equatorial bulge of the giant planets.
  const crowdsAnotherBody = (
    id: string,
    position: OrreryPosition,
    radiusAu: number,
    enlarged: boolean,
  ): boolean =>
    drawn.some((other) => {
      const reachAu = (radiusAu + other.radiusAu) / NEIGHBOUR_SEPARATION_FILL;
      // Most pairs are far apart on one axis, which skips the square root.
      return (
        other.body.id !== id &&
        (enlarged || other.enlarged) &&
        Math.abs(position.x - other.position.x) < reachAu &&
        distanceAu(position, other.position) < reachAu
      );
    });
  const radiusAuById = new Map<string, number>();
  const hiddenIds = new Set<string>();
  for (const { body, position, radiusAu, enlarged } of drawn) {
    radiusAuById.set(body.id, radiusAu);
    if (
      !isInOpenSystem(body) &&
      crowdsAnotherBody(body.id, position, radiusAu, enlarged)
    ) {
      hiddenIds.add(body.id);
    }
  }
  for (const moon of catalogueMoons) {
    const position = positions.get(moon.id);
    if (
      moon.parentId !== openSystemId &&
      position !== undefined &&
      crowdsAnotherBody(moon.id, position, 0, false)
    ) {
      hiddenIds.add(moon.id);
    }
  }
  return { clearanceScale, radiusAuById, hiddenIds };
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
