import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

type ToneWindow = Window & { toneHz: number[] };

const callistoEggNames = {
  "death-star-1": "Death Star I (fictional)",
  "deep-space-nine": "Deep Space Nine (fictional)",
  "uss-defiant": "USS Defiant (fictional)",
} as const;

async function pauseScene(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  await expect(scene).toHaveAttribute("data-rendered-time-seconds", /-?\d+/u, {
    timeout: 30_000,
  });
  return scene;
}

async function focusCallisto(page: Page, scene: Locator): Promise<void> {
  const focus = page.getByRole("combobox", { name: "Focus" });
  await focus.fill("Callisto");
  await focus.press("Enter");
  await expect(scene).toHaveAttribute("data-focus-body", "callisto");
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

test("hints at hidden objects near Callisto and celebrates the first find", async ({
  page,
}, testInfo) => {
  test.setTimeout(150_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    const testWindow = window as unknown as ToneWindow;
    testWindow.toneHz = [];
    const originalSetValueAtTime: (
      this: AudioParam,
      value: number,
      startTime: number,
    ) => AudioParam = Reflect.get(AudioParam.prototype, "setValueAtTime");
    AudioParam.prototype.setValueAtTime = function setValueAtTime(
      value: number,
      startTime: number,
    ): AudioParam {
      testWindow.toneHz.push(value);
      return originalSetValueAtTime.call(this, value, startTime);
    };
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const scene = await pauseScene(page);
  await focusCallisto(page, scene);

  const unknownLabel = page
    .getByRole("button", { name: "? Hidden surprise", exact: true })
    .filter({ visible: true })
    .first();
  // The Death Star laps Callisto in about 3 hours, so a few steps bring at
  // least one hidden object in front of the moon where a child can click it.
  await expect(async () => {
    if (!(await unknownLabel.isVisible())) {
      await page.getByRole("button", { name: "Step forward" }).click();
    }
    await expect(unknownLabel).toBeVisible({ timeout: 2_000 });
    await unknownLabel.click({ trial: true, timeout: 2_000 });
  }).toPass({ timeout: 40_000 });
  await expect(unknownLabel).toHaveText("? Hidden surprise");
  const eggId = await unknownLabel.getAttribute("data-body-id");
  expect(Object.keys(callistoEggNames)).toContain(eggId);
  const realName = callistoEggNames[eggId as keyof typeof callistoEggNames];
  await page.screenshot({
    path: testInfo.outputPath("hidden-surprise-label.png"),
    animations: "disabled",
  });

  await page.evaluate(() => {
    (window as unknown as ToneWindow).toneHz = [];
  });
  await unknownLabel.click();
  const toast = page.getByRole("status").filter({ hasText: "You found" });
  await expect(toast).toBeVisible();
  await expect(toast).toContainText(/\(fictional, from Star (Wars|Trek)\)/u);
  await expect(toast).toContainText("1 of 7 found");
  await expect(scene).toHaveAttribute("data-selected-body", eggId ?? "");
  const egg = page.locator(`.body-label[data-body-id="${eggId ?? ""}"]`);
  await expect(egg).toHaveText(realName);
  const toastBox = await toast.boundingBox();
  expect(toastBox).not.toBeNull();
  for (const control of [
    page
      .locator(".selected-body-detail")
      .getByRole("button", { name: "Fly there" }),
    page.getByRole("button", { name: "Parent" }),
    page.getByRole("button", { name: "Next object" }),
    page.getByRole("button", { name: "Collapse" }),
  ]) {
    const controlBox = await control.boundingBox();
    expect(controlBox).not.toBeNull();
    if (toastBox !== null && controlBox !== null) {
      expect(overlaps(toastBox, controlBox)).toBe(false);
    }
  }
  await page.screenshot({
    path: testInfo.outputPath("discovery-toast.png"),
    animations: "disabled",
  });
  // The discovery chime (C5, E5, G5) replaces the 520 Hz button sound.
  await expect
    .poll(() => page.evaluate(() => (window as unknown as ToneWindow).toneHz))
    .toEqual(expect.arrayContaining([523.25, 659.25, 783.99]));
  expect(
    await page.evaluate(() => (window as unknown as ToneWindow).toneHz),
  ).not.toContain(520);
  await expect(toast).toBeHidden({ timeout: 10_000 });
  expect(
    await page.evaluate(() =>
      window.localStorage.getItem("solar-explorer.found-eggs.v1"),
    ),
  ).toBe(JSON.stringify([eggId]));

  await page.reload();
  await focusCallisto(page, await pauseScene(page));
  await expect(egg).toHaveText(realName);
  await expect(egg).toHaveAccessibleName(realName);
  expect(pageErrors).toEqual([]);
});

test("tells a phone user that a hidden surprise orbits the selected moon", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await focusCallisto(page, await pauseScene(page));
  const card = page.locator(".selected-body-detail");
  await expect(card.locator("strong").first()).toHaveText("Callisto");
  const hint = card.getByText("Something hidden is out there. Look closely!", {
    exact: true,
  });
  await expect(hint).toBeVisible();
  const hintBox = await hint.boundingBox();
  expect(hintBox).not.toBeNull();
  expect((hintBox?.x ?? 0) + (hintBox?.width ?? 0)).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: testInfo.outputPath("card-hint-390.png"),
    animations: "disabled",
  });

  // Once every Callisto egg is found the card stops hinting.
  await page.evaluate((found) => {
    window.localStorage.setItem(
      "solar-explorer.found-eggs.v1",
      JSON.stringify(found),
    );
  }, Object.keys(callistoEggNames));
  await page.reload();
  await focusCallisto(page, await pauseScene(page));
  await expect(card.locator("strong").first()).toHaveText("Callisto");
  await expect(hint).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

const EGG_NAME =
  /Death Star|Deep Space Nine|Defiant|Discovery One|Monolith|Roadster/u;
const FOUND_EGGS_KEY = "solar-explorer.found-eggs.v1";

async function seedFoundEggs(page: Page, found: readonly string[]) {
  await page.goto("/");
  await page.evaluate(
    ([key, ids]) => window.localStorage.setItem(key, JSON.stringify(ids)),
    [FOUND_EGGS_KEY, found] as const,
  );
  await page.reload();
}

test("keeps unfound eggs out of the Focus list, search, Next object and map", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  const scene = await pauseScene(page);
  const focus = page.getByRole("combobox", { name: "Focus" });

  await page.getByRole("button", { name: "Open focus list" }).click();
  const listbox = page.locator(".focus-popover");
  await expect(listbox).toBeVisible();
  await expect(listbox).toContainText("Hidden surprises · 0 of 7 found");
  await expect(listbox).toContainText("? Near Callisto");
  await expect(listbox).toContainText("? Between Jupiter and Io");
  await expect(listbox).toContainText(
    "? Circles the Sun between Earth and Mars",
  );
  await expect(listbox).not.toContainText(EGG_NAME);
  await expect(listbox).not.toContainText("Fictional references");
  await page.screenshot({
    path: testInfo.outputPath("focus-list-nothing-found.png"),
  });

  await focus.fill("Hubble");
  await expect(
    listbox.getByRole("option", { name: "Hubble Space Telescope" }),
  ).toBeVisible();
  // "star" names no real object here, so no egg is left to list.
  await focus.fill("star");
  await expect(listbox.getByRole("option")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("search-star.png") });

  await focus.fill("James Webb Space Telescope");
  await focus.press("Enter");
  await expect(scene).toHaveAttribute("data-focus-body", "jwst");
  await page.getByRole("button", { name: "Next object" }).click();
  await expect(scene).toHaveAttribute("data-selected-body", "sun");

  const destinations = page.getByRole("combobox", {
    name: "Navigation destination",
  });
  await expect(destinations.locator("option").first()).toBeAttached();
  for (const option of await destinations.locator("option").allTextContents()) {
    expect(option).not.toMatch(EGG_NAME);
  }
  expect(
    await destinations
      .locator("optgroup")
      .evaluateAll((groups) =>
        groups.map((group) => group.getAttribute("label")),
      ),
  ).not.toContain("Hidden surprises");
  expect(
    await page.evaluate(
      (key) => window.localStorage.getItem(key),
      FOUND_EGGS_KEY,
    ),
  ).toBeNull();
  expect(pageErrors).toEqual([]);
});

