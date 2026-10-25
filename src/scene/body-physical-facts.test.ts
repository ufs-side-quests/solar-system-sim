import { describe, expect, it } from "vitest";

import { majorBodySnapshot } from "../physics/solar-system-data";
import {
  BODY_COMPOSITION_BY_ID,
  formatBodySize,
  formatDiameterKm,
  formatDistanceAu,
  formatExactDistanceKm,
  formatGapInParentWidths,
  formatLiveOrbitalPeriod,
  formatMassComparedWithEarth,
  formatMassKg,
  formatOrbitalPeriod,
  formatPlainDistance,
  formatSourcedOrbitalPeriod,
  formatSpeedWithJetComparison,
  formatSpinPeriod,
  formatSunDistance,
  formatSunlightTravelTime,
  formatWidthComparedToEarth,
  PLAIN_SURFACE_BY_BODY_ID,
  PLAIN_SURFACE_MAP_BY_CLASSIFICATION,
  SIDEREAL_ORBITAL_PERIOD_BY_ID,
  validatePlainSurfaceWording,
  validateSourcedOrbitalPeriods,
} from "./body-physical-facts";
import { PARENT_BODY_ID } from "./body-facts";
import {
  nasaMaterialPresentationByBodyId,
  nasaTextureByBodyId,
} from "./visual-assets";

