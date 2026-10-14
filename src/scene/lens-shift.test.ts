import { describe, expect, it } from "vitest";

import { easeLensShiftPx, lensShiftTargetPx } from "./lens-shift";

describe("lensShiftTargetPx", () => {
  it("moves the subject to the middle of the free sky right of a covering panel", () => {
    // The tour card at 1024 px ends at 542 px: the free sky runs 542-1024.
    const shift = lensShiftTargetPx(542, 1024);
    expect(1024 / 2 + shift).toBe((542 + 1024) / 2);
  });

  it("leaves the picture alone when the panel keeps clear of the centre", () => {
    expect(lensShiftTargetPx(542, 1440)).toBe(0);
    expect(lensShiftTargetPx(0, 1024)).toBe(0);
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