test("a clue row flies to the clue body, not to the egg", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  const scene = await pauseScene(page);
  // Record every value the Focus input shows, frame by frame.
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Focus"]',
    );
    if (input === null) throw new Error("Focus input is missing");
    const shown = new Set<string>();
    (window as unknown as { focusValues: Set<string> }).focusValues = shown;
    const record = (): void => {
      shown.add(input.value);
      requestAnimationFrame(record);
    };
    record();
    new MutationObserver(() => shown.add(input.value)).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
    });
  });
  await page.getByRole("button", { name: "Open focus list" }).click();
  await page
    .locator(".focus-popover")
    .getByRole("option", { name: "? Near Callisto" })
    .first()
    .click();
  await expect(scene).toHaveAttribute("data-focus-body", "callisto");
  await expect(scene).toHaveAttribute("data-selected-body", "callisto");
  const focus = page.getByRole("combobox", { name: "Focus" });
  await expect(focus).toHaveValue("Callisto");
  // A second clue click on the focused body still names the body.
  await page.getByRole("button", { name: "Open focus list" }).click();
  await page
    .locator(".focus-popover")
    .getByRole("option", { name: "? Near Callisto" })
    .first()
    .click();
  await expect(focus).toHaveValue("Callisto");
  // The input names the body, never the clue, even for one frame.
  expect(
    await page.evaluate(() => [
      ...(window as unknown as { focusValues: Set<string> }).focusValues,
    ]),
  ).not.toContain("? Near Callisto");
  expect(
    await page.evaluate(
      (key) => window.localStorage.getItem(key),
      FOUND_EGGS_KEY,
    ),
  ).toBeNull();
});

