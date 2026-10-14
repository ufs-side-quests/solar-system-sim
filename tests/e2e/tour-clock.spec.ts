import { expect, test, type Page } from "@playwright/test";

const sceneSelector = '[aria-label^="Physics-driven Solar System"]';

async function cameraSequence(page: Page): Promise<string | null> {
  return page
    .locator(sceneSelector)
    .getAttribute("data-camera-transition-sequence");
}

async function clockSeconds(page: Page): Promise<number> {
  return Number(
    await page
      .locator("time.global-simulation-clock")
      .getAttribute("data-time-seconds"),
  );
}

// Reads the clock in the same animation frame the new flight settles.
async function clockAtSettle(
  page: Page,
  previousSequence: string | null,
): Promise<number> {
  const handle = await page.waitForFunction(
    (previous) => {
      const scene = document.querySelector<HTMLElement>(
        '[aria-label^="Physics-driven Solar System"]',
      );
      if (
        scene === null ||
        scene.dataset.cameraTransitionSequence === (previous ?? undefined) ||
        scene.dataset.cameraTransitionPhase !== "settled"
      ) {
        return false;
      }
      return Number(
        document.querySelector<HTMLElement>("time.global-simulation-clock")
          ?.dataset.timeSeconds,
      );
    },
    previousSequence,
    { polling: "raf", timeout: 30_000 },
  );
  return (await handle.jsonValue()) as number;
}

async function openApp(page: Page, reducedMotion: "reduce" | "no-preference") {
  await page.emulateMedia({ reducedMotion });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("canvas.major-body-layer")).toBeVisible({
    timeout: 30_000,
  });
}

test("the eclipse story clock waits at each step's time for the camera", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openApp(page, "no-preference");
  const story = page.getByRole("dialog", {
    name: "12 August 2026 eclipse story",
  });

  const sequenceBeforeStory = await cameraSequence(page);
  await page.getByRole("button", { name: "Eclipse story" }).click();
  await expect(story).toHaveAttribute("data-tour-step", "eclipse-alignment");
  await expect(
    story.getByRole("button", { name: "Pause story" }),
  ).toBeVisible();
  const alignmentStepSeconds = Number(
    await story.getAttribute("data-tour-time-seconds"),
  );
  const alignmentRate = Number(
    await story.getAttribute("data-tour-time-rate-seconds-per-second"),
  );
  const settledAlignmentSeconds = await clockAtSettle(
    page,
    sequenceBeforeStory,
  );
  // The 8 s flight at 1 hour per second would carry the clock past the
  // crossing; held, it is still at the step's time when the camera arrives.
  expect(
    Math.abs(settledAlignmentSeconds - alignmentStepSeconds),
  ).toBeLessThanOrEqual(alignmentRate);
  // The step's rate starts once the camera has settled.
  await expect
    .poll(() => clockSeconds(page), { timeout: 5_000 })
    .toBeGreaterThan(settledAlignmentSeconds + alignmentRate);
});

test("the scale tour clock does not move while the camera flies", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openApp(page, "no-preference");
  const tour = page.getByRole("dialog", {
    name: "Scale of the Solar System tour",
  });
  await page.getByRole("button", { name: "Scale tour" }).click();
  await expect(tour).toHaveAttribute("data-tour-step", "earth");

  const sequenceBeforeMoonGap = await cameraSequence(page);
  await tour.getByRole("button", { name: "Next" }).click();
  await expect(tour).toHaveAttribute("data-tour-step", "moon-gap");
  await expect(tour).toHaveAttribute("data-tour-playing", "true");
  // Step 2 plays at 1 day per second through a 12 s flight.
  const flightElapsedAtLeast = async (elapsedMs: number): Promise<void> => {
    await page.waitForFunction(
      ([previous, minimumMs]) => {
        const scene = document.querySelector<HTMLElement>(
          '[aria-label^="Physics-driven Solar System"]',
        );
        return (
          scene !== null &&
          scene.dataset.cameraTransitionSequence !== (previous ?? undefined) &&
          scene.dataset.cameraTransitionPhase !== "settled" &&
          Number(scene.dataset.cameraTransitionElapsedMs) >= minimumMs
        );
      },
      [sequenceBeforeMoonGap, elapsedMs] as const,
      { polling: "raf", timeout: 20_000 },
    );
  };
  await flightElapsedAtLeast(1_000);
  const earlyFlightSeconds = await clockSeconds(page);
  await flightElapsedAtLeast(9_000);
  expect(await clockSeconds(page)).toBe(earlyFlightSeconds);

  const settledSeconds = await clockAtSettle(page, sequenceBeforeMoonGap);
  expect(settledSeconds).toBe(earlyFlightSeconds);
  await expect
    .poll(() => clockSeconds(page), { timeout: 5_000 })
    .toBeGreaterThan(settledSeconds + 86_400);
});

