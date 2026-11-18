import { expect, test, type Locator, type Page } from "@playwright/test";

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
      // A seek can outlast the flight on a slow machine. Until it lands the
      // clock still shows the time from before the step, and says Seeking.
      if (
        scene === null ||
        scene.dataset.cameraTransitionSequence === (previous ?? undefined) ||
        scene.dataset.cameraTransitionPhase !== "settled" ||
        document.querySelector(".run-status")?.textContent === "Seeking"
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

// Selects the Sun by its guide label, then flies there, as a child's two
// presses do. The guide label stays on screen in every tour step.
async function pressSunGuideTwice(page: Page): Promise<void> {
  const label = page.locator(".wayfinder-label.sun-guide-label");
  await label.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(sceneSelector)).toHaveAttribute(
    "data-selected-body",
    "sun",
  );
  await page.keyboard.press("Enter");
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
  // The tour hides the time controls, so their status is read while hidden.
  await expect(page.locator(".timeline-dock .run-status")).toHaveText("Paused");
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
  // Finish shows the ending, so a child who clicks through still sees the
  // eye-safety rule; Fly home leaves the story.
  await story.getByRole("button", { name: "Finish" }).click();
  await expect(story).toHaveAttribute("data-tour-ended", "true");
  await expect(
    story.getByText("Never look at the Sun without certified eclipse glasses."),
  ).toBeVisible();
  await story.getByRole("button", { name: "Fly home" }).click();
  await expect(story).toHaveCount(0);
  await expectSettingsRestoredAfterTour(page, settings);
});

// A tour hides the view switcher; a second press on the Sun's guide label is
// the child's own choice that a tour leaves on screen.
test("a body chosen during a tour keeps the settings from before it", async ({
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
  await expect(
    page.getByRole("button", { name: "Orrery", exact: true }),
  ).toBeHidden();

  // The child's choice wins for the focus; the settings come back.
  await pressSunGuideTwice(page);
  await expect(tour).toHaveCount(0);
  await expect(page.locator(sceneSelector)).toHaveAttribute(
    "data-focus-body",
    "sun",
  );
  await expect(page.locator(sceneSelector)).toHaveAttribute(
    "data-view-mode",
    "orrery",
  );
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

test("starting a tour leaves focus where a key already moved it", async ({
  page,
}) => {
  await openApp(page, "reduce");
  const tour = page.getByRole("dialog", {
    name: "Scale of the Solar System tour",
  });
  // The launch button hides when the tour starts. As soon as the card is in
  // the page, before the next frame, focus moves on to its Next button: the
  // card must not take focus back for itself.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const launch = [...document.querySelectorAll("button")].find(
          (button) => button.textContent === "Scale tour",
        );
        if (launch === undefined) {
          throw new Error("The Scale tour button is missing");
        }
        const observer = new MutationObserver(() => {
          const next = [
            ...document.querySelectorAll(".scale-tour button"),
          ].find((button) => button.textContent === "Next");
          if (next instanceof HTMLElement) {
            observer.disconnect();
            next.focus();
            resolve();
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        launch.focus();
        launch.click();
      }),
  );
  await expect(tour).toHaveAttribute("data-tour-step", "earth");
  // Three frames, so the card's focus frame has run.
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
      }),
  );
  await expect(tour.getByRole("button", { name: "Next" })).toBeFocused();
});

const SCALE_STEP_IDS_AFTER_EARTH = [
  "moon-gap",
  "sun-atmosphere",
  "sun-from-mars",
  "jupiter",
  "jupiter-from-io",
  "earth-from-jupiter",
  "saturn",
  "saturn-from-titan",
  "neptune",
  "voyager-2",
  "voyager-1",
  "solar-system",
  "oort-cloud",
  "alpha-centauri",
] as const;

const ECLIPSE_STEP_IDS_AFTER_ALIGNMENT = [
  "london-before-contact",
  "london-first-contact",
  "london-maximum",
  "shadow-axis",
  "shadow-from-moon",
  "spain-totality",
  "london-final-contact",
] as const;

type Box = Readonly<{ x: number; y: number; width: number; height: number }>;

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("The element must be laid out");
  }
  return box;
}

function expectInside(inner: Box, outer: Box, label: string): void {
  const detail = `${label}: ${JSON.stringify({ inner, outer })}`;
  expect(inner.x, detail).toBeGreaterThanOrEqual(outer.x - 0.5);
  expect(inner.y, detail).toBeGreaterThanOrEqual(outer.y - 0.5);
  expect(inner.x + inner.width, detail).toBeLessThanOrEqual(
    outer.x + outer.width + 0.5,
  );
  expect(inner.y + inner.height, detail).toBeLessThanOrEqual(
    outer.y + outer.height + 0.5,
  );
}

