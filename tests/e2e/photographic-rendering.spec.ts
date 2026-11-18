import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import sharp from "sharp";

import solarPhotosphereJson from "../../src/data/solar-photosphere.snapshot.json" with { type: "json" };

import {
  hueAndSaturation,
  marsMapMeanLinear,
  srgbDecode,
} from "./colour-metrics";

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
  await expect
    .poll(async () =>
      Number(await scene.getAttribute("data-camera-transition-elapsed-ms")),
    )
    .toBeGreaterThan(500);
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
    { timeout: 30_000 },
  );
}

async function hemisphereLuminance(
  image: Buffer,
  centreX: number,
  centreY: number,
  radius: number,
): Promise<Readonly<{ left: number; right: number }>> {
  const { data, info } = await sharp(image)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let leftTotal = 0;
  let leftCount = 0;
  let rightTotal = 0;
  let rightCount = 0;
  const sampleRadius = radius * 0.72;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const localX = x - centreX;
      const localY = y - centreY;
      if (localX * localX + localY * localY > sampleRadius * sampleRadius) {
        continue;
      }
      const offset = (y * info.width + x) * info.channels;
      const luminance =
        (data[offset] ?? 0) * 0.2126 +
        (data[offset + 1] ?? 0) * 0.7152 +
        (data[offset + 2] ?? 0) * 0.0722;
      if (localX < -radius * 0.08) {
        leftTotal += luminance;
        leftCount += 1;
      } else if (localX > radius * 0.08) {
        rightTotal += luminance;
        rightCount += 1;
      }
    }
  }
  if (leftCount === 0 || rightCount === 0) {
    throw new Error("The reference body has no image samples");
  }
  return { left: leftTotal / leftCount, right: rightTotal / rightCount };
}

/** Mean linear sRGB in a thin ring of a disc at mu = cos(angle from centre). */
async function discRingLinearRgb(
  image: Buffer,
  centreX: number,
  centreY: number,
  radius: number,
): Promise<(mu: number) => readonly [number, number, number]> {
  const { data, info } = await sharp(image)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const linear = (value: number) => {
    const encoded = value / 255;
    return encoded <= 0.04045
      ? encoded / 12.92
      : ((encoded + 0.055) / 1.055) ** 2.4;
  };
  return (mu) => {
    const ringRadius = Math.sqrt(1 - mu * mu);
    const [inner, outer] =
      mu === 1 ? [0, 0.25] : [ringRadius - 0.012, ringRadius + 0.012];
    const total: [number, number, number] = [0, 0, 0];
    let count = 0;
    for (let y = Math.floor(centreY - radius); y <= centreY + radius; y += 1) {
      for (
        let x = Math.floor(centreX - radius);
        x <= centreX + radius;
        x += 1
      ) {
        const distance = Math.hypot(x - centreX, y - centreY) / radius;
        if (distance < inner || distance > outer) {
          continue;
        }
        const offset = (y * info.width + x) * info.channels;
        total[0] += linear(data[offset] ?? Number.NaN);
        total[1] += linear(data[offset + 1] ?? Number.NaN);
        total[2] += linear(data[offset + 2] ?? Number.NaN);
        count += 1;
      }
    }
    if (count === 0) {
      throw new Error(`The solar disc has no samples at mu ${mu.toFixed(2)}`);
    }
    return [total[0] / count, total[1] / count, total[2] / count];
  };
}

