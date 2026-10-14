import { expect, test, type Locator, type Page } from "@playwright/test";

const sceneSelector = '[aria-label^="Physics-driven Solar System"]';

async function openApp(
  page: Page,
  reducedMotion: "reduce" | "no-preference",
  viewport = { width: 1440, height: 900 },
): Promise<Locator> {
  await page.emulateMedia({ reducedMotion });
  await page.setViewportSize(viewport);
  await page.goto("/");
  await expect(page.locator("canvas.major-body-layer")).toBeVisible({
    timeout: 30_000,
  });
  return page.locator(sceneSelector);
}

// The names a child reads on the buttons that are on screen.
async function visibleButtonNames(page: Page): Promise<string[]> {
  return page
    .locator("button:visible")
    .evaluateAll((buttons) =>
      buttons.map((button) =>
        (button.getAttribute("aria-label") ?? button.textContent).trim(),
      ),
    );
}

async function finishBy(dialog: Locator, nextClicks: number): Promise<void> {
  for (let click = 0; click < nextClicks; click += 1) {
    await dialog.getByRole("button", { name: "Next" }).click();
  }
  await dialog.getByRole("button", { name: "Finish" }).click();
  await expect(dialog).toHaveAttribute("data-tour-ended", "true");
}

const SCALE_STEP_COUNT_AFTER_EARTH = 14;
const ECLIPSE_STEP_COUNT_AFTER_ALIGNMENT = 7;

async function expectSolarSystemOverview(
  page: Page,
  scene: Locator,
): Promise<void> {
  await expect(scene).toHaveAttribute("data-focus-body", "solar-system");
  await expect(
    page.getByRole("navigation", { name: "Current focus" }),
  ).toHaveText("Solar System");
}

test("every screen names each action with one word", async ({ page }) => {
  test.setTimeout(150_000);
  const scene = await openApp(page, "no-preference");
  const buttonNames = new Set<string>();
  const journeyTexts = new Set<string>();
  const collect = async (): Promise<void> => {
    for (const name of await visibleButtonNames(page)) {
      buttonNames.add(name);
    }
    const journey = page.locator(".camera-journey");
    if (await journey.isVisible()) {
      journeyTexts.add((await journey.textContent()) ?? "");
    }
  };

  // The first screen.
  await collect();
  await expect(
    page
      .locator(".reality-navigation-map")
      .getByRole("button", { name: "Fly there" }),
  ).toBeVisible();

  // A selected body.
  const jupiter = page.locator('.body-label[data-body-id="jupiter"]');
  await jupiter.focus();
  await page.keyboard.press("Enter");
  await expect(scene).toHaveAttribute("data-selected-body", "jupiter");
  await expect(jupiter).toHaveAccessibleDescription(
    "Select again to fly there.",
  );
  await collect();

  // A flight, sampled until the camera settles.
  const sequenceBefore = await scene.getAttribute(
    "data-camera-transition-sequence",
  );
  await page
    .locator(".selected-body-detail")
    .getByRole("button", { name: "Fly there" })
    .click();
  await expect(scene).not.toHaveAttribute(
    "data-camera-transition-sequence",
    sequenceBefore ?? "",
  );
  await expect(scene).not.toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
  );
  while (
    (await scene.getAttribute("data-camera-transition-phase")) !== "settled"
  ) {
    await collect();
  }
  await expect(scene).toHaveAttribute("data-focus-body", "jupiter");
  expect([...journeyTexts].some((text) => text.startsWith("Flying to"))).toBe(
    true,
  );

  // A tour and its ending.
  const tour = page.getByRole("dialog", {
    name: "Scale of the Solar System tour",
  });
  await page.getByRole("button", { name: "Scale tour" }).click();
  await expect(tour).toHaveAttribute("data-tour-step", "earth");
  await collect();
  await finishBy(tour, SCALE_STEP_COUNT_AFTER_EARTH);
  await collect();
  await tour.getByRole("button", { name: "Fly home" }).click();
  await expect(tour).toHaveCount(0);
  await collect();

  for (const retired of ["Reset", "Travel", "Focus"]) {
    expect([...buttonNames]).not.toContain(retired);
  }
  for (const text of journeyTexts) {
    expect(text).not.toContain("Travelling");
  }
});

for (const kind of ["Scale tour", "Eclipse story"] as const) {
  test(`Fly home after the ${kind} lands on the Solar System overview`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const scene = await openApp(page, "reduce");
    const dialog = page.getByRole("dialog", {
      name:
        kind === "Scale tour"
          ? "Scale of the Solar System tour"
          : "12 August 2026 eclipse story",
    });
    await page.getByRole("button", { name: kind }).click();
    await finishBy(
      dialog,
      kind === "Scale tour"
        ? SCALE_STEP_COUNT_AFTER_EARTH
        : ECLIPSE_STEP_COUNT_AFTER_ALIGNMENT,
    );
    await dialog.getByRole("button", { name: "Fly home" }).click();
    await expect(dialog).toHaveCount(0);
    await expectSolarSystemOverview(page, scene);
    await expect(scene).not.toHaveAttribute("data-surface-observer-body");
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
]) {
  test(`the scale tour shows only the date and its card at ${String(viewport.width)} px`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openApp(page, "reduce", viewport);
    const panels = [
      ".command-bar",
      ".camera-dock",
      ".timeline-dock",
      ".reality-navigation-map",
    ].map((selector) => page.locator(selector));
    const tour = page.getByRole("dialog", {
      name: "Scale of the Solar System tour",
    });
    await page.getByRole("button", { name: "Scale tour" }).click();
    await expect(tour).toHaveAttribute("data-tour-step", "earth");
    for (const panel of panels) {
      await expect(panel).toBeHidden();
    }
    await expect(page.locator("time.global-simulation-clock")).toBeVisible();
    // One play control: the tour's own.
    await expect(
      page.getByRole("button", { name: /^(Pause|Resume|Run|Step)/u }),
    ).toHaveText(["Resume tour"]);

    await page.keyboard.press("Escape");
    await expect(tour).toHaveCount(0);
    for (const panel of panels) {
      await expect(panel).toBeVisible();
    }
  });
}