test("the scale tour ends with an ending card and Fly home restores the settings", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await openApp(page, "reduce");
  const settings = { playback: "paused" } as const;
  await chooseSettingsBeforeTour(page, settings);
  const tour = page.getByRole("dialog", {
    name: "Scale of the Solar System tour",
  });
  await page.getByRole("button", { name: "Scale tour" }).click();
  await expect(tour).toHaveAttribute("data-tour-step", "earth");

  // The child's line sits directly under the step title, in large type.
  const kidLine = tour.locator(".tour-kid-line");
  await expect(kidLine).toHaveText(
    "Earth is 12,742 km wide. Here one hour passes each second, so watch it spin.",
  );
  expect(
    await kidLine.evaluate((element) => ({
      previous: element.previousElementSibling?.textContent,
      fontSizePx: Number.parseFloat(getComputedStyle(element).fontSize),
    })),
  ).toEqual({ previous: "Earth is already enormous", fontSizePx: 16.8 });
  const titleBox = await boxOf(
    tour.getByRole("heading", { name: "Earth is already enormous" }),
  );
  expect((await boxOf(kidLine)).y).toBeGreaterThanOrEqual(
    titleBox.y + titleBox.height,
  );

  for (const stepId of SCALE_STEP_IDS_AFTER_EARTH) {
    await tour.getByRole("button", { name: "Next" }).click();
    await expect(tour).toHaveAttribute("data-tour-step", stepId);
  }
  await expect(tour.getByRole("button", { name: "Finish" })).toBeVisible();
  await tour.getByRole("button", { name: "Resume tour" }).click();
  // The last step's 28 s timer ends the tour.
  await expect(
    tour.getByRole("heading", {
      name: "You went from Earth out toward the nearest stars.",
    }),
  ).toBeVisible({ timeout: 45_000 });
  await expect(tour).toHaveAttribute("data-tour-ended", "true");
  await expect(tour.getByText("The end of the tour")).toBeVisible();
  await expect(tour.locator(".tour-kid-line")).toHaveText(
    "Light takes 4.3 years to get there. Voyager 1 would need about 75,000 years.",
  );
  await expect(tour.locator(".tour-actions button")).toHaveText([
    "Fly home",
    "Watch the eclipse",
    "Start again",
  ]);

  await tour.getByRole("button", { name: "Fly home" }).click();
  await expect(tour).toHaveCount(0);
  await expectSettingsRestoredAfterTour(page, settings);
});

test("the scale tour ending starts the eclipse story, which fits a phone to its own ending", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openApp(page, "no-preference");
  await page.setViewportSize({ width: 390, height: 844 });
  const viewport = { x: 0, y: 0, width: 390, height: 844 };
  const tour = page.getByRole("dialog", {
    name: "Scale of the Solar System tour",
  });
  await page.getByRole("button", { name: "Scale tour" }).click();
  await expect(tour).toHaveAttribute("data-tour-step", "earth");
  for (const stepId of SCALE_STEP_IDS_AFTER_EARTH) {
    await tour.getByRole("button", { name: "Next" }).click();
    await expect(tour).toHaveAttribute("data-tour-step", stepId);
  }
  await expect(tour).toHaveAttribute("data-tour-ended", "true", {
    timeout: 45_000,
  });
  await tour.getByRole("button", { name: "Watch the eclipse" }).click();

  const story = page.getByRole("dialog", {
    name: "12 August 2026 eclipse story",
  });
  await expect(story).toHaveAttribute("data-tour-step", "eclipse-alignment");
  await expect(story).toHaveAttribute("data-tour-playing", "true");
  await expect(story).toHaveAttribute("data-tour-ended", "false");

  for (const stepId of [
    "eclipse-alignment",
    ...ECLIPSE_STEP_IDS_AFTER_ALIGNMENT,
  ]) {
    if (stepId !== "eclipse-alignment") {
      await story.getByRole("button", { name: "Next" }).click();
    }
    await expect(story).toHaveAttribute("data-tour-step", stepId);
    const storyBox = await boxOf(story);
    expectInside(storyBox, viewport, `${stepId} panel`);
    expectInside(
      await boxOf(story.locator(".tour-kid-line")),
      storyBox,
      `${stepId} child line`,
    );
  }

  // The last step's 24 s timer ends the story.
  await expect(
    story.getByRole("heading", { name: "The eclipse is over" }),
  ).toBeVisible({ timeout: 40_000 });
  await expect(
    story.getByText("Never look at the Sun without certified eclipse glasses."),
  ).toBeVisible();
  const endingButtons = story.locator(".tour-actions button");
  await expect(endingButtons).toHaveText([
    "Fly home",
    "Take the Scale tour",
    "Watch again",
  ]);
  const endingBox = await boxOf(story);
  expectInside(endingBox, viewport, "ending panel");
  for (const button of await endingButtons.all()) {
    expectInside(await boxOf(button), endingBox, "ending button");
  }

  await story.getByRole("button", { name: "Watch again" }).click();
  await expect(story).toHaveAttribute("data-tour-step", "eclipse-alignment");
  await expect(story).toHaveAttribute("data-tour-ended", "false");
  await expect(story).toHaveAttribute("data-tour-playing", "true");
});