test("names found eggs and celebrates the last find", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await seedFoundEggs(page, [
    "death-star-1",
    "death-star-2",
    "deep-space-nine",
    "uss-defiant",
    "discovery-one",
    "jovian-monolith",
  ]);
  const scene = await pauseScene(page);
  const focus = page.getByRole("combobox", { name: "Focus" });
  await page.getByRole("button", { name: "Open focus list" }).click();
  const listbox = page.locator(".focus-popover");
  await expect(listbox).toContainText("Hidden surprises · 6 of 7 found");
  for (const name of [
    "Death Star I (fictional)",
    "Death Star II (fictional)",
    "Deep Space Nine (fictional)",
    "USS Defiant (fictional)",
    "Discovery One (fictional)",
    "Jovian Monolith (fictional)",
  ]) {
    await expect(
      listbox.getByRole("option", { name, exact: true }),
    ).toBeVisible();
  }
  await expect(
    listbox.getByRole("option", {
      name: "? Circles the Sun between Earth and Mars",
    }),
  ).toBeVisible();
  await expect(listbox.getByRole("option", { name: /^\? Near/u })).toHaveCount(
    0,
  );
  await page.screenshot({
    path: testInfo.outputPath("focus-list-six-found.png"),
  });

  // A parent can still type the full name.
  await focus.fill("Tesla Roadster and Starman");
  await focus.press("Enter");
  await expect(scene).toHaveAttribute("data-focus-body", "roadster");
  const toast = page.getByRole("status").filter({ hasText: "You found" });
  await expect(toast).toContainText("Starman's Tesla Roadster");
  await expect(toast).toContainText(
    "You found every hidden surprise! 7 of 7 found",
  );
  await expect(page.locator(".camera-journey")).toContainText("Tesla Roadster");
  await expect(
    page.getByRole("navigation", { name: "Current focus" }),
  ).toContainText("Tesla Roadster and Starman");
  await page.screenshot({ path: testInfo.outputPath("all-found-toast.png") });
  expect(pageErrors).toEqual([]);
});

test("the Roadster clue flies to the Sun, where its hint is in view", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.goto("/");
  const scene = await pauseScene(page);
  await page.getByRole("button", { name: "Open focus list" }).click();
  await page
    .locator(".focus-popover")
    .getByRole("option", { name: "? Circles the Sun between Earth and Mars" })
    .click();
  // A focused Sun fills the view, so the clue flies to the overview with the
  // Sun selected.
  await expect(scene).toHaveAttribute("data-focus-body", "solar-system");
  await expect(scene).toHaveAttribute("data-selected-body", "sun");
  // The first screen is already the overview: no flight runs, or one has
  // settled.
  await expect(scene).not.toHaveAttribute(
    "data-camera-transition-phase",
    /^(?!settled$)./u,
    { timeout: 60_000 },
  );
  await expect(page.locator('.body-label[data-body-id="roadster"]')).toHaveText(
    "? Hidden surprise",
  );
  await expect(
    page.locator('.body-label[data-body-id="roadster"]'),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("roadster-clue-sun.png") });
});

