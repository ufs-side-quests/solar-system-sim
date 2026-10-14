import { describe, expect, it } from "vitest";

import { ECLIPSE_STORY_STEPS } from "../eclipse/eclipse-story";
import { SCALE_TOUR_STEPS } from "./scale-tour";

const GUIDED_STEPS = [...SCALE_TOUR_STEPS, ...ECLIPSE_STORY_STEPS];

function numericTokens(text: string): string[] {
  return text.match(/\d+(?:[.,]\d+)*/gu) ?? [];
}

describe("child line of every guided step", () => {
  it("is short", () => {
    for (const step of GUIDED_STEPS) {
      expect(step.kidLine.split(/\s+/u).length, step.id).toBeLessThanOrEqual(
        18,
      );
    }
  });

  it("uses only numbers that the step's own sourced text gives", () => {
    for (const step of GUIDED_STEPS) {
      const sourced = new Set(
        numericTokens(
          [
            step.title,
            step.scale,
            step.description,
            step.timeRateLabel,
            step.narration.text,
          ].join(" "),
        ),
      );
      for (const token of numericTokens(step.kidLine)) {
        expect(sourced.has(token), `${step.id}: ${token}`).toBe(true);
      }
    }
  });
});
