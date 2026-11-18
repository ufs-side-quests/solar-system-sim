import { expect, test, type Page } from "@playwright/test";

const FOUND_EGGS_KEY = "solar-explorer.found-eggs.v1";
const AUDIO_SETTINGS_KEY = "solar-system-time-explorer.audio-settings.v1";

async function openApp(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  await expect(page.locator("canvas.major-body-layer")).toBeVisible({
    timeout: 30_000,
  });
}

// The controls that would keep Page Down and Page Up for themselves.
const TEXT_FIELDS = "input:visible, select:visible, textarea:visible";

async function blurFocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
}

async function startScaleTour(page: Page) {
  await page.getByRole("button", { name: "Scale tour" }).click();
  const tour = page.getByRole("dialog", {
    name: "Scale of the Solar System tour",
  });
  await expect(tour).toHaveAttribute("data-tour-step", "earth");
  return tour;
}

test("keeps the Scale tour and its labels on a full screen, without the map or clock", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openApp(page);
  const app = page.locator("main.app-shell");
  const map = page.locator(".reality-navigation-map");
  const clock = page.locator(".global-simulation-clock");
  await expect(map).toBeVisible();
  await expect(clock).toBeVisible();

  const tour = await startScaleTour(page);
  const earthLabel = page.locator('.body-label[data-body-id="earth"]');
  await expect(earthLabel).toBeVisible();
  // A tour hides the header's Full screen button, so a teacher with only a
  // mouse or a tablet opens full screen from the tour card.
  await expect(page.locator(".command-bar .fullscreen-button")).toBeHidden();
  const tourFullScreen = tour.getByRole("button", { name: "Full screen" });
  await tourFullScreen.click();
  await expect(app).toHaveAttribute("data-immersive-mode", "true");
  await expect(tourFullScreen).toBeHidden();

  await expect(tour).toBeVisible();
  await expect(earthLabel).toBeVisible();
  await expect(map).toBeHidden();
  await expect(clock).toBeHidden();
  await tour.getByRole("button", { name: "Next" }).click();
  await expect(tour).toHaveAttribute("data-tour-step", "moon-gap");
  await page.screenshot({
    path: testInfo.outputPath("scale-tour-full-screen.png"),
  });

  // Without a tour the full screen keeps the labelled view.
  await tour.getByRole("button", { name: "Exit" }).click();
  await expect(tour).toBeHidden();
  await expect(app).toHaveAttribute("data-immersive-mode", "true");
  await expect(earthLabel).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("the f key opens and closes full screen during the Eclipse story", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openApp(page);
  const app = page.locator("main.app-shell");
  await page.getByRole("button", { name: "Eclipse story" }).click();
  const story = page.getByRole("dialog", {
    name: "12 August 2026 eclipse story",
  });
  await expect(story).toBeVisible();
  await expect(page.locator("header.command-bar")).toBeHidden();

  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await page.keyboard.press("f");
  await expect(app).toHaveAttribute("data-immersive-mode", "true");
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.tagName))
    .toBe("MAIN");
  await expect(story).toBeVisible();
  // The story's steps happen at named times, so its date stays.
  await expect(page.locator(".global-simulation-clock")).toBeVisible();

  await page.keyboard.press("f");
  await expect(app).toHaveAttribute("data-immersive-mode", "false");
  await expect(story).toBeVisible();
  // The header's Full screen button is hidden, so the story card's takes the
  // focus back.
  await expect(
    story.getByRole("button", { name: "Full screen" }),
  ).toBeFocused();

  // A letter typed into the search box is text, not a shortcut.
  await page.getByRole("button", { name: "Exit" }).click();
  const search = page.getByRole("combobox", { name: "Focus" });
  await search.press("f");
  await expect(app).toHaveAttribute("data-immersive-mode", "false");
  // b typed there is a letter too, not the black cover.
  await search.fill("");
  await search.press("b");
  await expect(search).toHaveValue("b");
  await expect(page.locator(".blackout-cover")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("an Eclipse observer step and a phone tour show no text box, list or slider", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openApp(page);
  const fields = page.locator(TEXT_FIELDS);
  // Without a tour the screen has them.
  await expect(fields).not.toHaveCount(0);

  await page.getByRole("button", { name: "Eclipse story" }).click();
  const story = page.getByRole("dialog", {
    name: "12 August 2026 eclipse story",
  });
  await story.getByRole("button", { name: "Next" }).click();
  await expect(story).toHaveAttribute(
    "data-tour-step",
    "london-before-contact",
  );
  await expect(page.locator("[data-surface-observer-body]")).toHaveAttribute(
    "data-surface-observer-body",
    "earth",
  );
  await expect(fields).toHaveCount(0);
  await story.getByRole("button", { name: "Exit" }).click();
  await expect(story).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(fields).not.toHaveCount(0);
  await startScaleTour(page);
  await expect(fields).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("a presentation clicker steps the tour with Page Down and Page Up", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openApp(page);
  const tour = await startScaleTour(page);

  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  // A tour hides the time controls, so the rate is read while hidden.
  const rate = page.locator(".playback-rate-control input");
  // A step applies its own rate a moment after the step changes, so each
  // step's rate is read once two consecutive polls agree.
  const settledRate = async (): Promise<string> => {
    let lastRead: string | null = null;
    await expect
      .poll(
        async () => {
          const previous = lastRead;
          lastRead = await rate.inputValue();
          return lastRead === previous;
        },
        { intervals: [250], timeout: 10_000 },
      )
      .toBe(true);
    return rate.inputValue();
  };
  await page.keyboard.press("PageDown");
  await expect(tour).toHaveAttribute("data-tour-step", "moon-gap");
  const moonGapRate = await settledRate();
  await page.keyboard.press("PageUp");
  await expect(tour).toHaveAttribute("data-tour-step", "earth");
  const earthRate = await settledRate();

  // The clicker still steps the tour from a focused tour button, and the
  // rate does not move as well: it shows each step's own rate.
  await page.evaluate(() => {
    const record = window as unknown as Window & { pageKeysTaken: boolean[] };
    record.pageKeysTaken = [];
    // Read at the key's keyup, once every keydown listener has run. The
    // press returns after its keyup is handled, so the record is complete
    // when the press returns. A timer here ran late when frames were slow:
    // the record read [true] and gained its second entry later.
    let pageKey: KeyboardEvent | null = null;
    window.addEventListener("keydown", (event) => {
      if (event.key === "PageDown" || event.key === "PageUp") {
        pageKey = event;
      }
    });
    window.addEventListener("keyup", (event) => {
      if (pageKey !== null && event.key === pageKey.key) {
        record.pageKeysTaken.push(pageKey.defaultPrevented);
        pageKey = null;
      }
    });
  });
  await tour.getByRole("button", { name: /^(Pause|Resume) tour$/u }).focus();
  await page.keyboard.press("PageDown");
  await expect(tour).toHaveAttribute("data-tour-step", "moon-gap");
  await expect(rate).toHaveValue(moonGapRate);
  await page.keyboard.press("PageUp");
  await expect(tour).toHaveAttribute("data-tour-step", "earth");
  await expect(rate).toHaveValue(earthRate);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as Window & { pageKeysTaken: boolean[] })
          .pageKeysTaken,
    ),
  ).toEqual([true, true]);

  // A tour hides every text box, list and slider, which would keep Page
  // Down, so the clicker always steps the tour.
  await expect(page.locator(TEXT_FIELDS)).toHaveCount(0);
  await expect(tour).toHaveAttribute("data-tour-step", "earth");

  // b blanks the screen; any key or a click shows it again.
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await page.keyboard.press("b");
  const cover = page.locator(".blackout-cover");
  await expect(cover).toBeVisible();
  await page.keyboard.press("PageDown");
  await expect(cover).toBeHidden();
  await expect(tour).toHaveAttribute("data-tour-step", "earth");
  await page.keyboard.press(".");
  await expect(cover).toBeVisible();
  await page.keyboard.press(".");
  await expect(cover).toBeHidden();
  await page.keyboard.press(".");
  await expect(cover).toBeVisible();
  await cover.click();
  await expect(cover).toBeHidden();

  // The ending card has no step to move to.
  while ((await tour.getAttribute("data-tour-ended")) !== "true") {
    await tour.getByRole("button", { name: /^(Next|Finish)$/u }).click();
  }
  const lastStep = await tour.getAttribute("data-tour-step");
  await page.keyboard.press("PageUp");
  await page.keyboard.press("PageDown");
  await expect(tour).toHaveAttribute("data-tour-ended", "true");
  await expect(tour).toHaveAttribute("data-tour-step", lastStep ?? "");
  expect(pageErrors).toEqual([]);
});