const ECLIPSE_STEP_COUNT_AFTER_ALIGNMENT =
  ECLIPSE_STEP_IDS_AFTER_ALIGNMENT.length;

async function finishBy(dialog: Locator, nextClicks: number): Promise<void> {
  for (let click = 0; click < nextClicks; click += 1) {
    await dialog.getByRole("button", { name: "Next" }).click();
  }
  await dialog.getByRole("button", { name: "Finish" }).click();
  await expect(dialog).toHaveAttribute("data-tour-ended", "true");
}

test("Finish shows the ending, and Fly home after a chain of stories restores the settings", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await openApp(page, "reduce");
  const settings = { playback: "reverse" } as const;
  await chooseSettingsBeforeTour(page, settings);
  const story = page.getByRole("dialog", {
    name: "12 August 2026 eclipse story",
  });
  const tour = page.getByRole("dialog", {
    name: "Scale of the Solar System tour",
  });

  await page.getByRole("button", { name: "Eclipse story" }).click();
  await finishBy(story, ECLIPSE_STEP_COUNT_AFTER_ALIGNMENT);
  await expect(
    story.getByRole("heading", { name: "The eclipse is over" }),
  ).toBeVisible();
  await expect(story).toHaveAttribute("data-tour-step", "london-final-contact");
  // Finish had focus; the ending moves it to Fly home, not to the page.
  await expect(story.getByRole("button", { name: "Fly home" })).toBeFocused();

  await story.getByRole("button", { name: "Take the Scale tour" }).click();
  await expect(tour).toHaveAttribute("data-tour-step", "earth");
  await expect(tour).toHaveAttribute("data-tour-ended", "false");
  await finishBy(tour, SCALE_STEP_IDS_AFTER_EARTH.length);
  await expect(
    tour.getByRole("heading", {
      name: "You went from Earth out toward the nearest stars.",
    }),
  ).toBeVisible();

  await tour.getByRole("button", { name: "Watch the eclipse" }).click();
  await expect(story).toHaveAttribute("data-tour-step", "eclipse-alignment");
  await finishBy(story, ECLIPSE_STEP_COUNT_AFTER_ALIGNMENT);
  await story.getByRole("button", { name: "Watch again" }).click();
  await expect(story).toHaveAttribute("data-tour-step", "eclipse-alignment");
  await expect(story).toHaveAttribute("data-tour-ended", "false");
  await finishBy(story, ECLIPSE_STEP_COUNT_AFTER_ALIGNMENT);

  await story.getByRole("button", { name: "Fly home" }).click();
  await expect(story).toHaveCount(0);
  await expectSettingsRestoredAfterTour(page, settings);
});

test("Escape at the ending restores the settings from before the story", async ({
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
  await finishBy(story, ECLIPSE_STEP_COUNT_AFTER_ALIGNMENT);
  await page.keyboard.press("Escape");
  await expect(story).toHaveCount(0);
  await expectSettingsRestoredAfterTour(page, settings);
});

test("Start again replays the scale tour from the time the tour began", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await openApp(page, "reduce");
  const validity = page.locator("[data-outside-validated-window]");
  await expect(validity).toHaveAttribute(
    "data-outside-validated-window",
    "false",
  );
  const tour = page.getByRole("dialog", {
    name: "Scale of the Solar System tour",
  });
  await page.getByRole("button", { name: "Scale tour" }).click();
  await expect(tour).toHaveAttribute("data-tour-step", "earth");
  // Reduced motion holds the clock near the time the tour began; the start
  // time is read at the click, a few frames earlier.
  const tourStartSeconds = await clockSeconds(page);
  for (const stepId of SCALE_STEP_IDS_AFTER_EARTH) {
    await tour.getByRole("button", { name: "Next" }).click();
    await expect(tour).toHaveAttribute("data-tour-step", stepId);
  }
  // The last step runs 28 s at 30 days per second, past the ±1 year window.
  await tour.getByRole("button", { name: "Resume tour" }).click();
  await expect(tour).toHaveAttribute("data-tour-ended", "true", {
    timeout: 45_000,
  });
  await expect(validity).toHaveAttribute(
    "data-outside-validated-window",
    "true",
  );

  await tour.getByRole("button", { name: "Start again" }).click();
  await expect(tour).toHaveAttribute("data-tour-step", "earth");
  await expect(tour).toHaveAttribute("data-tour-ended", "false");
  await expect
    .poll(async () => Math.abs((await clockSeconds(page)) - tourStartSeconds), {
      timeout: 30_000,
    })
    .toBeLessThan(86_400);
  await expect(validity).toHaveAttribute(
    "data-outside-validated-window",
    "false",
  );
  await expect(
    page.getByText("Outside ±1 year ephemeris validation"),
  ).toHaveCount(0);
});

