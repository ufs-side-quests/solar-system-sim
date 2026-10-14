import { describe, expect, it } from "vitest";

import { majorBodySnapshot } from "../physics/solar-system-data";
import {
  BODY_COMPOSITION_BY_ID,
  formatMassKg,
  formatOrbitalPeriod,
  formatSpeedWithJetComparison,
  formatSpinPeriod,
  formatWidthComparedToEarth,
} from "./body-physical-facts";

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
});
