import { describe, expect, it } from "vitest";

import type { BodyState } from "../physics/contracts";
import { majorBodySystem } from "../physics/solar-system";
import {
  osculatingOrbitalPeriodSeconds,
  osculatingOrbitPositionsM,
} from "./osculating-orbit";

const parent: BodyState = {
  id: "sun",
  gravitationalParameterM3S2: 1,
  positionM: [0, 0, 0],
  velocityMps: [0, 0, 0],
};

describe("osculating orbit", () => {
  it("reconstructs a circular orbit from the instantaneous physics state", () => {
    const body: BodyState = {
      id: "planet",
      gravitationalParameterM3S2: 0,
      positionM: [4, 0, 0],
      velocityMps: [0, 0.5, 0],
    };

    const points = osculatingOrbitPositionsM(body, parent, 64);

    expect(points).toHaveLength(64);
    for (const point of points) {
      expect(Math.hypot(...point)).toBeCloseTo(4, 10);
    }
  });

  it("rejects an invalid point count rather than weakening the orbit", () => {
    const body: BodyState = {
      id: "planet",
      gravitationalParameterM3S2: 0,
      positionM: [4, 0, 0],
      velocityMps: [0, 0.5, 0],
    };

    expect(() => osculatingOrbitPositionsM(body, parent, 8)).toThrow(
      "at least 32 points",
    );
  });

  it("derives an eccentric ellipse from position and velocity instead of drawing a decorative circle", () => {
    const body: BodyState = {
      id: "comet-like-body",
      gravitationalParameterM3S2: 0,
      positionM: [2, 0, 0],
      velocityMps: [0, Math.sqrt(0.75), 0],
    };

    const radii = osculatingOrbitPositionsM(body, parent, 192).map((point) =>
      Math.hypot(...point),
    );

    expect(Math.min(...radii)).toBeCloseTo(2, 10);
    expect(Math.max(...radii)).toBeCloseTo(6, 10);
  });
});

describe("osculating orbital period", () => {
  const DAY_SECONDS = 86_400;
  const epochState = (id: string): BodyState => {
    const body = majorBodySystem.bodies.find(
      (candidate) => candidate.id === id,
    );
    if (body === undefined) {
      throw new Error(`Snapshot body ${id} is missing`);
    }
    return body;
  };

  it.each([
    ["earth", "sun", 365.256],
    ["mars", "sun", 686.98],
    ["io", "jupiter", 1.769],
  ])(
    "derives the %s period about %s from the snapshot epoch state",
    (bodyId, parentId, expectedDays) => {
      const periodSeconds = osculatingOrbitalPeriodSeconds(
        epochState(bodyId),
        epochState(parentId),
      );
      expect(periodSeconds).toBeDefined();
      const days = (periodSeconds ?? Number.NaN) / DAY_SECONDS;
      expect(Math.abs(days / expectedDays - 1)).toBeLessThan(0.01);
    },
  );

  it("returns undefined for an unbound state", () => {
    const escaping: BodyState = {
      id: "escaping",
      gravitationalParameterM3S2: 0,
      positionM: [4, 0, 0],
      velocityMps: [0, Math.sqrt(2 / 4) * 1.01, 0],
    };
    expect(osculatingOrbitalPeriodSeconds(escaping, parent)).toBeUndefined();
  });

  it("includes the body's own GM, so Charon about Pluto matches JPL within 0.1%", () => {
    // JPL SSD planetary satellite mean elements: Charon P = 6.387222 days.
    // Charon is 12% of Pluto's mass, so a μ without its GM misses by about 6%.
    const periodSeconds = osculatingOrbitalPeriodSeconds(
      epochState("charon"),
      epochState("pluto"),
    );
    const days = (periodSeconds ?? Number.NaN) / DAY_SECONDS;
    expect(Math.abs(days / 6.387222 - 1)).toBeLessThan(0.001);
  });

  it("throws for a state that cannot describe an orbit", () => {
    const massless: BodyState = { ...parent, gravitationalParameterM3S2: 0 };
    const atParent: BodyState = {
      id: "at-parent",
      gravitationalParameterM3S2: 0,
      positionM: parent.positionM,
      velocityMps: [0, 1, 0],
    };
    const orbiting: BodyState = {
      id: "orbiting",
      gravitationalParameterM3S2: 0,
      positionM: [4, 0, 0],
      velocityMps: [0, 0.5, 0],
    };
    expect(() => osculatingOrbitalPeriodSeconds(orbiting, massless)).toThrow(
      "Two-body orbit state is physically invalid",
    );
    expect(() => osculatingOrbitalPeriodSeconds(atParent, parent)).toThrow(
      "Two-body orbit state is physically invalid",
    );
  });
});