const DAY_SECONDS = 86_400;
const VALIDATED_WINDOW_SECONDS = 365 * DAY_SECONDS;

async function outsideValidatedWindow(page: Page): Promise<string | null> {
  return page
    .locator(".model-validity")
    .getAttribute("data-outside-validated-window");
}

// Runs the clock at 1 year per second until it passes the given day, then
// pauses it there.
async function pushClockPast(page: Page, days: number): Promise<void> {
  await page.getByRole("slider", { name: "Playback rate" }).fill("6");
  await expect(
    page.getByText("1 year / second", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => clockSeconds(page), { timeout: 30_000 })
    .toBeGreaterThan(days * DAY_SECONDS);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Run forward" })).toBeVisible();
}

test("a focus after the planets race brings back the rate from before it", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openApp(page, "no-preference");
  const rate = page.locator(".playback-rate-control output");
  await expect(rate).toHaveText("1 hour / second");
  await page
    .getByRole("button", { name: "Planets racing", exact: true })
    .click();
  await expect(rate).toHaveText("30 days / second");
  await page.waitForTimeout(3_000);
  const focus = page.getByRole("combobox", { name: "Focus" });
  await focus.fill("Jupiter");
  await focus.press("Enter");
  await expect(rate).toHaveText("1 hour / second");
  // At 30 days per second the clock would cover 60 days in 2 s; at 1 hour
  // per second it covers a few hours. The readout trails the solver by up to
  // 100 ms, 3 days of the race.
  const secondsAfterFocus = await clockSeconds(page);
  await page.waitForTimeout(2_000);
  await expect(rate).toHaveText("1 hour / second");
  expect(await clockSeconds(page)).toBeLessThan(
    secondsAfterFocus + 10 * DAY_SECONDS,
  );
  expect(await outsideValidatedWindow(page)).toBe("false");
});

test("the scale tour starts inside the validated window", async ({ page }) => {
  test.setTimeout(90_000);
  await openApp(page, "no-preference");
  await pushClockPast(page, 730);
  expect(await outsideValidatedWindow(page)).toBe("true");

  const tour = page.getByRole("dialog", {
    name: "Scale of the Solar System tour",
  });
  await page.getByRole("button", { name: "Scale tour" }).click();
  await expect(tour).toHaveAttribute("data-tour-step", "earth");
  await expect
    .poll(async () => Math.abs(await clockSeconds(page)), { timeout: 10_000 })
    .toBeLessThan(VALIDATED_WINDOW_SECONDS);
  expect(await outsideValidatedWindow(page)).toBe("false");
});

test("the eclipse maximum stays on screen after a long seek lands", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openApp(page, "no-preference");
  await pushClockPast(page, 3 * 365);

  // Record, on every animation frame, whether the card says it moves the clock.
  await page.evaluate(() => {
    const seen = { movingClock: false };
    (window as unknown as { seekSeen: typeof seen }).seekSeen = seen;
    const sample = (): void => {
      if (
        document
          .querySelector(".tour-seeking")
          ?.textContent.startsWith("Moving the clock to 12 Aug 2026") === true
      ) {
        seen.movingClock = true;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  const story = page.getByRole("dialog", {
    name: "12 August 2026 eclipse story",
  });
  await page.getByRole("button", { name: "Eclipse story" }).click();
  for (const stepId of ["london-before-contact", "london-first-contact"]) {
    await story.getByRole("button", { name: "Next" }).click();
    await expect(story).toHaveAttribute("data-tour-step", stepId);
  }
  const sequenceBeforeMaximum = await cameraSequence(page);
  await story.getByRole("button", { name: "Next" }).click();
  await expect(story).toHaveAttribute("data-tour-step", "london-maximum");
  await page.waitForFunction(
    () => {
      const obscuration = Number(
        document.querySelector<HTMLElement>(
          '[aria-label^="Physics-driven Solar System"]',
        )?.dataset.solarEclipseObscuration,
      );
      return Math.abs(obscuration - 0.913) <= 0.01;
    },
    undefined,
    { polling: "raf", timeout: 40_000 },
  );
  const maximumShownAt = Date.now();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { seekSeen: { movingClock: boolean } }).seekSeen
          .movingClock,
    ),
  ).toBe(true);
  await expect(story.getByText("exact model time")).toBeVisible();
  await expect(story.locator(".tour-seeking")).toHaveCount(0);
  await clockAtSettle(page, sequenceBeforeMaximum);
  const cameraSettledAt = Date.now();
  await expect(story).not.toHaveAttribute("data-tour-step", "london-maximum", {
    timeout: 40_000,
  });
  const leftAt = Date.now();
  expect(leftAt - maximumShownAt).toBeGreaterThanOrEqual(20_000);
  // The step's full 24 s count from the moment the camera arrives.
  expect(leftAt - cameraSettledAt).toBeGreaterThanOrEqual(23_000);
});

