import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

// Focusing the Sun frames the Sun's disc like any other body. The Solar
// System overview is a separate view: Home and the "Solar System" crumb.

test.use({ viewport: { width: 1280, height: 800 } });

const sceneOf = (page: Page): Locator =>
  page.getByRole("img", { name: /Physics-driven Solar System/u });

async function settledAfter(
  scene: Locator,
  sequenceBefore: string | null,
): Promise<void> {
  await expect
    .poll(async () => scene.getAttribute("data-camera-transition-sequence"))
    .not.toBe(sequenceBefore);
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
    { timeout: 30_000 },
  );
}

// The Sun's disc fills the view as a focused planet's does, and it is on
// screen.
async function expectSunFramed(page: Page, scene: Locator): Promise<void> {
  await expect(scene).toHaveAttribute("data-focus-body", "sun");
  const sun = page.locator('.body-label[data-body-id="sun"]');
  await expect(async () => {
    expect(
      Number(await scene.getAttribute("data-focus-distance-au")),
    ).toBeLessThan(1);
    const radius = Number(await sun.getAttribute("data-radius-pixels"));
    expect(radius).toBeGreaterThan(100);
    const x = Number(await sun.getAttribute("data-screen-x"));
    const y = Number(await sun.getAttribute("data-screen-y"));
    const box = await scene.boundingBox();
    if (box === null) throw new Error("The scene has no box");
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(box.width);
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(box.height);
  }).toPass({ timeout: 15_000 });
}

async function expectOverview(scene: Locator): Promise<void> {
  await expect(scene).toHaveAttribute("data-focus-body", "solar-system");
  await expect(scene).not.toHaveAttribute("data-focus-distance-au", /./u);
  expect(
    Number(await scene.getAttribute("data-camera-distance-au")),
  ).toBeCloseTo(90, 3);
}

test("every way to focus the Sun frames its disc, and Home keeps the overview", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await expect(page.locator("canvas.major-body-layer")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const scene = sceneOf(page);
  // The first screen is the overview.
  await expectOverview(scene);

  // The Focus box.
  const focus = page.getByRole("combobox", { name: "Focus" });
  let before = await scene.getAttribute("data-camera-transition-sequence");
  await focus.fill("Sun");
  await focus.press("Enter");
  await settledAfter(scene, before);
  await expectSunFramed(page, scene);
  await page.screenshot({ path: testInfo.outputPath("sun-focused.png") });

  // The breadcrumb's Solar System goes back to the overview.
  before = await scene.getAttribute("data-camera-transition-sequence");
  await page
    .getByRole("navigation", { name: "Current focus" })
    .getByRole("button", { name: "Solar System" })
    .click();
  await settledAfter(scene, before);
  await expectOverview(scene);

  // Fly there in the navigation map.
  await page
    .getByRole("combobox", { name: "Navigation destination" })
    .selectOption("sun");
  before = await scene.getAttribute("data-camera-transition-sequence");
  await page
    .locator(".reality-navigation-map")
    .getByRole("button", { name: "Fly there" })
    .click();
  await settledAfter(scene, before);
  await expectSunFramed(page, scene);

  // Home goes back to the overview.
  before = await scene.getAttribute("data-camera-transition-sequence");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await settledAfter(scene, before);
  await expectOverview(scene);

  // Fly there in the selected-body card, from Earth's Parent.
  before = await scene.getAttribute("data-camera-transition-sequence");
  await focus.fill("Earth");
  await focus.press("Enter");
  await settledAfter(scene, before);
  const card = page.locator(".selected-body-detail");
  await card.getByRole("button", { name: "Parent" }).click();
  await expect(scene).toHaveAttribute("data-selected-body", "sun");
  before = await scene.getAttribute("data-camera-transition-sequence");
  await card.getByRole("button", { name: "Fly there" }).click();
  await settledAfter(scene, before);
  await expectSunFramed(page, scene);
});
