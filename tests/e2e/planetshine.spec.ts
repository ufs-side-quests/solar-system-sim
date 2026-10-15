import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import sharp from "sharp";

import bodyAlbedoJson from "../../src/data/body-albedo.snapshot.json" with { type: "json" };
import { predictedPlanetshineFill } from "./fixtures/planetshine-prediction";

const FIXTURE_URL = "/tests/e2e/fixtures/planetshine-scene.ts";
const DEGREE = Math.PI / 180;

async function openPausedScene(page: Page): Promise<Locator> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  await expect(scene).toHaveAttribute("data-rendered-time-seconds", /-?\d+/u, {
    timeout: 30_000,
  });
  return scene;
}

async function focusBody(
  page: Page,
  scene: Locator,
  name: string,
  bodyId: string,
): Promise<void> {
  const focus = page.getByRole("combobox", { name: "Focus" });
  await focus.fill(name);
  await focus.press("Enter");
  await expect(scene).toHaveAttribute("data-focus-body", bodyId);
}

/** Focuses a model and looks at its side that faces the parent. */
async function viewParentSide(
  page: Page,
  scene: Locator,
  name: string,
  bodyId: string,
): Promise<void> {
  await focusBody(page, scene, name, bodyId);
  await expect(scene).toHaveAttribute("data-local-shadow-body", bodyId, {
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Display" }).click();
  await page.getByRole("tab", { name: "Camera" }).click();
  await page.getByRole("button", { name: "Face parent", exact: true }).click();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(scene).toHaveAttribute(
    "data-camera-orientation",
    "parent-facing",
  );
  await expect
    .poll(
      async () =>
        Math.abs(
          Number(await scene.getAttribute("data-camera-exposure")) /
            Number(await scene.getAttribute("data-camera-exposure-target")) -
            1,
        ),
      { timeout: 30_000 },
    )
    .toBeLessThan(0.005);
  await page.addStyleTag({
    content: ".body-label-layer { visibility: hidden; }",
  });
}

type Crop = Readonly<{ left: number; top: number; size: number }>;

/** Mean sRGB luma of a crop of the scene canvas. */
async function cropMean(page: Page, crop: Crop): Promise<number> {
  const frame = await page
    .locator("canvas.major-body-layer")
    .screenshot({ animations: "disabled" });
  const { data, info } = await sharp(frame)
    .extract({
      left: crop.left,
      top: crop.top,
      width: crop.size,
      height: crop.size,
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    sum +=
      0.2126 * (data[offset] ?? Number.NaN) +
      0.7152 * (data[offset + 1] ?? Number.NaN) +
      0.0722 * (data[offset + 2] ?? Number.NaN);
  }
  return sum / (crop.size * crop.size);
}

/** The fill the scene's geometry predicts, from the surface integral. */
async function predictedFill(
  scene: Locator,
  parentId: string,
): Promise<number> {
  const body = bodyAlbedoJson.bodies.find(
    (candidate) => candidate.id === parentId,
  );
  if (body === undefined) throw new Error(`${parentId} has no albedo`);
  const { reflectance } = body;
  return predictedPlanetshineFill({
    law: reflectance.law === "lambert" ? "lambert" : "lommel-seeliger",
    albedo:
      "bondAlbedo" in reflectance
        ? reflectance.bondAlbedo
        : reflectance.geometricAlbedo,
    angularRadiusRad:
      Number(
        await scene.getAttribute("data-model-planetshine-angular-radius-deg"),
      ) * DEGREE,
    phaseAngleRad:
      Number(await scene.getAttribute("data-model-planetshine-phase-deg")) *
      DEGREE,
  });
}

// An empty patch of sky in the same frame: the black level.
const SKY: Crop = { left: 900, top: 150, size: 100 };

for (const model of [
  {
    name: "International Space Station (Earth)",
    bodyId: "iss",
    parentId: "earth",
    // A module on the shadow side, clear of the floodlights. Measured on
    // 1280 x 800: luma 7.5 without planetshine, 22 with it (sky 4.8).
    crop: { left: 576, top: 288, size: 24 },
  },
  {
    name: "Discovery One (fictional)",
    bodyId: "discovery-one",
    parentId: "io",
    // The pod bay below the command sphere: luma 2.7 without planetshine,
    // 169 with it.
    crop: { left: 632, top: 384, size: 20 },
  },
] as const) {
  test(`lights the shadow side of ${model.bodyId} with its parent's light`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000);
    const scene = await openPausedScene(page);
    await viewParentSide(page, scene, model.name, model.bodyId);
    const frame = await page
      .locator("canvas.major-body-layer")
      .screenshot({ animations: "disabled" });
    await testInfo.attach(model.bodyId, {
      body: frame,
      contentType: "image/png",
    });

    const black = await cropMean(page, SKY);
    expect(black).toBeLessThan(10);
    expect(await cropMean(page, model.crop)).toBeGreaterThan(black + 10);

    await expect(scene).toHaveAttribute(
      "data-model-planetshine-source",
      model.parentId,
    );
    const ratio = Number(
      await scene.getAttribute("data-model-planetshine-ratio"),
    );
    const predicted = await predictedFill(scene, model.parentId);
    expect(predicted).toBeGreaterThan(0.05);
    expect(Math.abs(ratio / predicted - 1)).toBeLessThan(0.2);
  });
}

test("puts Io's disc at its true size around Discovery One", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const scene = await openPausedScene(page);
  await focusBody(page, scene, "Discovery One (fictional)", "discovery-one");
  await expect(scene).toHaveAttribute("data-model-planetshine-source", "io", {
    timeout: 60_000,
  });
  // A 400 km orbit around Io's 1,821.6 km radius: asin(1821.6 / 2221.6).
  expect(
    Number(
      await scene.getAttribute("data-model-planetshine-angular-radius-deg"),
    ),
  ).toBeCloseTo(Math.asin(1_821.6 / 2_221.6) / DEGREE, 1);
});

test("gives planets and moons no planetshine", async ({ page }) => {
  test.setTimeout(150_000);
  const scene = await openPausedScene(page);
  await focusBody(page, scene, "Death Star I (fictional)", "death-star-1");
  await expect(scene).toHaveAttribute(
    "data-model-planetshine-source",
    "callisto",
    { timeout: 60_000 },
  );
  await focusBody(page, scene, "Callisto", "callisto");
  await expect(scene).toHaveAttribute("data-focus-sunlight-ratio", "1.000");
  await expect(scene).not.toHaveAttribute("data-model-planetshine-ratio", /./u);
});

test("shades the map through three as the fill the scene reports", async ({
  page,
}) => {
  await page.goto(FIXTURE_URL);
  const { facingShare, awayShare } = await page.evaluate(async (url) => {
    const fixture = (await import(
      url
    )) as typeof import("./fixtures/planetshine-scene");
    return fixture.shadePlanetshinePlate();
  }, FIXTURE_URL);
  // three's PMREM irradiance on a plate facing Io against the map's own
  // cosine integral; and none on a plate facing away.
  expect(Math.abs(facingShare - 1)).toBeLessThan(0.1);
  expect(awayShare).toBeLessThan(0.02);
});