test("search highlights the first row on screen", async ({ page }) => {
  test.setTimeout(60_000);
  await seedFoundEggs(page, [
    "death-star-1",
    "death-star-2",
    "deep-space-nine",
    "uss-defiant",
    "discovery-one",
    "jovian-monolith",
    "roadster",
  ]);
  const scene = await pauseScene(page);
  const focus = page.getByRole("combobox", { name: "Focus" });
  await focus.fill("2001");
  const options = page.locator(".focus-popover").getByRole("option");
  await expect(options).toHaveText([
    "Discovery One (fictional)",
    "Jovian Monolith (fictional)",
  ]);
  await focus.press("Enter");
  await expect(scene).toHaveAttribute("data-focus-body", "discovery-one");
});

test("the first Arrow Down after typing stays on the first row", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/");
  const scene = await pauseScene(page);
  const focus = page.getByRole("combobox", { name: "Focus" });
  await focus.fill("Jup");
  const options = page.locator(".focus-popover").getByRole("option");
  await expect(options.first()).toHaveText("Jupiter");
  await focus.press("ArrowDown");
  await expect(options.first()).toHaveAttribute("aria-selected", "true");
  await focus.press("Enter");
  await expect(scene).toHaveAttribute("data-focus-body", "jupiter");
  // A second Arrow Down moves on to the next row.
  await focus.fill("Jup");
  await focus.press("ArrowDown");
  await focus.press("ArrowDown");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
});

test("plots the Roadster on the map only once it is found", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const navigationMap = page.locator(".reality-navigation-map");
  const range = page.getByRole("combobox", { name: "Navigation map range" });
  const destinations = page.getByRole("combobox", {
    name: "Navigation destination",
  });

  await page.goto("/");
  await pauseScene(page);
  await range.selectOption("2");
  await expect(navigationMap).toHaveAttribute("data-range-mode", "2");
  await expect(navigationMap).toHaveAttribute(
    "data-plotted-bodies",
    /\bmars\b/u,
  );
  expect(
    (await navigationMap.getAttribute("data-plotted-bodies"))?.split(" "),
  ).not.toContain("roadster");

  await seedFoundEggs(page, ["roadster"]);
  await pauseScene(page);
  await range.selectOption("2");
  await expect(navigationMap).toHaveAttribute("data-range-mode", "2");
  await expect(navigationMap).toHaveAttribute(
    "data-plotted-bodies",
    /\broadster\b/u,
  );
  // A real craft: listed and coloured with the spacecraft.
  await expect(
    destinations.locator(
      'optgroup[label="Spacecraft"] option[value="roadster"]',
    ),
  ).toHaveCount(1);
  await expect(
    destinations.locator('optgroup[label="Hidden surprises"]'),
  ).toHaveCount(0);
});

test("the discovery toast sits clear of the flight banner", async ({
  page,
}, testInfo) => {
  test.setTimeout(150_000);
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await seedFoundEggs(page, ["death-star-1"]);
    await pauseScene(page);
    const focus = page.getByRole("combobox", { name: "Focus" });
    await focus.fill("Tesla Roadster and Starman");
    await focus.press("Enter");
    const toast = page.getByRole("status").filter({ hasText: "You found" });
    const banner = page.locator(".camera-journey");
    await expect(toast).toBeVisible();
    await expect(banner).toBeVisible();
    const [toastBox, bannerBox] = await Promise.all([
      toast.boundingBox(),
      banner.boundingBox(),
    ]);
    expect(toastBox).not.toBeNull();
    expect(bannerBox).not.toBeNull();
    if (toastBox !== null && bannerBox !== null) {
      expect(overlaps(toastBox, bannerBox)).toBe(false);
    }
    await page.screenshot({
      path: testInfo.outputPath(
        `toast-and-banner-${String(viewport.width)}.png`,
      ),
    });
  }
});
