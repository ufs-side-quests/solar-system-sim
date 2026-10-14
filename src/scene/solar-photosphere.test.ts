import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import solarPhotosphereJson from "../data/solar-photosphere.snapshot.json";
import { solarDiscLinearSrgb, solarPhotosphere } from "./solar-photosphere";

const luminance = ([red, green, blue]: readonly [number, number, number]) =>
  0.2126 * red + 0.7152 * green + 0.0722 * blue;

describe("solar photosphere", () => {
  it("commits exactly what the derivation script computes", () => {
    const derived: unknown = JSON.parse(
      execFileSync(
        process.execPath,
        ["scripts/derive-solar-photosphere.mjs", "--stdout"],
        { encoding: "utf8" },
      ),
    );
    expect(solarPhotosphereJson).toEqual(derived);
  });

  it("is white at the centre and darker and redder at the edge", () => {
    const centre = solarDiscLinearSrgb(1);
    const nearEdge = solarDiscLinearSrgb(0.2);
    expect(centre[2] / centre[0]).toBeGreaterThan(0.85);
    expect(luminance(solarDiscLinearSrgb(0.4)) / luminance(centre)).toBeCloseTo(
      0.635,
      2,
    );
    expect(nearEdge[2] / nearEdge[0] / (centre[2] / centre[0])).toBeLessThan(
      0.75,
    );
    // Sunlight, the whole disc, is the 5772 K blackbody colour.
    expect(solarPhotosphere.discMeanSrgbHex).toBe("#fff1ea");
  });
});
