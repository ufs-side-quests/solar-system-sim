import { describe, expect, it } from "vitest";

import {
  pointInsideViewport,
  pointsAroundDisc,
  rayToViewportEdge,
  rectangleOverlapsDisc,
} from "./sun-guide";

describe("sun guide screen geometry", () => {
  it("clips a bearing ray to the correct viewport edge", () => {
    expect(
      rayToViewportEdge({ x: 400, y: 300 }, { x: 2, y: 1 }, 800, 600, 24),
    ).toEqual({
      x: 776,
      y: 488,
    });
  });

  it("recognises points inside the labelled safe area", () => {
    expect(pointInsideViewport({ x: 24, y: 24 }, 800, 600, 24)).toBe(true);
    expect(pointInsideViewport({ x: 10, y: 300 }, 800, 600, 24)).toBe(false);
  });

  it("keeps an outward bearing on an already reached edge", () => {
    expect(
      rayToViewportEdge({ x: 776, y: 300 }, { x: 1, y: 0 }, 800, 600, 24),
    ).toEqual({ x: 776, y: 300 });
  });

  it("rejects a direction with no bearing", () => {
    expect(() =>
      rayToViewportEdge({ x: 400, y: 300 }, { x: 0, y: 0 }, 800, 600, 24),
    ).toThrow("direction must be positive");
  });
});

describe("guide labels clear of a disc", () => {
  const disc = { x: 100, y: 100, radius: 50 };

  it("finds a rectangle that reaches into a disc", () => {
    // Clear of the disc, beside its right edge.
    expect(
      rectangleOverlapsDisc(
        { left: 151, right: 200, top: 90, bottom: 110 },
        disc,
      ),
    ).toBe(false);
    // Over its edge.
    expect(
      rectangleOverlapsDisc(
        { left: 140, right: 200, top: 90, bottom: 110 },
        disc,
      ),
    ).toBe(true);
    // Its corner is outside the disc, although its box is inside the
    // disc's square.
    expect(
      rectangleOverlapsDisc(
        { left: 140, right: 200, top: 140, bottom: 200 },
        disc,
      ),
    ).toBe(false);
  });

  it("starts straight out along the direction and turns away both ways", () => {
    const points = pointsAroundDisc(disc, { x: 1, y: 0 }, 10);
    expect(points[0]?.x).toBeCloseTo(160);
    expect(points[0]?.y).toBeCloseTo(100);
    // The next two turn 15 degrees each way.
    for (const point of points.slice(1, 3)) {
      expect(Math.hypot(point.x - 100, point.y - 100)).toBeCloseTo(60);
      expect(point.x).toBeCloseTo(100 + 60 * Math.cos(Math.PI / 12));
    }
    expect(points[1]?.y).not.toBeCloseTo(points[2]?.y ?? 0);
    // The last is straight back.
    expect(points.at(-1)?.x).toBeCloseTo(40);
    expect(points).toHaveLength(24);
  });
});
