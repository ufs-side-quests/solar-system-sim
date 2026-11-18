import { describe, expect, it } from "vitest";

import { enqueueTrailSteps, interpolateBodyState } from "./interpolation";
import type { TrailQueue } from "./interpolation";

const body = {
  id: "body",
  gravitationalParameterM3S2: 1,
  positionM: [0, 0, 0] as const,
  velocityMps: [1, 0, 0] as const,
};

describe("physics-state interpolation", () => {
  it("uses exact solver endpoints", () => {
    const end = {
      ...body,
      positionM: [10, 0, 0] as const,
    };
    expect(interpolateBodyState(body, end, 0, 10, 0).positionM).toEqual(
      body.positionM,
    );
    expect(interpolateBodyState(body, end, 0, 10, 1).positionM).toEqual(
      end.positionM,
    );
  });

  it("follows the velocity-constrained Hermite path between states", () => {
    const end = {
      ...body,
      positionM: [10, 0, 0] as const,
    };
    expect(interpolateBodyState(body, end, 0, 10, 0.5).positionM[0]).toBe(5);
  });
});

describe("trail queue", () => {
  const steps = (count: number, firstTime = 0) =>
    Array.from({ length: count }, (_, index) => ({
      state: { timeSeconds: firstTime + index, energy: 0, bodies: [] },
      jumped: false,
    }));

  it("keeps every step up to its capacity", () => {
    const queue: TrailQueue = { steps: [], dropped: false };
    enqueueTrailSteps(queue, steps(40), 64);
    enqueueTrailSteps(queue, steps(24, 40), 64);
    expect(queue.steps).toHaveLength(64);
    expect(queue.dropped).toBe(false);
  });

  it("keeps the newest steps and says it dropped the rest", () => {
    const queue: TrailQueue = { steps: [], dropped: false };
    enqueueTrailSteps(queue, steps(40), 64);
    enqueueTrailSteps(queue, steps(30, 40), 64);
    expect(queue.steps.map((step) => step.state.timeSeconds)).toEqual(
      Array.from({ length: 64 }, (_, index) => index + 6),
    );
    expect(queue.dropped).toBe(true);
  });
});
