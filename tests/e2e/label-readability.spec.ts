import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

// Scene labels are big enough to read, show a clear ring under the keyboard,
// keep clear of each other, and a flight tells a screen reader only where it
// goes and when it arrives.

async function pausedScene(page: Page): Promise<Locator> {
  await page.goto("/");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const scene = page.getByRole("img", { name: /Physics-driven Solar System/u });
  await expect(scene).toHaveAttribute("data-rendered-time-seconds", /-?\d+/u, {
    timeout: 30_000,
  });
  return scene;
}

// The box of the label's text, which is what a child sees cover another name.
const textBox = (label: Locator): Promise<DOMRect> =>
  label.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return range.getBoundingClientRect().toJSON() as DOMRect;
  });

test("the first Tab stop is a readable label with a solid focus ring", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await pausedScene(page);
  // Start the keyboard walk from empty space at the left of the scene.
  await page.mouse.click(5, 450);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus");
  await expect(focused).toHaveClass(/\bbody-label\b/u);
  const style = await focused.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      focusVisible: element.matches(":focus-visible"),
      outlineStyle: computed.outlineStyle,
      outlineWidth: Number.parseFloat(computed.outlineWidth),
      fontSize: Number.parseFloat(computed.fontSize),
    };
  });
  expect(style.focusVisible).toBe(true);
  expect(style.outlineStyle).toBe("solid");
  expect(style.outlineWidth).toBeGreaterThanOrEqual(2);
  expect(style.fontSize).toBeGreaterThanOrEqual(11);
});

for (const viewport of [
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
]) {
  test(`the Sun label does not cover Mercury at ${String(viewport.width)}x${String(viewport.height)}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await pausedScene(page);
    const sun = page.locator(".sun-guide-label");
    const mercury = page.locator('.body-label[data-body-id="mercury"]');
    await expect(sun).toBeVisible();
    await expect(mercury).toBeVisible();
    await expect
      .poll(
        async () => {
          const [sunBox, mercuryBox] = await Promise.all([
            textBox(sun),
            textBox(mercury),
          ]);
          return (
            sunBox.left < mercuryBox.right &&
            mercuryBox.left < sunBox.right &&
            sunBox.top < mercuryBox.bottom &&
            mercuryBox.top < sunBox.bottom
          );
        },
        { timeout: 5_000 },
      )
      .toBe(false);
  });
}

test("a flight announces where it goes and its arrival, not its speed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const scene = await pausedScene(page);
  const mars = page.locator('.body-label[data-body-id="mars"]');
  await mars.click();
  await expect(scene).toHaveAttribute("data-selected-body", "mars");
  // Count every text change in the scene's live regions during the flight.
  await page.evaluate(() => {
    const sceneElement = document.querySelector("[data-focus-body]");
    if (sceneElement === null) {
      throw new Error("The scene is missing");
    }
    const lastText = new Map<Element, string>();
    for (const region of sceneElement.querySelectorAll("[aria-live]")) {
      lastText.set(region, region.textContent);
    }
    const root = document.documentElement;
    root.dataset.liveChanges = "0";
    new MutationObserver((records) => {
      for (const record of records) {
        const node =
          record.target instanceof Element
            ? record.target
            : record.target.parentElement;
        const region = node?.closest("[aria-live]");
        if (
          region === null ||
          region === undefined ||
          !sceneElement.contains(region)
        ) {
          continue;
        }
        if (lastText.get(region) !== region.textContent) {
          lastText.set(region, region.textContent);
          root.dataset.liveChanges = String(
            Number(root.dataset.liveChanges) + 1,
          );
        }
      }
    }).observe(sceneElement, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
  await mars.click();
  await expect(scene).toHaveAttribute("data-focus-body", "mars");
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
    { timeout: 40_000 },
  );
  const changes = Number(
    await page.locator("html").getAttribute("data-live-changes"),
  );
  expect(changes).toBeGreaterThan(0);
  expect(changes).toBeLessThanOrEqual(3);
  await expect(page.getByText("Arrived at Mars", { exact: true })).toHaveCount(
    1,
  );
  await expect(page.locator(".camera-journey")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
});
