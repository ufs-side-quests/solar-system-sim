import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import sharp from "sharp";

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

async function focusModel(
  page: Page,
  scene: Locator,
  name: string,
  bodyId: string,
): Promise<void> {
  await focusBody(page, scene, name, bodyId);
  await expect(scene).toHaveAttribute("data-local-shadow-body", bodyId, {
    timeout: 60_000,
  });
}

test("lights a focused model and the moon below it with one sunlight", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const scene = await openPausedScene(page);

  await focusBody(page, scene, "Callisto", "callisto");
  await expect(scene).toHaveAttribute("data-focus-sunlight-ratio", "1.000");
  await expect(scene).toHaveAttribute("data-parent-sunlight-ratio", "1.000");

  // Callisto keeps exactly its own sunlight while the camera is at the
  // station: not twice as much, and not none.
  await focusModel(
    page,
    scene,
    "Deep Space Nine (fictional)",
    "deep-space-nine",
  );
  await expect(scene).toHaveAttribute("data-focus-sunlight-ratio", "1.000");
  await expect(scene).toHaveAttribute("data-parent-sunlight-ratio", "1.000");
});

test("views a focused model from about 40 degrees off the Sun line", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const scene = await openPausedScene(page);

  await focusModel(
    page,
    scene,
    "Deep Space Nine (fictional)",
    "deep-space-nine",
  );
  await expect(scene).toHaveAttribute("data-camera-orientation", "sun-facing");
  await expect
    .poll(async () =>
      Number(await scene.getAttribute("data-camera-phase-angle-deg")),
    )
    .toBeGreaterThanOrEqual(35);
  expect(
    Number(await scene.getAttribute("data-camera-phase-angle-deg")),
  ).toBeLessThanOrEqual(45);

  // Planets and moons keep the near-full sunlit view.
  await focusBody(page, scene, "Callisto", "callisto");
  await expect
    .poll(async () =>
      Number(await scene.getAttribute("data-camera-phase-angle-deg")),
    )
    .toBeLessThan(15);
});

test("keeps the focused model's sunlit hull out of saturation", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const scene = await openPausedScene(page);
  await focusModel(page, scene, "USS Defiant (fictional)", "uss-defiant");
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
  const frame = await page
    .locator("canvas.major-body-layer")
    .screenshot({ animations: "disabled" });
  await testInfo.attach("defiant", { body: frame, contentType: "image/png" });
  const { data, info } = await sharp(frame)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let hullPixels = 0;
  let saturatedPixels = 0;
  for (let y = Math.round(info.height * 0.2); y < info.height * 0.8; y += 1) {
    for (let x = Math.round(info.width * 0.3); x < info.width * 0.7; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      const luminance =
        (data[offset] ?? Number.NaN) * 0.2126 +
        (data[offset + 1] ?? Number.NaN) * 0.7152 +
        (data[offset + 2] ?? Number.NaN) * 0.0722;
      if (luminance <= 40) continue;
      hullPixels += 1;
      if (luminance >= 230) saturatedPixels += 1;
    }
  }
  expect(hullPixels).toBeGreaterThan(5_000);
  expect(saturatedPixels / hullPixels).toBeLessThan(0.15);
});
