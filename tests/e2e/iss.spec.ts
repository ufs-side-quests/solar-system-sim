import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";

async function selectFocus(focus: Locator, label: string): Promise<void> {
  await focus.fill(label);
  await focus.press("Enter");
}

test("ISS uses physical dimensions and only resolves at close range", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.goto("/");

  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  const focus = page.getByRole("combobox", { name: "Focus" });

  await expect(scene).toHaveAttribute(
    "data-rendered-time-seconds",
    /-?\d+(?:\.\d+)?/u,
    { timeout: 30_000 },
  );

  await expect(scene).toHaveAttribute("data-iss-ephemeris-valid", "false");
  await expect(scene).toHaveAttribute("data-iss-geometry-visible", "false");

  await selectFocus(focus, "International Space Station (Earth)");
  await expect(scene).toHaveAttribute("data-focus-body", "iss");
  await expect(scene).toHaveAttribute("data-iss-ephemeris-valid", "true", {
    timeout: 15_000,
  });
  await expect(scene).toHaveAttribute("data-iss-model-scale", "physical");
  await expect(scene).toHaveAttribute("data-iss-maximum-dimension-m", "109");
  await expect(scene).toHaveAttribute("data-iss-geometry-visible", "true", {
    timeout: 15_000,
  });
  await expect
    .poll(async () =>
      Number(await scene.getAttribute("data-iss-radius-pixels")),
    )
    .toBeGreaterThan(0.5);
  await expect(
    page.getByText("Official NASA 3D model · physical scale"),
  ).toBeVisible();
  await expect(scene).toHaveAttribute("data-iss-model-loaded", "true");
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
    { timeout: 35_000 },
  );
  await expect(
    page.getByText("From the centre of Earth", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Altitude", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Speed relative to Earth", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("About 420 tonnes")).toBeVisible();
  await expect(page.getByText("Its path", { exact: true })).toBeVisible();
  await expect(page.getByText("109 × 73 m")).toBeVisible();
  // The exact mass is in More detail.
  const more = page.locator(".selected-body-more");
  await more.getByText("More detail", { exact: true }).click();
  await expect(page.getByText("419,725 kg")).toBeVisible();
  await more.getByText("More detail", { exact: true }).click();

  await page.screenshot({
    path: testInfo.outputPath("iss-focused.png"),
    animations: "disabled",
  });

  // Leaving the ISS brings the clock back to January, where the ISS has no
  // position, so the far view is checked from the ISS itself: zoomed out
  // until it is under a pixel, it is not drawn.
  const zoomOut = page.getByRole("button", { name: "Zoom out" });
  for (let press = 0; press < 16; press += 1) {
    if (
      Number(await scene.getAttribute("data-iss-radius-pixels")) < 0.5 ||
      (await zoomOut.isDisabled())
    ) {
      break;
    }
    const before = await scene.getAttribute("data-camera-navigation-sequence");
    await zoomOut.click();
    await expect(scene).not.toHaveAttribute(
      "data-camera-navigation-sequence",
      before ?? "",
    );
  }
  await expect
    .poll(async () =>
      Number(await scene.getAttribute("data-iss-radius-pixels")),
    )
    .toBeLessThan(0.5);
  await expect(scene).toHaveAttribute("data-iss-geometry-visible", "false");

  await page.getByRole("button", { name: "Parent" }).click();
  await expect(scene).toHaveAttribute("data-selected-body", "earth");
  await expect(scene).toHaveAttribute("data-focus-body", "iss");
  await page
    .locator(".selected-body-detail")
    .getByRole("button", { name: "Fly there" })
    .click();
  await expect(scene).toHaveAttribute("data-focus-body", "earth");
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
    { timeout: 35_000 },
  );
  await expect(scene).toHaveAttribute("data-iss-ephemeris-valid", "false");
  await expect(scene).toHaveAttribute("data-iss-geometry-visible", "false");

  await page.getByRole("button", { name: "Display" }).click();
  const spacecraft = page.getByRole("checkbox", { name: "Spacecraft" });
  await expect(spacecraft).toBeChecked();
  await spacecraft.uncheck();
  await expect(scene).toHaveAttribute("data-spacecraft-visible", "false");
  await expect(scene).toHaveAttribute("data-iss-geometry-visible", "false");
});

test("keeps the ISS Orrery marker until its model has loaded", async ({
  page,
}) => {
  test.setTimeout(90_000);
  let releaseModel = (): void => undefined;
  // The executor runs at once, so releaseModel resolves this promise.
  const modelReleased = new Promise<void>((resolve) => {
    releaseModel = resolve;
  });
  let heldModelRequests = 0;
  await page.route("**/models/nasa/iss.glb", async (route) => {
    heldModelRequests += 1;
    await modelReleased;
    await route.continue();
  });
  await page.goto("/");
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  await expect(scene).toHaveAttribute(
    "data-rendered-time-seconds",
    /-?\d+(?:\.\d+)?/u,
    { timeout: 30_000 },
  );
  const orrery = page.getByRole("button", { name: "Orrery" });
  await orrery.click();
  await expect(orrery).toHaveAttribute("aria-pressed", "true");
  await selectFocus(
    page.getByRole("combobox", { name: "Focus" }),
    "International Space Station (Earth)",
  );
  await expect(scene).toHaveAttribute("data-focus-body", "iss");
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
    { timeout: 35_000 },
  );
  // The ISS is now far larger than a marker, but its model is still held.
  await expect
    .poll(async () =>
      Number(await scene.getAttribute("data-iss-radius-pixels")),
    )
    .toBeGreaterThan(3);
  await expect(scene).toHaveAttribute("data-iss-geometry-visible", "true");
  expect(heldModelRequests).toBe(1);
  await expect(scene).not.toHaveAttribute("data-iss-model-loaded", "true");
  await expect(scene).toHaveAttribute("data-iss-marker-visible", "true");

  releaseModel();
  await expect(scene).toHaveAttribute("data-iss-model-loaded", "true", {
    timeout: 30_000,
  });
  await expect(scene).toHaveAttribute("data-iss-marker-visible", "false");
});

test("focusing the ISS says why the clock jumps, and leaving it brings the date back", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.goto("/");
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  await expect(scene).toHaveAttribute(
    "data-rendered-time-seconds",
    /-?\d+(?:\.\d+)?/u,
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const clock = page.locator(".global-simulation-clock");
  await expect(clock).toContainText("01 Jan 2026");
  const before = Number(await clock.getAttribute("data-time-seconds"));
  const focus = page.getByRole("combobox", { name: "Focus" });
  const notice = page.locator(".clock-move-notice");

  await selectFocus(focus, "International Space Station (Earth)");
  await expect(scene).toHaveAttribute("data-iss-ephemeris-valid", "true", {
    timeout: 30_000,
  });
  await expect(clock).toContainText("02 Aug 2026");
  await expect(notice).toHaveText(
    "We only know where the International Space Station is near 2 August 2026, so the clock jumped there. Pick something else to go back to 1 January 2026.",
  );
  await expect(notice).toHaveAttribute("role", "status");
  await page.screenshot({
    path: testInfo.outputPath("iss-clock-notice.png"),
    animations: "disabled",
  });

  await selectFocus(focus, "Earth");
  await expect(scene).toHaveAttribute("data-focus-body", "earth");
  await expect(clock).toContainText("01 Jan 2026");
  expect(
    Math.abs(Number(await clock.getAttribute("data-time-seconds")) - before),
  ).toBeLessThanOrEqual(1);
  await expect(notice).toHaveCount(0);
});
