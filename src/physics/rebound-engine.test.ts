import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ReboundEngine } from "./rebound-engine";
import createNodeReboundModule from "./wasm/generated/rebound-node.mjs";

const DAY_SECONDS = 86_400;
const AU_M = 149_597_870_700;
// Written with Number() as in scripts/verify-rebound-wasm.mjs: the literal has
// more digits than a double holds.
const SUN_GM = Number("1.3271244004127942e20");
const EARTH_GM = Number("3.9860043550702266e14");

// The Node build of the same REBOUND bridge the browser worker loads.
async function createEngine(): Promise<ReboundEngine> {
  const generated = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "wasm/generated",
  );
  return new ReboundEngine(
    await createNodeReboundModule({
      locateFile: () => path.join(generated, "rebound-node.wasm"),
    }),
  );
}

describe("REBOUND engine", () => {
  it("restores an earlier state at its own time and integrates on from it", async () => {
    const engine = await createEngine();
    const earthSpeed = Math.sqrt((SUN_GM + EARTH_GM) / AU_M);
    engine.initialize({
      bodies: [
        {
          id: "sun",
          gravitationalParameterM3S2: SUN_GM,
          positionM: [0, 0, 0],
          velocityMps: [0, 0, 0],
        },
        {
          id: "earth",
          gravitationalParameterM3S2: EARTH_GM,
          positionM: [AU_M, 0, 0],
          velocityMps: [0, earthSpeed, 0],
        },
      ],
    });
    const checkpoint = engine.integrateTo(-100 * DAY_SECONDS);
    const continued = engine.integrateTo(50 * DAY_SECONDS);

    const restored = engine.restore(checkpoint);
    expect(restored.timeSeconds).toBe(-100 * DAY_SECONDS);
    expect(restored.bodies).toEqual(checkpoint.bodies);

    const replayed = engine.integrateTo(50 * DAY_SECONDS);
    expect(replayed.timeSeconds).toBeCloseTo(50 * DAY_SECONDS, 3);
    const replayedEarth = replayed.bodies[1];
    const continuedEarth = continued.bodies[1];
    if (replayedEarth === undefined || continuedEarth === undefined) {
      throw new Error("Earth is missing from the integrated state");
    }
    for (const axis of [0, 1, 2] as const) {
      expect(
        Math.abs(
          replayedEarth.positionM[axis] - continuedEarth.positionM[axis],
        ),
      ).toBeLessThan(1);
    }
    expect(engine.integrateTo(-100 * DAY_SECONDS).timeSeconds).toBeCloseTo(
      -100 * DAY_SECONDS,
      3,
    );
  });
});
