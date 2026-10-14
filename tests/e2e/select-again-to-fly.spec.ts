import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

// One gesture for every body label: the first tap, click or Enter selects the
// body and shows its facts; the same press on the selected body flies there.
test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true });

async function pausedScene(page: Page): Promise<Locator> {
  await page.goto("/");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const scene = page.getByRole("img", { name: /Physics-driven Solar System/u });
  await expect(scene).toHaveAttribute("data-rendered-time-seconds", /-?\d+/u, {
    timeout: 30_000,
  });
  return scene;
}

const bodyLabel = (page: Page, bodyId: string): Locator =>
  page.locator(`.body-label[data-body-id="${bodyId}"]`);

test("a second tap on a selected planet label flies there", async ({
  page,
}) => {
  const scene = await pausedScene(page);
  const jupiter = bodyLabel(page, "jupiter");
  await expect(jupiter).toHaveAccessibleName("Jupiter");
  const directionBefore = await scene.getAttribute("data-camera-direction");
  // Record every click's tap count and any native double-click, so the test
  // proves the second tap is a single tap of its own.
  await page.evaluate(() => {
    const root = document.documentElement;
    document.addEventListener(
      "click",
      (event) => {
        root.dataset.clickDetails = `${root.dataset.clickDetails ?? ""}${String(event.detail)},`;
      },
      true,
    );
    document.addEventListener(
      "dblclick",
      () => {
        root.dataset.dblclickFired = "true";
      },
      true,
    );
  });

  await jupiter.tap();
  await expect(scene).toHaveAttribute("data-selected-body", "jupiter");
  await expect(
    page.locator(".selected-body-detail").getByText("Jupiter", { exact: true }),
  ).toBeVisible();
  await expect(jupiter).toHaveAccessibleDescription(
    "Select again to fly there.",
  );
  // The first tap only selects: the camera stays where it was.
  await expect(scene).toHaveAttribute("data-focus-body", "solar-system");
  await expect(scene).toHaveAttribute(
    "data-camera-direction",
    directionBefore ?? "",
  );

  // A child's second tap comes well after the browser's double-tap window,
  // so it must not depend on a native double-click.
  await page.waitForTimeout(800);
  await jupiter.tap();
  await expect(scene).toHaveAttribute("data-focus-body", "jupiter");
  await expect(scene).not.toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
  );
  await expect(jupiter).not.toHaveAttribute("aria-describedby");
  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-click-details", "1,1,");
  await expect(root).not.toHaveAttribute("data-dblclick-fired");
});

test("Enter twice on a planet label flies there and announces the selection", async ({
  page,
}) => {
  const scene = await pausedScene(page);
  const mars = bodyLabel(page, "mars");
  await expect(mars).toHaveAccessibleName("Mars");
  const announcement = page.locator("p.visually-hidden[aria-live='polite']");

  await mars.focus();
  await page.keyboard.press("Enter");
  await expect(scene).toHaveAttribute("data-selected-body", "mars");
  await expect(announcement).toHaveText(
    "Mars selected. Select again to fly there.",
  );
  await expect(scene).toHaveAttribute("data-focus-body", "solar-system");

  await expect(mars).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(scene).toHaveAttribute("data-focus-body", "mars");
  // Once there, nothing is left to announce for a second press.
  await expect(announcement).toHaveText("");
});

test("the first tap on a hidden surprise finds it; the second flies there", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const scene = await pausedScene(page);
  const focus = page.getByRole("combobox", { name: "Focus" });
  await focus.fill("Callisto");
  await focus.press("Enter");
  await expect(scene).toHaveAttribute("data-focus-body", "callisto");
  // At this width the facts card covers the moon's neighbourhood.
  await page.getByRole("button", { name: "Collapse" }).click();
  const surprise = page
    .getByRole("button", { name: "? Hidden surprise", exact: true })
    .filter({ visible: true })
    .first();
  // The Death Star laps Callisto in about 3 hours, so a few steps bring a
  // hidden object in front of the moon where a child can tap it.
  await expect(async () => {
    if (!(await surprise.isVisible())) {
      await page.getByRole("button", { name: "Step forward" }).click();
    }
    await expect(surprise).toBeVisible({ timeout: 2_000 });
    await surprise.click({ trial: true, timeout: 2_000 });
  }).toPass({ timeout: 40_000 });
  const eggId = await surprise.getAttribute("data-body-id");
  if (eggId === null) {
    throw new Error("The hidden surprise label has no body id");
  }
  const egg = bodyLabel(page, eggId);

  await egg.tap();
  await expect(
    page.getByRole("status").filter({ hasText: "You found" }),
  ).toBeVisible();
  await expect(scene).toHaveAttribute("data-selected-body", eggId);
  await expect(scene).toHaveAttribute("data-focus-body", "callisto");

  await egg.tap();
  await expect(scene).toHaveAttribute("data-focus-body", eggId);
});

