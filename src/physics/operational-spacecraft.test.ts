import { describe, expect, it } from "vitest";

import oneMinuteDay from "./fixtures/hubble-and-earth-one-minute.json";
import type { BodyState } from "./contracts";
import {
  isOperationalSpacecraftWithinValidity,
  operationalSpacecraftById,
  operationalSpacecraftSnapshot,
  operationalSpacecraftState,
  withOperationalSpacecraft,
} from "./operational-spacecraft";
import { majorBodySystem, naifPhysicalSnapshot } from "./solar-system";
import { propagateTwoBody } from "./two-body-propagator";

type Vector3 = readonly [number, number, number];

// Geocentric samples are relative to Earth, so an Earth at the origin returns
// them unchanged.
const earthAtOrigin: BodyState = {
  id: "earth",
  gravitationalParameterM3S2: 0,
  positionM: [0, 0, 0],
  velocityMps: [0, 0, 0],
};
const simulationEarth =
  majorBodySystem.bodies.find((body) => body.id === "earth") ??
  (() => {
    throw new Error("Simulation Earth is missing");
  })();

// Two-body propagation ignores J2 (about 0.012 m/s² at Hubble's radius); from
// the nearest 30 minute sample the error measured against the one-minute
// Horizons day is about 5 km. The stated bound is 10 km.
const HUBBLE_PROPAGATION_BOUND_M = 10_000;
// Horizons puts Hubble 6,841.6 to 6,861.8 km from Earth's centre over the
// installed coverage; the band widens that by the propagation bound.
const HUBBLE_RADIUS_BAND_M = { minimum: 6_831_000, maximum: 6_872_000 };

function distanceM(left: Vector3, right: Vector3): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function vector3(values: readonly number[], field: string): Vector3 {
  const [x, y, z] = values;
  if (
    values.length !== 3 ||
    x === undefined ||
    y === undefined ||
    z === undefined
  ) {
    throw new Error(`${field} is not a three-component vector`);
  }
  return [x, y, z];
}

function hubbleAt(timeSeconds: number, earth: BodyState): BodyState {
  const state = withOperationalSpacecraft({
    timeSeconds,
    energy: 0,
    bodies: [earth],
  });
  return (
    state.bodies.find((body) => body.id === "hubble") ??
    (() => {
      throw new Error(`Hubble is missing at ${String(timeSeconds)} s`);
    })()
  );
}

function geocentricHubble() {
  const hubble = operationalSpacecraftById.get("hubble");
  if (hubble?.center !== "500@399") {
    throw new Error("Hubble is not installed as a geocentric spacecraft");
  }
  return hubble;
}

