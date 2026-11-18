import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import sharp from "sharp";

type SceneHarness = Readonly<{
  scene: Locator;
  assertNoBrowserErrors(): void;
}>;

async function openPausedScene(page: Page): Promise<SceneHarness> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const requestFailures: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    requestFailures.push(
      `${request.failure()?.errorText ?? "unknown request failure"}: ${request.url()}`,
    );
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  await expect(scene).toHaveAttribute("data-rendered-time-seconds", /-?\d+/u, {
    timeout: 30_000,
  });
  return {
    scene,
    assertNoBrowserErrors: () => {
      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
      expect(requestFailures).toEqual([]);
    },
  };
}

test("declares all four physical ring systems and fictional-orbiter physics", async ({
  page,
}) => {
  const harness = await openPausedScene(page);
  const { scene } = harness;
  await expect(scene).toHaveAttribute("data-jupiter-ring-count", "5");
  await expect(scene).toHaveAttribute("data-uranus-ring-count", "13");
  await expect(scene).toHaveAttribute("data-neptune-ring-count", "5");
  await expect(scene).toHaveAttribute(
    "data-fictional-orbiter-physics",
    "hypothetical-massless-two-body-no-gravity-backreaction",
  );
  harness.assertNoBrowserErrors();
});

for (const [search, bodyId, ringModelAttribute] of [
  ["Jupiter", "jupiter", "data-jupiter-ring-model"],
  ["Neptune", "neptune", "data-neptune-ring-model"],
] as const) {
  test(`renders ${search}'s PDS ring system`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const harness = await openPausedScene(page);
    const { scene } = harness;
    await page.getByRole("button", { name: "Orrery" }).click();
    const focus = page.getByRole("combobox", { name: "Focus" });
    await focus.fill(search);
    await focus.press("Enter");
    await expect(scene).toHaveAttribute("data-focus-body", bodyId);
    await expect(scene).toHaveAttribute(
      ringModelAttribute,
      "pds-radii-widths-optical-depths",
    );
    for (let zoomStep = 0; zoomStep < 4; zoomStep += 1) {
      await page.getByRole("button", { name: "Zoom in" }).click();
    }
    await page.screenshot({
      path: testInfo.outputPath(`${bodyId}-rings.png`),
      animations: "disabled",
    });
    harness.assertNoBrowserErrors();
  });
}

for (const [search, bodyId, geometryAttribute] of [
  [
    "Death Star I (fictional)",
    "death-star-1",
    "data-deathstar1-geometry-visible",
  ],
  [
    "Death Star II (fictional)",
    "death-star-2",
    "data-deathstar2-geometry-visible",
  ],
] as const) {
  test(`renders ${search} at physical scale`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const harness = await openPausedScene(page);
    const { scene } = harness;
    const focus = page.getByRole("combobox", { name: "Focus" });
    await focus.fill(search);
    await focus.press("Enter");
    await expect(scene).toHaveAttribute("data-focus-body", bodyId);
    await expect(scene).toHaveAttribute(geometryAttribute, "true");
    await expect(scene).toHaveAttribute(
      `data-${bodyId.replaceAll("-", "")}-visual-model`,
      bodyId === "death-star-2"
        ? "cc-by-sketchfab-pbr-glb"
        : "original-integrated-pbr-hull-recessed-dish-and-dense-interior-v3",
    );
    if (bodyId === "death-star-2") {
      await expect(scene).toHaveAttribute(
        "data-deathstar2-model-loaded",
        "true",
        { timeout: 30_000 },
      );
    }
    await expect(page.getByRole("complementary")).toContainText(
      "Hypothetical live circular two-body orbit",
    );
    if (bodyId === "death-star-2") {
      await expect(scene).toHaveAttribute(
        "data-deathstar2-attitude",
        "camera-relative-fictional-presentation",
      );
    } else {
      await expect(scene).toHaveAttribute(
        "data-deathstar1-attitude",
        "camera-relative-fictional-presentation",
      );
    }
    await page.screenshot({
      path: testInfo.outputPath(`${bodyId}.png`),
      animations: "disabled",
    });
    const radiusAttribute = `data-${bodyId.replaceAll("-", "")}-radius-pixels`;
    const zoomIn = page.getByRole("button", { name: "Zoom in" });
    for (let zoomStep = 0; zoomStep < 3; zoomStep += 1) {
      const previousRadius = Number(await scene.getAttribute(radiusAttribute));
      await zoomIn.click();
      await expect
        .poll(() => scene.getAttribute(radiusAttribute).then(Number))
        .toBeGreaterThan(previousRadius);
      if (zoomStep === 1) {
        await expect
          .poll(() => scene.getAttribute(radiusAttribute).then(Number))
          .toBeGreaterThan(280);
        await page.screenshot({
          path: testInfo.outputPath(`${bodyId}-close-framed.png`),
          animations: "disabled",
        });
      }
    }
    await expect
      .poll(() => scene.getAttribute(radiusAttribute).then(Number))
      .toBeGreaterThan(280);
    await page.screenshot({
      path: testInfo.outputPath(`${bodyId}-close.png`),
      animations: "disabled",
    });
    harness.assertNoBrowserErrors();
  });
}

