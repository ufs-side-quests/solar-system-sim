import { describe, expect, it } from "vitest";

import { majorBodySnapshot } from "../physics/solar-system-data";
import { sizeLineupLayout } from "./size-lineup";

function sourcedRadiusM(id: string): number {
  const body = majorBodySnapshot.bodies.find(
    (candidate) => candidate.id === id,
  );
  if (body === undefined) {
    throw new Error(`Snapshot is missing ${id}`);
  }
  return body.meanRadiusM;
}

describe("size lineup layout", () => {
  const layout = sizeLineupLayout(majorBodySnapshot.bodies);

  it("keeps the planets in order, then the Moon and Pluto", () => {
    expect(layout.circles.map((circle) => circle.name)).toEqual([
      "Mercury",
      "Venus",
      "Earth",
      "Mars",
      "Jupiter",
      "Saturn",
      "Uranus",
      "Neptune",
      "Moon",
      "Pluto",
    ]);
  });

  it("draws every circle and the Sun at one scale from the sourced radii", () => {
    const earth = layout.circles.find((circle) => circle.id === "earth");
    if (earth === undefined) {
      throw new Error("Lineup is missing Earth");
    }
    for (const circle of [layout.sun, ...layout.circles]) {
      const drawnRatio = circle.radius / earth.radius;
      const sourcedRatio = sourcedRadiusM(circle.id) / sourcedRadiusM("earth");
      expect(Math.abs(drawnRatio / sourcedRatio - 1), circle.id).toBeLessThan(
        0.001,
      );
    }
    expect(Math.max(...layout.circles.map((circle) => circle.radius))).toBe(1);
    expect(layout.sun.radius).toBeGreaterThan(9);
  });

  it("fails by name when a lineup body is missing", () => {
    expect(() =>
      sizeLineupLayout(
        majorBodySnapshot.bodies.filter((body) => body.id !== "pluto"),
      ),
    ).toThrow("Size lineup body pluto is missing from the snapshot");
  });
});