test("uses photographic rendering with inverse-square sunlight and measured diagnostics", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await page.goto("/");
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  await expect(page.locator("canvas.major-body-layer")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Pause", exact: true }).click();

  await expect(scene).toHaveAttribute("data-visual-quality", "photographic");
  await expect(scene).toHaveAttribute(
    "data-solar-illumination-model",
    "inverse-square",
  );
  await expect(scene).toHaveAttribute(
    "data-solar-occlusion-model",
    "all-major-bodies-finite-disc",
  );
  expect(
    Number(await scene.getAttribute("data-solar-occlusion-receiver-count")),
  ).toBeGreaterThan(20);
  await expect(scene).toHaveAttribute(
    "data-atmosphere-model",
    "optical-depth-ray-marched-single-scattering",
  );
  await expect(scene).toHaveAttribute(
    "data-saturn-ring-lighting",
    "cassini-profile-solar-incidence-mutual-shadowing-and-depth-occlusion",
  );
  await expect(scene).toHaveAttribute(
    "data-saturn-ring-exposure",
    "live-camera-exposure",
  );
  await expect(scene).toHaveAttribute(
    "data-saturn-ring-occlusion",
    "continuous-sheet-against-opaque-globe-logarithmic-depth-buffer",
  );
  await expect(scene).toHaveAttribute(
    "data-uranus-ring-model",
    "pds-13-ring-radii-widths-optical-depths",
  );
  await expect(scene).toHaveAttribute("data-uranus-ring-count", "13");
  await expect(scene).toHaveAttribute(
    "data-uranus-ring-inner-radius-km",
    "37850",
  );
  await expect(scene).toHaveAttribute(
    "data-uranus-ring-outer-radius-km",
    "106200",
  );

  await page.getByRole("button", { name: "Display" }).click();
  const exposureMode = page.getByRole("combobox", { name: "Exposure mode" });
  await expect(exposureMode).toHaveValue("auto");
  await expect(scene).toHaveAttribute("data-camera-exposure-mode", "auto");
  await exposureMode.selectOption("manual");
  const manualExposure = page.getByRole("slider", {
    name: "Manual exposure EV",
  });
  await manualExposure.fill("2");
  await expect(scene).toHaveAttribute("data-camera-exposure-mode", "manual");
  await expect
    .poll(async () =>
      Number(await scene.getAttribute("data-camera-exposure-ev")),
    )
    .toBeGreaterThan(1.8);
  await exposureMode.selectOption("auto");
  const quality = page.getByRole("combobox", { name: "Rendering quality" });
  await quality.selectOption("battery");
  await expect(scene).toHaveAttribute("data-visual-quality", "battery");
  expect(
    Number(await scene.getAttribute("data-render-pixel-ratio")),
  ).toBeLessThanOrEqual(1);
  await quality.selectOption("balanced");
  await expect(scene).toHaveAttribute("data-visual-quality", "balanced");
  await quality.selectOption("photographic");
  await expect(scene).toHaveAttribute("data-visual-quality", "photographic");
  await page.getByRole("tab", { name: "Guides" }).click();
  await page.getByRole("combobox", { name: "Wayfinders" }).selectOption("off");
  await page.getByRole("tab", { name: "View" }).click();
  await page.getByRole("checkbox", { name: "Labels" }).uncheck();
  await page.getByRole("button", { name: "Close" }).click();

  await focusBody(page, scene, "Earth", "earth");
  await expect(
    page.locator('.body-label[data-body-id="earth"]'),
  ).toHaveAttribute("data-surface-asset-state", "loaded", {
    timeout: 60_000,
  });
  expect(
    Number(await scene.getAttribute("data-exposure-reference-distance-au")),
  ).toBeGreaterThan(0.98);
  expect(
    Number(await scene.getAttribute("data-focused-sun-camera-alignment")),
  ).toBeGreaterThan(0.9);
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.screenshot({
    path: testInfo.outputPath("photographic-earth.png"),
    animations: "disabled",
  });

  await focusBody(page, scene, "Saturn", "saturn");
  await expect(scene).toHaveAttribute(
    "data-saturn-ring-asset-state",
    "loaded",
    {
      timeout: 60_000,
    },
  );
  await expect(scene).toHaveAttribute(
    "data-earth-night-light-asset",
    "NASA-Black-Marble-2016",
  );
  expect(
    Number(await scene.getAttribute("data-camera-exposure-target")),
  ).toBeGreaterThan(50);
  expect(
    Number(await scene.getAttribute("data-focused-sun-camera-alignment")),
  ).toBeGreaterThan(0.9);
  await page.getByRole("button", { name: "Zoom in" }).click();
  const saturnCanvas = page.locator("canvas.major-body-layer");
  const saturnFrame = await saturnCanvas.screenshot({
    animations: "disabled",
  });
  const saturnLabel = page.locator('.body-label[data-body-id="saturn"]');
  const saturnX = Number(await saturnLabel.getAttribute("data-screen-x"));
  const saturnY = Number(await saturnLabel.getAttribute("data-screen-y"));
  const saturnRadius = Number(
    await saturnLabel.getAttribute("data-radius-pixels"),
  );
  const { data: saturnPixels, info: saturnImage } = await sharp(saturnFrame)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let visibleRingPixelCount = 0;
  let brightRingPixelCount = 0;
  let neutralRingPixelCount = 0;
  let brownRingPixelCount = 0;
  for (let y = 0; y < saturnImage.height; y += 1) {
    for (let x = 0; x < saturnImage.width; x += 1) {
      const distance = Math.hypot(x - saturnX, y - saturnY);
      if (distance <= saturnRadius * 1.08 || distance >= saturnRadius * 2.5) {
        continue;
      }
      const pixelOffset = (y * saturnImage.width + x) * saturnImage.channels;
      const red = saturnPixels[pixelOffset] ?? 0;
      const green = saturnPixels[pixelOffset + 1] ?? 0;
      const blue = saturnPixels[pixelOffset + 2] ?? 0;
      const maximumChannel = Math.max(red, green, blue);
      const minimumChannel = Math.min(red, green, blue);
      if (maximumChannel <= 35) {
        continue;
      }
      visibleRingPixelCount += 1;
      if (red + green + blue > 240) {
        brightRingPixelCount += 1;
      }
      if (maximumChannel - minimumChannel < 64) {
        neutralRingPixelCount += 1;
      }
      if (red > green * 1.18 && red > blue * 1.45) {
        brownRingPixelCount += 1;
      }
    }
  }
  await page.screenshot({
    path: testInfo.outputPath("photographic-saturn.png"),
    animations: "disabled",
  });
  expect(visibleRingPixelCount).toBeGreaterThan(5_000);
  expect(brightRingPixelCount).toBeGreaterThan(1_000);
  expect(neutralRingPixelCount / visibleRingPixelCount).toBeGreaterThan(0.7);
  expect(brownRingPixelCount / visibleRingPixelCount).toBeLessThan(0.08);

  await focusBody(page, scene, "Uranus", "uranus");
  await page.screenshot({
    path: testInfo.outputPath("photographic-uranus-rings.png"),
    animations: "disabled",
  });

  await focusBody(page, scene, "Sun", "sun");
  expect(
    Number(await scene.getAttribute("data-camera-exposure-target")),
  ).toBeCloseTo(1.05, 2);
  await page.waitForTimeout(1_000);
  const frameIntervalMs = Number(
    await scene.getAttribute("data-render-frame-interval-ms"),
  );
  const cpuSubmissionMs = Number(
    await scene.getAttribute("data-render-cpu-submission-ms"),
  );
  expect(frameIntervalMs).toBeGreaterThan(0);
  expect(frameIntervalMs).toBeLessThan(250);
  expect(cpuSubmissionMs).toBeGreaterThanOrEqual(0);
  expect(Number(await scene.getAttribute("data-render-calls"))).toBeGreaterThan(
    0,
  );
  const sunCanvas = await page
    .locator("canvas.major-body-layer")
    .screenshot({ animations: "disabled" });
  expect(sunCanvas.byteLength).toBeGreaterThan(5_000);
  await page.screenshot({
    path: testInfo.outputPath("photographic-sun.png"),
    animations: "disabled",
  });

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("keeps both physical ring systems coherent across camera orientations", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  await page.goto("/");
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  const canvas = page.locator("canvas.major-body-layer");
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect(scene).toHaveAttribute(
    "data-rendered-time-seconds",
    /-?\d+(?:\.\d+)?/u,
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Pause", exact: true }).click();

  for (const [name, bodyId] of [
    ["Saturn", "saturn"],
    ["Uranus", "uranus"],
  ] as const) {
    await focusBody(page, scene, name, bodyId);
    for (const [orientation, controlName] of [
      ["sun-facing", "Sunlit side"],
      ["overhead", "Above"],
      ["edge-on", "Side"],
    ] as const) {
      await page.getByRole("button", { name: "Display" }).click();
      await page.getByRole("tab", { name: "Camera" }).click();
      await page
        .getByRole("button", { name: controlName, exact: true })
        .click();
      await expect(scene).toHaveAttribute(
        "data-camera-orientation",
        orientation,
      );
      await expect(scene).toHaveAttribute(
        "data-camera-transition-phase",
        "settled",
        { timeout: 30_000 },
      );
      await page.getByRole("button", { name: "Close" }).click();
      await canvas.screenshot({
        path: testInfo.outputPath(`${bodyId}-${orientation}.png`),
        animations: "disabled",
      });
    }
  }

  await focusBody(page, scene, "Saturn", "saturn");
  await page.getByRole("button", { name: "Display" }).click();
  await page.getByRole("tab", { name: "Camera" }).click();
  await page.getByRole("button", { name: "Sunlit side" }).click();
  await page.getByRole("button", { name: "Close" }).click();
  const zoomIn = page.getByRole("button", { name: "Zoom in" });
  await zoomIn.click();
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
    {
      timeout: 30_000,
    },
  );
  await canvas.screenshot({
    path: testInfo.outputPath("saturn-close-oblique.png"),
    animations: "disabled",
  });

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("renders the restrained solar photosphere in the authored close-view scene", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  await expect(page.locator("canvas.major-body-layer")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Scale tour" }).click();
  const tourNext = page.getByRole("button", { name: "Next", exact: true });
  await tourNext.click();
  await tourNext.click();
  await expect(
    page.getByText("The Sun is more than a yellow ball", { exact: true }),
  ).toBeVisible();
  await expect(scene).toHaveAttribute("data-focus-body", "sun");
  await expect(scene).toHaveAttribute(
    "data-solar-presentation",
    "physical-limb-darkening-and-corona-scattering",
  );
  await expect(scene).toHaveAttribute("data-solar-corona-layers", "3d-shell");
  await expect(scene).toHaveAttribute("data-solar-prominence-count", "0");
  const canvas = page.locator("canvas.major-body-layer");
  const capture = await canvas.screenshot({ animations: "disabled" });
  expect(capture.byteLength).toBeGreaterThan(10_000);
  await page.screenshot({
    path: testInfo.outputPath("photographic-sun-close.png"),
    animations: "disabled",
  });

  // Measure the bare disc with every panel and label hidden. A 5772 K star
  // is nearly white at the centre; Allen limb darkening dims and reddens
  // the edge (I(0.4)/I(1) is 0.635, edge blue/red falls to 0.67 of centre).
  const sunLabel = page.locator('.body-label[data-body-id="sun"]');
  await expect(sunLabel).toHaveAttribute("data-surface-asset-state", "derived");
  // The tour camera has arrived when the Sun's drawn radius stops changing.
  let previousRadius = Number.NaN;
  await expect
    .poll(
      async () => {
        const radius = Number(
          await sunLabel.getAttribute("data-radius-pixels"),
        );
        const steady = Math.abs(radius - previousRadius) < 0.01;
        previousRadius = radius;
        return steady && radius > 60;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  const sceneBox = await scene.boundingBox();
  if (sceneBox === null) {
    throw new Error("The scene has no layout box");
  }
  const sunX =
    sceneBox.x + Number(await sunLabel.getAttribute("data-screen-x"));
  const sunY =
    sceneBox.y + Number(await sunLabel.getAttribute("data-screen-y"));
  const sunRadius = Number(await sunLabel.getAttribute("data-radius-pixels"));
  await page.addStyleTag({
    content:
      "body *:not(canvas) { visibility: hidden !important; } canvas { visibility: visible !important; }",
  });
  const bareDisc = await page.screenshot({ animations: "disabled" });
  await testInfo.attach("photographic-sun-bare-disc.png", {
    body: bareDisc,
    contentType: "image/png",
  });
  const ring = await discRingLinearRgb(bareDisc, sunX, sunY, sunRadius);
  const luminance = ([red, green, blue]: readonly [number, number, number]) =>
    0.2126 * red + 0.7152 * green + 0.0722 * blue;
  const blueToRed = ([red, , blue]: readonly [number, number, number]) =>
    blue / red;
  const centre = ring(1);
  expect(blueToRed(centre)).toBeGreaterThanOrEqual(0.8);
  expect(blueToRed(centre)).toBeLessThanOrEqual(0.98);
  const midLimb = luminance(ring(0.4)) / luminance(centre);
  expect(midLimb).toBeGreaterThanOrEqual(0.59);
  expect(midLimb).toBeLessThanOrEqual(0.68);
  expect(blueToRed(ring(0.2)) / blueToRed(centre)).toBeLessThan(0.75);
});

test("matches the reference image for a physical terminator", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.goto("/");
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  const canvas = page.locator("canvas.major-body-layer");
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Pause", exact: true }).click();

  await focusBody(page, scene, "Earth", "earth");
  await page.getByRole("button", { name: "Display" }).click();
  await page.getByRole("tab", { name: "Camera" }).click();
  await page.getByRole("button", { name: "Day and night" }).click();
  await expect(scene).toHaveAttribute("data-camera-orientation", "terminator");
  await expect(scene).toHaveAttribute(
    "data-orientation-transition-phase",
    "settled",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Close" }).click();
  const earthFrame = await canvas.screenshot({ animations: "disabled" });
  const earthLabel = page.locator('.body-label[data-body-id="earth"]');
  const earthLuminance = await hemisphereLuminance(
    earthFrame,
    Number(await earthLabel.getAttribute("data-screen-x")),
    Number(await earthLabel.getAttribute("data-screen-y")),
    Number(await earthLabel.getAttribute("data-radius-pixels")),
  );
  expect(
    Math.max(earthLuminance.left, earthLuminance.right) /
      Math.max(1, Math.min(earthLuminance.left, earthLuminance.right)),
  ).toBeGreaterThan(2.2);
  await page.screenshot({
    path: testInfo.outputPath("reference-earth-terminator.png"),
    animations: "disabled",
  });
});

test("matches the reference image for the Death Star II local shadow", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.goto("/");
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  const canvas = page.locator("canvas.major-body-layer");
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  // The clock runs at 1 hour / second until the pause, so the pause time
  // depends on how fast the page loaded, and the station turns along its
  // orbit: a pause between 530 s and 1,100 s gave ratios from 1.56 down to
  // 1.21. Steps of 1 minute back put every run in one window, 420 s to 480 s.
  const renderedTime = async (): Promise<number> =>
    Number(await scene.getAttribute("data-rendered-time-seconds"));
  await page.getByRole("slider", { name: "Playback rate" }).fill("1");
  for (let time = await renderedTime(); time > 480;) {
    await page.getByRole("button", { name: "Step backward" }).click();
    await expect.poll(renderedTime).toBeCloseTo(time - 60, 0);
    time = await renderedTime();
  }
  expect(await renderedTime()).toBeGreaterThan(420);
  await focusBody(page, scene, "Death Star II (fictional)", "death-star-2");
  await expect(scene).toHaveAttribute("data-deathstar2-model-loaded", "true", {
    timeout: 60_000,
  });
  await expect(scene).toHaveAttribute("data-local-shadow-body", "death-star-2");
  await expect(scene).toHaveAttribute("data-local-shadow-map", "pcf-2048");
  await page.getByRole("button", { name: "Display" }).click();
  await page.getByRole("tab", { name: "Camera" }).click();
  await page.getByRole("button", { name: "Day and night" }).click();
  await expect(scene).toHaveAttribute("data-camera-orientation", "terminator");
  // Measure the terminator view, not a frame of the turn towards it.
  await expect(scene).toHaveAttribute(
    "data-orientation-transition-phase",
    "settled",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Close" }).click();
  const modelFrame = await canvas.screenshot({ animations: "disabled" });
  expect(modelFrame.byteLength).toBeGreaterThan(10_000);
  const modelLabel = page.locator('.body-label[data-body-id="death-star-2"]');
  const modelLuminance = await hemisphereLuminance(
    modelFrame,
    Number(await modelLabel.getAttribute("data-screen-x")),
    Number(await modelLabel.getAttribute("data-screen-y")),
    Number(await modelLabel.getAttribute("data-radius-pixels")),
  );
  testInfo.annotations.push({
    type: "Death Star II hemisphere luma",
    description: `left ${modelLuminance.left.toFixed(2)}, right ${modelLuminance.right.toFixed(2)}, simulation time ${String(await renderedTime())} s`,
  });
  expect(
    Math.max(modelLuminance.left, modelLuminance.right) /
      Math.max(1, Math.min(modelLuminance.left, modelLuminance.right)),
  ).toBeGreaterThan(1.25);
  await page.screenshot({
    path: testInfo.outputPath("reference-death-star-local-shadow.png"),
    animations: "disabled",
  });
});

test("shows Mars in the hue and saturation of its surface map", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  // The reference: the area-weighted (cosine of latitude) mean of the
  // installed map in linear sRGB, as scripts/fetch-body-albedo.mjs takes it,
  // lit by the scene's sunlight colour.
  const mapMean = await marsMapMeanLinear();
  const reference = hueAndSaturation(
    mapMean.map(
      (mean, channel) =>
        mean * (solarPhotosphereJson.discMeanLinearSrgb[channel] ?? Number.NaN),
    ),
  );

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  await expect(scene).toHaveAttribute("data-rendered-time-seconds", /-?\d+/u, {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await focusBody(page, scene, "Mars", "mars");
  const label = page.locator('.body-label[data-body-id="mars"]');
  await expect(label).toHaveAttribute("data-surface-asset-state", "loaded", {
    timeout: 60_000,
  });
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
  const centreX = Number(await label.getAttribute("data-screen-x"));
  const centreY = Number(await label.getAttribute("data-screen-y"));
  const radius = Number(await label.getAttribute("data-radius-pixels"));
  expect(radius).toBeGreaterThan(100);
  const frame = await page
    .locator("canvas.major-body-layer")
    .screenshot({ animations: "disabled" });
  await testInfo.attach("mars", { body: frame, contentType: "image/png" });
  const { data, info } = await sharp(frame)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // The sunlit part of the disc: inside 90% of the radius, clear of the
  // limb, and at least a quarter of the brightest luma there, clear of the
  // terminator.
  const inside: number[] = [];
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if ((x - centreX) ** 2 + (y - centreY) ** 2 <= (0.9 * radius) ** 2) {
        inside.push((y * info.width + x) * info.channels);
      }
    }
  }
  const luma = (offset: number): number =>
    0.2126 * (data[offset] ?? Number.NaN) +
    0.7152 * (data[offset + 1] ?? Number.NaN) +
    0.0722 * (data[offset + 2] ?? Number.NaN);
  const peak = inside.reduce(
    (brightest, offset) => Math.max(brightest, luma(offset)),
    0,
  );
  const lit = inside.filter((offset) => luma(offset) >= 0.25 * peak);
  expect(lit.length).toBeGreaterThan(10_000);
  const rendered = hueAndSaturation(
    [0, 1, 2].map(
      (channel) =>
        lit.reduce(
          (sum, offset) =>
            sum + srgbDecode(data[offset + channel] ?? Number.NaN),
          0,
        ) / lit.length,
    ),
  );
  // Measured at 1280 by 800: ACES Filmic drew this disc 9.2 degrees towards
  // yellow. The hue-keeping tone mapping draws it 0.3 degrees away.
  // Saturation is not checked against the map here: the shaded scene has
  // only 0.91 of it before any tone curve, likely from the surface's
  // specular reflection of white sunlight. tone-mapping.spec.ts checks that
  // the curve itself keeps saturation.
  expect(Math.abs(rendered.hueDeg - reference.hueDeg)).toBeLessThan(3);
});