test("a pause during the flight lasts after the camera settles", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openApp(page, "no-preference");
  const tour = page.getByRole("dialog", {
    name: "Scale of the Solar System tour",
  });
  await page.getByRole("button", { name: "Scale tour" }).click();
  await expect(tour).toHaveAttribute("data-tour-step", "earth");
  const sequenceBeforeMoonGap = await cameraSequence(page);
  await tour.getByRole("button", { name: "Next" }).click();
  await expect(tour).toHaveAttribute("data-tour-step", "moon-gap");
  await expect(page.locator(sceneSelector)).not.toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
  );
  await tour.getByRole("button", { name: "Pause tour" }).click();

  const settledSeconds = await clockAtSettle(page, sequenceBeforeMoonGap);
  await page.waitForTimeout(1_500);
  expect(await clockSeconds(page)).toBe(settledSeconds);
  await expect(tour).toHaveAttribute("data-tour-playing", "false");
  await expect(
    page.getByRole("region", { name: "Time controls" }).locator(".run-status"),
  ).toHaveText("Paused");
});

async function pausedAtSettledMoonGap(page: Page) {
  const tour = page.getByRole("dialog", {
    name: "Scale of the Solar System tour",
  });
  await page.getByRole("button", { name: "Scale tour" }).click();
  await expect(tour).toHaveAttribute("data-tour-step", "earth");
  const sequenceBeforeMoonGap = await cameraSequence(page);
  await tour.getByRole("button", { name: "Next" }).click();
  await expect(tour).toHaveAttribute("data-tour-step", "moon-gap");
  await clockAtSettle(page, sequenceBeforeMoonGap);
  await tour.getByRole("button", { name: "Pause tour" }).click();
  await expect(tour).toHaveAttribute("data-tour-playing", "false");
  return tour;
}

test("Resume after a pause starts the clock at once", async ({ page }) => {
  test.setTimeout(90_000);
  await openApp(page, "no-preference");
  const tour = await pausedAtSettledMoonGap(page);
  const sequenceAtPause = await cameraSequence(page);
  const pausedSeconds = await clockSeconds(page);

  await tour.getByRole("button", { name: "Resume tour" }).click();
  // Step 2 plays at 1 day per second; a fresh 12 s flight would hold it.
  await expect
    .poll(() => clockSeconds(page), { timeout: 1_000 })
    .toBeGreaterThan(pausedSeconds);
  expect(await cameraSequence(page)).toBe(sequenceAtPause);
});

test("Resume after a camera drag presents the step again", async ({ page }) => {
  test.setTimeout(90_000);
  await openApp(page, "no-preference");
  const tour = await pausedAtSettledMoonGap(page);
  const scene = page.locator(sceneSelector);
  const bounds = await page.locator("canvas.major-body-layer").boundingBox();
  if (bounds === null) {
    throw new Error("Major-body canvas is unavailable for a camera drag");
  }
  const start = {
    x: bounds.x + bounds.width * 0.3,
    y: bounds.y + bounds.height * 0.4,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 120, start.y + 40, { steps: 8 });
  await page.mouse.up();
  await expect(scene).toHaveAttribute("data-camera-orientation", "custom");
  const sequenceAfterDrag = await cameraSequence(page);

  await tour.getByRole("button", { name: "Resume tour" }).click();
  await expect(tour).toHaveAttribute("data-tour-step", "moon-gap");
  await expect
    .poll(async () => Number(await cameraSequence(page)))
    .toBeGreaterThan(Number(sequenceAfterDrag));
  await expect(scene).not.toHaveAttribute("data-camera-orientation", "custom");
});