describe("selected-body physical facts", () => {
  it("provides sourced composition summaries for every installed major body", () => {
    for (const body of majorBodySnapshot.bodies) {
      const fact = BODY_COMPOSITION_BY_ID[body.id];
      expect(fact, body.name).toBeDefined();
      expect(fact?.authority, body.name).toBe("NASA Science");
      expect(fact?.sourceUrl, body.name).toMatch(
        /^https:\/\/science\.nasa\.gov\//u,
      );
      expect(fact?.summary.length, body.name).toBeGreaterThan(20);
    }
  });

  it("formats catalogue-scale masses without discarding magnitude", () => {
    expect(formatMassKg(5.97217e24)).toBe("5.9722 × 10²⁴ kg");
    expect(formatMassKg(419_725)).toBe("419,725 kg");
    expect(formatMassKg(undefined)).toBe("Not provided by source");
  });

  it("compares sourced masses with Earth in plain words", () => {
    const massKg = (id: string): number => {
      const mass = majorBodySnapshot.bodies.find(
        (candidate) => candidate.id === id,
      )?.massKg;
      if (mass === undefined) {
        throw new Error(`Snapshot body ${id} has no mass`);
      }
      return mass;
    };
    const earthKg = massKg("earth");
    const compare = (id: string): string =>
      formatMassComparedWithEarth(id, massKg(id), earthKg);
    expect(compare("jupiter")).toBe("As heavy as 318 Earths");
    expect(compare("sun")).toBe("As heavy as 333,000 Earths");
    expect(compare("uranus")).toBe("As heavy as 15 Earths");
    expect(compare("earth")).toBe(
      "Our home: other worlds are weighed against it",
    );
    expect(compare("venus")).toBe("Earth is about 1.2 times heavier");
    expect(compare("moon")).toBe("Earth is about 81 times heavier");
    expect(compare("pluto")).toBe("Earth is about 458 times heavier");
    expect(compare("mimas")).toBe("Earth is about 159,000 times heavier");
    expect(compare("phobos")).toBe("Earth is about 560 million times heavier");
    expect(compare("deimos")).toBe("Earth is about 4 billion times heavier");
  });

  it("names every surface map kind in plain words", () => {
    const kinds = new Set([
      ...[...nasaTextureByBodyId.values()].map((asset) => asset.classification),
      ...[...nasaMaterialPresentationByBodyId.values()].map(
        (presentation) => presentation.classification,
      ),
    ]);
    for (const kind of kinds) {
      expect(PLAIN_SURFACE_MAP_BY_CLASSIFICATION[kind], kind).toMatch(
        /^[A-Z]/u,
      );
    }
  });

  it("compares sourced mean radii with Earth in plain words", () => {
    const radiusM = (id: string): number => {
      const body = majorBodySnapshot.bodies.find(
        (candidate) => candidate.id === id,
      );
      if (body === undefined) {
        throw new Error(`Snapshot body ${id} is missing`);
      }
      return body.meanRadiusM;
    };
    const earthRadiusM = radiusM("earth");
    expect(formatWidthComparedToEarth(radiusM("jupiter"), earthRadiusM)).toBe(
      "As wide as 11 Earths",
    );
    expect(formatWidthComparedToEarth(radiusM("sun"), earthRadiusM)).toBe(
      "As wide as 109 Earths",
    );
    expect(formatWidthComparedToEarth(radiusM("venus"), earthRadiusM)).toBe(
      "About as wide as Earth",
    );
    expect(formatWidthComparedToEarth(radiusM("moon"), earthRadiusM)).toBe(
      "Earth is about 3.7 times wider",
    );
    expect(formatBodySize("earth", earthRadiusM, earthRadiusM)).toBe(
      "Our home: 12,742 km wide",
    );
    expect(formatBodySize("jupiter", radiusM("jupiter"), earthRadiusM)).toBe(
      "As wide as 11 Earths",
    );
    expect(formatDiameterKm(radiusM("jupiter"))).toBe("139,822 km");
  });

  it("states orbit and spin periods in units a child can compare", () => {
    const DAY_SECONDS = 86_400;
    expect(formatOrbitalPeriod(686.98 * DAY_SECONDS)).toBe(
      "about 687 Earth days (1.9 years)",
    );
    expect(formatOrbitalPeriod(365.26 * DAY_SECONDS)).toBe(
      "about 365 Earth days (1 year)",
    );
    expect(formatOrbitalPeriod(4_332.6 * DAY_SECONDS)).toBe("about 11.9 years");
    expect(formatOrbitalPeriod(1.769 * DAY_SECONDS)).toBe(
      "about 1.8 Earth days",
    );
    expect(formatOrbitalPeriod(0.319 * DAY_SECONDS)).toBe("about 7.7 hours");
    expect(formatSpinPeriod(9.925)).toBe("about 9.9 hours");
    expect(formatSpinPeriod(24.62)).toBe("about 24.6 hours");
    expect(formatSpinPeriod(5_832.4)).toBe("about 243 Earth days");
  });

  it("compares a speed with a named, rounded jet airliner reference", () => {
    expect(formatSpeedWithJetComparison(29.78)).toBe(
      "29.8 km/s, about 120 times faster than a jet airliner (900 km/h)",
    );
    expect(formatSpeedWithJetComparison(7.66)).toBe(
      "7.66 km/s, about 31 times faster than a jet airliner (900 km/h)",
    );
    expect(formatSpeedWithJetComparison(0.25)).toBe(
      "0.25 km/s, about as fast as a jet airliner (900 km/h)",
    );
    expect(formatSpeedWithJetComparison(0.01)).toBe(
      "0.01 km/s, slower than a jet airliner (900 km/h)",
    );
  });

  it("states sourced year lengths that do not depend on the simulated date", () => {
    expect(formatSourcedOrbitalPeriod("pluto")).toBe("about 248 years");
    expect(formatSourcedOrbitalPeriod("earth")).toBe(
      "about 365 Earth days (1 year)",
    );
    expect(formatSourcedOrbitalPeriod("uranus")).toBe("about 84 years");
    expect(formatSourcedOrbitalPeriod("moon")).toBe("about 27 Earth days");
    expect(formatSourcedOrbitalPeriod("charon")).toBe("about 6.4 Earth days");
    expect(formatSourcedOrbitalPeriod("sun")).toBeUndefined();
  });

  it("sources a sidereal period for every installed orbiting body", () => {
    const orbiting = majorBodySnapshot.bodies.filter(
      (body) => PARENT_BODY_ID[body.id] !== undefined,
    );
    expect(orbiting.length).toBe(30);
    for (const body of orbiting) {
      const period = SIDEREAL_ORBITAL_PERIOD_BY_ID[body.id];
      expect(period?.siderealPeriodDays, body.id).toBeGreaterThan(0);
      expect(period?.sourceUrl, body.id).toMatch(
        /^https:\/\/(?:nssdc\.gsfc\.nasa\.gov\/planetary\/factsheet\/[a-z]+fact\.html|ssd\.jpl\.nasa\.gov\/sats\/elem\/)$/u,
      );
    }
  });

  it("rejects a sourced period table that is incomplete, invalid or extra", () => {
    const valid = {
      siderealPeriodDays: 365.256,
      authority: "NASA NSSDC fact sheet",
      sourceUrl:
        "https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html",
    };
    expect(() =>
      validateSourcedOrbitalPeriods({ earth: valid }, ["earth"]),
    ).not.toThrow();
    expect(() =>
      validateSourcedOrbitalPeriods({ earth: valid }, ["earth", "mars"]),
    ).toThrow("Sourced orbital period is missing body mars");
    for (const siderealPeriodDays of [0, -1, Number.NaN, Infinity]) {
      expect(() =>
        validateSourcedOrbitalPeriods(
          { earth: { ...valid, siderealPeriodDays } },
          ["earth"],
        ),
      ).toThrow("Sourced orbital period of earth is not positive");
    }
    expect(() =>
      validateSourcedOrbitalPeriods({ earth: valid, sun: valid }, ["earth"]),
    ).toThrow("Sourced orbital period sun is not an orbiting body");
  });

  it("gives every installed surface its own plain wording", () => {
    const installed = [
      ...nasaTextureByBodyId.keys(),
      ...nasaMaterialPresentationByBodyId.keys(),
    ];
    expect(Object.keys(PLAIN_SURFACE_BY_BODY_ID).sort()).toEqual(
      [...installed].sort(),
    );
    expect(PLAIN_SURFACE_BY_BODY_ID["venus"]).toBe(
      "Radar map of the ground under the clouds",
    );
    expect(() =>
      validatePlainSurfaceWording({ venus: "Radar map" }, ["venus", "mars"]),
    ).toThrow("Surface asset mars has no plain wording");
    expect(() =>
      validatePlainSurfaceWording({ venus: " " }, ["venus"]),
    ).toThrow("Surface asset venus has no plain wording");
    expect(() =>
      validatePlainSurfaceWording({ venus: "Radar map", vulcan: "Art" }, [
        "venus",
      ]),
    ).toThrow("Plain surface wording vulcan has no installed asset");
  });

  it("labels the live osculating period in days or years", () => {
    const DAY_SECONDS = 86_400;
    expect(formatLiveOrbitalPeriod(365.1 * DAY_SECONDS)).toBe("365.1 days");
    expect(formatLiveOrbitalPeriod(0.3189 * DAY_SECONDS)).toBe("0.3189 days");
    expect(formatLiveOrbitalPeriod(251.04 * 365.25 * DAY_SECONDS)).toBe(
      "251 years",
    );
  });
});

