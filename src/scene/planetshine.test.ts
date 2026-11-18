import { DataUtils, Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { predictedPlanetshineFill } from "../../tests/e2e/fixtures/planetshine-prediction";
import bodyAlbedoJson from "../data/body-albedo.snapshot.json";
import { majorBodySnapshot } from "../physics/solar-system";
import {
  bodyAlbedoSnapshotSchema,
  PLANETSHINE_MAP_HEIGHT,
  PLANETSHINE_MAP_WIDTH,
  planetshineAngularRadiusRad,
  planetshineFillRatio,
  planetshineFrame,
  planetshineNeedsRebuild,
  planetshineSourceById,
  planetshineSourceId,
  type PlanetshineSource,
  writePlanetshineMap,
} from "./planetshine";

const SUNLIGHT: [number, number, number] = [1, 0.88, 0.82];
const DEGREE = Math.PI / 180;

function radiusM(bodyId: string): number {
  const body = majorBodySnapshot.bodies.find(
    (candidate) => candidate.id === bodyId,
  );
  if (body === undefined) throw new Error(`${bodyId} is not in the snapshot`);
  return body.meanRadiusM;
}

function source(bodyId: string): PlanetshineSource {
  const found = planetshineSourceById.get(bodyId);
  if (found === undefined) throw new Error(`${bodyId} has no albedo`);
  return found;
}

function newMap(): Uint16Array {
  return new Uint16Array(PLANETSHINE_MAP_WIDTH * PLANETSHINE_MAP_HEIGHT * 4);
}

/** The fill the scene reports for a map, with one intensity for both lights. */
function mapFill(
  bodyId: string,
  angularRadiusRad: number,
  phaseAngleRad: number,
): number {
  const irradiance = writePlanetshineMap(
    newMap(),
    { angularRadiusRad, phaseAngleRad },
    source(bodyId),
    SUNLIGHT,
  );
  return planetshineFillRatio(2.5, irradiance, 2.5, SUNLIGHT);
}

function predictedFill(
  bodyId: string,
  angularRadiusRad: number,
  phaseAngleRad: number,
): number {
  const { reflectance } = source(bodyId);
  return predictedPlanetshineFill({
    law: reflectance.law,
    albedo:
      reflectance.law === "lambert"
        ? reflectance.bondAlbedo
        : reflectance.geometricAlbedo,
    angularRadiusRad,
    phaseAngleRad,
  });
}

// Each model's parent and orbit radius in this app, with the fill on a
// surface facing the parent at zero phase.
const MODEL_ORBITS = [
  ["ISS, 420 km", "earth", radiusM("earth") + 420_000, 0.258],
  ["Discovery One, 400 km", "io", 1_821_600 + 400_000, 0.508],
  ["Death Star II, 650 km", "ganymede", 2_634_100 + 650_000, 0.344],
  ["Death Star I, 500 km", "callisto", 2_410_300 + 500_000, 0.159],
  ["Deep Space Nine, 10,000 km", "callisto", 2_410_300 + 10_000_000, 0.0078],
] as const;

describe("body albedo snapshot", () => {
  it("rejects a body without the albedo its law needs", () => {
    expect(() => bodyAlbedoSnapshotSchema.parse(bodyAlbedoJson)).not.toThrow();
    for (const [index, field] of [
      [0, "bondAlbedo"],
      [2, "geometricAlbedo"],
    ] as const) {
      const missing = structuredClone(bodyAlbedoJson);
      const body = missing.bodies[index];
      if (body === undefined) throw new Error("Snapshot is too short");
      Reflect.deleteProperty(body.reflectance, field);
      expect(() => bodyAlbedoSnapshotSchema.parse(missing)).toThrow(
        new RegExp(field, "u"),
      );
    }
  });

  it("finds the natural body that each model orbits or sits near", () => {
    const parents: Record<string, string | undefined> = {
      iss: "earth",
      hubble: "earth",
      "discovery-one": "io",
      "death-star-1": "callisto",
      "death-star-2": "ganymede",
      "deep-space-nine": "callisto",
      "uss-defiant": "deep-space-nine",
      "jovian-monolith": "jupiter",
      jwst: "sun",
      "voyager-1": "sun",
    };
    const natural = (id: string) =>
      majorBodySnapshot.bodies.some((body) => body.id === id);
    const sourceOf = (id: string) =>
      planetshineSourceId(id, (child) => parents[child], natural);
    expect(sourceOf("iss")).toBe("earth");
    expect(sourceOf("hubble")).toBe("earth");
    expect(sourceOf("discovery-one")).toBe("io");
    expect(sourceOf("death-star-1")).toBe("callisto");
    expect(sourceOf("death-star-2")).toBe("ganymede");
    expect(sourceOf("uss-defiant")).toBe("callisto");
    expect(sourceOf("jovian-monolith")).toBe("jupiter");
    expect(sourceOf("jwst")).toBeUndefined();
    expect(sourceOf("voyager-1")).toBeUndefined();
    expect(() => planetshineSourceId("probe", () => "europa", natural)).toThrow(
      /europa has no sourced albedo/u,
    );
  });
});

describe("planetshine map", () => {
  it("draws the parent's disc at angular radius asin(R / d)", () => {
    // The ISS: Earth's disc is 70 degrees in radius, not atan(R / d) = 43.
    const angularRadiusRad = planetshineAngularRadiusRad(6_371, 6_791);
    expect(angularRadiusRad / DEGREE).toBeCloseTo(69.7, 1);
    const data = newMap();
    writePlanetshineMap(
      data,
      { angularRadiusRad, phaseAngleRad: 0 },
      source("io"),
      SUNLIGHT,
    );
    const texelRad = (2 * Math.PI) / PLANETSHINE_MAP_WIDTH;
    // Along the equator row through the parent's centre (+z, longitude 90).
    const row = PLANETSHINE_MAP_HEIGHT / 2;
    const rowLatitude = ((row + 0.5) / PLANETSHINE_MAP_HEIGHT - 0.5) * Math.PI;
    let checked = 0;
    for (let column = 0; column < PLANETSHINE_MAP_WIDTH; column += 1) {
      const longitude =
        ((column + 0.5) / PLANETSHINE_MAP_WIDTH - 0.5) * 2 * Math.PI;
      const fromCentre = Math.acos(Math.cos(rowLatitude) * Math.sin(longitude));
      const red = DataUtils.fromHalfFloat(
        data[(row * PLANETSHINE_MAP_WIDTH + column) * 4] ?? Number.NaN,
      );
      if (fromCentre < angularRadiusRad - texelRad) {
        expect(red).toBeGreaterThan(0);
        checked += 1;
      } else if (fromCentre > angularRadiusRad + texelRad) {
        expect(red).toBe(0);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(PLANETSHINE_MAP_WIDTH - 6);
  });

  it("gives the far-field fill at zero phase", () => {
    // Far away, a lommel-seeliger disc gives p sin^2(a) and a lambert disc
    // (2/3) A sin^2(a). At 20 radii, sin(a) = 1 / 20, the near side still
    // gives a few percent more.
    const far = planetshineAngularRadiusRad(1, 20);
    const io = source("io").reflectance;
    const earth = source("earth").reflectance;
    if (io.law !== "lommel-seeliger" || earth.law !== "lambert") {
      throw new Error("Io and Earth laws changed");
    }
    for (const share of [
      mapFill("io", far, 0) / (io.geometricAlbedo / 400),
      mapFill("earth", far, 0) / ((2 / 3) * (earth.bondAlbedo / 400)),
    ]) {
      expect(share).toBeGreaterThan(1);
      expect(share).toBeLessThan(1.07);
    }
  });

  it("matches the fill integrated over the parent's surface", () => {
    for (const [, bodyId, distanceM, fullPhaseFill] of MODEL_ORBITS) {
      const angularRadiusRad = planetshineAngularRadiusRad(
        radiusM(bodyId),
        distanceM,
      );
      expect(mapFill(bodyId, angularRadiusRad, 0) / fullPhaseFill).toBeCloseTo(
        1,
        1,
      );
      for (const phaseDeg of [0, 30, 63, 90, 112, 150]) {
        const predicted = predictedFill(
          bodyId,
          angularRadiusRad,
          phaseDeg * DEGREE,
        );
        const fill = mapFill(bodyId, angularRadiusRad, phaseDeg * DEGREE);
        // Within 3%, or 0.0005 of the sunlight for a crescent thinner than
        // the map's texels.
        expect(Math.abs(fill - predicted)).toBeLessThan(
          Math.max(0.03 * predicted, 0.0005),
        );
      }
      expect(mapFill(bodyId, angularRadiusRad, Math.PI)).toBe(0);
    }
  });

  it("changes by at most 1.1% of the sunlight over one degree of phase", () => {
    for (const [, bodyId, distanceM] of MODEL_ORBITS) {
      const angularRadiusRad = planetshineAngularRadiusRad(
        radiusM(bodyId),
        distanceM,
      );
      for (let phaseDeg = 0; phaseDeg < 180; phaseDeg += 1) {
        const step = Math.abs(
          predictedFill(bodyId, angularRadiusRad, (phaseDeg + 1) * DEGREE) -
            predictedFill(bodyId, angularRadiusRad, phaseDeg * DEGREE),
        );
        expect(step).toBeLessThan(0.0115);
      }
    }
    // About 1.7 s alone, and past the 5 s default when the suite runs
    // beside a browser.
  }, 20_000);

  it("tints the light by the parent", () => {
    const data = newMap();
    writePlanetshineMap(
      data,
      { angularRadiusRad: 0.9, phaseAngleRad: 0 },
      source("io"),
      SUNLIGHT,
    );
    const centre =
      ((PLANETSHINE_MAP_HEIGHT / 2) * PLANETSHINE_MAP_WIDTH +
        (3 * PLANETSHINE_MAP_WIDTH) / 4) *
      4;
    const red = DataUtils.fromHalfFloat(data[centre] ?? Number.NaN);
    const blue = DataUtils.fromHalfFloat(data[centre + 2] ?? Number.NaN);
    // Io is sulphur yellow: far more red than blue.
    expect(red / blue).toBeGreaterThan(2);
  });

  it("rebuilds only for a visible change", () => {
    const built = { angularRadiusRad: 0.5, phaseAngleRad: 0.3 };
    expect(planetshineNeedsRebuild(undefined, built)).toBe(true);
    expect(planetshineNeedsRebuild(built, { ...built })).toBe(false);
    expect(
      planetshineNeedsRebuild(built, { ...built, phaseAngleRad: 0.3 + 0.01 }),
    ).toBe(false);
    expect(
      planetshineNeedsRebuild(built, { ...built, phaseAngleRad: 0.3 + 0.02 }),
    ).toBe(true);
    // sin^2(0.501) is 0.4% above sin^2(0.5), sin^2(0.503) 1.1%.
    expect(
      planetshineNeedsRebuild(built, { ...built, angularRadiusRad: 0.501 }),
    ).toBe(false);
    expect(
      planetshineNeedsRebuild(built, { ...built, angularRadiusRad: 0.503 }),
    ).toBe(true);
  });
});

describe("planetshine frame", () => {
  it("turns +z to the parent and the Sun into the +x side", () => {
    const model = new Vector3(3, -2, 5);
    const parent = new Vector3(3.6, -1.1, 4.2);
    const sun = new Vector3(-40, 25, 90);
    const rotation = new Matrix4();
    const geometry = planetshineFrame(model, parent, sun, 0.5, rotation);
    const inverse = rotation.clone().invert();
    const toParent = parent
      .clone()
      .sub(model)
      .normalize()
      .applyMatrix4(inverse);
    expect(toParent.z).toBeCloseTo(1, 9);
    const sunFromParent = sun
      .clone()
      .sub(parent)
      .normalize()
      .applyMatrix4(inverse);
    expect(sunFromParent.y).toBeCloseTo(0, 9);
    expect(sunFromParent.x).toBeGreaterThan(0);
    expect(-sunFromParent.z).toBeCloseTo(Math.cos(geometry.phaseAngleRad), 9);
    expect(geometry.angularRadiusRad).toBeCloseTo(
      Math.asin(0.5 / parent.distanceTo(model)),
      12,
    );
  });

  it("rejects a model inside its parent", () => {
    expect(() => planetshineAngularRadiusRad(2, 1.5)).toThrow(/outside/u);
  });
});
