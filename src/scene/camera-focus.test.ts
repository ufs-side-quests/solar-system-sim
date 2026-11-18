import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { majorBodySnapshot } from "../physics/solar-system";

import {
  catalogueMoonFocusDistanceAu,
  focusDistanceAu,
  focusNearPlaneAu,
  sunlitModelViewDirection,
} from "./camera-focus";

function bodyById(id: string) {
  const body = majorBodySnapshot.bodies.find(
    (candidate) => candidate.id === id,
  );
  if (body === undefined) {
    throw new Error(`Missing test body ${id}`);
  }
  return body;
}

describe("camera focus distance", () => {
  it("fits Earth itself instead of silently framing the Earth-Moon system", () => {
    const earth = bodyById("earth");
    expect(focusDistanceAu(earth, 0)).toBeCloseTo(
      (earth.meanRadiusM / 149_597_870_700) * 4,
      15,
    );
  });

  it("frames a close Moon view", () => {
    const moon = bodyById("moon");
    expect(focusDistanceAu(moon, 0)).toBeCloseTo(
      (moon.meanRadiusM / 149_597_870_700) * 4,
      15,
    );
  });

  it("bounds enhanced-object framing instead of zooming out to the whole system", () => {
    const earth = bodyById("earth");
    const physicalDistance = focusDistanceAu(earth, 0);
    expect(focusDistanceAu(earth, 1)).toBeCloseTo(physicalDistance * 12, 15);
  });

  it("frames Saturn's observed outer ring instead of only its globe", () => {
    const saturn = bodyById("saturn");
    const globeOnlyDistance = (saturn.meanRadiusM / 149_597_870_700) * 4;
    expect(focusDistanceAu(saturn, 0)).toBeGreaterThan(globeOnlyDistance * 2.3);
  });

  it("frames Uranus's resolvable main rings without shrinking it for diffuse Mu", () => {
    const uranus = bodyById("uranus");
    const globeOnlyDistance = (uranus.meanRadiusM / 149_597_870_700) * 4;
    expect(focusDistanceAu(uranus, 0)).toBeGreaterThan(globeOnlyDistance * 2);
    expect(focusDistanceAu(uranus, 0)).toBeLessThan(globeOnlyDistance * 2.1);
  });

  it("places the near plane inside the fit distance for small moons", () => {
    const phobosDistance = focusDistanceAu(bodyById("phobos"), 0);
    const nearPlane = focusNearPlaneAu(phobosDistance, 0.000_001);
    expect(nearPlane).toBe(phobosDistance / 64);
    expect(phobosDistance).toBeGreaterThan(nearPlane * 2);
  });

  it("retains the default near plane for planetary views", () => {
    expect(
      focusNearPlaneAu(focusDistanceAu(bodyById("earth"), 0), 0.000_001),
    ).toBe(0.000_001);
  });
});

describe("sunlit model view direction", () => {
  const north = new Vector3(0, 1, 0);

  it("views a model from about 40 degrees off the Sun line", () => {
    for (const sunDirection of [
      new Vector3(1, 0, 0),
      new Vector3(-0.3, 0.05, 0.9),
      new Vector3(0.2, 0.6, -0.7),
    ]) {
      const view = sunlitModelViewDirection(sunDirection, north);
      const phaseDeg = (view.angleTo(sunDirection) * 180) / Math.PI;
      expect(phaseDeg).toBeGreaterThan(39);
      expect(phaseDeg).toBeLessThan(40);
      expect(view.length()).toBeCloseTo(1, 12);
      // Most of the visible side stays sunlit.
      const sunlitFraction = (1 + Math.cos((phaseDeg * Math.PI) / 180)) / 2;
      expect(sunlitFraction).toBeGreaterThan(0.87);
    }
  });

  it("raises the camera north of the Sun line", () => {
    const sunDirection = new Vector3(1, 0, 0);
    const view = sunlitModelViewDirection(sunDirection, north);
    expect(view.y).toBeGreaterThan(0);
  });
});

describe("catalogue moon framing", () => {
  it("puts the parent half way to the edge of the narrower side", () => {
    // A 45 degree vertical field: in landscape the height is narrower.
    const landscape = catalogueMoonFocusDistanceAu(0.001, 45, 1.6);
    expect(Math.atan(0.001 / landscape)).toBeCloseTo(
      (22.5 / 2) * (Math.PI / 180),
    );
    // On a portrait phone the width is narrower, so the camera stands
    // farther back.
    const portrait = catalogueMoonFocusDistanceAu(0.001, 45, 390 / 844);
    const halfWidth = Math.atan(Math.tan((22.5 * Math.PI) / 180) * (390 / 844));
    expect(Math.atan(0.001 / portrait)).toBeCloseTo(halfWidth / 2);
    expect(portrait).toBeGreaterThan(landscape);
  });

  it("rejects a separation or view that cannot frame a moon", () => {
    expect(() => catalogueMoonFocusDistanceAu(0, 45, 1)).toThrow();
    expect(() => catalogueMoonFocusDistanceAu(0.001, 45, 0)).toThrow();
  });
});
