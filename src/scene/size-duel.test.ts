import { describe, expect, it } from "vitest";

import { majorBodySnapshot } from "../physics/solar-system-data";
import {
  formatWidthRatio,
  SIZE_DUEL_PAIRS,
  sizeDuelQuestion,
  sizeDuelResult,
  sizeDuels,
} from "./size-duel";
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

describe("size duel", () => {
  const circles = sizeLineupLayout(majorBodySnapshot.bodies).circles;
  const duels = sizeDuels(circles, SIZE_DUEL_PAIRS);

  it("computes each pair's winner and ratio from the sourced radii", () => {
    expect(duels).toHaveLength(6);
    for (const [index, [firstId, secondId]] of SIZE_DUEL_PAIRS.entries()) {
      const duel = duels[index];
      const first = sourcedRadiusM(firstId);
      const second = sourcedRadiusM(secondId);
      expect(duel?.wider.id).toBe(first > second ? firstId : secondId);
      expect(duel?.ratio).toBeCloseTo(
        Math.max(first, second) / Math.min(first, second),
        12,
      );
    }
    expect(duels.map((duel) => duel.ratio.toFixed(3))).toEqual([
      "1.462",
      "1.404",
      "1.053",
      "1.030",
      "1.201",
      "1.389",
    ]);
  });

  it("asks the question and gives the result in plain words", () => {
    const [moonPluto, moonMercury, venusEarth, , saturnJupiter] = duels;
    if (
      moonPluto === undefined ||
      moonMercury === undefined ||
      venusEarth === undefined ||
      saturnJupiter === undefined
    ) {
      throw new Error("Size duel pairs are missing");
    }
    expect(sizeDuelQuestion(moonPluto)).toBe(
      "Guess first! Which is wider: the Moon or Pluto?",
    );
    expect(sizeDuelResult(moonPluto, "moon")).toBe(
      "Yes! The Moon is about 1.5 times wider than Pluto.",
    );
    expect(sizeDuelResult(moonPluto, "pluto")).toBe(
      "Not quite! The Moon is about 1.5 times wider than Pluto.",
    );
    expect(formatWidthRatio(moonMercury)).toBe(
      "Mercury is about 1.4 times wider than the Moon.",
    );
    expect(formatWidthRatio(venusEarth)).toBe(
      "Earth is only a little wider than Venus.",
    );
    expect(sizeDuelResult(saturnJupiter, "saturn")).toBe(
      "Not quite! Jupiter is about 1.2 times wider than Saturn. We measure the ball, not the rings.",
    );
  });

  it("rejects a body outside the lineup", () => {
    expect(() => sizeDuels(circles, [["moon", "io"]])).toThrow(
      "Size duel body io is not in the size lineup",
    );
  });

  it("rejects a pair with equal radii", () => {
    expect(() => sizeDuels(circles, [["earth", "earth"]])).toThrow(
      "Size duel earth and earth have equal radii, so neither is wider",
    );
  });
});
