import { describe, expect, it } from "vitest";

import { CINEMATIC_SHOTS, PLANETS_RACING_SHOT } from "./cinematic-shots";

const DAY_SECONDS = 86_400;

describe("cinematic shots", () => {
  it("keeps every body portrait Cool Shot physically scaled in Reality mode", () => {
    const portraits = CINEMATIC_SHOTS.filter(
      (shot) => shot !== PLANETS_RACING_SHOT,
    );
    expect(portraits).toHaveLength(CINEMATIC_SHOTS.length - 1);
    for (const shot of portraits) {
      expect(shot.viewMode, shot.name).toBe("reality");
      expect(shot.bodyVisibilityPercent, shot.name).toBe(100);
    }
  });

  it("uses a sunward camera for planetary portraits", () => {
    for (const shotId of [
      "earth-daylight",
      "saturn-ring-skimming",
      "jupiter-daylight",
    ]) {
      expect(
        CINEMATIC_SHOTS.find((shot) => shot.id === shotId)?.orientation,
      ).toBe("sun-facing");
    }
  });

  it("keeps the Moon portrait illuminated at every live orbital phase", () => {
    const moon = CINEMATIC_SHOTS.find((shot) => shot.id === "moon-daylight");
    expect(moon?.orientation).toBe("sun-facing");
    expect(moon?.cameraDistanceAu).toBeGreaterThan(0);
  });

  it("shows the inner planets racing round the Sun from above", () => {
    expect(CINEMATIC_SHOTS).toContain(PLANETS_RACING_SHOT);
    expect(PLANETS_RACING_SHOT).toMatchObject({
      focusBodyId: "sun",
      orientation: "overhead",
      viewMode: "orrery",
      orbitGuides: true,
      planetTrails: true,
      labels: true,
    });
    // Mars aphelion is about 1.67 AU: the overhead camera must sit far enough
    // out to frame Mercury to Mars, and close enough that Earth's orbit is large.
    expect(PLANETS_RACING_SHOT.cameraDistanceAu).toBeGreaterThan(4);
    expect(PLANETS_RACING_SHOT.cameraDistanceAu).toBeLessThan(8);
    // Mercury (about 88 days) must lap Earth (about 365 days) within about
    // 10 seconds: the synodic period is about 116 days.
    const synodicDays = 1 / (1 / 87.97 - 1 / 365.26);
    expect(
      synodicDays /
        (PLANETS_RACING_SHOT.timeRateSecondsPerSecond / DAY_SECONDS),
    ).toBeLessThan(10);
    expect(PLANETS_RACING_SHOT.description).toBe(
      "Closer planets go round faster. Watch Mercury lap Earth.",
    );
  });
});
