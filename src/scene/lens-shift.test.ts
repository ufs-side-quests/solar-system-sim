import { describe, expect, it } from "vitest";

import {
  easeLensShiftPx,
  lensShiftTargetPx,
  lensShiftUpTargetPx,
  projectedSphereRadiusPx,
  type PanelBox,
} from "./lens-shift";

// A left card from the left edge to `right`, `top` to `bottom`.
const leftCard = (right: number, top: number, bottom: number): PanelBox => ({
  left: 14,
  right,
  top,
  bottom,
});

describe("lensShiftTargetPx", () => {
  it("moves the subject to the middle of the free sky right of a covering panel", () => {
    // The tour card at 1024 px ends at 542 px: the free sky runs 542-1024.
    const shift = lensShiftTargetPx({
      sceneWidthPx: 1024,
      sceneHeightPx: 768,
      subjectLabelReachPx: 33,
      subjectRadiusPx: 200,
      leftPanels: [leftCard(542, 100, 750)],
      rightPanels: [],
    });
    expect(1024 / 2 + shift).toBe((542 + 1024) / 2);
  });

  it("leaves the picture alone when the panel keeps clear of the centre", () => {
    const layout = {
      sceneWidthPx: 1440,
      sceneHeightPx: 900,
      subjectLabelReachPx: 33,
      subjectRadiusPx: 200,
      rightPanels: [],
    };
    // The subject's left edge is at 520 px: a card ending at 494 px keeps
    // clear of it.
    expect(
      lensShiftTargetPx({ ...layout, leftPanels: [leftCard(494, 100, 880)] }),
    ).toBe(0);
    expect(lensShiftTargetPx({ ...layout, leftPanels: [] })).toBe(0);
    // A card ending at 542 px hides 22 px of the rim, so the subject goes to
    // the open sky.
    expect(
      1440 / 2 +
        lensShiftTargetPx({ ...layout, leftPanels: [leftCard(542, 100, 880)] }),
    ).toBe((542 + 1440) / 2);
  });

  it("leaves the picture alone when the card sits below the subject", () => {
    // Portrait 768 x 1024: the card is a band along the bottom.
    expect(
      lensShiftTargetPx({
        sceneWidthPx: 768,
        sceneHeightPx: 1024,
        subjectLabelReachPx: 33,
        subjectRadiusPx: 200,
        leftPanels: [leftCard(542, 760, 1010)],
        rightPanels: [],
      }),
    ).toBe(0);
  });

  it("keeps a subject wider than the open sky on the canvas", () => {
    // The open sky 542-1024 is 482 px wide; a subject 2 x 391 px wide stops
    // with its right edge on the canvas edge.
    const shift = lensShiftTargetPx({
      sceneWidthPx: 1024,
      sceneHeightPx: 768,
      subjectLabelReachPx: 33,
      subjectRadiusPx: 391,
      leftPanels: [leftCard(542, 100, 750)],
      rightPanels: [],
    });
    expect(1024 / 2 + shift + 391).toBe(1024);
  });

  it("keeps the subject out from under the Display panel", () => {
    // The selected-body card ends at 494 px and the Display panel starts at
    // 626 px: a subject 460 px wide fits nowhere, so it stays centred.
    const layout = {
      sceneWidthPx: 1024,
      sceneHeightPx: 768,
      subjectLabelReachPx: 33,
      leftPanels: [leftCard(494, 100, 670)],
      rightPanels: [{ left: 626, right: 1010, top: 14, bottom: 648 }],
    };
    expect(lensShiftTargetPx({ ...layout, subjectRadiusPx: 230 })).toBe(0);
    // A small subject under the tour card goes to the middle of the gap
    // between the panels.
    expect(
      1024 / 2 +
        lensShiftTargetPx({
          ...layout,
          leftPanels: [leftCard(542, 100, 750)],
          subjectRadiusPx: 10,
        }),
    ).toBe((542 + 626) / 2);
  });

  it("leaves a small subject alone when the card ends left of it", () => {
    // At 1280 px the tour card ends at 542 px, left of a small subject at
    // 640 px and of its label to the right.
    expect(
      lensShiftTargetPx({
        sceneWidthPx: 1280,
        sceneHeightPx: 720,
        subjectLabelReachPx: 33,
        subjectRadiusPx: 20,
        leftPanels: [leftCard(542, 359, 706)],
        rightPanels: [],
      }),
    ).toBe(0);
  });

  it("counts a card across the rows of a small subject's label", () => {
    // The card's top at 407 px is below Jupiter's disc at 384 +- 18 px but
    // above the bottom of the label 33 px below the centre.
    expect(
      lensShiftTargetPx({
        sceneWidthPx: 1024,
        sceneHeightPx: 768,
        subjectLabelReachPx: 33,
        subjectRadiusPx: 18,
        leftPanels: [leftCard(542, 407, 754)],
        rightPanels: [],
      }),
    ).toBe((542 + 1024) / 2 - 512);
  });

  it("moves a large subject whose rim the selected-body card covers", () => {
    // At 1280 x 800 the scene is 1280 x 736 and the card ends at 494 px:
    // a focused body 235 px in radius starts at 405 px, under the card.
    const shift = lensShiftTargetPx({
      sceneWidthPx: 1280,
      sceneHeightPx: 736,
      subjectLabelReachPx: 33,
      subjectRadiusPx: 235,
      leftPanels: [leftCard(494, 328, 630)],
      rightPanels: [],
    });
    expect(1280 / 2 + shift).toBe((494 + 1280) / 2);
    expect(1280 / 2 + shift - 235).toBeGreaterThan(494);
  });

  it("never moves a subject that surrounds the camera", () => {
    expect(
      lensShiftTargetPx({
        sceneWidthPx: 1024,
        sceneHeightPx: 768,
        subjectLabelReachPx: 33,
        subjectRadiusPx: Number.POSITIVE_INFINITY,
        leftPanels: [leftCard(542, 100, 750)],
        rightPanels: [],
      }),
    ).toBe(0);
  });
});

