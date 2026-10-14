import { Body, GeoMoon, GeoVector, MakeTime } from "astronomy-engine";
import { describe, expect, it } from "vitest";

import {
  ASTRONOMICAL_UNIT_M,
  majorBodySnapshot,
} from "../physics/solar-system";
import {
  ECLIPSE_STORY_STEP_DURATION_MS,
  ECLIPSE_STORY_STEPS,
  LONDON_ECLIPSE,
  LONDON_ECLIPSE_OBSERVER,
  SPAIN_CENTRE_LINE_OBSERVER,
} from "./eclipse-story";

describe("12 August 2026 eclipse story", () => {
  it("matches NASA's published London circumstances", () => {
    expect(LONDON_ECLIPSE.partialBeginUtc).toBe("2026-08-12T17:17:12.171Z");
    expect(LONDON_ECLIPSE.maximumUtc).toBe("2026-08-12T18:13:11.748Z");
    expect(LONDON_ECLIPSE.partialEndUtc).toBe("2026-08-12T19:06:11.180Z");
    expect(LONDON_ECLIPSE.maximumObscuration).toBeCloseTo(0.9133, 4);
    expect(LONDON_ECLIPSE.maximumSunAltitudeDeg).toBeCloseTo(10.44, 2);
  });

  it("uses physical observer locations for London and the Spanish centre line", () => {
    expect(LONDON_ECLIPSE_OBSERVER).toEqual({
      name: "London",
      latitudeDeg: 51.5074,
      longitudeDeg: -0.1278,
    });
    expect(SPAIN_CENTRE_LINE_OBSERVER.latitudeDeg).toBeCloseTo(43.3717, 4);
    expect(SPAIN_CENTRE_LINE_OBSERVER.longitudeDeg).toBeCloseTo(-6.1883, 4);
  });

  it("keeps every view in the same physical renderer", () => {
    expect(ECLIPSE_STORY_STEPS).toHaveLength(8);
    expect(new Set(ECLIPSE_STORY_STEPS.map((step) => step.id)).size).toBe(8);
    for (const step of ECLIPSE_STORY_STEPS) {
      expect(step.viewMode, step.id).toBe("reality");
      expect(step.bodyVisibilityPercent, step.id).toBe(0);
      expect(step.timeSeconds, step.id).toBeGreaterThan(0);
      expect(step.overlays.tactical, step.id).toBe(false);
      expect(step.overlays.eclipticGrid, step.id).toBe(false);
      expect(step.overlays.planetTrails, step.id).toBe(false);
      expect(step.overlays.moonTrail, step.id).toBe(false);
      expect(step.narration.audioSource).toBe(`/audio/tour/${step.id}.mp3`);
      expect(step.narration.text.length).toBeGreaterThan(120);
    }
  });

  it("starts before the Sun-Moon-Earth alignment with visible lunar motion", () => {
    const opening = ECLIPSE_STORY_STEPS[0];
    expect(opening?.orientation).toBe("perspective");
    expect(opening?.timeUtc).toBe("2026-08-12T15:45:53.800Z");
    expect(opening?.timeRateSecondsPerSecond).toBe(3_600);
    expect(opening?.overlays.orbitGuides).toBe(true);
    expect(opening?.overlays.moonTrail).toBe(false);
    expect(opening?.title).toContain("Sun-Earth line");
    expect(opening?.description).toContain("starts before alignment");
  });

  it("bridges the London view to the physical lunar shadow axis", () => {
    const shadowAxis = ECLIPSE_STORY_STEPS.find(
      (step) => step.id === "shadow-axis",
    );
    const shadowView = ECLIPSE_STORY_STEPS.find(
      (step) => step.id === "shadow-from-moon",
    );
    expect(shadowAxis?.orientation).toBe("perspective");
    expect(shadowAxis?.focusBodyId).toBe("earth");
    expect(shadowAxis?.overlays.orbitGuides).toBe(true);
    expect(shadowView?.focusBodyId).toBe("moon");
    expect(shadowView?.cameraTargetBodyId).toBe("earth");
    expect(shadowView?.observerCameraStyle).toBe("shadow-axis");
    expect(shadowView?.cameraZoom).toBe(1);
    expect(shadowView?.timeRateSecondsPerSecond).toBe(120);
  });

  it("keeps the shadow view's own time inside the path of totality", () => {
    const shadowView = ECLIPSE_STORY_STEPS.find(
      (step) => step.id === "shadow-from-moon",
    );
    const earth = majorBodySnapshot.bodies.find((body) => body.id === "earth");
    if (shadowView === undefined || earth === undefined) {
      throw new Error("The shadow view and Earth are required");
    }
    // Distance from Earth's centre to the Sun-Moon shadow axis, as the
    // scene measures it against Earth's mean radius.
    const axisOffsetM = (date: Date): number => {
      const time = MakeTime(date);
      const moon = GeoMoon(time);
      const sun = GeoVector(Body.Sun, time, true);
      const shadowLength = Math.hypot(
        moon.x - sun.x,
        moon.y - sun.y,
        moon.z - sun.z,
      );
      const [ux, uy, uz] = [
        (moon.x - sun.x) / shadowLength,
        (moon.y - sun.y) / shadowLength,
        (moon.z - sun.z) / shadowLength,
      ];
      const along = -(moon.x * ux + moon.y * uy + moon.z * uz);
      const offsetAu = Math.hypot(
        moon.x + ux * along,
        moon.y + uy * along,
        moon.z + uz * along,
      );
      return offsetAu * ASTRONOMICAL_UNIT_M;
    };
    const startMs = Date.parse(shadowView.timeUtc);
    // The step plays for its full duration at its own rate, and the clock
    // can run on for up to a second while the next step's seek lands.
    const endMs =
      startMs +
      (ECLIPSE_STORY_STEP_DURATION_MS + 1_000) *
        shadowView.timeRateSecondsPerSecond;
    for (let timeMs = startMs; timeMs <= endMs; timeMs += 10_000) {
      expect(axisOffsetM(new Date(timeMs))).toBeLessThan(earth.meanRadiusM);
    }
    // A few minutes later the axis has left Earth: the check has a real edge.
    expect(axisOffsetM(new Date(endMs + 6 * 60_000))).toBeGreaterThan(
      earth.meanRadiusM,
    );
  });

  it("uses surface views for each contact phase and totality comparison", () => {
    const surfaceStepIds = ECLIPSE_STORY_STEPS.filter(
      (step) => step.surfaceObserver !== undefined,
    ).map((step) => step.id);
    expect(surfaceStepIds).toEqual([
      "london-before-contact",
      "london-first-contact",
      "london-maximum",
      "spain-totality",
      "london-final-contact",
    ]);
  });
});