/** Rec. 709 luma of each pixel of a screenshot inside a disc. */
async function discLuma(
  image: Buffer,
  centreX: number,
  centreY: number,
  radius: number,
): Promise<{ left: number[]; right: number[] }> {
  const { data, info } = await sharp(image)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const left: number[] = [];
  const right: number[] = [];
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const localX = x - centreX;
      const localY = y - centreY;
      if (localX * localX + localY * localY > radius * radius) continue;
      const offset = (y * info.width + x) * info.channels;
      const luma =
        (data[offset] ?? Number.NaN) * 0.2126 +
        (data[offset + 1] ?? Number.NaN) * 0.7152 +
        (data[offset + 2] ?? Number.NaN) * 0.0722;
      (localX < 0 ? left : right).push(luma);
    }
  }
  return { left, right };
}

test("shows Death Star II's sunlit hull and lit windows, steady while the camera is still", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const harness = await openPausedScene(page);
  const { scene } = harness;
  const focus = page.getByRole("combobox", { name: "Focus" });
  await focus.fill("Death Star II (fictional)");
  await focus.press("Enter");
  await expect(scene).toHaveAttribute("data-focus-body", "death-star-2");
  await expect(scene).toHaveAttribute("data-deathstar2-model-loaded", "true", {
    timeout: 60_000,
  });
  await expect(scene).toHaveAttribute(
    "data-local-shadow-body",
    "death-star-2",
    {
      timeout: 60_000,
    },
  );
  // Measure the settled automatic exposure, not one still adapting.
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
  const label = page.locator('.body-label[data-body-id="death-star-2"]');
  const centreX = Number(await label.getAttribute("data-screen-x"));
  const centreY = Number(await label.getAttribute("data-screen-y"));
  const radius = Number(await label.getAttribute("data-radius-pixels"));
  expect(radius).toBeGreaterThan(100);
  const canvas = page.locator("canvas.major-body-layer");
  const first = await canvas.screenshot({ animations: "disabled" });
  const second = await canvas.screenshot({ animations: "disabled" });
  await testInfo.attach("death-star-2", {
    body: first,
    contentType: "image/png",
  });
  const firstLuma = await discLuma(first, centreX, centreY, radius);
  const secondLuma = await discLuma(second, centreX, centreY, radius);

  // The Sun lights one half of the disc. The painted hull there is grey,
  // not the near-black of dimmed bare metal: the Sketchfab export's base
  // colour and metallic factors put the mean luma of that half at 11, the
  // repaired file at 53.
  const mean = (values: readonly number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  expect(Math.max(mean(firstLuma.left), mean(firstLuma.right))).toBeGreaterThan(
    30,
  );

  // With the camera still, two frames match: no alpha-tested or shadowed
  // texel flickers between them.
  const firstPixels = [...firstLuma.left, ...firstLuma.right];
  const secondPixels = [...secondLuma.left, ...secondLuma.right];
  expect(secondPixels).toHaveLength(firstPixels.length);
  const changedPixels = firstPixels.filter(
    (luma, index) => Math.abs(luma - (secondPixels[index] ?? Number.NaN)) > 30,
  ).length;
  expect(changedPixels / firstPixels.length).toBeLessThan(0.001);

  // The file's two window materials emit at the calibrated level.
  await expect(scene).toHaveAttribute(
    "data-deathstar2-lit-window-materials",
    "2",
  );
  await expect(scene).toHaveAttribute(
    "data-deathstar2-window-luminance-cd-m2",
    "300",
  );
  harness.assertNoBrowserErrors();
});

