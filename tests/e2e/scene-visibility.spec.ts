import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

// The browser can hide the scene or take it out of the document for a while.
// The render loop must wait through that and draw again afterwards.
async function openScene(page: Page, pageErrors: string[]): Promise<Locator> {
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  const scene = page.getByRole("img", { name: /Physics-driven Solar System/u });
  await expect(scene).toHaveAttribute("data-rendered-time-seconds", /-?\d+/u, {
    timeout: 30_000,
  });
  return scene;
}

async function expectSceneDrawsAgain(scene: Locator): Promise<void> {
  const before = await scene.getAttribute("data-rendered-time-seconds");
  expect(before).toMatch(/-?\d+/u);
  await expect
    .poll(async () => scene.getAttribute("data-rendered-time-seconds"))
    .not.toBe(before);
}

test("draws again after an ancestor hides the scene", async ({ page }) => {
  const pageErrors: string[] = [];
  const scene = await openScene(page, pageErrors);
  await page.evaluate(() => {
    document.body.style.display = "none";
  });
  // Several frames run while the scene has no layout box.
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const tick = (): void => {
          frames += 1;
          if (frames < 10) {
            requestAnimationFrame(tick);
          } else {
            resolve(frames);
          }
        };
        requestAnimationFrame(tick);
      }),
  );
  await page.evaluate(() => {
    document.body.style.display = "";
  });
  await expectSceneDrawsAgain(scene);
  expect(pageErrors).toEqual([]);
});

test("draws again after the scene leaves and rejoins the document", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  const scene = await openScene(page, pageErrors);
  await scene.evaluate(
    (element) =>
      new Promise((resolve) => {
        const parent = element.parentElement;
        if (parent === null) {
          throw new Error("The scene has no parent element");
        }
        const next = element.nextSibling;
        element.remove();
        let frames = 0;
        const tick = (): void => {
          frames += 1;
          if (frames < 10) {
            requestAnimationFrame(tick);
          } else {
            // From a task, so the next frame draws before the resize
            // callback reports the new size.
            setTimeout(() => {
              parent.insertBefore(element, next);
              resolve(frames);
            }, 0);
          }
        };
        requestAnimationFrame(tick);
      }),
  );
  await expectSceneDrawsAgain(scene);
  expect(pageErrors).toEqual([]);
});