test("Start fresh forgets the surprises found and the sound settings", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openApp(page);
  await page.evaluate(
    ([eggsKey, audioKey]) => {
      window.localStorage.setItem(
        eggsKey,
        JSON.stringify(["death-star-1", "death-star-2"]),
      );
      window.localStorage.setItem(
        audioKey,
        JSON.stringify({
          musicEnabled: true,
          effectsEnabled: true,
          narrationEnabled: true,
          musicVolume: 0.22,
          effectsVolume: 0.45,
          narrationVolume: 0.05,
        }),
      );
    },
    [FOUND_EGGS_KEY, AUDIO_SETTINGS_KEY] as const,
  );
  await page.reload();
  await expect(page.locator("canvas.major-body-layer")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Display" }).click();
  const startFresh = page.getByRole("button", { name: "Start fresh" });

  // Cancel keeps everything.
  page.once("dialog", (dialog) => void dialog.dismiss());
  await startFresh.click();
  expect(
    await page.evaluate(
      (keys) => keys.map((key) => window.localStorage.getItem(key) !== null),
      [FOUND_EGGS_KEY, AUDIO_SETTINGS_KEY],
    ),
  ).toEqual([true, true]);

  let question = "";
  page.once("dialog", (dialog) => {
    question = dialog.message();
    void dialog.accept();
  });
  await Promise.all([page.waitForEvent("load"), startFresh.click()]);
  expect(question).toBe(
    "Forget the 2 surprises found and the sound settings on this computer?",
  );
  await expect(page.locator("canvas.major-body-layer")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Open focus list" }).click();
  await expect(page.locator(".focus-popover")).toContainText(
    "Hidden surprises · 0 of 7 found",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Display" }).click();
  await page.getByRole("tab", { name: "Sound" }).click();
  await expect(
    page.getByRole("slider", { name: "Narration volume" }),
  ).toHaveValue("72");

  // With no surprise found, the question names only the sound settings.
  await page.getByRole("tab", { name: "View" }).click();
  page.once("dialog", (dialog) => {
    question = dialog.message();
    void dialog.dismiss();
  });
  await startFresh.click();
  await expect
    .poll(() => question)
    .toBe("Forget the sound settings on this computer?");
  expect(pageErrors).toEqual([]);
});

test("the black cover pauses the tour behind it and a key brings both back", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openApp(page);
  const tour = await startScaleTour(page);
  await expect(tour).toHaveAttribute("data-tour-playing", "true");
  const cover = page.locator(".blackout-cover");

  // The cover goes on from the tour's own Pause button, which keeps focus
  // and reads "Resume tour" while the cover pauses the tour.
  const pauseTour = tour.getByRole("button", {
    name: /^(Pause|Resume) tour$/u,
  });
  await pauseTour.focus();
  await page.keyboard.down("b");
  await expect(cover).toBeVisible();
  await expect(tour).toHaveAttribute("data-tour-playing", "false");
  // Holding b does not take the cover off again.
  await page.keyboard.down("b");
  await expect(cover).toBeVisible();
  // A click takes the cover off; the b still held does not put it back.
  await cover.click();
  await expect(cover).toBeHidden();
  await expect(tour).toHaveAttribute("data-tour-playing", "true");
  await page.keyboard.down("b");
  await page.keyboard.up("b");
  await expect(cover).toBeHidden();
  await pauseTour.focus();
  await page.keyboard.press("b");
  await expect(cover).toBeVisible();

  // A modifier alone, a browser shortcut or a media key leaves the cover.
  await page.keyboard.press("Shift");
  await page.keyboard.press("Meta");
  await page.keyboard.press("Control+Tab");
  await page.keyboard.press("MediaPlayPause");
  await expect(cover).toBeVisible();

  // One step of the tour later, the tour still waits on its first step.
  await page.waitForTimeout(29_000);
  await expect(tour).toHaveAttribute("data-tour-step", "earth");
  await expect(tour).toHaveAttribute("data-tour-playing", "false");

  // Space takes the cover off and does not also press the focused button.
  await expect(pauseTour).toBeFocused();
  await page.keyboard.press(" ");
  await expect(cover).toBeHidden();
  await expect(tour).toHaveAttribute("data-tour-playing", "true");
  await expect(tour).toHaveAttribute("data-tour-step", "earth");

  // Outside a tour the cover pauses the clock and gives it back.
  await tour.getByRole("button", { name: "Exit" }).click();
  await expect(tour).toBeHidden();
  const pause = page.getByRole("button", { name: "Pause", exact: true });
  await expect(pause).toBeVisible();
  await blurFocus(page);
  await page.keyboard.press("b");
  await expect(cover).toBeVisible();
  await expect(pause).toHaveCount(0);
  await page.keyboard.press("x");
  await expect(cover).toBeHidden();
  await expect(pause).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("a clicker key with Ctrl or held down, or a key a panel took, leaves the tour alone", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openApp(page);
  const app = page.locator("main.app-shell");
  const tour = await startScaleTour(page);
  await blurFocus(page);

  // Ctrl+Page Down switches browser tabs. A held Page Down then moves one
  // step, not on to the ending.
  await page.keyboard.press("Control+PageDown");
  await page.keyboard.press("Alt+PageDown");
  await page.keyboard.down("PageDown");
  await page.keyboard.down("PageDown");
  await page.keyboard.down("PageDown");
  await page.keyboard.up("PageDown");
  await expect(tour).toHaveAttribute("data-tour-step", "moon-gap");
  await expect(tour).toHaveAttribute("data-tour-ended", "false");

  // Browser shortcuts are not full screen or a reset (which pauses a tour).
  await page.keyboard.press("Control+f");
  await page.keyboard.press("Meta+f");
  await page.keyboard.press("Control+r");
  await page.keyboard.press("Meta+r");
  await expect(app).toHaveAttribute("data-immersive-mode", "false");
  await expect(tour).toHaveAttribute("data-tour-playing", "true");
  await expect(tour).toHaveAttribute("data-tour-step", "moon-gap");

  // A tour hides the Display panel's button, so no panel can take a key
  // during the tour.
  await expect(page.getByRole("button", { name: "Display" })).toBeHidden();
  await expect(tour).toBeVisible();
  await expect(tour).toHaveAttribute("data-tour-step", "moon-gap");
  expect(pageErrors).toEqual([]);
});
