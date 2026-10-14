import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

const snapshot = JSON.parse(
  readFileSync("src/data/major-bodies.snapshot.json", "utf8"),
) as { bodies: { id: string; meanRadiusM: number }[] };

const LINEUP_BODY_IDS = [
  "mercury",
  "venus",
  "earth",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "moon",
  "pluto",
] as const;

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

async function focusBody(page: Page, scene: Locator, name: string) {
  const focus = page.getByRole("combobox", { name: "Focus" });
  await focus.fill(name);
  await focus.press("Enter");
  await expect(scene).toHaveAttribute("data-focus-body", name.toLowerCase());
}

/**
 * The drawn mean diameter of a lineup body: the Sun's disc width, or a
 * picture's width divided by how many mean radii it spans on each side.
 */
async function drawnDiameter(dialog: Locator, bodyId: string): Promise<number> {
  return dialog.locator(`[data-lineup-circle="${bodyId}"]`).evaluate((art) => {
    const width = art.getBoundingClientRect().width;
    const frame = art.getAttribute("data-frame-half-width");
    return frame === null ? width : width / Number(frame);
  });
}

test("compare sizes draws every body at one true scale and selects by tap", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const scene = await waitForScene(page);
  await focusBody(page, scene, "Jupiter");

  const card = page.locator(".selected-body-detail");
  const opener = card.getByRole("button", { name: "Compare sizes" });
  await expect(opener).toHaveAttribute("aria-haspopup", "dialog");
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
    "Jupiter As wide as 11 EarthsSurface: Real space pictures of its clouds in 2000",
  );
  await expect(card).toContainText("As wide as 11 Earths");
  await expect(dialog).not.toContainText(/photograph/iu);

  // Every picture has decoded, so none is an empty box.
  for (const bodyId of LINEUP_BODY_IDS) {
    await expect
      .poll(() =>
        dialog
          .locator(`img[data-lineup-circle="${bodyId}"]`)
          .evaluate((image: HTMLImageElement) =>
            image.complete ? image.naturalWidth : 0,
          ),
      )
      .toBeGreaterThan(0);
  }

  const jupiterDiameter = await drawnDiameter(dialog, "jupiter");
  for (const bodyId of ["sun", ...LINEUP_BODY_IDS]) {
    const drawnRatio = (await drawnDiameter(dialog, bodyId)) / jupiterDiameter;
    const sourcedRatio = sourcedRadiusM(bodyId) / sourcedRadiusM("jupiter");
    expect(Math.abs(drawnRatio / sourcedRatio - 1), bodyId).toBeLessThan(0.01);
  }

  // Saturn's rings reach past its globe: the picture is wider than the globe.
  const saturn = await dialog
    .locator('[data-lineup-circle="saturn"]')
    .boundingBox();
  expect(saturn?.width ?? 0).toBeGreaterThan(
    2 * (await drawnDiameter(dialog, "saturn")),
  );

  const sunColumn = await dialog
    .locator('[data-lineup-body="sun"]')
    .boundingBox();
  const sunDisc = await dialog
    .locator('[data-lineup-circle="sun"]')
    .evaluate((disc) => {
      const { left, right } = disc.getBoundingClientRect();
      return { left, right };
    });
  expect(sunColumn).not.toBeNull();
  if (sunColumn !== null) {
    expect(sunDisc.right).toBeGreaterThan(sunColumn.x);
    expect(sunDisc.right).toBeLessThanOrEqual(sunColumn.x + sunColumn.width);
  }

  await page.screenshot({
    path: testInfo.outputPath("size-lineup-jupiter.png"),
    animations: "disabled",
  });

  await dialog.getByRole("button", { name: /^Venus, / }).click();
  await expect(scene).toHaveAttribute("data-focus-body", "venus");
  await expect(dialog.locator(".size-lineup-comparison")).toContainText(
    "Surface: Radar map of the ground under the clouds",
  );

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

test("compare sizes says which picture failed to load", async ({ page }) => {
  await page.route("**/textures/lineup/mars.webp", (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  await page.goto("/");
  const scene = await waitForScene(page);
  await focusBody(page, scene, "Earth");
  await page
    .locator(".selected-body-detail")
    .getByRole("button", { name: "Compare sizes" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Compare sizes" });
  await expect(dialog.getByRole("alert")).toHaveText(
    "Picture did not load: Mars.",
  );
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
    const scene = await waitForScene(page);
    await focusBody(page, scene, "Saturn");

    const opener = page
      .locator(".selected-body-detail")
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
    // Nothing in the app paints over the dialog's heading. Overlays such as
    // the clock ignore pointer events, so hit-test with them all switched on.
    expect(
      await dialog.getByText("Compare sizes").evaluate((heading) => {
        const hitAll = document.createElement("style");
        hitAll.textContent = "* { pointer-events: auto !important; }";
        document.head.append(hitAll);
        const { left, top, right, bottom } = heading.getBoundingClientRect();
        const dialogElement = heading.closest("aside");
        const uncovered = [left + 1, (left + right) / 2, right - 1].every((x) =>
          [top + 1, (top + bottom) / 2, bottom - 1].every((y) => {
            const hit = document.elementFromPoint(x, y);
            return hit !== null && dialogElement?.contains(hit) === true;
          }),
        );
        hitAll.remove();
        return uncovered;
      }),
    ).toBe(true);
    // Saturn's rings stay inside the dialog.
    const saturn = await dialog
      .locator('[data-lineup-circle="saturn"]')
      .boundingBox();
    if (box !== null && saturn !== null) {
      expect(saturn.x).toBeGreaterThanOrEqual(box.x);
      expect(saturn.x + saturn.width).toBeLessThanOrEqual(box.x + box.width);
    }

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

test("camera dock buttons stay at least 44 px wide on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await waitForScene(page);
  const buttons = page
    .getByRole("navigation", { name: "Camera navigation" })
    .getByRole("button");
  expect(await buttons.count()).toBeGreaterThan(0);
  for (const button of await buttons.all()) {
    const target = await button.boundingBox();
    expect(target?.width ?? 0, await button.innerText()).toBeGreaterThanOrEqual(
      44,
    );
  }
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
]) {
  test(`selected-body card stays below the camera dock at ${String(viewport.width)}x${String(viewport.height)}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const scene = await waitForScene(page);
    await focusBody(page, scene, "Jupiter");
    const card = page.locator(".selected-body-detail");
    await card.getByText("More detail", { exact: true }).click();
    await expect(
      card.getByText("Rotation angle", { exact: true }),
    ).toBeVisible();

    const cardBox = await card.boundingBox();
    const dockBox = await page
      .getByRole("navigation", { name: "Camera navigation" })
      .boundingBox();
    expect(cardBox).not.toBeNull();
    expect(dockBox).not.toBeNull();
    if (cardBox !== null && dockBox !== null) {
      expect(cardBox.y).toBeGreaterThanOrEqual(dockBox.y + dockBox.height);
    }
  });
}
