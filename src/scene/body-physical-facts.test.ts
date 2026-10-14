import { describe, expect, it } from "vitest";

import { majorBodySnapshot } from "../physics/solar-system-data";
import {
  BODY_COMPOSITION_BY_ID,
  formatLiveOrbitalPeriod,
  formatMassKg,
  formatOrbitalPeriod,
  formatSourcedOrbitalPeriod,
  formatSpeedWithJetComparison,
  formatSpinPeriod,
  formatWidthComparedToEarth,
  PLAIN_SURFACE_BY_BODY_ID,
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