type SettingsBeforeTour = Readonly<{
  playback: "forward" | "reverse" | "paused";
}>;

// Settings every tour step changes: the view, the body size, the surface
// observer place, and the playback rate (1 day per second, not the start rate).
async function chooseSettingsBeforeTour(
  page: Page,
  { playback }: SettingsBeforeTour,
): Promise<void> {
  await page.getByRole("button", { name: "Orrery", exact: true }).click();
  await page.getByRole("button", { name: "Display" }).click();
  const display = page.getByRole("dialog", { name: "Display controls" });
  await display.getByRole("slider", { name: "Body size boost" }).fill("40");
  await display.getByRole("tab", { name: "Camera" }).click();
  await display.getByText("Surface observer", { exact: true }).click();
  await display
    .getByRole("combobox", { name: "Observer body" })
    .selectOption("mars");
  await display
    .locator(".surface-observer-controls")
    .getByRole("combobox", { name: "Look at" })
    .selectOption("earth");
  await display.getByRole("spinbutton", { name: "Latitude" }).fill("12.5");
  await display.getByRole("spinbutton", { name: "Longitude °E" }).fill("-30");
  await display.getByRole("button", { name: "Close" }).click();
  await expect(display).toBeHidden();

  const timeControls = page.getByRole("region", { name: "Time controls" });
  await timeControls.getByRole("slider", { name: "Playback rate" }).fill("3");
  await expect(timeControls.getByText("1 day / second")).toBeVisible();
  if (playback !== "forward") {
    await timeControls.getByRole("button", { name: "Pause" }).click();
  }
  if (playback === "reverse") {
    await timeControls.getByRole("button", { name: "Run backward" }).click();
  }
}

async function expectSettingsRestoredAfterTour(
  page: Page,
  { playback }: SettingsBeforeTour,
): Promise<void> {
  const scene = page.locator(sceneSelector);
  await expect(scene).toHaveAttribute("data-view-mode", "orrery");
  await expect(
    page.getByRole("button", { name: "Orrery", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () =>
      Number(await scene.getAttribute("data-view-magnification")),
    )
    .toBe(1);
  await expect(scene).not.toHaveAttribute(
    "data-camera-tracking",
    "surface-observer",
  );

  await page.getByRole("button", { name: "Display" }).click();
  const display = page.getByRole("dialog", { name: "Display controls" });
  await display.getByRole("tab", { name: "View" }).click();
  await expect(
    display.getByRole("slider", { name: "Body size boost" }),
  ).toHaveValue("40");
  await display.getByRole("tab", { name: "Camera" }).click();
  await expect(
    display.getByRole("combobox", { name: "Observer body" }),
  ).toHaveValue("mars");
  await expect(
    display
      .locator(".surface-observer-controls")
      .getByRole("combobox", { name: "Look at" }),
  ).toHaveValue("earth");
  await expect(
    display.getByRole("spinbutton", { name: "Latitude" }),
  ).toHaveValue("12.5");
  await expect(
    display.getByRole("spinbutton", { name: "Longitude °E" }),
  ).toHaveValue("-30");
  await display.getByRole("button", { name: "Close" }).click();

  // A clock paused before the tour runs forward after it at the saved rate.
  const timeControls = page.getByRole("region", { name: "Time controls" });
  await expect(timeControls.locator(".run-status")).toContainText(
    "1 day/s requested",
  );
  await expect(page.locator(".status-cluster")).toContainText(
    playback === "reverse" ? "Reverse" : "Forward",
  );
  const exitSeconds = await clockSeconds(page);
  await expect
    .poll(
      async () =>
        playback === "reverse"
          ? exitSeconds - (await clockSeconds(page))
          : (await clockSeconds(page)) - exitSeconds,
      { timeout: 5_000 },
    )
    .toBeGreaterThan(86_400);
}

test("Exit from the scale tour restores the settings from before it", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openApp(page, "reduce");
  const settings = { playback: "reverse" } as const;
  await chooseSettingsBeforeTour(page, settings);
  const tour = page.getByRole("dialog", {
    name: "Scale of the Solar System tour",
  });
  await page.getByRole("button", { name: "Scale tour" }).click();
  for (const stepId of ["moon-gap", "sun-atmosphere", "sun-from-mars"]) {
    await tour.getByRole("button", { name: "Next" }).click();
    await expect(tour).toHaveAttribute("data-tour-step", stepId);
  }
  const scene = page.locator(sceneSelector);
  await expect(scene).toHaveAttribute("data-view-mode", "reality");
  await expect
    .poll(async () =>
      Number(await scene.getAttribute("data-view-magnification")),
    )
    .toBe(8);

  await tour.getByRole("button", { name: "Exit" }).click();
  await expect(tour).toHaveCount(0);
  await expectSettingsRestoredAfterTour(page, settings);
});

test("Escape from an eclipse observer step restores the settings from before it", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openApp(page, "reduce");
  const settings = { playback: "paused" } as const;
  await chooseSettingsBeforeTour(page, settings);
  const story = page.getByRole("dialog", {
    name: "12 August 2026 eclipse story",
  });
  await page.getByRole("button", { name: "Eclipse story" }).click();
  await story.getByRole("button", { name: "Next" }).click();
  await expect(story).toHaveAttribute(
    "data-tour-step",
    "london-before-contact",
  );
  const scene = page.locator(sceneSelector);
  await expect(scene).toHaveAttribute(
    "data-camera-tracking",
    "surface-observer",
  );
  await expect(scene).toHaveAttribute("data-surface-observer-body", "earth");

  await page.keyboard.press("Escape");
  await expect(story).toHaveCount(0);
  await expectSettingsRestoredAfterTour(page, settings);
});