describe("operational spacecraft ephemerides", () => {
  it("reproduces every authoritative sample exactly at its timestamp", () => {
    for (const spacecraft of operationalSpacecraftSnapshot.spacecraft) {
      for (const sample of spacecraft.samples.filter(
        (_, index) =>
          index % Math.max(1, Math.floor(spacecraft.samples.length / 20)) === 0,
      )) {
        const state = operationalSpacecraftState(
          spacecraft.id,
          sample.timeSeconds,
          [earthAtOrigin],
        );
        expect(state.positionM).toEqual(sample.positionM);
        expect(state.velocityMps).toEqual(sample.velocityMps);
      }
    }
  });

  it("refuses to invent positions outside the published coverage", () => {
    const hubble = operationalSpacecraftSnapshot.spacecraft.find(
      (spacecraft) => spacecraft.id === "hubble",
    );
    expect(hubble).toBeDefined();
    const first = hubble?.samples[0];
    expect(first).toBeDefined();
    expect(
      isOperationalSpacecraftWithinValidity(
        "hubble",
        (first?.timeSeconds ?? 0) - 1,
      ),
    ).toBe(false);
    expect(() =>
      operationalSpacecraftState("hubble", (first?.timeSeconds ?? 0) - 1, [
        earthAtOrigin,
      ]),
    ).toThrow(/unavailable/u);
  });

  it("installs the bounded JPL Roadster solution rather than extrapolating it", () => {
    const roadster = operationalSpacecraftSnapshot.spacecraft.find(
      (spacecraft) => spacecraft.id === "roadster",
    );
    expect(roadster).toBeDefined();
    expect(roadster?.command).toBe("-143205");
    expect(roadster?.massKg).toBe(1_250);
    expect(roadster?.maximumDimensionM).toBe(3.946);
    expect(roadster?.samples).toHaveLength(5_253);

    const first = roadster?.samples.at(0);
    const last = roadster?.samples.at(-1);
    expect(first?.timeSeconds).toBe(-249_253_200);
    expect(last?.timeSeconds).toBe(2_019_610_800);
    expect(
      isOperationalSpacecraftWithinValidity(
        "roadster",
        first?.timeSeconds ?? Number.NaN,
      ),
    ).toBe(true);
    expect(
      isOperationalSpacecraftWithinValidity(
        "roadster",
        (last?.timeSeconds ?? Number.NaN) + 1,
      ),
    ).toBe(false);
  });

  it("places Hubble on the simulation's Earth at every Horizons geocentric sample", () => {
    const hubble = geocentricHubble();
    for (const sample of hubble.samples) {
      const state = hubbleAt(sample.timeSeconds, simulationEarth);
      // Adding then removing Earth's 1.5e11 m position leaves only rounding.
      for (const axis of [0, 1, 2] as const) {
        expect(
          state.positionM[axis] - simulationEarth.positionM[axis],
        ).toBeCloseTo(sample.positionM[axis], 3);
        expect(
          state.velocityMps[axis] - simulationEarth.velocityMps[axis],
        ).toBeCloseTo(sample.velocityMps[axis], 6);
      }
    }
  });

  it("refuses to place Hubble without the simulation's Earth", () => {
    const first = geocentricHubble().samples[0];
    if (first === undefined) {
      throw new Error("Hubble has no samples");
    }
    expect(() =>
      withOperationalSpacecraft({
        timeSeconds: first.timeSeconds,
        energy: 0,
        bodies: [],
      }),
    ).toThrow(/earth state/u);
  });

  it("keeps Hubble in its real altitude band at every mid-interval time across the coverage", () => {
    const samples = geocentricHubble().samples;
    let minimumM = Number.POSITIVE_INFINITY;
    let maximumM = 0;
    for (let index = 1; index < samples.length; index += 1) {
      const previous = samples[index - 1];
      const next = samples[index];
      if (previous === undefined || next === undefined) {
        throw new Error(`Hubble sample ${String(index)} is missing`);
      }
      const middle = (previous.timeSeconds + next.timeSeconds) / 2;
      const radiusM = distanceM(
        hubbleAt(middle, simulationEarth).positionM,
        simulationEarth.positionM,
      );
      minimumM = Math.min(minimumM, radiusM);
      maximumM = Math.max(maximumM, radiusM);
    }
    expect(minimumM).toBeGreaterThan(HUBBLE_RADIUS_BAND_M.minimum);
    expect(maximumM).toBeLessThan(HUBBLE_RADIUS_BAND_M.maximum);
  });

  it("keeps the mid-interval jump between neighbouring samples under the bound across the coverage", () => {
    const earthGravitationalParameterM3S2 =
      naifPhysicalSnapshot.bodies["earth"]?.gravitationalParameterM3S2;
    if (earthGravitationalParameterM3S2 === undefined) {
      throw new Error("Earth GM is missing");
    }
    const samples = geocentricHubble().samples;
    let largestJumpM = 0;
    for (let index = 1; index < samples.length; index += 1) {
      const previous = samples[index - 1];
      const next = samples[index];
      if (previous === undefined || next === undefined) {
        throw new Error(`Hubble sample ${String(index)} is missing`);
      }
      const halfStepSeconds = (next.timeSeconds - previous.timeSeconds) / 2;
      const forward = propagateTwoBody(
        previous,
        earthGravitationalParameterM3S2,
        halfStepSeconds,
      );
      const backward = propagateTwoBody(
        next,
        earthGravitationalParameterM3S2,
        -halfStepSeconds,
      );
      largestJumpM = Math.max(
        largestJumpM,
        distanceM(forward.positionM, backward.positionM),
      );
    }
    expect(largestJumpM).toBeLessThan(HUBBLE_PROPAGATION_BOUND_M);
  });

  it("matches a one-minute Horizons day within the propagation bound", () => {
    expect(oneMinuteDay.hubble.center).toBe("500@399");
    expect(oneMinuteDay.hubble.step).toBe("1 m");
    expect(oneMinuteDay.earth.center).toBe("500@0");
    expect(oneMinuteDay.hubble.samples).toHaveLength(1_441);
    let largestErrorM = 0;
    for (const [index, expected] of oneMinuteDay.hubble.samples.entries()) {
      const earthSample = oneMinuteDay.earth.samples[index];
      if (earthSample?.timeSeconds !== expected.timeSeconds) {
        throw new Error(`Earth fixture sample ${String(index)} is misaligned`);
      }
      const earth: BodyState = {
        id: "earth",
        gravitationalParameterM3S2: 0,
        positionM: vector3(earthSample.positionM, "earth positionM"),
        velocityMps: vector3(earthSample.velocityMps, "earth velocityMps"),
      };
      const state = hubbleAt(expected.timeSeconds, earth);
      const geocentric: Vector3 = [
        state.positionM[0] - earth.positionM[0],
        state.positionM[1] - earth.positionM[1],
        state.positionM[2] - earth.positionM[2],
      ];
      largestErrorM = Math.max(
        largestErrorM,
        distanceM(geocentric, vector3(expected.positionM, "hubble positionM")),
      );
    }
    expect(largestErrorM).toBeLessThan(HUBBLE_PROPAGATION_BOUND_M);
  });
});
