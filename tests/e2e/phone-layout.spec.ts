import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

// One phone layout: (max-width: 650px), (max-height: 500px). With Uranus in
// focus on 1 January 2026 the Sun's guide label lies inside the open card on
// a portrait phone and in open sky beside it on a landscape phone.
const UNDER_CARD = { underCard: true, hit: "card", aboveTimeControls: true };
const OPEN_SKY = { underCard: false, hit: "label", aboveTimeControls: true };
const PHONES = [
  { viewport: { width: 390, height: 844 }, uranusSunLabel: UNDER_CARD },
  { viewport: { width: 360, height: 740 }, uranusSunLabel: UNDER_CARD },
  { viewport: { width: 844, height: 390 }, uranusSunLabel: OPEN_SKY },
] as const;

async function openExplorer(page: Page): Promise<Locator> {
  await page.goto("/");
  await expect(page.locator("canvas.major-body-layer")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Pause" }).tap();
  return page.getByRole("img", { name: /Physics-driven Solar System/u });
}

async function flyTo(page: Page, scene: Locator, name: string): Promise<void> {
  const before = await scene.getAttribute("data-camera-transition-sequence");
  const focus = page.getByRole("combobox", { name: "Focus" });
  await focus.fill(name);
  await focus.press("Enter");
  await expect
    .poll(async () => scene.getAttribute("data-camera-transition-sequence"))
    .not.toBe(before);
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
    { timeout: 30_000 },
  );
}

// Where the Sun guide label's centre lies: inside the facts card or not,
// what a tap there reaches, and whether it is above the time controls.
async function sunLabelPlacement(page: Page): Promise<{
  underCard: boolean;
  hit: string;
  aboveTimeControls: boolean;
}> {
  return page.evaluate(() => {
    const label = document.querySelector(".sun-guide-label");
    const card = document.querySelector(".selected-body-detail");
    const timeControls = document.querySelector(".timeline-dock");
    if (label === null || card === null || timeControls === null) {
      throw new Error("The Sun guide label, card or time controls are missing");
    }
    const l = label.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const x = l.x + l.width / 2;
    const y = l.y + l.height / 2;
    const hit = document.elementFromPoint(x, y);
    return {
      underCard: x > c.left && x < c.right && y > c.top && y < c.bottom,
      hit:
        hit?.closest(".selected-body-detail") === card
          ? "card"
          : hit === label
            ? "label"
            : String(hit?.className),
      aboveTimeControls: l.bottom <= timeControls.getBoundingClientRect().top,
    };
  });
}

for (const { viewport, uranusSunLabel } of PHONES) {
  const size = `${String(viewport.width)}x${String(viewport.height)}`;

  test.describe(`phone ${size}`, () => {
    test.use({ viewport, isMobile: true, hasTouch: true });

    test("a tour shows only the clock and its panel", async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await openExplorer(page);
      const header = page.locator("header.command-bar");
      await expect(header).toBeVisible();
      await page.getByRole("button", { name: "Scale tour" }).tap();
      const tour = page.getByRole("dialog", {
        name: "Scale of the Solar System tour",
      });
      await expect(tour).toBeVisible();
      await expect(header).toBeHidden();
      await expect(
        page.getByRole("navigation", { name: "Camera navigation" }),
      ).toBeHidden();
      await expect(page.locator(".reality-navigation-map")).toBeHidden();
      await expect(page.locator(".global-simulation-clock")).toBeVisible();
      await tour.getByRole("button", { name: "Minimise" }).tap({ trial: true });
      await tour.getByRole("button", { name: "Next" }).tap();
      await page.screenshot({
        path: testInfo.outputPath(`scale-tour-${size}.png`),
      });
      const exit = tour.getByRole("button", { name: "Exit" });
      await exit.tap({ trial: true });
      await exit.tap();
      await expect(tour).toBeHidden();
      await expect(header).toBeVisible();
    });

    test("a flight leaves the card short and the planet in view", async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      const scene = await openExplorer(page);
      await flyTo(page, scene, "Jupiter");
      const card = page.locator(".selected-body-detail");
      await expect(card).toHaveClass(/is-collapsed/u);
      await expect(card.getByText("As wide as 11 Earths")).toBeVisible();
      await expect(
        card.getByRole("button", { name: "Expand selected body details" }),
      ).toBeVisible();
      const hit = await page.evaluate(() => {
        const scene = document.querySelector("[data-focus-body]");
        const label = document.querySelector('[data-body-id="jupiter"]');
        if (!(scene instanceof HTMLElement && label instanceof HTMLElement)) {
          throw new Error("The scene or Jupiter's label is missing");
        }
        const box = scene.getBoundingClientRect();
        const x = box.x + Number(label.dataset.screenX);
        const y = box.y + Number(label.dataset.screenY);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          throw new Error("Jupiter has no screen position");
        }
        return document.elementFromPoint(x, y)?.tagName;
      });
      expect(hit).toBe("CANVAS");
      await page.locator(".sun-guide-label").tap({ trial: true });
      await page.screenshot({
        path: testInfo.outputPath(`jupiter-${size}.png`),
      });
      // The facts are one tap away, and the next flight makes the card short
      // again.
      await card
        .getByRole("button", { name: "Expand selected body details" })
        .tap();
      await expect(card).not.toHaveClass(/is-collapsed/u);
      await flyTo(page, scene, "Saturn");
      await expect(card).toHaveClass(/is-collapsed/u);
    });

    test("the navigation map is a Map chip that opens and travels", async ({
      page,
    }) => {
      test.setTimeout(90_000);
      const scene = await openExplorer(page);
      const map = page.locator(".reality-navigation-map");
      const chip = map.locator("summary");
      await expect(chip).toHaveText("Map");
      await expect(chip).toBeVisible();
      await expect(map).toHaveJSProperty("open", false);
      const travel = page.getByRole("button", { name: "Travel" });
      await expect(travel).toBeHidden();
      await chip.tap();
      await expect(map).toHaveJSProperty("open", true);
      await page
        .getByRole("combobox", { name: "Navigation destination" })
        .selectOption("saturn");
      await travel.tap();
      await expect(scene).toHaveAttribute(
        "data-camera-transition-phase",
        "settled",
        { timeout: 30_000 },
      );
      await expect(scene).toHaveAttribute("data-focus-body", "saturn");
    });

    test("the Sun guide label stays under the card, above the time controls", async ({
      page,
    }) => {
      test.setTimeout(90_000);
      const scene = await openExplorer(page);
      await flyTo(page, scene, "Uranus");
      await page
        .getByRole("button", { name: "Expand selected body details" })
        .tap();
      await expect(page.locator(".sun-guide-label")).toBeAttached();
      await expect.poll(() => sunLabelPlacement(page)).toEqual(uranusSunLabel);
    });
  });
}

test.describe("desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the Sun guide label stays under the card, above the time controls", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto("/");
    await expect(page.locator("canvas.major-body-layer")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Pause" }).click();
    const scene = page.getByRole("img", {
      name: /Physics-driven Solar System/u,
    });
    await flyTo(page, scene, "Uranus");
    await expect(page.locator(".selected-body-detail")).not.toHaveClass(
      /is-collapsed/u,
    );
    await expect.poll(() => sunLabelPlacement(page)).toEqual(UNDER_CARD);
  });
});
