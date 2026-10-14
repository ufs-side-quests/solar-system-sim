import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

const snapshot = JSON.parse(
  readFileSync("src/data/major-bodies.snapshot.json", "utf8"),
) as { bodies: { id: string; meanRadiusM: number }[] };

function sourcedRadiusM(id: string): number {
  const body = snapshot.bodies.find((candidate) => candidate.id === id);
  if (body === undefined) {
    throw new Error(`Snapshot is missing ${id}`);
  }
  return body.meanRadiusM;
}

async function waitForScene(page: Page): Promise<Locator> {
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  await expect(scene).toHaveAttribute(
    "data-rendered-time-seconds",
    /-?\d+(?:\.\d+)?/u,
    { timeout: 30_000 },
  );
  return scene;
}

async function drawnDiameter(dialog: Locator, bodyId: string): Promise<number> {
  return dialog
    .locator(`[data-lineup-circle="${bodyId}"] circle`)
    .evaluate((circle) => circle.getBoundingClientRect().width);
}

test("compare sizes draws Jupiter and Earth at one true scale and selects by tap", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const scene = await waitForScene(page);
  const focus = page.getByRole("combobox", { name: "Focus" });
  await focus.fill("Jupiter");
  await focus.press("Enter");
  await expect(scene).toHaveAttribute("data-focus-body", "jupiter");

  const card = page.locator(".selected-body-detail");
  const opener = card.getByRole("button", { name: "Compare sizes" });
  await opener.click();

  const dialog = page.getByRole("dialog", { name: "Compare sizes" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
  await expect(
    dialog.getByText("Sizes to scale. Distances are not."),
  ).toBeVisible();
  await expect(dialog.getByText(/too big to fit/u)).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Jupiter, 139,822 km wide" }),
  ).toHaveAttribute("aria-current", "true");
  await expect(dialog.locator(".size-lineup-comparison")).toHaveText(
    "Jupiter As wide as 11 Earths",
  );
  await expect(card).toContainText("As wide as 11 Earths");

  const drawnRatio =
    (await drawnDiameter(dialog, "jupiter")) /
    (await drawnDiameter(dialog, "earth"));
  const sourcedRatio = sourcedRadiusM("jupiter") / sourcedRadiusM("earth");
  expect(Math.abs(drawnRatio / sourcedRatio - 1)).toBeLessThan(0.01);

  await page.screenshot({
    path: testInfo.outputPath("size-lineup-jupiter.png"),
    animations: "disabled",
  });

  await dialog.getByRole("button", { name: /^Mars, / }).click();
  await expect(scene).toHaveAttribute("data-focus-body", "mars");
  await expect(card.getByText("Mars", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^Mars, / })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(dialog.locator(".size-lineup-comparison")).toContainText("Mars");

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
]) {
  test(`compare sizes fits with large tap targets at ${String(viewport.width)}x${String(viewport.height)}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await waitForScene(page);

    const opener = page
      .getByRole("navigation", { name: "Camera navigation" })
      .getByRole("button", { name: "Compare sizes" });
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "Compare sizes" });
    await expect(dialog).toBeVisible();

    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    if (box !== null) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    }
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth - element.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);

    const columns = dialog.locator("[data-lineup-body]");
    await expect(columns).toHaveCount(11);
    for (const column of await columns.all()) {
      const target = await column.boundingBox();
      expect(target?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(target?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await expect(
      dialog.getByRole("button", { name: "Sun, 1,391,400 km wide" }),
    ).toBeVisible();

    await page.screenshot({
      path: testInfo.outputPath(
        `size-lineup-${String(viewport.width)}x${String(viewport.height)}.png`,
      ),
      animations: "disabled",
    });

    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
}