const AU_M = 149_597_870_700;

function sourcedRadiusM(bodyId: string): number {
  const body = majorBodySnapshot.bodies.find(
    (candidate) => candidate.id === bodyId,
  );
  if (body === undefined) {
    throw new Error(`Major-body snapshot is missing ${bodyId}`);
  }
  return body.meanRadiusM;
}

describe("child-first distances", () => {
  it("compares a Sun distance with Earth's average distance", () => {
    expect(formatSunDistance("neptune", 30.1 * AU_M)).toBe(
      "about 30 times as far as Earth (about 4.5 billion km)",
    );
    expect(formatSunDistance("jupiter", 779_712_329_000)).toBe(
      "about 5.2 times as far as Earth (about 780 million km)",
    );
    expect(formatSunDistance("mercury", 0.387 * AU_M)).toBe(
      "about 58 million km. Earth is about 2.6 times as far.",
    );
    expect(formatSunDistance("venus", 0.723 * AU_M)).toBe(
      "about 110 million km. Earth is about 1.4 times as far.",
    );
    expect(formatSunDistance("earth", 147_102_684_000)).toBe(
      "about 150 million km",
    );
  });

  it("rounds Sun distance ratios at their boundaries", () => {
    expect(formatSunDistance("mars", 1.1 * AU_M)).toMatch(
      /^about 1\.1 times as far as Earth/u,
    );
    // The Tesla Roadster card reaches this branch: its orbit runs from
    // about 0.99 AU to about 1.66 AU.
    expect(formatSunDistance("roadster", 0.99 * AU_M)).toBe(
      "about as far as Earth (about 150 million km)",
    );
    expect(formatSunDistance("roadster", 1.09 * AU_M)).toMatch(
      /^about as far as Earth/u,
    );
    expect(formatSunDistance("venus", 0.9 * AU_M)).toMatch(
      /^about 130 million km\. Earth is about 1\.1 times as far\.$/u,
    );
    expect(formatSunDistance("saturn", 9.96 * AU_M)).toMatch(
      /^about 10 times as far as Earth/u,
    );
    expect(formatSunDistance("pluto", 34.49 * AU_M)).toMatch(
      /^about 34 times as far as Earth/u,
    );
  });

  it("states plain distances to two significant figures", () => {
    expect(formatPlainDistance(360_512_000)).toBe("about 360,000 km");
    expect(formatPlainDistance(9_376_000)).toBe("about 9,400 km");
    expect(formatPlainDistance(1_433_175_000)).toBe("about 1.4 million km");
    expect(formatPlainDistance(1_500_000_000)).toBe("about 1.5 million km");
    expect(formatPlainDistance(12_400_000_000)).toBe("about 12 million km");
    expect(formatPlainDistance(24_990_000_000_000)).toBe("about 25 billion km");
    expect(formatPlainDistance(999_999_000_000)).toBe("about 1 billion km");
    // USS Defiant patrols 2.5 km from Deep Space Nine.
    expect(formatPlainDistance(2_500)).toBe("about 2.5 km");
    expect(formatPlainDistance(9_960)).toBe("about 10 km");
  });

  it("says how long sunlight takes to arrive", () => {
    expect(formatSunlightTravelTime(AU_M)).toBe(
      "takes about 8 minutes to get here",
    );
    expect(formatSunlightTravelTime(30.1 * AU_M)).toBe(
      "takes about 4 hours to get here",
    );
    expect(formatSunlightTravelTime(5.2 * AU_M)).toBe(
      "takes about 43 minutes to get here",
    );
    const lightMinutes = (minutes: number): number =>
      minutes * 60 * 299_792_458;
    expect(formatSunlightTravelTime(lightMinutes(59.4))).toBe(
      "takes about 59 minutes to get here",
    );
    expect(formatSunlightTravelTime(lightMinutes(59.6))).toBe(
      "takes about 1 hour to get here",
    );
    expect(formatSunlightTravelTime(9.58 * AU_M)).toBe(
      "takes about 1 hour 20 minutes to get here",
    );
    expect(formatSunlightTravelTime(lightMinutes(89.9))).toBe(
      "takes about 1 hour 30 minutes to get here",
    );
    expect(formatSunlightTravelTime(lightMinutes(90))).toBe(
      "takes about 2 hours to get here",
    );
    expect(formatSunlightTravelTime(lightMinutes(119))).toBe(
      "takes about 2 hours to get here",
    );
    // Voyager 1, about 169 AU from the Sun in 2026.
    expect(formatSunlightTravelTime(169 * AU_M)).toBe(
      "takes about 23 hours to get here",
    );
    expect(formatSunlightTravelTime(60 * 299_792_458)).toBe(
      "takes about 1 minute to get here",
    );
    expect(formatSunlightTravelTime(1_000)).toBe(
      "takes less than a minute to get here",
    );
  });

  it("counts parent widths in the gap between a moon and its parent", () => {
    expect(
      formatGapInParentWidths(
        384_400_000,
        "Earth",
        sourcedRadiusM("earth"),
        sourcedRadiusM("moon"),
      ),
    ).toBe("the gap is about 30 times as wide as Earth");
    expect(
      formatGapInParentWidths(
        421_800_000,
        "Jupiter",
        sourcedRadiusM("jupiter"),
        sourcedRadiusM("io"),
      ),
    ).toBe("the gap is about 2.5 times as wide as Jupiter");
    expect(
      formatGapInParentWidths(
        23_460_000,
        "Mars",
        sourcedRadiusM("mars"),
        sourcedRadiusM("deimos"),
      ),
    ).toBe("the gap is about 3 times as wide as Mars");
    expect(
      formatGapInParentWidths(
        9_376_000,
        "Mars",
        sourcedRadiusM("mars"),
        sourcedRadiusM("phobos"),
      ),
    ).toBe("the gap is almost as wide as Mars");
    expect(
      formatGapInParentWidths(
        129_900_000,
        "Uranus",
        sourcedRadiusM("uranus"),
        sourcedRadiusM("miranda"),
      ),
    ).toBe("the gap is about 2.1 times as wide as Uranus");
  });

  it("rounds parent widths at their boundaries", () => {
    const gapForWidths = (widths: number): number => (2 * widths + 1) * 1 + 1;
    expect(formatGapInParentWidths(gapForWidths(0.499), "Earth", 1, 1)).toBe(
      "the gap is less than half as wide as Earth",
    );
    expect(formatGapInParentWidths(gapForWidths(0.5), "Earth", 1, 1)).toBe(
      "the gap is almost as wide as Earth",
    );
    expect(formatGapInParentWidths(gapForWidths(0.949), "Earth", 1, 1)).toBe(
      "the gap is almost as wide as Earth",
    );
    expect(formatGapInParentWidths(gapForWidths(0.95), "Earth", 1, 1)).toBe(
      "the gap is about as wide as Earth",
    );
    expect(formatGapInParentWidths(gapForWidths(1.06), "Earth", 1, 1)).toBe(
      "the gap is about 1.1 times as wide as Earth",
    );
    expect(formatGapInParentWidths(gapForWidths(9.96), "Earth", 1, 1)).toBe(
      "the gap is about 10 times as wide as Earth",
    );
  });

  it("formats the exact live values for More detail", () => {
    expect(formatExactDistanceKm(779_739_602_760)).toBe("779,739,603 km");
    expect(formatExactDistanceKm(2_497_400)).toBe("2,497 km");
    expect(formatExactDistanceKm(99_999)).toBe("99.999 km");
    expect(formatExactDistanceKm(2_500)).toBe("2.5 km");
    expect(formatDistanceAu(5.21198 * AU_M)).toBe("5.212 AU");
    expect(formatDistanceAu(AU_M)).toBe("1.000 AU");
  });

  it("rejects invalid distances", () => {
    for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => formatPlainDistance(invalid)).toThrow(/Distance/u);
      expect(() => formatSunDistance("mars", invalid)).toThrow(/Distance/u);
      expect(() => formatSunlightTravelTime(invalid)).toThrow(/Distance/u);
      expect(() => formatExactDistanceKm(invalid)).toThrow(/Distance/u);
      expect(() => formatDistanceAu(invalid)).toThrow(/Distance/u);
      expect(() => formatGapInParentWidths(invalid, "Earth", 1, 1)).toThrow(
        /Distance/u,
      );
      expect(() => formatGapInParentWidths(10, "Earth", invalid, 1)).toThrow(
        /Earth radius/u,
      );
      expect(() => formatGapInParentWidths(10, "Earth", 1, invalid)).toThrow(
        /Moon radius/u,
      );
    }
    expect(() => formatGapInParentWidths(2, "Earth", 1, 1)).toThrow(/overlap/u);
  });
});
