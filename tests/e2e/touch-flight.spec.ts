import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true });

const sceneOf = (page: Page): Locator =>
  page.getByRole("img", { name: /Physics-driven Solar System/u });

async function startJupiterFlight(page: Page): Promise<Locator> {
  await page.goto("/");
  // Paused time keeps Jupiter still, so the settled view can be compared.
  await page.getByRole("button", { name: "Pause" }).click();
  const scene = sceneOf(page);
  const sequenceBefore = await scene.getAttribute(
    "data-camera-transition-sequence",
  );
  const focus = page.getByRole("combobox", { name: "Focus" });
  await focus.fill("Jupiter");
  await focus.press("Enter");
  await expect(scene).toHaveAttribute("data-focus-body", "jupiter");
  await expect
    .poll(async () => scene.getAttribute("data-camera-transition-sequence"))
    .not.toBe(sequenceBefore);
  await expect(scene).not.toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
  );
  await expect
    .poll(async () =>
      Number(await scene.getAttribute("data-camera-transition-elapsed-ms")),
    )
    .toBeGreaterThanOrEqual(1_500);
  await expect(scene).not.toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
  );
  return scene;
}

// A point where the 3D canvas itself receives the touch, not a label or panel.
async function emptySkyPoint(page: Page): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(() => {
    for (const [fx, fy] of [
      [0.9, 0.35],
      [0.85, 0.5],
      [0.7, 0.3],
      [0.6, 0.6],
    ] as const) {
      const x = Math.round(window.innerWidth * fx);
      const y = Math.round(window.innerHeight * fy);
      if (
        document.elementFromPoint(x, y)?.classList.contains("major-body-layer")
      ) {
        return { x, y };
      }
    }
    return null;
  });
  if (point === null) {
    throw new Error("No empty sky point found over the scene canvas");
  }
  return point;
}

test("a tap or small press on the sky during a flight does not stop the flight", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const scene = await startJupiterFlight(page);
  const sky = await emptySkyPoint(page);
  await page.touchscreen.tap(sky.x, sky.y);
  // A mouse press that wobbles a few pixels is still a tap.
  await page.mouse.move(sky.x, sky.y);
  await page.mouse.down();
  await page.mouse.move(sky.x + 4, sky.y + 3, { steps: 3 });
  await page.mouse.up();
  await expect(scene).not.toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
  );

  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
    {
      timeout: 20_000,
    },
  );
  await expect(scene).not.toHaveAttribute("data-camera-transition-interrupted");
  await expect(scene).toHaveAttribute("data-focus-body", "jupiter");
  await expect(scene).toHaveAttribute("data-camera-orientation", "sun-facing");
  // The interrupted flight stays near 90 AU; the finished one ends close to Jupiter.
  expect(
    Number(await scene.getAttribute("data-camera-distance-au")),
  ).toBeLessThan(0.1);
  // No leftover drag rotation drifts the settled view away from the target.
  const directionAtSettle = await scene.getAttribute("data-camera-direction");
  await page.waitForTimeout(1_000);
  await expect(scene).toHaveAttribute(
    "data-camera-direction",
    directionAtSettle ?? "",
  );
});

test("a one-finger drag during a flight gives the child control", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const scene = await startJupiterFlight(page);
  const sky = await emptySkyPoint(page);
  const cdp = await page.context().newCDPSession(page);
  const touch = async (
    type: "touchStart" | "touchMove" | "touchEnd",
    x: number,
  ): Promise<void> => {
    await cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y: sky.y, id: 0 }],
    });
  };
  await touch("touchStart", sky.x);
  for (let step = 1; step <= 6; step += 1) {
    await touch("touchMove", sky.x - step * 10);
  }
  await touch("touchEnd", sky.x - 60);

  await expect(scene).toHaveAttribute("data-camera-transition-interrupted");
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
  );
  await expect(scene).toHaveAttribute("data-camera-orientation", "custom");
});

test("a mouse wheel during a flight gives the child control", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const scene = await startJupiterFlight(page);
  const sky = await emptySkyPoint(page);
  await page.mouse.move(sky.x, sky.y);
  await page.mouse.wheel(0, -200);

  await expect(scene).toHaveAttribute("data-camera-transition-interrupted");
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
  );
  await expect(scene).toHaveAttribute("data-camera-orientation", "custom");
});
