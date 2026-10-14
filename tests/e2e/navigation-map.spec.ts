import { expect, test } from "@playwright/test";

test("chooses an AU map range and travels to an object", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Pause" }).click();

  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  const navigationMap = page.locator(".reality-navigation-map");
  await expect(navigationMap).toBeVisible({ timeout: 30_000 });
  await expect(navigationMap).toHaveAttribute("data-range-mode", "50");
  const navigationRange = page.getByRole("combobox", {
    name: "Navigation map range",
  });
  const [mapBounds, rangeBounds] = await Promise.all([
    navigationMap.boundingBox(),
    navigationRange.boundingBox(),
  ]);
  expect(mapBounds).not.toBeNull();
  expect(rangeBounds).not.toBeNull();
  expect((rangeBounds?.x ?? 0) + (rangeBounds?.width ?? 0)).toBeLessThanOrEqual(
    (mapBounds?.x ?? 0) + (mapBounds?.width ?? 0) - 6,
  );

  await navigationRange.selectOption("300000");
  await expect(navigationMap).toHaveAttribute("data-scale-au", "300000.0000");
  await expect(navigationMap).toContainText("Radius 300,000 AU");
  await navigationMap.screenshot({
    path: testInfo.outputPath("navigation-map-alpha-centauri-range.png"),
  });

  await page
    .getByRole("combobox", { name: "Navigation destination" })
    .selectOption("saturn");
  await expect(scene).toHaveAttribute("data-selected-body", "saturn");
  await page.getByRole("button", { name: "Travel" }).click();
  await expect(scene).toHaveAttribute(
    "data-camera-transition-interpolation",
    "orient-then-direct-flight",
  );
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "travelling",
    { timeout: 7_000 },
  );
  await expect(page.locator(".camera-journey")).toContainText(
    /Viewpoint speed/u,
  );
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
    { timeout: 15_000 },
  );
  await expect(scene).toHaveAttribute("data-focus-body", "saturn");
  await expect(navigationMap).toHaveAttribute("data-destination", "saturn");
});

test("keeps the facts card clear of the navigation map's controls", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await page.getByRole("button", { name: "Pause" }).click();
  const navigationMap = page.locator(".reality-navigation-map");
  await expect(navigationMap).toBeVisible({ timeout: 30_000 });
  await page
    .getByRole("combobox", { name: "Navigation destination" })
    .selectOption("saturn");
  const card = page.locator(".selected-body-detail");
  await expect(card).toBeVisible();
  const travel = page.getByRole("button", { name: "Travel" });

  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(
        async () => {
          const [mapBox, cardBox] = await Promise.all([
            navigationMap.boundingBox(),
            card.boundingBox(),
          ]);
          if (mapBox === null || cardBox === null) {
            throw new Error("The map or the facts card has no bounding box");
          }
          // The card starts below the map's bottom edge.
          return cardBox.y - (mapBox.y + mapBox.height);
        },
        {
          message: `card below map at ${String(viewport.width)}x${String(viewport.height)}`,
        },
      )
      .toBeGreaterThanOrEqual(0);
    if (viewport.width <= 650) {
      // On a phone the map folds into its Mini map chip; Travel is one tap
      // away.
      await expect(navigationMap).toHaveJSProperty("open", false);
      await navigationMap.getByText("Mini map", { exact: true }).click();
    }
    await travel.click({ trial: true });
  }
});
