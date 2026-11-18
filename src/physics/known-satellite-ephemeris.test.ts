import { describe, expect, it } from "vitest";

import { withKnownSatellites } from "./known-satellite-ephemeris";
import {
  ISS_BODY_ID,
  ISS_EPOCH_SIMULATION_SECONDS,
  issSnapshot,
} from "./iss-ephemeris";
import {
  additionalAvailableKnownSatellites,
  additionalKnownSatellites,
} from "./known-satellites";
import { OPERATIONAL_SPACECRAFT_BODY_IDS } from "./operational-spacecraft";
import { majorBodySystem } from "./solar-system";

describe("known-satellite display state", () => {
  it("adds every available moon and authoritative spacecraft without dropping integrated probes", () => {
    const state = withKnownSatellites({
      timeSeconds: 0,
      energy: 0,
      bodies: majorBodySystem.bodies,
    });

    expect(state.bodies).toHaveLength(
      majorBodySystem.bodies.length +
        additionalAvailableKnownSatellites.length +
        OPERATIONAL_SPACECRAFT_BODY_IDS.length,
    );
    expect(
      additionalAvailableKnownSatellites.every((satellite) =>
        state.bodies.some((body) => body.id === satellite.id),
      ),
    ).toBe(true);
    expect(
      additionalKnownSatellites
        .filter((satellite) => satellite.availability === "unavailable")
        .some((satellite) =>
          state.bodies.some((body) => body.id === satellite.id),
        ),
    ).toBe(false);
    // The simulation epoch is outside the ISS element window.
    expect(state.bodies.some((body) => body.id === ISS_BODY_ID)).toBe(false);
    expect(state.bodies.some((body) => body.id === "voyager-1")).toBe(true);
    expect(state.bodies.some((body) => body.id === "voyager-2")).toBe(true);
    expect(
      OPERATIONAL_SPACECRAFT_BODY_IDS.every((bodyId) =>
        state.bodies.some((body) => body.id === bodyId),
      ),
    ).toBe(true);
  });

  it("adds the ISS only inside its declared element window", () => {
    const stateAt = (timeSeconds: number) =>
      withKnownSatellites({
        timeSeconds,
        energy: 0,
        bodies: majorBodySystem.bodies,
      });
    const window = issSnapshot.validityWindowSeconds;
    const hasIss = (timeSeconds: number) =>
      stateAt(timeSeconds).bodies.some((body) => body.id === ISS_BODY_ID);

    expect(hasIss(ISS_EPOCH_SIMULATION_SECONDS)).toBe(true);
    expect(hasIss(ISS_EPOCH_SIMULATION_SECONDS + window)).toBe(true);
    expect(hasIss(ISS_EPOCH_SIMULATION_SECONDS + window + 1)).toBe(false);
    // Ten years ahead SGP4 reports decay; the state must still build.
    expect(hasIss(ISS_EPOCH_SIMULATION_SECONDS + 10 * 365.25 * 86_400)).toBe(
      false,
    );
  });
});