test("a seek back from years away starts again from the epoch", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openApp(page, "no-preference");
  // Record the solver calls (Comlink messages) in the order the page sends
  // them.
  await page.evaluate(() => {
    const post: unknown = Reflect.get(Worker.prototype, "postMessage");
    if (typeof post !== "function") {
      throw new Error("Worker.postMessage is unavailable");
    }
    const calls: { name: string; seconds?: number }[] = [];
    (window as unknown as { solverCalls: typeof calls }).solverCalls = calls;
    Worker.prototype.postMessage = function (this: Worker, ...args: unknown[]) {
      const message = args[0] as {
        path?: string[];
        argumentList?: { value?: unknown }[];
      };
      const name = message.path?.join(".");
      if (name !== undefined) {
        const first = message.argumentList?.[0]?.value;
        calls.push(
          typeof first === "number" ? { name, seconds: first } : { name },
        );
      }
      Reflect.apply(post, this, args);
    };
  });
  const story = page.getByRole("dialog", {
    name: "12 August 2026 eclipse story",
  });
  // The time from the click until the clock shows the story's first step.
  const storySeek = async (): Promise<{
    seekMs: number;
    stepSeconds: number;
  }> => {
    await page.evaluate(() => {
      (window as unknown as { solverCalls: unknown[] }).solverCalls.length = 0;
    });
    const clickedAt = Date.now();
    await page.getByRole("button", { name: "Eclipse story" }).click();
    const stepSeconds = Number(
      await story.getAttribute("data-tour-time-seconds"),
    );
    await page.waitForFunction(
      (requestedSeconds) =>
        Math.abs(
          Number(
            document.querySelector<HTMLElement>("time.global-simulation-clock")
              ?.dataset.timeSeconds,
          ) - requestedSeconds,
        ) < 1,
      stepSeconds,
      { polling: "raf", timeout: 60_000 },
    );
    const seekMs = Date.now() - clickedAt;
    await story.getByRole("button", { name: "Exit" }).click();
    await expect(story).toHaveCount(0);
    return { seekMs, stepSeconds };
  };
  // From the epoch the story's time is about 220 days ahead.
  const near = await storySeek();
  await pushClockPast(page, 5 * 365);
  const far = await storySeek();
  const farCalls = await page.evaluate(
    () =>
      (
        window as unknown as {
          solverCalls: { name: string; seconds?: number }[];
        }
      ).solverCalls,
  );
  console.log(JSON.stringify({ nearMs: near.seekMs, farMs: far.seekMs }));
  // Five years back from the clock costs about as much as the near seek,
  // whatever the machine's load, because it starts again from the epoch.
  expect(far.seekMs).toBeLessThan(3 * near.seekMs + 1_000);
  const integrateIndex = farCalls.findIndex(
    (call) =>
      call.name === "integrateTo" &&
      call.seconds !== undefined &&
      Math.abs(call.seconds - far.stepSeconds) < 1,
  );
  expect(integrateIndex).toBeGreaterThan(0);
  expect(farCalls.slice(0, integrateIndex).map((call) => call.name)).toContain(
    "initialize",
  );
});

