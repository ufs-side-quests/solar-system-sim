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
    .getByRole("button", { name: "Focus ? Hidden surprise" })
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
  await expect(scene).toHaveAttribute("data-selected-body", eggId ?? "");
  const egg = page.locator(`.body-label[data-body-id="${eggId ?? ""}"]`);
  await expect(egg).toHaveText(realName);
  const toastBox = await toast.boundingBox();
  expect(toastBox).not.toBeNull();
  for (const control of [
    page.getByRole("button", { name: "Focus", exact: true }),
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
  await expect(egg).toHaveAttribute("aria-label", `Focus ${realName}`);
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
