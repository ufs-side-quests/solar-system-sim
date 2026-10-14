import { describe, expect, it } from "vitest";

import { additionalAvailableKnownSatellites } from "../physics/known-satellites";
import {
  ASTRONOMICAL_UNIT_M,
  majorBodySnapshot,
} from "../physics/solar-system";
import {
  displayedRadiusAu,
  isPhysicalBodyResolvable,
  NEIGHBOUR_SEPARATION_FILL,
  nonOverlappingDisplayedRadiusAu,
  orreryLayout,
  type OrreryPosition,
  pairClearanceScale,
} from "./scale";
import { PARENT_BODY_ID } from "./body-facts";

function onAxis(xAu: number): OrreryPosition {
  return { x: xAu, y: 0, z: 0 };
}

// The readable-radius factor that one pair alone allows, at most 1.
function pairScale(a: string, b: string | undefined, distanceAu: number) {
  return Math.min(
    1,
    pairClearanceScale(
      displayedRadiusAu(body(a), 1),
      b === undefined ? 0 : displayedRadiusAu(body(b), 1),
      distanceAu,
    ),
  );
}

function body(id: string) {
  const result = majorBodySnapshot.bodies.find(
    (candidate) => candidate.id === id,
  );
  if (result === undefined) {
    throw new Error(`Missing test body ${id}`);
  }
  return result;
}

describe("body scale transformations", () => {
  it("uses one common physical length scale at zero visibility boost", () => {
    const earth = body("earth");
    const moon = body("moon");

    expect(
      displayedRadiusAu(earth, 0) / displayedRadiusAu(moon, 0),
    ).toBeCloseTo(earth.meanRadiusM / moon.meanRadiusM, 12);
  });

  it("keeps the true size order of the Sun, planets and Pluto at full boost", () => {
    const largestFirst = [
      "sun",
      "jupiter",
      "saturn",
      "uranus",
      "neptune",
      "earth",
      "venus",
      "mars",
      "mercury",
      "pluto",
    ];
    const radii = largestFirst.map((id) => displayedRadiusAu(body(id), 1));

    for (let index = 1; index < radii.length; index += 1) {
      expect(radii[index]).toBeLessThan(radii[index - 1] ?? 0);
    }
  });

  it.each([
    ["jupiter", "earth"],
    ["earth", "mars"],
    ["earth", "pluto"],
    ["ganymede", "moon"],
  ])(
    "draws %s against %s at the square root of their true size ratio",
    (largerId, smallerId) => {
      const larger = body(largerId);
      const smaller = body(smallerId);

      expect(
        displayedRadiusAu(larger, 1) / displayedRadiusAu(smaller, 1),
      ).toBeCloseTo(Math.sqrt(larger.meanRadiusM / smaller.meanRadiusM), 12);
    },
  );

  it("keeps the full-boost Sun clear of Mercury at perihelion", () => {
    const mercuryPerihelionAu = 0.3075;
    const scale = pairScale("sun", "mercury", mercuryPerihelionAu);
    const sun = nonOverlappingDisplayedRadiusAu(body("sun"), 1, scale);
    const mercury = nonOverlappingDisplayedRadiusAu(body("mercury"), 1, scale);

    expect(sun).toBeCloseTo(displayedRadiusAu(body("sun"), 1), 15);
    expect(sun).toBeGreaterThan(displayedRadiusAu(body("jupiter"), 1));
    expect(sun + mercury).toBeLessThanOrEqual(
      NEIGHBOUR_SEPARATION_FILL * mercuryPerihelionAu,
    );
  });

  it("caps enhanced radii before neighboring bodies can overlap", () => {
    const earthMoonDistanceAu = 0.00257;
    const layout = orreryLayout(
      [body("earth"), body("moon")],
      [],
      new Map([
        ["earth", onAxis(0)],
        ["moon", onAxis(earthMoonDistanceAu)],
      ]),
      "earth",
      1,
    );
    const earth = layout.radiusAuById.get("earth") ?? Number.NaN;
    const moon = layout.radiusAuById.get("moon") ?? Number.NaN;

    expect(earth + moon).toBeCloseTo(
      NEIGHBOUR_SEPARATION_FILL * earthMoonDistanceAu,
      12,
    );
    expect(earth).toBeGreaterThan(moon);
  });

  it("keeps a catalogue moon point outside an enlarged planet", () => {
    const pointDistanceAu = 0.002;
    const layout = orreryLayout(
      [body("jupiter")],
      [{ id: "point", parentId: "jupiter" }],
      new Map([
        ["jupiter", onAxis(0)],
        ["point", onAxis(pointDistanceAu)],
      ]),
      "jupiter",
      1,
    );
    const jupiter = layout.radiusAuById.get("jupiter") ?? Number.NaN;

    expect(jupiter).toBeCloseTo(
      NEIGHBOUR_SEPARATION_FILL * pointDistanceAu,
      15,
    );
  });

  it("rejects a neighbour at no distance", () => {
    expect(() => pairScale("earth", "moon", 0)).toThrow(/positive and finite/u);
  });

  it.each(["jupiter", "saturn", "uranus", "neptune"])(
    "never shrinks %s below its physical radius when a moon is nearby",
    (bodyId) => {
      const definition = body(bodyId);
      const physicalRadiusAu = definition.meanRadiusM / 149_597_870_700;

      expect(
        nonOverlappingDisplayedRadiusAu(
          definition,
          0,
          pairScale(bodyId, undefined, physicalRadiusAu * 1.5),
        ),
      ).toBeCloseTo(physicalRadiusAu, 15);
    },
  );

  it("changes continuously from physical to enhanced radii", () => {
    const earth = body("earth");
    const physical = displayedRadiusAu(earth, 0);
    const midpoint = displayedRadiusAu(earth, 0.5);
    const enhanced = displayedRadiusAu(earth, 1);

    expect(midpoint).toBeCloseTo(Math.sqrt(physical * enhanced), 12);
    expect(midpoint).toBeGreaterThan(physical);
    expect(enhanced).toBeGreaterThan(midpoint);
  });

  it("rejects values outside the declared scale", () => {
    const earth = body("earth");

    expect(() => displayedRadiusAu(earth, -0.01)).toThrow(/between 0 and 1/u);
    expect(() => displayedRadiusAu(earth, 1.01)).toThrow(/between 0 and 1/u);
  });

  it("hides physical bodies smaller than one projected CSS pixel", () => {
    expect(isPhysicalBodyResolvable(0.499)).toBe(false);
    expect(isPhysicalBodyResolvable(0.5)).toBe(true);
  });

  it("rejects invalid projected physical radii", () => {
    expect(() => isPhysicalBodyResolvable(-0.1)).toThrow(
      /finite and non-negative/u,
    );
  });
});

