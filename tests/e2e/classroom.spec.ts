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
  await page.getByRole("button", { name: "Full screen" }).click();
  await expect(app).toHaveAttribute("data-immersive-mode", "true");

  await expect(tour).toBeVisible();
  await expect(earthLabel).toBeVisible();
  await expect(map).toBeHidden();
  await expect(clock).toBeHidden();
  await tour.getByRole("button", { name: "Next" }).click();
  await expect(tour).toHaveAttribute("data-tour-step", "moon-gap");
  await page.screenshot({
    path: testInfo.outputPath("scale-tour-full-screen.png"),
  });

  // Without a tour the full screen is the clean sky again.
  await tour.getByRole("button", { name: "Exit" }).click();
  await expect(tour).toBeHidden();
  await expect(app).toHaveAttribute("data-immersive-mode", "true");
  await expect(page.locator(".body-label:visible")).toHaveCount(0);
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

  await page.keyboard.press("f");
  await expect(app).toHaveAttribute("data-immersive-mode", "false");
  await expect(story).toBeVisible();

  // A letter typed into the search box is text, not a shortcut.
  await page.getByRole("button", { name: "Exit" }).click();
  await page.getByRole("combobox", { name: "Focus" }).press("f");
  await expect(app).toHaveAttribute("data-immersive-mode", "false");
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
  const rate = page.getByRole("slider", { name: "Playback rate" });
  await page.keyboard.press("PageDown");
  await expect(tour).toHaveAttribute("data-tour-step", "moon-gap");
  const moonGapRate = await rate.inputValue();
  await page.keyboard.press("PageUp");
  await expect(tour).toHaveAttribute("data-tour-step", "earth");
  const earthRate = await rate.inputValue();

  // The clicker still steps the tour after a click on the playback slider,
  // and the slider does not move as well: it shows each step's own rate.
  await page.evaluate(() => {
    const record = window as unknown as Window & { pageKeysTaken: boolean[] };
    record.pageKeysTaken = [];
    window.addEventListener("keydown", (event) => {
      if (event.key === "PageDown" || event.key === "PageUp") {
        // Read once every listener has run.
        window.setTimeout(() =>
          record.pageKeysTaken.push(event.defaultPrevented),
        );
      }
    });
  });
  await rate.focus();
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

  // Page Down in the search box is left to the search box. The search stays
  // on a word that matches nothing, so the box chooses no body (which would
  // leave the tour) when it loses focus.
  const search = page.getByRole("combobox", { name: "Focus" });
  await search.fill("zzz");
  await search.press("PageDown");
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
      (key) => window.localStorage.getItem(key),
      FOUND_EGGS_KEY,
    ),
  ).not.toBeNull();

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
  expect(pageErrors).toEqual([]);
});
