import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import type { SimulationState } from "../physics/contracts";
import { ReboundEngine } from "../physics/rebound-engine";
import {
  VALIDATED_WINDOW_SECONDS,
  simulationSecondsForUtc,
} from "../physics/simulation-date";
import { majorBodySystem } from "../physics/solar-system";
import createReboundModule from "../physics/wasm/generated/rebound.mjs";
import { bodyOrientationAngles } from "../scene/orientation";
import {
  SATURN_EQUATORIAL_RADIUS_KM,
  SATURN_MAIN_RING_OUTER_RADIUS_KM,
} from "../scene/ring-system";
import { SCALE_TOUR_STEP_DURATION_MS, SCALE_TOUR_STEPS } from "./scale-tour";

type Vector = readonly [number, number, number];

const DEG = 180 / Math.PI;
const sub = (a: Vector, b: Vector): Vector => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
const dot = (a: Vector, b: Vector): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (a: Vector): number => Math.sqrt(dot(a, a));

function positionOf(state: SimulationState, bodyId: string): Vector {
  const body = state.bodies.find((candidate) => candidate.id === bodyId);
  if (body === undefined) throw new Error(`State has no ${bodyId}`);
  return body.positionM;
}

async function physicsEngine(): Promise<ReboundEngine> {
  const bytes = await readFile(
    new URL("../physics/wasm/generated/rebound.wasm", import.meta.url),
  );
  const compiled = await WebAssembly.compile(bytes);
  const module = await createReboundModule({
    locateFile: (path) => path,
    instantiateWasm: (imports, receiveInstance) => {
      receiveInstance(new WebAssembly.Instance(compiled, imports));
    },
  });
  const engine = new ReboundEngine(module);
  engine.initialize(majorBodySystem);
  return engine;
}

describe("Saturn seen from Titan", () => {
  const step = SCALE_TOUR_STEPS.find(
    (candidate) => candidate.id === "saturn-from-titan",
  );
  if (step === undefined) throw new Error("The Titan step must exist");

  it("shows Saturn's sunlit side with its rings edge-on, as the card says", async () => {
    if (step.timeUtc === undefined || step.timeSeconds === undefined) {
      throw new Error("The Titan step must set its own time");
    }
    expect(step.timeSeconds).toBeCloseTo(
      simulationSecondsForUtc(step.timeUtc),
      3,
    );
    const playedSeconds =
      (SCALE_TOUR_STEP_DURATION_MS / 1_000) * step.timeRateSecondsPerSecond;
    expect(Math.abs(step.timeSeconds) + playedSeconds).toBeLessThan(
      VALIDATED_WINDOW_SECONDS,
    );

    const engine = await physicsEngine();
    let largestPhaseDeg = 0;
    let largestTitanElevationDeg = 0;
    let saturnWidthDeg = 0;
    let ringLengthDeg = 0;
    for (let hour = 0; hour <= playedSeconds / 3_600; hour += 1) {
      const timeSeconds = step.timeSeconds + hour * 3_600;
      const state = engine.integrateTo(timeSeconds);
      const saturn = positionOf(state, "saturn");
      const toSun = sub(positionOf(state, "sun"), saturn);
      const toTitan = sub(positionOf(state, "titan"), saturn);
      const titanDistanceKm = length(toTitan) / 1_000;
      // The angle at Saturn between the Sun and Titan: below 90 degrees
      // Titan sees more of the day side than of the night side.
      largestPhaseDeg = Math.max(
        largestPhaseDeg,
        Math.acos(dot(toSun, toTitan) / (length(toSun) * length(toTitan))) *
          DEG,
      );
      const pole = bodyOrientationAngles("saturn", timeSeconds);
      const ra = pole.poleRightAscensionDeg / DEG;
      const dec = pole.poleDeclinationDeg / DEG;
      const poleVector: Vector = [
        Math.cos(dec) * Math.cos(ra),
        Math.cos(dec) * Math.sin(ra),
        Math.sin(dec),
      ];
      largestTitanElevationDeg = Math.max(
        largestTitanElevationDeg,
        Math.abs(Math.asin(dot(toTitan, poleVector) / length(toTitan)) * DEG),
      );
      if (hour === 0) {
        saturnWidthDeg =
          2 * Math.atan(SATURN_EQUATORIAL_RADIUS_KM / titanDistanceKm) * DEG;
        ringLengthDeg =
          2 *
          Math.atan(SATURN_MAIN_RING_OUTER_RADIUS_KM / titanDistanceKm) *
          DEG;
      }
    }

    // Mostly sunlit for the whole step.
    expect(largestPhaseDeg).toBeLessThan(30);
    // Titan stays within half a degree of the ring plane: the rings show
    // edge-on, as a thin line.
    expect(largestTitanElevationDeg).toBeLessThan(0.5);
    expect(step.kidLine).toMatch(/thin line/u);
    expect(step.description).toMatch(/sunlit side/u);
    expect(step.description).toMatch(/edge-on/u);
    expect(step.description).toContain(
      `about ${saturnWidthDeg.toFixed(1)} degrees wide`,
    );
    expect(step.description).toContain(
      `about ${ringLengthDeg.toFixed(0)} degrees long`,
    );
    expect(step.description).not.toMatch(/several degrees of sky/u);
  });
});