test("a keyboard start of the Scale tour keeps focus in its card and Escape returns it", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openApp(page, "reduce");
  const start = page.getByRole("button", { name: "Scale tour" });
  const tour = page.getByRole("dialog", {
    name: "Scale of the Solar System tour",
  });
  await start.focus();
  await page.keyboard.press("Enter");
  await expect(tour).toHaveAttribute("data-tour-step", "earth");
  // The tour hides the dock that holds the start button.
  await expect(start).toBeHidden();
  await expect
    .poll(() => tour.evaluate((card) => card.contains(document.activeElement)))
    .toBe(true);

  await page.keyboard.press("Escape");
  await expect(tour).toHaveCount(0);
  await expect(start).toBeFocused();
});

test("Stop returns focus to the button that started the shot", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openApp(page, "reduce");
  const racing = page.getByRole("button", {
    name: "Planets racing",
    exact: true,
  });
  await racing.focus();
  await page.keyboard.press("Enter");
  await expect(racing).toHaveAttribute("aria-pressed", "true");
  const stop = page.getByRole("button", { name: "Stop Planets racing" });
  await stop.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cinematic-shot-caption")).toHaveCount(0);
  await expect(racing).toBeFocused();
});

const RACE_WAYS_OUT = {
  Home: (page: Page) =>
    page.getByRole("button", { name: "Home", exact: true }).click(),
  Stop: (page: Page) =>
    page
      .locator(".cinematic-shot-caption")
      .getByRole("button", { name: "Stop" })
      .click(),
} as const;

for (const [way, leave] of Object.entries(RACE_WAYS_OUT)) {
  test(`${way} after the planets race brings back the view from before it`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const scene = await openApp(page, "reduce");
    // A setting the race changes: no labels.
    await page.getByRole("button", { name: "Display" }).click();
    const display = page.getByRole("dialog", { name: "Display controls" });
    await display.getByRole("tab", { name: "View" }).click();
    await display.getByLabel("Labels", { exact: true }).uncheck();
    await display.getByRole("button", { name: "Close" }).click();

    const racing = page.getByRole("button", {
      name: "Planets racing",
      exact: true,
    });
    await racing.click();
    await expect(racing).toHaveAttribute("aria-pressed", "true");
    await expect(scene).toHaveAttribute("data-view-mode", "orrery");
    await expect(scene).toHaveAttribute("data-planet-trails-visible", "true");

    await leave(page);
    await expect(racing).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".cinematic-shot-caption")).toHaveCount(0);
    await expect(scene).toHaveAttribute("data-view-mode", "reality");
    await expect(scene).toHaveAttribute("data-planet-trails-visible", "false");
    await expect(page.locator(".playback-rate-control output")).toHaveText(
      "1 hour / second",
    );
    await expect(
      page
        .getByRole("region", { name: "Time controls" })
        .locator(".run-status"),
    ).toContainText("1 hour/s requested");

    await page.getByRole("button", { name: "Display" }).click();
    await expect(
      display.getByLabel("Labels", { exact: true }),
    ).not.toBeChecked();
    await expect(
      display.getByLabel("Orbit guides", { exact: true }),
    ).not.toBeChecked();
    await expect(
      display.getByLabel("Planet trails", { exact: true }),
    ).not.toBeChecked();
    await display.getByRole("button", { name: "Close" }).click();

    // The clock runs on at the child's rate, inside the validated window.
    await page.waitForTimeout(2_000);
    await expect(page.locator(".model-validity")).toHaveAttribute(
      "data-outside-validated-window",
      "false",
    );
  });
}

// The child's own Display choice during a shot outlasts it, as the child's
// own playback rate does.
test("Labels turned off during the planets race stay off after Stop", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const scene = await openApp(page, "reduce");
  const racing = page.getByRole("button", {
    name: "Planets racing",
    exact: true,
  });
  await racing.click();
  await expect(racing).toHaveAttribute("aria-pressed", "true");
  await expect(scene).toHaveAttribute("data-view-mode", "orrery");

  await page.getByRole("button", { name: "Display" }).click();
  const display = page.getByRole("dialog", { name: "Display controls" });
  await display.getByRole("tab", { name: "View" }).click();
  const labels = display.getByLabel("Labels", { exact: true });
  await expect(labels).toBeChecked();
  await labels.uncheck();
  await display.getByRole("button", { name: "Close" }).click();

  await page
    .locator(".cinematic-shot-caption")
    .getByRole("button", { name: "Stop" })
    .click();
  await expect(racing).toHaveAttribute("aria-pressed", "false");
  // The rest of the view from before the race comes back.
  await expect(scene).toHaveAttribute("data-view-mode", "reality");
  await page.getByRole("button", { name: "Display" }).click();
  await expect(labels).not.toBeChecked();
});