describe("Orrery layout at the snapshot epoch", () => {
  const positions = new Map<string, OrreryPosition>(
    [...majorBodySnapshot.bodies, ...additionalAvailableKnownSatellites].map(
      (definition) => [
        definition.id,
        {
          x: definition.positionM[0] / ASTRONOMICAL_UNIT_M,
          y: definition.positionM[1] / ASTRONOMICAL_UNIT_M,
          z: definition.positionM[2] / ASTRONOMICAL_UNIT_M,
        },
      ],
    ),
  );
  const at = (bodyId: string): OrreryPosition => {
    const position = positions.get(bodyId);
    if (position === undefined) {
      throw new Error(`Missing test position ${bodyId}`);
    }
    return position;
  };
  const separationAu = (a: string, b: string): number =>
    Math.hypot(at(a).x - at(b).x, at(a).y - at(b).y, at(a).z - at(b).z);
  const layoutFor = (openSystemId: string | undefined, boost: number) =>
    orreryLayout(
      majorBodySnapshot.bodies,
      additionalAvailableKnownSatellites,
      positions,
      openSystemId,
      boost,
    );
  const radius = (
    layout: ReturnType<typeof layoutFor>,
    bodyId: string,
  ): number => {
    const value = layout.radiusAuById.get(bodyId);
    if (value === undefined) {
      throw new Error(`Missing layout radius ${bodyId}`);
    }
    return value;
  };
  const views = [
    ["the overview", undefined],
    ["a Jupiter focus", "jupiter"],
    ["an Earth focus", "earth"],
    ["a Pluto focus", "pluto"],
  ] as const;
  const boosts = [1, 0.75, 0.5, 0.25, 0];

  describe.each(views)("in %s", (_name, openSystemId) => {
    it.each(boosts)("never overlaps two drawn bodies at boost %s", (boost) => {
      const layout = layoutFor(openSystemId, boost);
      const drawn = majorBodySnapshot.bodies.filter(
        (definition) => !layout.hiddenIds.has(definition.id),
      );
      for (const [index, a] of drawn.entries()) {
        for (const b of drawn.slice(index + 1)) {
          const filled =
            (radius(layout, a.id) + radius(layout, b.id)) /
            separationAu(a.id, b.id);
          const atTrueSize =
            radius(layout, a.id) === a.meanRadiusM / ASTRONOMICAL_UNIT_M ||
            radius(layout, b.id) === b.meanRadiusM / ASTRONOMICAL_UNIT_M;
          expect(filled, `${a.id} and ${b.id}`).toBeLessThan(1);
          if (!atTrueSize) {
            expect(filled, `${a.id} and ${b.id}`).toBeLessThanOrEqual(
              NEIGHBOUR_SEPARATION_FILL + 1e-12,
            );
          }
        }
      }
      for (const moon of additionalAvailableKnownSatellites) {
        if (layout.hiddenIds.has(moon.id)) {
          continue;
        }
        for (const definition of drawn) {
          const filled =
            radius(layout, definition.id) /
            separationAu(moon.id, definition.id);
          expect(filled, `${moon.name} and ${definition.id}`).toBeLessThan(
            radius(layout, definition.id) ===
              definition.meanRadiusM / ASTRONOMICAL_UNIT_M
              ? 1
              : NEIGHBOUR_SEPARATION_FILL + 1e-12,
          );
        }
      }
    });

    it.each(boosts)(
      "keeps the true size order of every drawn body at boost %s",
      (boost) => {
        const layout = layoutFor(openSystemId, boost);
        const largestFirst = majorBodySnapshot.bodies
          .filter((definition) => !layout.hiddenIds.has(definition.id))
          .toSorted((a, b) => b.meanRadiusM - a.meanRadiusM);
        for (const [index, definition] of largestFirst.entries()) {
          const smaller = largestFirst[index + 1];
          if (smaller !== undefined) {
            expect(
              radius(layout, smaller.id),
              `${smaller.id} below ${definition.id}`,
            ).toBeLessThan(radius(layout, definition.id));
          }
        }
      },
    );

    it("draws every moon of the focused system", () => {
      const layout = layoutFor(openSystemId, 1);
      const openMoonIds = [
        ...majorBodySnapshot.bodies
          .filter(
            (definition) => PARENT_BODY_ID[definition.id] === openSystemId,
          )
          .map((definition) => definition.id),
        ...additionalAvailableKnownSatellites
          .filter((moon) => moon.parentId === openSystemId)
          .map((moon) => moon.id),
      ];
      expect(openMoonIds.filter((id) => layout.hiddenIds.has(id))).toEqual([]);
      expect(
        majorBodySnapshot.bodies
          .filter((definition) => definition.type !== "moon")
          .filter((definition) => layout.hiddenIds.has(definition.id)),
      ).toEqual([]);
    });
  });

  it("hides the moons that would sit inside their planet in the overview", () => {
    const layout = layoutFor(undefined, 1);

    expect(layout.clearanceScale).toBe(1);
    expect(radius(layout, "earth")).toBeCloseTo(0.02, 12);
    for (const moonId of ["moon", "callisto", "titan", "iapetus", "charon"]) {
      expect(layout.hiddenIds.has(moonId), moonId).toBe(true);
    }
    expect(
      additionalAvailableKnownSatellites.filter((moon) =>
        layout.hiddenIds.has(moon.id),
      ).length,
    ).toBeGreaterThan(0);
  });

  it("draws Venus smaller than Earth in an Earth focus", () => {
    const layout = layoutFor("earth", 1);

    expect(layout.hiddenIds.has("moon")).toBe(false);
    expect(radius(layout, "venus")).toBeLessThan(radius(layout, "earth"));
    expect(radius(layout, "moon")).toBeLessThan(radius(layout, "earth"));
  });

  it("draws Earth smaller than Jupiter in a Jupiter focus", () => {
    const layout = layoutFor("jupiter", 1);

    expect(radius(layout, "earth")).toBeLessThan(radius(layout, "jupiter"));
    expect(radius(layout, "ganymede")).toBeLessThan(radius(layout, "jupiter"));
  });

  it("rejects an open system that is not a planet system", () => {
    expect(() => layoutFor("moon", 1)).toThrow(/not a planet system/u);
  });
});