test("a second tap on a planet in the scene flies there", async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const scene = await pausedScene(page);
  // From Europa, Jupiter fills a wide disc that a child can tap.
  const focus = page.getByRole("combobox", { name: "Focus" });
  await focus.fill("Europa");
  await focus.press("Enter");
  await expect(scene).toHaveAttribute("data-focus-body", "europa");
  const jupiter = bodyLabel(page, "jupiter");
  await expect(jupiter).toHaveAttribute("data-in-camera-frustum", "true");
  await expect
    .poll(async () => Number(await jupiter.getAttribute("data-radius-pixels")))
    .toBeGreaterThan(20);
  const canvas = page.locator("canvas.major-body-layer");
  const bounds = await canvas.boundingBox();
  if (bounds === null) throw new Error("Scene canvas has no bounding box");
  const x = bounds.x + Number(await jupiter.getAttribute("data-screen-x"));
  const y = bounds.y + Number(await jupiter.getAttribute("data-screen-y"));
  // The point is the planet itself, not a label or a panel.
  expect(
    await page.evaluate(
      ([px, py]) =>
        document
          .elementFromPoint(px ?? 0, py ?? 0)
          ?.matches("canvas.major-body-layer") ?? false,
      [x, y],
    ),
  ).toBe(true);

  await page.touchscreen.tap(x, y);
  await expect(scene).toHaveAttribute("data-selected-body", "jupiter");
  await expect(scene).toHaveAttribute("data-focus-body", "europa");
  await page.waitForTimeout(800);
  await page.touchscreen.tap(x, y);
  await expect(scene).toHaveAttribute("data-focus-body", "jupiter");
});

test("a second click on a planet on the navigation map flies there", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const scene = await pausedScene(page);
  const map = page.locator(".reality-navigation-map");
  await page
    .getByRole("combobox", { name: "Navigation map range" })
    .selectOption("10");
  await expect(map).toHaveAttribute("data-scale-au", "10.0000");
  const mapCanvas = map.locator("canvas");
  const bounds = await mapCanvas.boundingBox();
  if (bounds === null) throw new Error("Navigation map has no bounding box");
  // Find Saturn's dot the way a child does: the hover tooltip names it. A
  // coarse pass finds the dot, and the press goes to the middle of the points
  // around it that name it.
  const tooltip = map.getByRole("tooltip");
  const namesSaturn = async (x: number, y: number): Promise<boolean> => {
    await page.mouse.move(x, y);
    return (
      (await tooltip.isVisible()) &&
      ((await tooltip.textContent()) ?? "").startsWith("Saturn ·")
    );
  };
  let firstHit: Readonly<{ x: number; y: number }> | undefined;
  for (let y = 0; y < bounds.height && firstHit === undefined; y += 3) {
    for (let x = 0; x < bounds.width; x += 3) {
      if (await namesSaturn(bounds.x + x, bounds.y + y)) {
        firstHit = { x: bounds.x + x, y: bounds.y + y };
        break;
      }
    }
  }
  if (firstHit === undefined) {
    throw new Error("Saturn has no dot on the 10 AU navigation map");
  }
  const saturnPoints: { x: number; y: number }[] = [];
  for (let dy = -6; dy <= 12; dy += 1) {
    for (let dx = -12; dx <= 12; dx += 1) {
      if (await namesSaturn(firstHit.x + dx, firstHit.y + dy)) {
        saturnPoints.push({ x: firstHit.x + dx, y: firstHit.y + dy });
      }
    }
  }
  const saturnPoint = {
    x:
      saturnPoints.reduce((sum, point) => sum + point.x, 0) /
      saturnPoints.length,
    y:
      saturnPoints.reduce((sum, point) => sum + point.y, 0) /
      saturnPoints.length,
  };

  await page.mouse.click(saturnPoint.x, saturnPoint.y);
  await expect(scene).toHaveAttribute("data-selected-body", "saturn");
  await expect(scene).toHaveAttribute("data-focus-body", "solar-system");
  await page.waitForTimeout(800);
  await page.mouse.click(saturnPoint.x, saturnPoint.y);
  await expect(scene).toHaveAttribute("data-focus-body", "saturn");
});