test("Finish of the eclipse story restores the settings from before it", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openApp(page, "reduce");
  const settings = { playback: "forward" } as const;
  await chooseSettingsBeforeTour(page, settings);
  const story = page.getByRole("dialog", {
    name: "12 August 2026 eclipse story",
  });
  await page.getByRole("button", { name: "Eclipse story" }).click();
  await expect(story).toHaveAttribute("data-tour-step", "eclipse-alignment");
  for (const stepId of [
    "london-before-contact",
    "london-first-contact",
    "london-maximum",
    "shadow-axis",
    "shadow-from-moon",
    "spain-totality",
    "london-final-contact",
  ]) {
    await story.getByRole("button", { name: "Next" }).click();
    await expect(story).toHaveAttribute("data-tour-step", stepId);
  }
  await story.getByRole("button", { name: "Finish" }).click();
  await expect(story).toHaveCount(0);
  await expectSettingsRestoredAfterTour(page, settings);
});

test("a view change during a tour keeps the settings from before it", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openApp(page, "reduce");
  await chooseSettingsBeforeTour(page, { playback: "forward" });
  const tour = page.getByRole("dialog", {
    name: "Scale of the Solar System tour",
  });
  await page.getByRole("button", { name: "Scale tour" }).click();
  await expect(tour).toHaveAttribute("data-tour-step", "earth");
  await expect(page.locator(sceneSelector)).toHaveAttribute(
    "data-view-mode",
    "reality",
  );

  // The child's choice wins for the view; the rest comes back.
  await page.getByRole("button", { name: "Orrery", exact: true }).click();
  await expect(tour).toHaveCount(0);
  await page.getByRole("button", { name: "Display" }).click();
  const display = page.getByRole("dialog", { name: "Display controls" });
  await display.getByRole("tab", { name: "View" }).click();
  await expect(
    display.getByRole("slider", { name: "Body size boost" }),
  ).toHaveValue("40");
  await expect(
    page.getByRole("region", { name: "Time controls" }).locator(".run-status"),
  ).toContainText("1 day/s requested");
});
