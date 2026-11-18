import { describe, expect, it } from "vitest";
import { controlsDampingFactor } from "./controls-damping";

// The turn still to come after the frames of one second, as OrbitControls
// damps it: each update keeps 1 - dampingFactor of it.
function turnLeftAfterOneSecond(framesPerSecond: number): number {
  let left = 1;
  for (let frame = 0; frame < framesPerSecond; frame += 1) {
    left *= 1 - controlsDampingFactor(1_000 / framesPerSecond);
  }
  return left;
}

describe("controlsDampingFactor", () => {
  it("keeps the three.js factor of 0.05 at 60 frames per second", () => {
    expect(controlsDampingFactor(1_000 / 60)).toBeCloseTo(0.05, 12);
  });

  it("glides for the same time at any frame rate", () => {
    const at60 = turnLeftAfterOneSecond(60);
    expect(at60).toBeCloseTo(0.95 ** 60, 12);
    for (const framesPerSecond of [10, 15, 20, 30, 120, 144]) {
      expect(turnLeftAfterOneSecond(framesPerSecond)).toBeCloseTo(at60, 12);
    }
  });
});
