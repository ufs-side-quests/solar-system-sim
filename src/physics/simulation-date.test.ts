import { describe, expect, it } from "vitest";

import { majorBodySnapshot } from "./solar-system";
import {
  formatPlainSimulationDate,
  formatPlainSimulationOffset,
  formatSimulationDateUtc,
  simulationDateUtc,
} from "./simulation-date";

describe("simulation UTC date", () => {
  it("converts the TDB model epoch to its corresponding UTC instant", () => {
    expect(majorBodySnapshot.epoch.value).toBe(2_461_041.5);
    expect(simulationDateUtc(0).toISOString()).toBe("2025-12-31T23:58:44.948Z");
  });

  it("formats a compact global timestamp", () => {
    expect(formatSimulationDateUtc(86_400)).toBe("01 Jan 2026 · 23:58:44 UTC");
  });

  it("names the day in plain words", () => {
    expect(formatPlainSimulationDate(86_400)).toBe("1 January 2026");
  });

  it("says how far the clock is from the start in plain words", () => {
    const DAY = 86_400;
    expect(formatPlainSimulationOffset(0)).toBe("At the start");
    expect(formatPlainSimulationOffset(30)).toBe("30 seconds after the start");
    expect(formatPlainSimulationOffset(41.2 * 60)).toBe(
      "41.2 minutes after the start",
    );
    expect(formatPlainSimulationOffset(3_600)).toBe("1 hour after the start");
    expect(formatPlainSimulationOffset(4 * 3_600)).toBe(
      "4 hours after the start",
    );
    expect(formatPlainSimulationOffset(213.51 * DAY)).toBe(
      "213.51 days after the start",
    );
    expect(formatPlainSimulationOffset(-1 * DAY)).toBe(
      "1 day before the start",
    );
  });

  it("rejects invalid simulation times", () => {
    expect(() => simulationDateUtc(Number.NaN)).toThrow(
      "Simulation time must be finite",
    );
  });
});
