import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

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
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const scene = await pauseScene(page);
  await focusCallisto(page, scene);

  const unknownLabel = page
    .getByRole("button", { name: "Focus ? Unknown object" })
    .filter({ visible: true })
    .first();
  // The Death Star laps Callisto in about 3 hours, so a few steps bring at
  // least one hidden object in front of the moon.
  await expect(async () => {
    if (!(await unknownLabel.isVisible())) {
      await page.getByRole("button", { name: "Step forward" }).click();
    }
    await expect(unknownLabel).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 40_000 });
  await expect(unknownLabel).toHaveText("? Unknown object");
  const eggId = await unknownLabel.getAttribute("data-body-id");
  expect(Object.keys(callistoEggNames)).toContain(eggId);
  const realName = callistoEggNames[eggId as keyof typeof callistoEggNames];
  await page.screenshot({
    path: testInfo.outputPath("unknown-object-label.png"),
    animations: "disabled",
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
