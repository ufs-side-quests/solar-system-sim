import { describe, expect, it } from "vitest";

import { majorBodySnapshot } from "../physics/solar-system";
import {
  displayedRadiusAu,
  isPhysicalBodyResolvable,
  NEIGHBOUR_SEPARATION_FILL,
  neighbourClearanceScale,
  nonOverlappingDisplayedRadiusAu,
} from "./scale";

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
    const sun = nonOverlappingDisplayedRadiusAu(
      body("sun"),
      1,
      neighbourClearanceScale(body("sun"), [
        { distanceAu: mercuryPerihelionAu, body: body("mercury") },
      ]),
    );
    const mercury = nonOverlappingDisplayedRadiusAu(
      body("mercury"),
      1,
      neighbourClearanceScale(body("mercury"), [
        { distanceAu: mercuryPerihelionAu, body: body("sun") },
      ]),
    );

    expect(sun).toBeCloseTo(displayedRadiusAu(body("sun"), 1), 15);
    expect(sun).toBeGreaterThan(displayedRadiusAu(body("jupiter"), 1));
    expect(sun + mercury).toBeLessThanOrEqual(
      NEIGHBOUR_SEPARATION_FILL * mercuryPerihelionAu,
    );
  });

  it("caps enhanced radii before neighboring bodies can overlap", () => {
    const earthMoonDistanceAu = 0.00257;
    const earth = nonOverlappingDisplayedRadiusAu(
      body("earth"),
      1,
      neighbourClearanceScale(body("earth"), [
        { distanceAu: earthMoonDistanceAu, body: body("moon") },
      ]),
    );
    const moon = nonOverlappingDisplayedRadiusAu(
      body("moon"),
      1,
      neighbourClearanceScale(body("moon"), [
        { distanceAu: earthMoonDistanceAu, body: body("earth") },
      ]),
    );

    expect(earth + moon).toBeCloseTo(
      NEIGHBOUR_SEPARATION_FILL * earthMoonDistanceAu,
      12,
    );
    expect(earth).toBeGreaterThan(moon);
  });

  it("keeps a catalogue moon point outside an enlarged planet", () => {
    const pointDistanceAu = 0.002;
    const jupiter = nonOverlappingDisplayedRadiusAu(
      body("jupiter"),
      1,
      neighbourClearanceScale(body("jupiter"), [
        { distanceAu: pointDistanceAu, body: undefined },
      ]),
    );

    expect(jupiter).toBeCloseTo(
      NEIGHBOUR_SEPARATION_FILL * pointDistanceAu,
      15,
    );
  });

  it("rejects a neighbour at no distance", () => {
    expect(() =>
      neighbourClearanceScale(body("earth"), [
        { distanceAu: 0, body: body("moon") },
      ]),
    ).toThrow(/positive and finite/u);
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
          neighbourClearanceScale(definition, [
            { distanceAu: physicalRadiusAu * 1.5, body: undefined },
          ]),
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