test("a scale step's time on screen starts when the camera arrives", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openApp(page, "no-preference");
  const tour = page.getByRole("dialog", {
    name: "Scale of the Solar System tour",
  });
  await page.getByRole("button", { name: "Scale tour" }).click();
  await expect(tour).toHaveAttribute("data-tour-step", "earth");
  const sequenceBeforeMoonGap = await cameraSequence(page);
  await tour.getByRole("button", { name: "Next" }).click();
  await expect(tour).toHaveAttribute("data-tour-step", "moon-gap");
  // Step 2 flies for 12 s, then shows for its 28 s.
  await clockAtSettle(page, sequenceBeforeMoonGap);
  const cameraSettledAt = Date.now();
  await expect(tour).not.toHaveAttribute("data-tour-step", "moon-gap", {
    timeout: 40_000,
  });
  expect(Date.now() - cameraSettledAt).toBeGreaterThanOrEqual(27_000);
});

const playbackRate = (page: Page) =>
  page.locator(".playback-rate-control output");
const racingButton = (page: Page) =>
  page.getByRole("button", { name: "Planets racing", exact: true });
const runStatus = (page: Page) =>
  page.getByRole("region", { name: "Time controls" }).locator(".run-status");

async function startRace(page: Page): Promise<void> {
  await racingButton(page).click();
  await expect(racingButton(page)).toHaveAttribute("aria-pressed", "true");
  await expect(playbackRate(page)).toHaveText("30 days / second");
}

test("a rate picked during the planets race outlasts a focus", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openApp(page, "reduce");
  await startRace(page);
  await page.getByRole("slider", { name: "Playback rate" }).fill("3");
  await expect(playbackRate(page)).toHaveText("1 day / second");
  const focus = page.getByRole("combobox", { name: "Focus" });
  await focus.fill("Jupiter");
  await focus.press("Enter");
  await expect(page.locator(sceneSelector)).toHaveAttribute(
    "data-focus-body",
    "jupiter",
  );
  await expect(playbackRate(page)).toHaveText("1 day / second");
});

test("a tour started during the planets race returns to the rate from before the race", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openApp(page, "reduce");
  await startRace(page);
  await page.getByRole("button", { name: "Scale tour" }).click();
  const tour = page.getByRole("dialog", {
    name: "Scale of the Solar System tour",
  });
  await expect(tour).toHaveAttribute("data-tour-step", "earth");
  await tour.getByRole("button", { name: "Exit" }).click();
  await expect(tour).toHaveCount(0);
  await expect(playbackRate(page)).toHaveText("1 hour / second");
  await expect(runStatus(page)).toContainText("1 hour/s requested");
});

test("a camera drag during the planets race only moves the camera", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openApp(page, "no-preference");
  const sequenceBeforeRace = await cameraSequence(page);
  await startRace(page);
  await clockAtSettle(page, sequenceBeforeRace);
  const bounds = await page.locator("canvas.major-body-layer").boundingBox();
  if (bounds === null) {
    throw new Error("Major-body canvas is unavailable for a camera drag");
  }
  const start = {
    x: bounds.x + bounds.width * 0.8,
    y: bounds.y + bounds.height * 0.3,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 80, start.y + 40, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator(sceneSelector)).toHaveAttribute(
    "data-camera-orientation",
    "custom",
  );
  await page.waitForTimeout(500);
  await expect(racingButton(page)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".cinematic-shot-caption")).toBeVisible();
  await expect(playbackRate(page)).toHaveText("30 days / second");
});

// A tour hides the camera dock, so a shot no longer starts inside a tour; a
// tour started from a shot ends it, and the shot's view is not the child's.
test("a tour from a shot restores the settings from before the shot", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openApp(page, "reduce");
  const scene = page.locator(sceneSelector);
  await expect(scene).toHaveAttribute("data-view-mode", "reality");
  const tour = page.getByRole("dialog", {
    name: "Scale of the Solar System tour",
  });
  await startRace(page);
  await expect(scene).toHaveAttribute("data-view-mode", "orrery");

  await page.getByRole("button", { name: "Scale tour" }).click();
  await expect(tour).toHaveAttribute("data-tour-step", "earth");
  await expect(scene).toHaveAttribute("data-view-mode", "reality");
  await expect(
    page.getByRole("button", { name: "Planets racing", exact: true }),
  ).toBeHidden();
  await expect(page.locator(".cinematic-shot-picker")).toBeHidden();
  await tour.getByRole("button", { name: "Exit" }).click();
  await expect(tour).toHaveCount(0);
  await expect(scene).toHaveAttribute("data-view-mode", "reality");
  await expect(scene).toHaveAttribute("data-planet-trails-visible", "false");
  await expect(playbackRate(page)).toHaveText("1 hour / second");
});

