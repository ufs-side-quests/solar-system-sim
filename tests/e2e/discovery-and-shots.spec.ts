import { expect, test } from "@playwright/test";

async function selectFocus(
  focus: import("@playwright/test").Locator,
  label: string,
): Promise<void> {
  await focus.fill(label);
  await focus.press("Enter");
}

test("renders Discovery One and presents every cinematic shot", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.goto("/");
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  await expect(scene).toHaveAttribute(
    "data-rendered-time-seconds",
    /-?\d+(?:\.\d+)?/u,
    { timeout: 30_000 },
  );
  await expect(scene).not.toHaveAttribute(
    "data-discoveryone-model-loaded",
    "true",
  );

  await selectFocus(
    page.getByRole("combobox", { name: "Focus" }),
    "Discovery One",
  );
  await expect(scene).toHaveAttribute("data-focus-body", "discovery-one");
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
    { timeout: 25_000 },
  );
  await expect(scene).toHaveAttribute(
    "data-discovery-one-visual-model",
    "cc-by-sketchfab-licensed-glb",
  );
  await expect(scene).toHaveAttribute(
    "data-discoveryone-model-loaded",
    "true",
    { timeout: 30_000 },
  );
  await expect(scene).toHaveAttribute(
    "data-discovery-one-geometry-visible",
    "true",
  );
  await expect(page.getByText("140.1 m long", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Display" }).click();
  await page.getByRole("tab", { name: "Camera" }).click();
  await page
    .getByRole("combobox", { name: "Zoom preset" })
    .selectOption("close");
  await page.getByRole("button", { name: "Close" }).click();
  await page.screenshot({
    path: testInfo.outputPath("discovery-one-focus.png"),
    animations: "disabled",
  });

  const shots = [
    ["Earth in daylight", "earth", "reality"],
    ["Saturn and its rings", "saturn", "reality"],
    ["Jupiter in daylight", "jupiter", "reality"],
    ["Moon in sunlight", "moon", "reality"],
    ["Voyager beyond the planets", "voyager-1", "reality"],
    ["Sun from Mercury", "mercury", "reality"],
    ["Planets racing round the Sun", "sun", "orrery"],
  ] as const;
  for (const [shotName, expectedFocus, expectedViewMode] of shots) {
    await page.getByRole("button", { name: "Display" }).click();
    await page.getByRole("tab", { name: "Camera" }).click();
    const shotButton = page.getByRole("button", {
      name: shotName,
      exact: true,
    });
    await expect(shotButton).toBeVisible();
    await shotButton.click();
    await expect(scene).toHaveAttribute("data-focus-body", expectedFocus, {
      timeout: 15_000,
    });
    await expect(scene).toHaveAttribute("data-view-mode", expectedViewMode);
    await expect(scene).toHaveAttribute(
      "data-camera-transition-phase",
      "settled",
      { timeout: 25_000 },
    );
    await expect(page.getByText(/Physics engine failed/u)).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(
        `${shotName.toLowerCase().replaceAll(" ", "-")}.png`,
      ),
      animations: "disabled",
    });
  }
});

test("one tap from the first screen sets the planets racing round the Sun", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  await expect(scene).toHaveAttribute(
    "data-rendered-time-seconds",
    /-?\d+(?:\.\d+)?/u,
    { timeout: 30_000 },
  );
  await expect(scene).toHaveAttribute("data-view-mode", "reality");
  await expect(scene).toHaveAttribute("data-orbit-guide-count", "0");

  await page
    .getByRole("button", { name: "Planets racing", exact: true })
    .click();

  await expect(scene).toHaveAttribute("data-view-mode", "orrery");
  await expect(scene).toHaveAttribute("data-focus-body", "sun");
  await expect
    .poll(async () =>
      Number(await scene.getAttribute("data-orbit-guide-count")),
    )
    .toBeGreaterThan(0);
  await expect(page.locator(".cinematic-shot-caption")).toContainText(
    "Closer planets go round faster. Watch Mercury lap Earth.",
  );
  const timeOutput = page.locator(".time-readout output");
  // The shot first seeks to 330 days before the epoch. Trails grow only once
  // the race runs from there.
  await expect
    .poll(
      async () => Number(await timeOutput.getAttribute("data-time-seconds")),
      { timeout: 30_000 },
    )
    .toBeLessThan(-200 * 86_400);
  await expect(scene).toHaveAttribute("data-planet-trails-visible", "true");
  await expect(page.locator(".run-status")).toContainText(
    "30 days/s requested",
  );
  const startTime = Number(await timeOutput.getAttribute("data-time-seconds"));
  await page.screenshot({
    path: testInfo.outputPath("planets-racing-0s.png"),
    animations: "disabled",
  });
  await expect
    .poll(
      async () =>
        (Number(await timeOutput.getAttribute("data-time-seconds")) -
          startTime) /
        86_400,
      { timeout: 10_000 },
    )
    .toBeGreaterThan(60);
  await page.screenshot({
    path: testInfo.outputPath("planets-racing-10s.png"),
    animations: "disabled",
  });
  await expect(page.getByText(/Simulation stopped/u)).toHaveCount(0);
});

