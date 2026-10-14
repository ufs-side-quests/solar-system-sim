import { describe, expect, it } from "vitest";

import {
  ISS_EPOCH_SIMULATION_SECONDS,
  issSnapshot,
  propagateIss,
  withIssEphemeris,
} from "../physics/iss-ephemeris";
import { majorBodySystem } from "../physics/solar-system";
import {
  operationalSpacecraftById,
  withOperationalSpacecraft,
} from "../physics/operational-spacecraft";
import { interpolateDisplayedSimulationFrame } from "./display-interpolation";

const sun = {
  id: "sun",
  gravitationalParameterM3S2: 1.327_124_400_412_794_2e20,
  positionM: [0, 0, 0] as const,
  velocityMps: [0, 0, 0] as const,
};

describe("display interpolation", () => {
  it("evaluates operational spacecraft at display time across a coverage boundary", () => {
    const hubble = operationalSpacecraftById.get("hubble");
    const finalSample = hubble?.samples.at(-1);
    if (finalSample === undefined) {
      throw new Error("Hubble coverage endpoint is unavailable");
    }
    const start = withOperationalSpacecraft({
      timeSeconds: finalSample.timeSeconds - 3_600,
      energy: 0,
      bodies: [sun],
    });
    const end = withOperationalSpacecraft({
      timeSeconds: finalSample.timeSeconds + 3_600,
      energy: 0,
      bodies: [sun],
    });
    expect(start.bodies.some((body) => body.id === "hubble")).toBe(true);
    expect(end.bodies.some((body) => body.id === "hubble")).toBe(false);

    const insideCoverage = interpolateDisplayedSimulationFrame(
      { start, end, transitionDurationMs: 1_000 },
      0.25,
    );
    const outsideCoverage = interpolateDisplayedSimulationFrame(
      { start, end, transitionDurationMs: 1_000 },
      0.75,
    );
    expect(insideCoverage.bodies.some((body) => body.id === "hubble")).toBe(
      true,
    );
    expect(outsideCoverage.bodies.some((body) => body.id === "hubble")).toBe(
      false,
    );
  });

  it("evaluates the ISS at display time across its element-window boundary", () => {
    const windowEnd =
      ISS_EPOCH_SIMULATION_SECONDS + issSnapshot.validityWindowSeconds;
    const stateAt = (timeSeconds: number) =>
      withIssEphemeris({
        timeSeconds,
        energy: 0,
        bodies: majorBodySystem.bodies,
      });
    const start = stateAt(windowEnd - 3_600);
    const end = stateAt(windowEnd + 3_600);
    expect(start.bodies.some((body) => body.id === "iss")).toBe(true);
    expect(end.bodies.some((body) => body.id === "iss")).toBe(false);

    const frame = { start, end, transitionDurationMs: 1_000 };
    const inside = interpolateDisplayedSimulationFrame(frame, 0.25);
    const outside = interpolateDisplayedSimulationFrame(frame, 0.75);
    expect(inside.bodies.some((body) => body.id === "iss")).toBe(true);
    expect(outside.bodies.some((body) => body.id === "iss")).toBe(false);

    // The displayed ISS is the SGP4 state at the display time, not a Hermite
    // blend of the endpoints.
    const displayedEarth = inside.bodies.find((body) => body.id === "earth");
    const displayedIss = inside.bodies.find((body) => body.id === "iss");
    if (displayedEarth === undefined || displayedIss === undefined) {
      throw new Error("Displayed Earth or ISS state is unavailable");
    }
    expect(displayedIss.positionM).toEqual(
      propagateIss(displayedEarth, inside.timeSeconds).positionM,
    );
  });
});
