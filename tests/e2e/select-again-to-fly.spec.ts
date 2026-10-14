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