test("a second press on an Apollo site label shows it on the Moon and a third keeps it", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const scene = await pausedScene(page);
  const focus = page.getByRole("combobox", { name: "Focus" });
  await focus.fill("Moon");
  await focus.press("Enter");
  await expect(scene).toHaveAttribute("data-focus-body", "moon");
  const apollo11 = page.getByRole("button", {
    name: "Apollo 11 landing site at Tranquility Base",
  });
  await expect(apollo11).toBeVisible({ timeout: 20_000 });

  await apollo11.click();
  await expect(scene).toHaveAttribute("data-selected-body", "apollo-11-site");
  await expect(scene).not.toHaveAttribute("data-apollo-inspection-site");
  await page.waitForTimeout(800);
  await apollo11.click();
  await expect(scene).toHaveAttribute(
    "data-apollo-inspection-site",
    "apollo-11-site",
  );
  // The close view hides the label once the camera arrives, so the third
  // press comes from the keyboard while the camera is still on its way.
  await expect(apollo11).toBeFocused();
  await page.keyboard.press("Enter");
  // The camera arrives in the close view, which hides the label.
  await expect(apollo11).toBeHidden({ timeout: 20_000 });
  // The site stays shown on the Moon: nothing invites another press.
  await expect(scene).toHaveAttribute("data-selected-body", "apollo-11-site");
  await expect(
    page.locator("p.visually-hidden[aria-live='polite']"),
  ).toHaveText("");
});

test("from the Moon's surface two taps on Earth leave the surface and fly there", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const scene = await pausedScene(page);
  await page.getByRole("button", { name: "Display" }).click();
  await page.getByRole("tab", { name: "Camera" }).click();
  await page
    .getByRole("dialog", { name: "Display controls" })
    .getByText("Surface observer", { exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Observer body" })
    .selectOption("moon");
  await page
    .locator(".surface-observer-controls")
    .getByRole("combobox", { name: "Look at" })
    .selectOption("earth");
  // Entering the surface view closes the display panel.
  await page.getByRole("button", { name: "Enter surface view" }).click();
  await expect(
    page.getByRole("dialog", { name: "Display controls" }),
  ).toBeHidden();
  await expect(scene).toHaveAttribute("data-surface-observer-body", "moon");
  await expect(scene).toHaveAttribute(
    "data-camera-tracking",
    "surface-observer",
  );
  const earth = bodyLabel(page, "earth");
  await expect(earth).toBeVisible();

  await earth.tap();
  await expect(scene).toHaveAttribute("data-selected-body", "earth");
  await expect(scene).toHaveAttribute("data-surface-observer-body", "moon");
  await page.waitForTimeout(800);
  await earth.tap();
  await expect(scene).toHaveAttribute("data-focus-body", "earth");
  await expect(scene).not.toHaveAttribute("data-surface-observer-body", /.+/u);
  // The camera flies from the Moon's surface and settles on Earth.
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
    { timeout: 20_000 },
  );
  await expect(scene).not.toHaveAttribute(
    "data-camera-tracking",
    "surface-observer",
  );
  await expect(
    page.getByRole("complementary", { name: "Surface observer measurements" }),
  ).toBeHidden();
});

test("Next object selects without inviting a second press", async ({
  page,
}) => {
  const scene = await pausedScene(page);
  const announcement = page.locator("p.visually-hidden[aria-live='polite']");
  await bodyLabel(page, "mars").tap();
  await expect(announcement).toHaveText(
    "Mars selected. Select again to fly there.",
  );

  await page.getByRole("button", { name: "Next object" }).click();
  await expect(scene).not.toHaveAttribute("data-selected-body", "mars");
  await expect(announcement).toHaveText("");
});
