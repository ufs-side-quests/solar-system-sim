import { describe, expect, it } from "vitest";

import { placeBodyLabel, type LabelRectangle } from "./label-placement";

// 0.7rem, the body label font size in styles.css.
const FONT_PX = 11.2;
const LANE_PX = 2 * FONT_PX + 1;

const place = (
  name: string,
  role: "overview-planet" | "other",
  guideRectangles: readonly LabelRectangle[],
  bodyRectangles: readonly LabelRectangle[],
) =>
  placeBodyLabel({
    name,
    role,
    projectedX: 700,
    projectedY: 450,
    fontPx: FONT_PX,
    viewportWidth: 1440,
    viewportHeight: 900,
    guideRectangles,
    bodyRectangles,
  });

const everywhere: LabelRectangle = {
  left: 0,
  right: 1440,
  top: 0,
  bottom: 900,
};

describe("placeBodyLabel", () => {
  it("stacks crowded planet labels one lane above and below before the sides", () => {
    const first = place("Mercury", "overview-planet", [], []);
    expect([first.x, first.y]).toEqual([700, 450]);
    const second = place("Venus", "overview-planet", [], [first.rectangle]);
    expect([second.x, second.y]).toEqual([700, 450 - LANE_PX]);
    expect(second.rectangle.bottom).toBeLessThan(first.rectangle.top);
    const third = place(
      "Earth",
      "overview-planet",
      [],
      [first.rectangle, second.rectangle],
    );
    expect([third.x, third.y]).toEqual([700, 450 + LANE_PX]);
    expect(third.rectangle.top).toBeGreaterThan(first.rectangle.bottom);
  });

  it("lets a guide label move a body label but never hide it", () => {
    const sun: LabelRectangle = {
      left: 690,
      right: 760,
      top: 440,
      bottom: 460,
    };
    const moved = place("Mercury", "overview-planet", [sun], []);
    expect([moved.x, moved.y]).toEqual([700, 450 - LANE_PX]);
    expect(moved.overlapsBodyLabel).toBe(false);

    const io = place("Io", "other", [everywhere], []);
    expect([io.x, io.y]).toEqual([700, 450]);
    expect(io.overlapsBodyLabel).toBe(false);
  });

  it("reports a body label that covers the only place", () => {
    const io = place("Io", "other", [], [everywhere]);
    expect(io.overlapsBodyLabel).toBe(true);
  });
});
