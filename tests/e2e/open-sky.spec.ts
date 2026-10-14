import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

// The subject sits in the open sky: when a left-hand panel covers the centre
// of the scene, the picture moves right so the focused body is not under it.

const sceneOf = (page: Page): Locator =>
  page.getByRole("img", { name: /Physics-driven Solar System/u });

const bodyLabel = (page: Page, bodyId: string): Locator =>
  page.locator(`.body-label[data-body-id="${bodyId}"]`);

async function settledScene(page: Page): Promise<Locator> {
  const scene = sceneOf(page);
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
    {
      timeout: 30_000,
    },
  );
  return scene;
}

async function pausedScene(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("canvas.major-body-layer")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
}

async function focusBody(page: Page, name: string): Promise<Locator> {
  const focus = page.getByRole("combobox", { name: "Focus" });
  await focus.fill(name);
  await focus.press("Enter");
  await expect(sceneOf(page)).toHaveAttribute(
    "data-focus-body",
    name.toLowerCase(),
  );
  return settledScene(page);
}

// The right edge of a panel and the scene width, in scene pixels.
async function panelRightAndSceneWidth(
  scene: Locator,
  panel: Locator,
): Promise<{ panelRight: number; sceneWidth: number }> {
  const sceneBox = await scene.boundingBox();
  const panelBox = await panel.boundingBox();
  if (sceneBox === null || panelBox === null) {
    throw new Error("The scene or the panel has no box");
  }
  return {
    panelRight: panelBox.x + panelBox.width - sceneBox.x,
    sceneWidth: sceneBox.width,
  };
}

async function boxesOverlap(a: Locator, b: Locator): Promise<boolean> {
  const first = await a.boundingBox();
  const second = await b.boundingBox();
  if (first === null || second === null) {
    throw new Error("A box is missing");
  }
  return (
    first.x < second.x + second.width &&
    second.x < first.x + first.width &&
    first.y < second.y + second.height &&
    second.y < first.y + first.height
  );
}

test.describe("at 1024 x 768", () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test("the tour card never hides Jupiter's label", async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator("canvas.major-body-layer")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Scale tour" }).click();
    const tour = page.getByRole("dialog", {
      name: "Scale of the Solar System tour",
    });
    const jupiterLabel = bodyLabel(page, "jupiter");
    for (const stepId of [
      "earth",
      "moon-gap",
      "sun-atmosphere",
      "sun-from-mars",
      "jupiter",
      "jupiter-from-io",
    ]) {
      await expect(tour).toHaveAttribute("data-tour-step", stepId);
      // Reduced motion cuts straight to each step, so the label settles
      // without a flight.
      if (stepId.startsWith("jupiter")) {
        await expect(jupiterLabel).toBeVisible();
        await expect
          .poll(async () => boxesOverlap(jupiterLabel, tour), {
            timeout: 15_000,
          })
          .toBe(false);
      }
      if (stepId !== "jupiter-from-io") {
        await page.getByRole("button", { name: "Next" }).click();
      }
    }

    // A minimised card leaves the centre clear, so Jupiter goes back there.
    const scene = sceneOf(page);
    await tour.getByRole("button", { name: "Minimise" }).click();
    const width = (await scene.boundingBox())?.width ?? Number.NaN;
    await expect
      .poll(async () =>
        Number(await jupiterLabel.getAttribute("data-screen-x")),
      )
      .toBeCloseTo(width / 2, 0);
  });

  test("selected Jupiter sits clear of its card and a click on its disc picks it", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await pausedScene(page);
    const scene = await focusBody(page, "Jupiter");
    await expect(scene).toHaveAttribute("data-selected-body", "jupiter");
    const card = page.locator(".selected-body-detail");
    await expect(card).toBeVisible();
    const { panelRight, sceneWidth } = await panelRightAndSceneWidth(
      scene,
      card,
    );
    const jupiter = bodyLabel(page, "jupiter");
    // The centre of the free sky right of the card.
    await expect
      .poll(async () => Number(await jupiter.getAttribute("data-screen-x")))
      .toBeCloseTo((panelRight + sceneWidth) / 2, 0);
    const screenX = Number(await jupiter.getAttribute("data-screen-x"));
    const screenY = Number(await jupiter.getAttribute("data-screen-y"));
    const radius = Number(await jupiter.getAttribute("data-radius-pixels"));
    // The whole disc is in the open sky.
    expect(screenX - radius).toBeGreaterThan(panelRight);

    // Select Saturn without moving the camera, then pick Jupiter on its disc,
    // below the label, so only the canvas ray can find it.
    await page
      .getByRole("combobox", { name: "Navigation destination" })
      .selectOption("saturn");
    await expect(scene).toHaveAttribute("data-selected-body", "saturn");
    const sceneBox = await scene.boundingBox();
    if (sceneBox === null) throw new Error("The scene has no box");
    const clickX = sceneBox.x + screenX;
    const clickY = sceneBox.y + screenY + radius * 0.6;
    const labelBox = await jupiter.boundingBox();
    if (labelBox !== null) {
      expect(clickY < labelBox.y || clickY > labelBox.y + labelBox.height).toBe(
        true,
      );
    }
    await page.mouse.click(clickX, clickY);
    await expect(scene).toHaveAttribute("data-selected-body", "jupiter");
  });
});

test("at 1440 x 900 a card that leaves the centre clear changes nothing", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await pausedScene(page);
  const scene = await focusBody(page, "Jupiter");
  await expect(page.locator(".selected-body-detail")).toBeVisible();
  const width = (await scene.boundingBox())?.width ?? Number.NaN;
  await expect(scene).toHaveAttribute("data-lens-shift-px", "0.0");
  expect(
    Number(await bodyLabel(page, "jupiter").getAttribute("data-screen-x")),
  ).toBeCloseTo(width / 2, 0);
});
