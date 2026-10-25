import { expect, type Page, test } from "@playwright/test";
import sharp from "sharp";

test("observes the live sky from physical surface coordinates", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
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
  await page.getByRole("button", { name: "Display" }).click();
  await page.getByRole("tab", { name: "Camera" }).click();
  await page
    .getByRole("dialog", { name: "Display controls" })
    .getByText("Surface observer", { exact: true })
    .click();

  const observerBody = page.getByRole("combobox", {
    name: "Observer body",
  });
  const observerTarget = page
    .locator(".surface-observer-controls")
    .getByRole("combobox", { name: "Look at" });
  await observerBody.selectOption("earth");
  await observerTarget.selectOption("moon");
  await page.getByRole("spinbutton", { name: "Latitude" }).fill("51.4779");
  await page.getByRole("spinbutton", { name: "Longitude °E" }).fill("0");
  await page.getByRole("button", { name: "Enter surface view" }).click();

  const hud = page.getByRole("complementary", {
    name: "Surface observer measurements",
  });
  await expect(hud).toBeVisible();
  await expect(hud).toHaveAttribute("data-surface-observer-body", "earth");
  await expect(hud).toHaveAttribute("data-surface-observer-target", "moon");
  await expect(scene).toHaveAttribute("data-view-mode", "reality");
  await expect(scene).toHaveAttribute(
    "data-camera-tracking",
    "surface-observer",
  );
  await expect(scene).toHaveAttribute(
    "data-camera-orientation",
    "local-horizontal",
  );
  await expect(scene).toHaveAttribute("data-surface-observer-body", "earth");
  await expect(scene).toHaveAttribute("data-surface-observer-target", "moon");
  await expect(scene).toHaveAttribute(
    "data-surface-horizon-model",
    "mean-radius-geometric-no-refraction",
  );
  await expect(scene).toHaveAttribute("data-surface-horizon-visible", "true");
  await expect(hud).toContainText("Apparent diameter");
  await expect(hud).toContainText("Illuminated disc");
  await expect(hud).toContainText("Local solar time");
  await expect(hud).toContainText("Sunrise and sunset");
  await expect(page.getByLabel("Local compass")).toContainText("N");
  await expect(hud).toContainText("Geometric horizon");
  await expect(hud).toContainText("no terrain, atmosphere or refraction");

  const sceneSize = await scene.evaluate((element) => ({
    width: element.clientWidth,
    height: element.clientHeight,
  }));
  await expect
    .poll(async () =>
      Number(await scene.getAttribute("data-camera-target-screen-x")),
    )
    .toBeCloseTo(sceneSize.width / 2, 3);
  await expect
    .poll(async () =>
      Number(await scene.getAttribute("data-camera-target-screen-y")),
    )
    .toBeCloseTo(sceneSize.height / 2, 3);

  const observerPositionBeforeLook = await scene.getAttribute(
    "data-surface-observer-position",
  );
  const targetXBeforeLook = Number(
    await scene.getAttribute("data-camera-target-screen-x"),
  );
  const canvas = page.locator("canvas.major-body-layer");
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  if (canvasBox === null) throw new Error("Scene canvas has no bounding box");
  await page.mouse.move(
    canvasBox.x + canvasBox.width / 2,
    canvasBox.y + canvasBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    canvasBox.x + canvasBox.width / 2 + 180,
    canvasBox.y + canvasBox.height / 2 - 70,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(scene).toHaveAttribute("data-surface-free-look", "true");
  await expect(scene).toHaveAttribute(
    "data-surface-observer-position",
    observerPositionBeforeLook ?? "",
  );
  await expect
    .poll(async () =>
      Math.abs(
        Number(await scene.getAttribute("data-camera-target-screen-x")) -
          targetXBeforeLook,
      ),
    )
    .toBeGreaterThan(80);
  await hud.getByRole("button", { name: "Centre target" }).click();
  await expect(scene).toHaveAttribute("data-surface-free-look", "false");
  await expect
    .poll(async () =>
      Number(await scene.getAttribute("data-camera-target-screen-x")),
    )
    .toBeCloseTo(sceneSize.width / 2, 3);

  const localSolarTimeBefore = await scene.getAttribute(
    "data-surface-local-solar-time-hours",
  );
  await page.getByRole("button", { name: "Step forward" }).click();
  await expect
    .poll(() => scene.getAttribute("data-surface-local-solar-time-hours"))
    .not.toBe(localSolarTimeBefore);

  await page.getByRole("button", { name: "Display" }).click();
  await observerBody.selectOption("moon");
  await observerTarget.selectOption("earth");
  await expect(scene).toHaveAttribute("data-surface-observer-body", "moon");
  await expect(scene).toHaveAttribute("data-surface-observer-target", "earth");
  await expect(
    page.getByRole("button", { name: "Earth", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await page.screenshot({
    path: testInfo.outputPath("surface-observer-earth-from-moon.png"),
    animations: "disabled",
  });

  await hud.getByRole("button", { name: "Exit" }).click();
  await expect(hud).toBeHidden();
  await expect(scene).not.toHaveAttribute("data-surface-observer-body", /.+/u);
  await expect(page.getByRole("button", { name: "Zoom in" })).toBeEnabled();
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

// The mean sRGB byte of the open sky right of the cards, where the view
// looks down at the ground.
async function groundBrightness(page: Page): Promise<number> {
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error("The page must have a viewport");
  const png = await page.screenshot({
    clip: {
      x: viewport.width * 0.6,
      y: viewport.height * 0.25,
      width: viewport.width * 0.35,
      height: viewport.height * 0.35,
    },
    animations: "disabled",
  });
  const { data, info } = await sharp(png)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (const byte of data) sum += byte;
  return sum / (info.width * info.height * info.channels);
}

test("the ground under an Earth observer is dark at night and lit by day", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  await expect(page.locator("canvas.major-body-layer")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Display" }).click();
  await page.getByRole("tab", { name: "Camera" }).click();
  await page
    .getByRole("dialog", { name: "Display controls" })
    .getByText("Surface observer", { exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Observer body" })
    .selectOption("earth");
  await page
    .locator(".surface-observer-controls")
    .getByRole("combobox", { name: "Look at" })
    .selectOption("moon");
  const latitude = page.getByRole("spinbutton", { name: "Latitude" });
  const longitude = page.getByRole("spinbutton", { name: "Longitude °E" });
  await latitude.fill("51.4779");
  await longitude.fill("0");
  await page.getByRole("button", { name: "Enter surface view" }).click();
  await expect(scene).toHaveAttribute("data-surface-observer-body", "earth");

  const canvas = page.locator("canvas.major-body-layer");
  const lookDown = async (): Promise<void> => {
    const box = await canvas.boundingBox();
    if (box === null) throw new Error("Scene canvas has no bounding box");
    // A drag turns the look a fixed angle per pixel, about 80 degrees here,
    // down from the Moon. The Moon's altitude depends on when the Pause
    // click landed: at Greenwich it is near 50 degrees, so one drag ended
    // either side of -30 degrees. Two drags turn the look 160 degrees, so
    // it ends at least 70 degrees down from any start.
    for (let drag = 0; drag < 2; drag += 1) {
      await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.2);
      await page.mouse.down();
      await page.mouse.move(
        box.x + box.width * 0.75,
        box.y + box.height * 0.8,
        { steps: 10 },
      );
      await page.mouse.up();
    }
    await expect
      .poll(async () =>
        Number(await scene.getAttribute("data-surface-look-altitude-deg")),
      )
      .toBeLessThan(-30);
    await page.waitForTimeout(300);
  };

  // The paused clock is a little after midnight at Greenwich on 1 January
  // 2026. How far after depends on when the Pause click lands.
  const greenwichSolarHours = Number(
    await scene.getAttribute("data-surface-local-solar-time-hours"),
  );
  expect(greenwichSolarHours).toBeGreaterThan(0);
  expect(greenwichSolarHours).toBeLessThan(5);
  await lookDown();
  const night = await groundBrightness(page);
  await page.screenshot({
    path: testInfo.outputPath("earth-ground-night.png"),
    animations: "disabled",
  });

  // Longitude 150° E is near noon at the same moment.
  await page.getByRole("button", { name: "Display" }).click();
  await longitude.fill("150");
  await latitude.fill("0");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(scene).toHaveAttribute(
    "data-surface-observer-longitude-deg",
    "150.000000",
  );
  const pacificSolarHours = Number(
    await scene.getAttribute("data-surface-local-solar-time-hours"),
  );
  expect(pacificSolarHours).toBeGreaterThan(10);
  expect(pacificSolarHours).toBeLessThan(14);
  await lookDown();
  const day = await groundBrightness(page);
  await page.screenshot({
    path: testInfo.outputPath("earth-ground-day.png"),
    animations: "disabled",
  });

  // Moonlight and starlight are far below what the sunlit ground gives, so
  // the night ground reads as near black, not as glowing city lights.
  expect(night).toBeLessThan(12);
  expect(day).toBeGreaterThan(40);
});
