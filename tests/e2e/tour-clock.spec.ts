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

  const sequenceBeforeContact = await cameraSequence(page);
  await story.getByRole("button", { name: "Next" }).click();
  await expect(story).toHaveAttribute(
    "data-tour-step",
    "london-before-contact",
  );
  await clockAtSettle(page, sequenceBeforeContact);
  await expect(
    story
      .getByLabel("Live eclipse geometry")
      .locator("span")
      .filter({ hasText: "Sun hidden" }),
  ).toHaveText("Sun hidden0.0%");
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

async function expectNormalViewAfterTour(page: Page): Promise<void> {
  const scene = page.locator(sceneSelector);
  await expect
    .poll(async () =>
      Number(await scene.getAttribute("data-view-magnification")),
    )
    .toBe(1);
  await expect(scene).not.toHaveAttribute(
    "data-camera-tracking",
    "surface-observer",
  );
  await expect(
    page.locator(".body-label").filter({ visible: true }).first(),
  ).toBeVisible();
  const timeControls = page.getByRole("region", { name: "Time controls" });
  await expect(timeControls.locator(".run-status")).toContainText(
    "1 hour/s requested",
  );
  const exitSeconds = await clockSeconds(page);
  await expect
    .poll(() => clockSeconds(page), { timeout: 5_000 })
    .toBeGreaterThan(exitSeconds + 3_600);
}

test("exit from the scale tour returns to a normal running view", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openApp(page, "reduce");
  const tour = page.getByRole("dialog", {
    name: "Scale of the Solar System tour",
  });
  await page.getByRole("button", { name: "Scale tour" }).click();
  for (const stepId of ["moon-gap", "sun-atmosphere", "sun-from-mars"]) {
    await tour.getByRole("button", { name: "Next" }).click();
    await expect(tour).toHaveAttribute("data-tour-step", stepId);
  }
  const scene = page.locator(sceneSelector);
  await expect
    .poll(async () =>
      Number(await scene.getAttribute("data-view-magnification")),
    )
    .toBe(8);

  await tour.getByRole("button", { name: "Exit" }).click();
  await expect(tour).toHaveCount(0);
  await expectNormalViewAfterTour(page);
});

test("Escape from an eclipse observer step returns to a normal running view", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openApp(page, "reduce");
  const story = page.getByRole("dialog", {
    name: "12 August 2026 eclipse story",
  });
  await page.getByRole("button", { name: "Eclipse story" }).click();
  await story.getByRole("button", { name: "Next" }).click();
  await expect(story).toHaveAttribute(
    "data-tour-step",
    "london-before-contact",
  );
  await expect(page.locator(sceneSelector)).toHaveAttribute(
    "data-camera-tracking",
    "surface-observer",
  );

  await page.keyboard.press("Escape");
  await expect(story).toHaveCount(0);
  await expectNormalViewAfterTour(page);
});