describe("lensShiftUpTargetPx", () => {
  // A full-width card along the bottom of a 390 x 844 phone.
  const phoneCard: PanelBox = { left: 8, right: 382, top: 470, bottom: 834 };

  it("moves a small subject to the middle of the open sky above a bottom card", () => {
    const shift = lensShiftUpTargetPx({
      sceneWidthPx: 390,
      sceneHeightPx: 844,
      subjectLabelReachPx: 33,
      subjectRadiusPx: 100,
      leftPanels: [phoneCard],
      rightPanels: [],
    });
    expect(844 / 2 - shift).toBe(470 / 2);
  });

  it("moves a subject taller than the open sky only until its top meets the canvas edge", () => {
    const shift = lensShiftUpTargetPx({
      sceneWidthPx: 390,
      sceneHeightPx: 844,
      subjectLabelReachPx: 33,
      subjectRadiusPx: 260,
      leftPanels: [phoneCard],
      rightPanels: [],
    });
    expect(844 / 2 - shift - 260).toBe(0);
  });

  it("leaves the picture alone for a card beside the subject or below its label", () => {
    const layout = {
      sceneWidthPx: 1280,
      sceneHeightPx: 736,
      subjectLabelReachPx: 33,
      subjectRadiusPx: 235,
      rightPanels: [],
    };
    // The desktop card starts above the centre: it is beside the subject.
    expect(
      lensShiftUpTargetPx({ ...layout, leftPanels: [leftCard(494, 328, 630)] }),
    ).toBe(0);
    // A bottom card below the subject covers none of it.
    expect(
      lensShiftUpTargetPx({
        ...layout,
        subjectRadiusPx: 20,
        leftPanels: [{ left: 8, right: 1272, top: 600, bottom: 730 }],
      }),
    ).toBe(0);
    expect(lensShiftUpTargetPx({ ...layout, leftPanels: [] })).toBe(0);
    // A desktop tour card that starts just below the centre stays left of
    // the centre column: the sideways shift clears it, so it moves nothing
    // up.
    expect(
      lensShiftUpTargetPx({
        ...layout,
        sceneHeightPx: 656,
        subjectRadiusPx: 150,
        leftPanels: [leftCard(542, 340, 640)],
      }),
    ).toBe(0);
  });

  it("never moves a subject that fills the frame or surrounds the camera", () => {
    for (const subjectRadiusPx of [844 / 2, Number.POSITIVE_INFINITY]) {
      expect(
        lensShiftUpTargetPx({
          sceneWidthPx: 390,
          sceneHeightPx: 844,
          subjectLabelReachPx: 33,
          subjectRadiusPx,
          leftPanels: [phoneCard],
          rightPanels: [],
        }),
      ).toBe(0);
    }
  });
});

describe("projectedSphereRadiusPx", () => {
  it("draws the outline of a sphere seen from outside", () => {
    // A sphere of radius 3 at distance 5 subtends asin(3/5): tan is 3/4.
    expect(projectedSphereRadiusPx(3, 5, 400)).toBeCloseTo(300, 9);
  });

  it("has no outline from inside the sphere", () => {
    expect(projectedSphereRadiusPx(5, 5, 400)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("easeLensShiftPx", () => {
  it("glides to the target in about 300 ms without a jump", () => {
    let shift = 0;
    const steps: number[] = [];
    for (let elapsed = 0; elapsed < 300; elapsed += 16) {
      shift = easeLensShiftPx(shift, 271, 16);
      steps.push(shift);
    }
    expect(steps[0]).toBeLessThan(271 * 0.25);
    expect(shift).toBeGreaterThan(271 * 0.95);
    expect(easeLensShiftPx(270.8, 271, 16)).toBe(271);
  });

  it("holds still when no time passes", () => {
    expect(easeLensShiftPx(100, 271, 0)).toBe(100);
  });
});