async function startPlanetsRacing(
  page: import("@playwright/test").Page,
): Promise<import("@playwright/test").Locator> {
  await page.goto("/");
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  await expect(scene).toHaveAttribute(
    "data-rendered-time-seconds",
    /-?\d+(?:\.\d+)?/u,
    { timeout: 30_000 },
  );
  await page
    .getByRole("button", { name: "Planets racing", exact: true })
    .click();
  await expect(scene).toHaveAttribute("data-view-mode", "orrery");
  await expect(page.locator(".cinematic-shot-caption")).toBeVisible();
  return scene;
}

test("the planets race repeats inside the validated ephemeris window", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1024, height: 768 });
  await startPlanetsRacing(page);
  const timeOutput = page.locator(".time-readout output");
  const runStatus = page.locator(".run-status");
  const validity = page.locator(".model-validity");
  const simulationDays = async (): Promise<number> =>
    Number(await timeOutput.getAttribute("data-time-seconds")) / 86_400;
  // The shot first seeks to 330 days before the epoch.
  await expect.poll(simulationDays, { timeout: 30_000 }).toBeLessThan(-300);
  await expect(runStatus).toContainText("30 days/s requested");

  let previousDays = await simulationDays();
  let loops = 0;
  let seekingSince: number | null = null;
  let longestSeekMs = 0;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    await expect(validity).toHaveAttribute(
      "data-outside-validated-window",
      "false",
    );
    const now = Date.now();
    if ((await runStatus.textContent())?.startsWith("Seeking") === true) {
      seekingSince ??= now;
      longestSeekMs = Math.max(longestSeekMs, now - seekingSince);
    } else {
      seekingSince = null;
    }
    const days = await simulationDays();
    // A jump back of more than 300 days is the race starting again.
    if (previousDays - days > 300) {
      loops += 1;
    }
    previousDays = days;
    await page.waitForTimeout(200);
  }
  expect(loops).toBeGreaterThanOrEqual(1);
  // Starting again must not freeze the race while the past is recomputed.
  expect(longestSeekMs).toBeLessThan(2_500);
  await expect(page.getByText(/Outside ±1 year/u)).toHaveCount(0);
  await expect(page.locator(".cinematic-shot-caption")).toBeVisible();
  await expect(page.getByText(/Simulation stopped/u)).toHaveCount(0);
});

test("a tour ends the planets racing shot", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1024, height: 768 });
  await startPlanetsRacing(page);
  const racingButton = page.getByRole("button", {
    name: "Planets racing",
    exact: true,
  });
  const caption = page.locator(".cinematic-shot-caption");
  await expect(racingButton).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Scale tour" }).click();
  await expect(racingButton).toHaveAttribute("aria-pressed", "false");
  await expect(caption).toHaveCount(0);

  await page.getByRole("button", { name: "Exit" }).click();
  await expect(page.getByRole("button", { name: "Run forward" })).toBeVisible();
  await expect(caption).toHaveCount(0);
  // With the clock running again, the old shot must not come back.
  await page.getByRole("button", { name: "Run forward" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(caption).toHaveCount(0);
  await expect(racingButton).toHaveAttribute("aria-pressed", "false");
});

test("the shot caption hides while the clock is paused", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await startPlanetsRacing(page);
  const caption = page.locator(".cinematic-shot-caption");
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(caption).toHaveCount(0);
  await page.getByRole("button", { name: "Run forward" }).click();
  await expect(caption).toBeVisible();
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
]) {
  test(`the shot caption clears the camera dock at ${String(viewport.width)} px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await startPlanetsRacing(page);
    const caption = await page.locator(".cinematic-shot-caption").boundingBox();
    const dock = await page.locator(".camera-dock").boundingBox();
    if (caption === null || dock === null) {
      throw new Error("Caption and camera dock must both be laid out");
    }
    const overlaps =
      caption.x < dock.x + dock.width &&
      dock.x < caption.x + caption.width &&
      caption.y < dock.y + dock.height &&
      dock.y < caption.y + caption.height;
    expect(overlaps, JSON.stringify({ caption, dock })).toBe(false);
    expect(caption.x + caption.width).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({
      path: testInfo.outputPath(
        `planets-racing-caption-${String(viewport.width)}.png`,
      ),
      animations: "disabled",
    });
  });
}

test("the planets race fits Mars's orbit across a phone", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const scene = await startPlanetsRacing(page);
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
    { timeout: 40_000 },
  );
  // The camera moves out by the scene's portrait aspect ratio.
  const sceneBox = await scene.boundingBox();
  if (sceneBox === null) {
    throw new Error("The scene must be laid out");
  }
  expect(
    Number(await scene.getAttribute("data-camera-distance-au")),
  ).toBeCloseTo(6 / (sceneBox.width / sceneBox.height), 6);
  const mars = scene.locator(".body-label", { hasText: /^Mars$/u });
  // Mars goes most of the way round its orbit in 20 seconds of the race.
  for (let sample = 0; sample < 40; sample += 1) {
    const box = await mars.boundingBox();
    if (box === null) {
      throw new Error("The Mars label must stay laid out");
    }
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await page.waitForTimeout(500);
  }
});