test("reports a Death Star I texture that fails to load", async ({ page }) => {
  test.setTimeout(120_000);
  const hullTexture = "/textures/fictional/death-star-hull-v2.webp";
  await page.route(`**${hullTexture}`, (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  await expect(scene).toHaveAttribute("data-rendered-time-seconds", /-?\d+/u, {
    timeout: 30_000,
  });
  const focus = page.getByRole("combobox", { name: "Focus" });
  await focus.fill("Death Star I (fictional)");
  await focus.press("Enter");
  await expect(scene).toHaveAttribute("data-focus-body", "death-star-1");
  await expect(scene).toHaveAttribute(
    "data-deathstar1-geometry-visible",
    "true",
  );
  await expect(page.locator(".gpu-status")).toHaveClass(/\berror\b/u, {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Display" }).click();
  await expect(page.locator(".gpu-error-detail")).toHaveText(
    `Fictional model texture ${hullTexture} failed to load for Death Star I (fictional)`,
  );
});

for (const [search, bodyId, distanceText, litWindowMaterials] of [
  [
    "Deep Space Nine (fictional)",
    "deep-space-nine",
    "Distance from Callisto",
    "1",
  ],
  [
    "USS Defiant (fictional)",
    "uss-defiant",
    "Distance from Deep Space Nine",
    "2",
  ],
] as const) {
  test(`renders the licensed ${search} model at physical scale`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const harness = await openPausedScene(page);
    const { scene } = harness;
    const focus = page.getByRole("combobox", { name: "Focus" });
    await focus.fill(search);
    await focus.press("Enter");
    await expect(scene).toHaveAttribute("data-focus-body", bodyId);
    await expect(scene).toHaveAttribute(
      `data-${bodyId.replaceAll("-", "")}-model-loaded`,
      "true",
      { timeout: 30_000 },
    );
    await expect(scene).toHaveAttribute(
      `data-${bodyId.replaceAll("-", "")}-geometry-visible`,
      "true",
    );
    const datasetKey = bodyId.replaceAll("-", "");
    await expect(scene).toHaveAttribute(
      `data-${datasetKey}-lit-window-materials`,
      litWindowMaterials,
    );
    await expect(scene).toHaveAttribute(
      `data-${datasetKey}-window-luminance-cd-m2`,
      "300",
    );
    // The test browser (Chrome with WebGL) supports anisotropic filtering, so
    // the profile's anisotropy is above 1; at 1 a model texture left at the
    // default could not be told apart.
    const sceneAnisotropy = Number(
      await scene.getAttribute("data-texture-anisotropy"),
    );
    expect(sceneAnisotropy).toBeGreaterThan(1);
    await expect(scene).toHaveAttribute(
      `data-${datasetKey}-model-texture-anisotropy`,
      String(sceneAnisotropy),
    );
    await expect(page.getByRole("complementary")).toContainText(distanceText);
    await expect(page.getByRole("complementary")).toContainText("Sketchfab");
    await page.screenshot({
      path: testInfo.outputPath(`${bodyId}.png`),
      animations: "disabled",
    });
    harness.assertNoBrowserErrors();
  });
}

test("installs physical Apollo artefacts and sourced LROC traverses", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  await expect(scene).toHaveAttribute("data-rendered-time-seconds", /-?\d+/u, {
    timeout: 30_000,
  });
  await expect(scene).toHaveAttribute(
    "data-apollo-surface-assets",
    "physical-lm-flags-alsep-retroreflectors-lrv",
  );
  await expect(scene).toHaveAttribute(
    "data-apollo-traverse-authority",
    "NASA-LROC-PDS",
  );
});
