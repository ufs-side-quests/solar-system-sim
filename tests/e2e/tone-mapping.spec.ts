import { expect, test } from "@playwright/test";

import solarPhotosphereJson from "../../src/data/solar-photosphere.snapshot.json" with { type: "json" };

import {
  hueAndSaturation,
  marsMapMeanLinear,
  srgbDecode,
} from "./colour-metrics";

const FIXTURE_URL = "/tests/e2e/fixtures/tone-mapping-scene.ts";

const luma = ([red, green, blue]: readonly number[]): number =>
  0.2126 * (red ?? Number.NaN) +
  0.7152 * (green ?? Number.NaN) +
  0.0722 * (blue ?? Number.NaN);

// The hue-keeping tone mapping replaced ACES Filmic without changing the
// scene's brightness: middle grey shows where ACES showed it.
test("shows an 18% grey facing the Sun at the screen grey ACES gave it", async ({
  page,
}) => {
  // A page without the app, so only the fixture applies the patch.
  await page.goto(FIXTURE_URL);
  const shown = await page.evaluate(async (url) => {
    const fixture = (await import(
      url
    )) as typeof import("./fixtures/tone-mapping-scene");
    const grey = fixture.middleGreyFacingTheSun();
    return {
      app: fixture.renderToneMapped([grey], 1, "app")[0],
      aces: fixture.renderToneMapped([grey], 1, "aces")[0],
    };
  }, FIXTURE_URL);
  if (shown.app === undefined || shown.aces === undefined) {
    throw new Error("The fixture returned no pixel");
  }
  // ACES shows it at luma 177 (sRGB bytes 183, 176, 172).
  expect(luma(shown.aces)).toBeGreaterThan(176);
  expect(luma(shown.aces)).toBeLessThan(178);
  expect(Math.abs(luma(shown.app) - luma(shown.aces))).toBeLessThanOrEqual(2);
});

// The curve keeps the colour it is given: Mars's map colour in sunlight, as
// bright as the grey above and twice as bright, shows in its own hue and
// saturation. ACES Filmic turned it about 9 degrees towards yellow.
test("shows Mars's sunlit map colour in its own hue and saturation", async ({
  page,
}) => {
  const mapMean = await marsMapMeanLinear();
  const sunlight = solarPhotosphereJson.discMeanLinearSrgb;
  const lit = mapMean.map(
    (mean, channel) => mean * (sunlight[channel] ?? Number.NaN),
  );
  await page.goto(FIXTURE_URL);
  const greyLuma = await page.evaluate(async (url) => {
    const fixture = (await import(
      url
    )) as typeof import("./fixtures/tone-mapping-scene");
    const [red, green, blue] = fixture.middleGreyFacingTheSun();
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  }, FIXTURE_URL);
  const litLuma =
    0.2126 * (lit[0] ?? Number.NaN) +
    0.7152 * (lit[1] ?? Number.NaN) +
    0.0722 * (lit[2] ?? Number.NaN);
  const colours = [1, 2].map(
    (brightness) =>
      lit.map((channel) => (channel * brightness * greyLuma) / litLuma) as [
        number,
        number,
        number,
      ],
  );
  const shown = await page.evaluate(
    async ([url, inputs]) => {
      const fixture = (await import(
        url
      )) as typeof import("./fixtures/tone-mapping-scene");
      return fixture.renderToneMapped(inputs, 1, "app");
    },
    [FIXTURE_URL, colours] as const,
  );
  const given = hueAndSaturation(lit);
  for (const bytes of shown) {
    const drawn = hueAndSaturation(bytes.map(srgbDecode));
    expect(Math.abs(drawn.hueDeg - given.hueDeg)).toBeLessThan(1);
    expect(drawn.saturation / given.saturation).toBeGreaterThan(0.97);
    expect(drawn.saturation / given.saturation).toBeLessThan(1.03);
  }
});
