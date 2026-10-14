import { describe, expect, it } from "vitest";

import { VALIDATED_WINDOW_SECONDS } from "../physics/simulation-date";
import { portraitFitDistanceAu } from "../scene/camera-focus";
import { CINEMATIC_SHOTS, PLANETS_RACING_SHOT } from "./cinematic-shots";

const DAY_SECONDS = 86_400;

describe("cinematic shots", () => {
  it("keeps every Cool Shot physically scaled in Reality mode", () => {
    expect(CINEMATIC_SHOTS).not.toHaveLength(0);
    const portraits = CINEMATIC_SHOTS.filter(
      (shot) => shot !== PLANETS_RACING_SHOT,
    );
    expect(portraits).toHaveLength(CINEMATIC_SHOTS.length - 1);
    expect(portraits).not.toHaveLength(0);
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
    // Mercury (NASA year 87.97 days) laps Earth (365.26 days) once per
    // synodic period of about 115.9 days: the caption and README promise a
    // lap about every 4 seconds.
    const synodicDays = 1 / (1 / 87.97 - 1 / 365.26);
    const lapSeconds =
      synodicDays /
      (PLANETS_RACING_SHOT.timeRateSecondsPerSecond / DAY_SECONDS);
    expect(lapSeconds).toBeGreaterThan(3);
    expect(lapSeconds).toBeLessThan(5);
    expect(PLANETS_RACING_SHOT.description).toBe(
      "Closer planets go round faster. Watch Mercury lap Earth.",
    );
  });

  it("repeats the race inside the validated ephemeris window", () => {
    const start = PLANETS_RACING_SHOT.startTimeSeconds;
    const end = PLANETS_RACING_SHOT.loopEndTimeSeconds;
    if (start === null || end === null) {
      throw new Error("Planets racing must seek to a start and loop");
    }
    expect(start).toBeGreaterThanOrEqual(-VALIDATED_WINDOW_SECONDS);
    expect(end).toBeLessThanOrEqual(VALIDATED_WINDOW_SECONDS);
    // Each loop shows several Mercury laps.
    expect(
      (end - start) / PLANETS_RACING_SHOT.timeRateSecondsPerSecond,
    ).toBeGreaterThan(15);
    for (const shot of CINEMATIC_SHOTS) {
      if (shot.loopEndTimeSeconds !== null) {
        expect(shot.startTimeSeconds, shot.name).not.toBeNull();
      }
    }
  });

  it("fits Mars's orbit across a portrait phone view", () => {
    const distanceAu = PLANETS_RACING_SHOT.cameraDistanceAu;
    if (distanceAu === undefined) {
      throw new Error("Planets racing must set a camera distance");
    }
    expect(portraitFitDistanceAu(distanceAu, 1024 / 704)).toBe(distanceAu);
    // The camera's field of view is 45 degrees vertically. Mars's orbit
    // reaches about 1.67 AU from the Sun.
    const halfFieldTangent = Math.tan((22.5 * Math.PI) / 180);
    for (const aspect of [390 / 844, 390 / 703, 768 / 1024]) {
      const halfWidthAu =
        portraitFitDistanceAu(distanceAu, aspect) * halfFieldTangent * aspect;
      expect(halfWidthAu, String(aspect)).toBeGreaterThan(1.67);
    }
  });
});
