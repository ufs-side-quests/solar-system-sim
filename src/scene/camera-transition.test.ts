import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import {
  anchoredCameraMove,
  applyAnchoredCameraMove,
  formatViewpointSpeed,
  interpolateLogarithmicDistance,
  sampleDirectCameraTransition,
  sampleOrientationTransition,
} from "./camera-transition";

describe("camera transition", () => {
  it("labels camera speed honestly across terrestrial and superluminal scales", () => {
    expect(formatViewpointSpeed(125)).toBe("125 m/s");
    expect(formatViewpointSpeed(12_500)).toBe("12.5 km/s");
    expect(formatViewpointSpeed(299_792_458 * 2.5)).toBe("2.5× light speed");
    expect(() => formatViewpointSpeed(-1)).toThrow(/non-negative/u);
  });

  it("eases a local orientation change without overshoot", () => {
    expect(sampleOrientationTransition(0, 1_200)).toEqual({
      settled: false,
      progress: 0,
    });
    expect(sampleOrientationTransition(600, 1_200).progress).toBe(0.5);
    expect(sampleOrientationTransition(1_200, 1_200)).toEqual({
      settled: true,
      progress: 1,
    });
  });

  it("rejects invalid local orientation timing", () => {
    expect(() => sampleOrientationTransition(-1, 1_200)).toThrow(/elapsed/u);
    expect(() => sampleOrientationTransition(0, 0)).toThrow(/duration/u);
  });

  it("turns, travels on one route, and settles into the selected shot", () => {
    expect(sampleDirectCameraTransition(0, 3_000)).toEqual({
      phase: "orienting",
      segmentProgress: 0,
    });
    expect(sampleDirectCameraTransition(1_500, 3_000).phase).toBe("travelling");
    expect(sampleDirectCameraTransition(2_400, 3_000).phase).toBe("arriving");
    expect(sampleDirectCameraTransition(3_000, 3_000)).toEqual({
      phase: "settled",
      segmentProgress: 1,
    });
  });

  it("continues along the direct route without an overview stop", () => {
    const early = sampleDirectCameraTransition(1_650, 3_000);
    const late = sampleDirectCameraTransition(2_100, 3_000);
    expect(early.phase).toBe("travelling");
    expect(late.phase).toBe("travelling");
    expect(late.segmentProgress).toBeGreaterThan(early.segmentProgress);
  });

  it("fails explicitly for invalid timing inputs", () => {
    expect(() => sampleDirectCameraTransition(-1, 3_000)).toThrow(/elapsed/u);
    expect(() => sampleDirectCameraTransition(0, 0)).toThrow(/duration/u);
  });

  it("changes scale geometrically instead of rushing near the close endpoint", () => {
    expect(interpolateLogarithmicDistance(0.001, 100, 0)).toBeCloseTo(0.001);
    expect(interpolateLogarithmicDistance(0.001, 100, 0.5)).toBeCloseTo(
      Math.sqrt(0.001 * 100),
    );
    expect(interpolateLogarithmicDistance(0.001, 100, 1)).toBeCloseTo(100);
  });

  it("rejects invalid logarithmic camera distances", () => {
    expect(() => interpolateLogarithmicDistance(0, 1, 0.5)).toThrow(
      /positive/u,
    );
    expect(() => interpolateLogarithmicDistance(1, Number.NaN, 0.5)).toThrow(
      /positive/u,
    );
    expect(() => interpolateLogarithmicDistance(1, 2, Number.NaN)).toThrow(
      /progress/u,
    );
  });

  it("turns toward a manual destination before travelling directly to it", () => {
    expect(sampleDirectCameraTransition(0, 12_000)).toEqual({
      phase: "orienting",
      segmentProgress: 0,
    });
    expect(sampleDirectCameraTransition(4_000, 12_000).phase).toBe("orienting");
    expect(sampleDirectCameraTransition(6_000, 12_000).phase).toBe(
      "travelling",
    );
    expect(sampleDirectCameraTransition(10_000, 12_000).phase).toBe("arriving");
    expect(sampleDirectCameraTransition(12_000, 12_000)).toEqual({
      phase: "settled",
      segmentProgress: 1,
    });
  });

  it("reserves the final third of a direct flight for arrival", () => {
    const travelling = sampleDirectCameraTransition(8_000, 12_000);
    const arriving = sampleDirectCameraTransition(10_000, 12_000);
    expect(travelling.phase).toBe("travelling");
    expect(arriving.phase).toBe("arriving");
    expect(arriving.segmentProgress).toBeGreaterThan(
      travelling.segmentProgress,
    );
    expect(arriving.segmentProgress).toBeLessThan(1);
  });

  it("rejects invalid direct-flight timing", () => {
    expect(() => sampleDirectCameraTransition(-1, 12_000)).toThrow(/elapsed/u);
    expect(() => sampleDirectCameraTransition(0, 0)).toThrow(/duration/u);
  });

  describe("a flight around the destination", () => {
    const up = new Vector3(0, 0, 1);
    // About Jupiter's place and the overview's distance, in AU.
    const anchor = new Vector3(4.1, -2.9, 0.05);
    const endDistance = 0.002;
    const positionAt = (
      start: Vector3,
      end: Vector3,
      progress: number,
    ): Vector3 =>
      applyAnchoredCameraMove(
        new Vector3(),
        start,
        anchoredCameraMove(start, end, anchor, progress, up),
      );
    const progressSteps = Array.from({ length: 101 }, (_, step) => step / 100);

    it("lets the destination grow steadily instead of popping in at the end", () => {
      const start = new Vector3(0, -30, 26);
      const end = anchor.clone().add(new Vector3(-endDistance, 0, 0));
      expect(
        positionAt(start, end, 0.6).distanceTo(anchor),
      ).toBeLessThanOrEqual(60 * endDistance);
      const distances = progressSteps.map((progress) =>
        positionAt(start, end, progress).distanceTo(anchor),
      );
      for (let step = 1; step < distances.length; step += 1) {
        expect(distances[step]).toBeLessThan(distances[step - 1] ?? 0);
      }
      expect(Math.min(...distances)).toBeGreaterThanOrEqual(
        endDistance * (1 - 1e-9),
      );
      expect(positionAt(start, end, 0).distanceTo(start)).toBeLessThan(1e-9);
      expect(positionAt(start, end, 1).distanceTo(end)).toBeLessThan(1e-12);
    });

    it("swings level round the destination when it starts on the far side", () => {
      const start = anchor.clone().add(new Vector3(5, 1e-4, 0));
      const end = anchor.clone().add(new Vector3(-endDistance, 0, 0));
      for (const progress of progressSteps) {
        const offset = positionAt(start, end, progress).sub(anchor);
        expect(offset.length()).toBeGreaterThanOrEqual(
          endDistance * (1 - 1e-9),
        );
        // No tilted axis: the camera stays in the plane of both ends.
        expect(Math.abs(offset.z)).toBeLessThan(1e-9);
      }
      expect(positionAt(start, end, 0.5).sub(anchor).y).not.toBeCloseTo(0, 3);
      expect(positionAt(start, end, 1).distanceTo(end)).toBeLessThan(1e-12);
      const exactlyOpposite = anchor.clone().add(new Vector3(5, 0, 0));
      expect(
        Math.abs(positionAt(exactlyOpposite, end, 0.5).sub(anchor).z),
      ).toBeLessThan(1e-9);
      expect(positionAt(exactlyOpposite, end, 1).distanceTo(end)).toBeLessThan(
        1e-12,
      );
    });

    it("keeps a short hop where it is and moves outward without overshoot", () => {
      const close = anchor.clone().add(new Vector3(0, endDistance, 0));
      expect(positionAt(close, close, 0.5).distanceTo(close)).toBeLessThan(
        1e-12,
      );
      const far = anchor.clone().add(new Vector3(0, 40, 0));
      const outward = progressSteps.map((progress) =>
        positionAt(close, far, progress).distanceTo(anchor),
      );
      for (let step = 1; step < outward.length; step += 1) {
        expect(outward[step]).toBeGreaterThan(outward[step - 1] ?? 0);
      }
      expect(Math.max(...outward)).toBeLessThanOrEqual(40 * (1 + 1e-9));
    });

    it("keeps a look target on the start line pointed at the destination", () => {
      const start = new Vector3(0, -30, 26);
      const end = anchor.clone().add(new Vector3(-endDistance, 0, 0));
      const lookTarget = start.clone().lerp(anchor, 0.25);
      for (const progress of [0.1, 0.5, 0.9]) {
        const move = anchoredCameraMove(start, end, anchor, progress, up);
        const camera = applyAnchoredCameraMove(new Vector3(), start, move);
        const look = applyAnchoredCameraMove(new Vector3(), lookTarget, move)
          .sub(camera)
          .normalize();
        expect(look.dot(anchor.clone().sub(camera).normalize())).toBeCloseTo(
          1,
          9,
        );
      }
    });

    it("fails explicitly when the camera starts on the destination", () => {
      expect(() =>
        anchoredCameraMove(
          anchor,
          anchor.clone().addScalar(1),
          anchor,
          0.5,
          up,
        ),
      ).toThrow(/positive/u);
    });
  });
});