test("Step backward during the planets race steps by the rate that comes back", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openApp(page, "reduce");
  await startRace(page);
  await expect
    .poll(() => clockSeconds(page), { timeout: 10_000 })
    .toBeGreaterThan(40 * DAY_SECONDS);
  const secondsAtStep = await page.evaluate(() => {
    const seconds = Number(
      document.querySelector<HTMLElement>("time.global-simulation-clock")
        ?.dataset.timeSeconds,
    );
    [...document.querySelectorAll<HTMLButtonElement>(".time-actions button")]
      .find((button) => button.textContent === "Step backward")
      ?.click();
    return seconds;
  });
  await expect(playbackRate(page)).toHaveText("1 hour / second");
  await expect(runStatus(page)).toHaveText("Paused");
  // One hour back from where the race stopped, not 30 days back. The race
  // stops a few frames after the click, and the readout trails the solver by
  // up to 100 ms (3 race days).
  const secondsAfterStep = await clockSeconds(page);
  expect(secondsAfterStep).toBeLessThan(secondsAtStep + 10 * DAY_SECONDS);
  expect(secondsAfterStep).toBeGreaterThan(secondsAtStep - 10 * DAY_SECONDS);
});

test("an eclipse step's seek asked for during a long step still shows Seeking until it lands", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openApp(page, "reduce");
  await page.getByRole("slider", { name: "Playback rate" }).fill("6");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(runStatus(page)).toHaveText("Paused");
  // Sum the time on screen where the story is open, its clock has not
  // landed, and the status does not say Seeking. The landing frame and the
  // clock readout arrive one render apart, so a single short frame of
  // "Paused" before the new time is the readout catching up.
  await page.evaluate(() => {
    const seen = { notSeekingMs: 0 };
    (window as unknown as { landingSeen: typeof seen }).landingSeen = seen;
    let previousAt = performance.now();
    const sample = (now: number): void => {
      const story = document.querySelector<HTMLElement>("aside.scale-tour");
      const stepSeconds = Number(story?.dataset.tourTimeSeconds);
      const clock = Number(
        document.querySelector<HTMLElement>("time.global-simulation-clock")
          ?.dataset.timeSeconds,
      );
      const status = document.querySelector(".run-status")?.textContent ?? "";
      if (
        story !== null &&
        Number.isFinite(stepSeconds) &&
        Math.abs(clock - stepSeconds) > 86_400 &&
        status !== "Seeking"
      ) {
        seen.notSeekingMs += now - previousAt;
      }
      previousAt = now;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  // A one-year step at 1 year per second runs for several seconds, one day
  // at a time: each day is a solver answer, then a 16 ms frame. The story
  // starts a few milliseconds after a solver answer, inside that frame, so
  // its time is asked for while the step's frame is on screen.
  await page.evaluate(() => {
    const post: unknown = Reflect.get(Worker.prototype, "postMessage");
    if (typeof post !== "function") {
      throw new Error("Worker.postMessage is unavailable");
    }
    const hooked = new WeakSet<Worker>();
    const control = { armed: false };
    (window as unknown as { storyClick: typeof control }).storyClick = control;
    Worker.prototype.postMessage = function (this: Worker, ...args: unknown[]) {
      if (!hooked.has(this)) {
        hooked.add(this);
        this.addEventListener("message", () => {
          if (!control.armed) return;
          control.armed = false;
          window.setTimeout(() => {
            [...document.querySelectorAll<HTMLButtonElement>("button")]
              .find((button) => button.textContent === "Eclipse story")
              ?.click();
          }, 4);
        });
      }
      Reflect.apply(post, this, args);
    };
  });
  await page.getByRole("button", { name: "Step forward" }).click();
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    (window as unknown as { storyClick: { armed: boolean } }).storyClick.armed =
      true;
  });
  const story = page.getByRole("dialog", {
    name: "12 August 2026 eclipse story",
  });
  const stepSeconds = Number(
    await story.getAttribute("data-tour-time-seconds"),
  );
  await expect
    .poll(async () => Math.abs((await clockSeconds(page)) - stepSeconds), {
      timeout: 30_000,
    })
    .toBeLessThan(1);
  // The seek runs for seconds; without the guard all of it shows Paused.
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { landingSeen: { notSeekingMs: number } })
          .landingSeen.notSeekingMs,
    ),
  ).toBeLessThan(500);
});

