import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import {
  type AnchoredCameraMove,
  anchoredCameraMove,
  applyAnchoredCameraMove,
  chooseTurnSide,
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
    const newMove = (): AnchoredCameraMove => ({
      anchor: new Vector3(),
      rotation: new Quaternion(),
      scale: 1,
    });
    // A flight chooses its turn side once, from the poses it begins with.
    const moveAt = (
      start: Vector3,
      end: Vector3,
      centre: Vector3,
      progress: number,
    ): AnchoredCameraMove =>
      anchoredCameraMove(
        newMove(),
        start,
        end,
        centre,
        progress,
        chooseTurnSide(start.clone().sub(centre), end.clone().sub(centre), up),
      );
    const positionAt = (
      start: Vector3,
      end: Vector3,
      progress: number,
      centre: Vector3 = anchor,
    ): Vector3 =>
      applyAnchoredCameraMove(
        new Vector3(),
        start,
        moveAt(start, end, centre, progress),
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
        const move = moveAt(start, end, anchor, progress);
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
        moveAt(anchor, anchor.clone().addScalar(1), anchor, 0.5),
      ).toThrow(/positive/u);
    });

    // Every frame of a 12 s flight at 60 frames a second after the turn: the
    // eased progress crowds the last frames close to the destination.
    const fineSteps = Array.from({ length: 721 }, (_, frame) =>
      sampleDirectCameraTransition((frame * 1_000) / 60, 12_000),
    )
      .filter((sample) => sample.phase !== "orienting")
      .map((sample) => sample.segmentProgress);
    const closestApproach = (
      start: Vector3,
      end: Vector3,
      centre: Vector3,
      body: Vector3,
    ): number =>
      Math.min(
        ...fineSteps.map((progress) =>
          positionAt(start, end, progress, centre).distanceTo(body),
        ),
      );

    it("keeps an observer flight outside the body it ends just above", () => {
      // From Voyager 1 to just above Mercury's sunward surface, looking at
      // the Sun, with Mercury at several places on its orbit; in AU.
      const kmAu = 1 / 149_597_870.7;
      const mercuryRadius = 2_439.7 * kmAu;
      const start = new Vector3(-0.1, -0.85, 0.55)
        .normalize()
        .multiplyScalar(165);
      for (const degrees of [0, 45, 90, 135, 180, 270]) {
        const angle = (degrees * Math.PI) / 180;
        const mercury = new Vector3(
          Math.cos(angle),
          Math.sin(angle),
          0,
        ).multiplyScalar(0.387);
        const sun = new Vector3();
        const end = mercury.clone().add(
          sun
            .clone()
            .sub(mercury)
            .normalize()
            .multiplyScalar(mercuryRadius + 24.4 * kmAu),
        );
        expect(
          closestApproach(start, end, mercury, mercury) / mercuryRadius,
        ).toBeGreaterThan(1);
        // Turning round the Sun, the body the observer looks at, takes the
        // camera through Mercury.
        expect(
          closestApproach(start, end, sun, mercury) / mercuryRadius,
        ).toBeLessThan(1);
      }
    });

    it("keeps an Apollo site flight from the far side above the Moon", () => {
      // In km, with the Moon at the centre. The inspection pose sits about
      // 11 m up and 34 m from the site, looking at a point 1.1 m above it.
      const moonRadius = 1_737.4;
      const moon = new Vector3();
      const start = new Vector3(1, 0, 0.2)
        .normalize()
        .multiplyScalar(4 * moonRadius);
      for (const degrees of [105, 150, 180]) {
        const angle = (degrees * Math.PI) / 180;
        const normal = new Vector3(Math.cos(angle), Math.sin(angle), 0);
        const lookTarget = normal.clone().multiplyScalar(moonRadius + 0.0011);
        const end = normal
          .clone()
          .multiplyScalar(moonRadius + 0.011)
          .add(
            new Vector3(-Math.sin(angle), Math.cos(angle), 0).multiplyScalar(
              0.033,
            ),
          );
        expect(closestApproach(start, end, moon, moon)).toBeGreaterThan(
          moonRadius,
        );
        // Turning round the look target tunnels under the surface.
        expect(closestApproach(start, end, lookTarget, moon)).toBeLessThan(
          moonRadius,
        );
      }
    });

    it("keeps its turn when the end direction drifts across opposite", () => {
      // Time-lapse moves the destination during the flight, so the end
      // direction drifts from a clear turn, through nearly opposite, to the
      // other side of the start. The camera must not jump.
      const centre = new Vector3();
      const start = new Vector3(5, 0, 0);
      const endAt = (step: number): Vector3 =>
        new Vector3(-1, 0.2 - (0.4 * step) / 400, 0.1)
          .normalize()
          .multiplyScalar(5);
      const turnSide = chooseTurnSide(start, endAt(0), up);
      let previous = start.clone();
      let largestStep = 0;
      for (let step = 1; step <= 400; step += 1) {
        const position = applyAnchoredCameraMove(
          new Vector3(),
          start,
          anchoredCameraMove(
            newMove(),
            start,
            endAt(step),
            centre,
            step / 400,
            turnSide,
          ),
        );
        largestStep = Math.max(largestStep, position.distanceTo(previous));
        previous = position;
      }
      // About 3 degrees of turn at a distance of 5 per step at most; a flip
      // of the turn side jumps by several units.
      expect(largestStep).toBeLessThan(0.3);
      expect(previous.distanceTo(endAt(400))).toBeLessThan(1e-9);
    });
  });
});