test("Restart simulation keeps the eclipse step's time", async ({ page }) => {
  test.setTimeout(90_000);
  await openApp(page, "reduce");
  const story = page.getByRole("dialog", {
    name: "12 August 2026 eclipse story",
  });
  // The next call to the physics worker fails, as a solver error would.
  await page.evaluate(() => {
    const post: unknown = Reflect.get(Worker.prototype, "postMessage");
    if (typeof post !== "function") {
      throw new Error("Worker.postMessage is unavailable");
    }
    let failed = false;
    Worker.prototype.postMessage = function (this: Worker, ...args: unknown[]) {
      if (!failed) {
        failed = true;
        throw new Error("test solver failure");
      }
      Reflect.apply(post, this, args);
    };
  });
  await page.getByRole("button", { name: "Eclipse story" }).click();
  await expect(page.getByText(/Simulation stopped/u)).toBeVisible();
  const stepSeconds = Number(
    await story.getAttribute("data-tour-time-seconds"),
  );
  await page.getByRole("button", { name: "Restart simulation" }).click();
  await expect
    .poll(async () => Math.abs((await clockSeconds(page)) - stepSeconds), {
      timeout: 30_000,
    })
    .toBeLessThan(1);
  await expect(story.getByText("exact model time")).toBeVisible();
});

test("a quick Exit from the eclipse story leaves the clock where it was", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openApp(page, "reduce");
  const story = page.getByRole("dialog", {
    name: "12 August 2026 eclipse story",
  });
  for (const exitAfterMs of [0, 300]) {
    const secondsBefore = await clockSeconds(page);
    await page.getByRole("button", { name: "Eclipse story" }).click();
    await page.waitForTimeout(exitAfterMs);
    await story.getByRole("button", { name: "Exit" }).click();
    await expect(story).toHaveCount(0);
    await page.waitForTimeout(4_000);
    await expect(runStatus(page)).toContainText("requested");
    // The story's 12 August 2026 is about 220 days after the epoch.
    expect(Math.abs((await clockSeconds(page)) - secondsBefore)).toBeLessThan(
      DAY_SECONDS,
    );
  }
});

test("a step forward and back at once leaves the clock idle, not seeking", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openApp(page, "reduce");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("slider", { name: "Playback rate" }).fill("4");
  await expect(runStatus(page)).toHaveText("Paused");
  const secondsBefore = await clockSeconds(page);
  await page.evaluate(() => {
    const button = (name: string): HTMLButtonElement => {
      const found = [
        ...document.querySelectorAll<HTMLButtonElement>(".time-actions button"),
      ].find((candidate) => candidate.textContent === name);
      if (found === undefined) {
        throw new Error(`${name} is unavailable`);
      }
      return found;
    };
    button("Step forward").click();
    button("Step backward").click();
  });
  await expect(runStatus(page)).toHaveText("Paused", { timeout: 3_000 });
  expect(await clockSeconds(page)).toBe(secondsBefore);
});

test("a new playback rate during the planets race ends the race", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openApp(page, "reduce");
  await startRace(page);
  await page.getByRole("slider", { name: "Playback rate" }).fill("0");
  await expect(racingButton(page)).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".cinematic-shot-caption")).toHaveCount(0);
  await expect(playbackRate(page)).toHaveText("1 second / second");
});

// A tour hides Home, Back and the Focus box, so the ways out on screen are
// Escape, a second press on the Sun's guide label, and Fly home at the end.
for (const way of ["Escape", "The Sun guide label", "Fly home"] as const) {
  test(`${way} during a scale tour ends it with the clock running`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openApp(page, "no-preference");
    const tour = page.getByRole("dialog", {
      name: "Scale of the Solar System tour",
    });
    await page.getByRole("button", { name: "Scale tour" }).click();
    await expect(tour).toHaveAttribute("data-tour-step", "earth");
    await expect(
      page.getByRole("button", { name: "Home", exact: true }),
    ).toBeHidden();
    await expect(page.getByRole("combobox", { name: "Focus" })).toBeHidden();
    if (way === "The Sun guide label") {
      await pressSunGuideTwice(page);
    } else if (way === "Fly home") {
      await finishBy(tour, SCALE_STEP_IDS_AFTER_EARTH.length);
      await tour.getByRole("button", { name: "Fly home" }).click();
    } else {
      await page.keyboard.press("Escape");
    }
    await expect(tour).toHaveCount(0);
    await expect(runStatus(page)).toContainText("1 hour/s requested");
    const secondsAfter = await clockSeconds(page);
    await expect
      .poll(() => clockSeconds(page), { timeout: 5_000 })
      .toBeGreaterThan(secondsAfter + 3_600);
  });
}

test("the rate slider sits at the nearest stop for a shot's own rate", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openApp(page, "reduce");
  await page.getByRole("button", { name: "Display" }).click();
  await page.getByRole("tab", { name: "Camera" }).click();
  await page
    .getByRole("button", { name: "Moon in sunlight", exact: true })
    .click();
  await expect(playbackRate(page)).toHaveText("10 minutes / second");
  // 10 minutes per second is nearest the 1 hour stop, not the 1 second one.
  await expect(page.getByRole("slider", { name: "Playback rate" })).toHaveValue(
    "2",
  );
});
