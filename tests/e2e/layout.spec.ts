import { expect, test } from "@playwright/test";

test("shows direct view-angle actions before advanced camera settings", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("canvas.major-body-layer")).toBeVisible({
    timeout: 30_000,
  });
  const clock = page.locator(".global-simulation-clock");
  await expect(clock).toHaveText(
    /\d{2} [A-Z][a-z]{2} \d{4} · \d{2}:\d{2}:\d{2} UTC/u,
  );
  await expect(clock).toBeInViewport();
  await page.getByRole("button", { name: "Display" }).click();
  await expect(clock).toBeVisible();
  await expect(clock).toBeInViewport();
  await page.getByRole("tab", { name: "Camera" }).click();

  const viewAngles = page.getByRole("group", { name: "View angle" });
  await expect(viewAngles).toBeVisible();
  await expect(viewAngles).toBeInViewport();
  await expect(viewAngles.getByRole("button")).toHaveCount(8);
  await expect(
    viewAngles.getByRole("button", { name: "Day and night" }),
  ).toBeVisible();
  await expect(
    viewAngles.getByRole("button", { name: "3D view" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("combobox", { name: "Observer body" }),
  ).toBeHidden();

  await page.screenshot({
    path: testInfo.outputPath("direct-view-angle-controls.png"),
    fullPage: true,
  });
});

test("keeps the compact controls usable at narrow widths", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Solar System Explorer" }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Focus" })).toBeVisible();
  await expect(
    page.getByRole("slider", { name: "Playback rate" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Reality" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Orrery" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Map" })).toBeVisible();
  const cameraNavigation = page.getByRole("navigation", {
    name: "Camera navigation",
  });
  await expect(cameraNavigation).toBeVisible();
  await expect(page.getByRole("button", { name: "Zoom out" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Scale tour" })).toBeVisible();
  // Do not tear the page down while its WebAssembly worker is still starting.
  // Chromium can otherwise leave the following test's worker startup stalled.
  await expect(page.locator("canvas.major-body-layer")).toBeVisible({
    timeout: 30_000,
  });

  const horizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(0);

  await page.getByRole("button", { name: "Display" }).click();
  await expect(
    page.getByRole("dialog", { name: "Display controls" }),
  ).toBeVisible();
  await expect(cameraNavigation).toBeHidden();
  await expect(
    page.getByRole("region", { name: "Time controls" }),
  ).toBeHidden();
  await page.getByRole("tab", { name: "Camera" }).click();
  await expect(page.getByRole("group", { name: "View angle" })).toBeVisible();
  const controlsOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(controlsOverflow).toBeLessThanOrEqual(0);

  await page.screenshot({
    path: testInfo.outputPath("display-panel-mobile.png"),
    fullPage: true,
  });

  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Display controls" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Display" })).toBeFocused();

  await page.screenshot({
    path: testInfo.outputPath("modern-controls-mobile.png"),
    fullPage: true,
  });

  if (process.env.SOLAR_VISUAL_CAPTURE_DIR !== undefined) {
    await page.screenshot({
      path: `${process.env.SOLAR_VISUAL_CAPTURE_DIR}/solar-compact-mobile.png`,
      fullPage: true,
    });
  }
});

// A phone and a tablet: the Focus box is wide enough to read, its text is
// 16 px so iOS does not zoom the page into it, the chevron sits at its right
// end, the open list covers the date, and nothing covers the view scale or
// cuts off a dock button.
for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
]) {
  const size = `${String(viewport.width)}x${String(viewport.height)}`;
  test.describe(`Focus box and dock at ${size}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: viewport.width < 650 });

    test("the Focus box, its list, the date and the dock fit", async ({
      page,
    }, testInfo) => {
      await page.goto("/");
      await expect(page.locator("canvas.major-body-layer")).toBeVisible({
        timeout: 30_000,
      });
      const focus = page.getByRole("combobox", { name: "Focus" });
      const chevron = page.getByRole("button", { name: "Open focus list" });
      const focusBox = await focus.boundingBox();
      const chevronBox = await chevron.boundingBox();
      if (focusBox === null || chevronBox === null) {
        throw new Error("The Focus box or its chevron has no box");
      }
      expect(focusBox.width).toBeGreaterThanOrEqual(
        Math.min(240, viewport.width / 2),
      );
      expect(
        Math.abs(chevronBox.x - (focusBox.x + focusBox.width)),
      ).toBeLessThanOrEqual(1);
      expect(
        Number.parseFloat(
          await focus.evaluate((input) => getComputedStyle(input).fontSize),
        ),
      ).toBeGreaterThanOrEqual(16);

      const clock = page.locator(".global-simulation-clock");
      const scale = page.locator(".camera-scale");
      if (await scale.isVisible()) {
        const clockBox = await clock.boundingBox();
        const scaleBox = await scale.boundingBox();
        if (clockBox === null || scaleBox === null) {
          throw new Error("The date or the view scale has no box");
        }
        const apart =
          clockBox.x + clockBox.width <= scaleBox.x ||
          scaleBox.x + scaleBox.width <= clockBox.x ||
          clockBox.y + clockBox.height <= scaleBox.y ||
          scaleBox.y + scaleBox.height <= clockBox.y;
        expect(apart).toBe(true);
      }

      const dockOverflow = await page
        .locator(".camera-dock")
        .evaluate((dock) => dock.scrollWidth - dock.clientWidth);
      expect(dockOverflow).toBeLessThanOrEqual(0);
      for (const button of await page
        .locator(".camera-dock-actions button")
        .all()) {
        const overflow = await button.evaluate(
          (element) => element.scrollWidth - element.clientWidth,
        );
        expect(overflow, await button.innerText()).toBeLessThanOrEqual(0);
      }

      await focus.tap();
      await focus.fill("Saturn");
      const popover = page.locator(".focus-popover");
      await expect(popover).toBeVisible();
      const clockBox = await clock.boundingBox();
      const popoverBox = await popover.boundingBox();
      if (clockBox === null || popoverBox === null) {
        throw new Error("The date or the Focus list has no box");
      }
      // Where the list lies over the date, the list is on top. The date
      // takes no pointer events, so hit-testing would skip it: let it take
      // them while the test looks at that point.
      const x = Math.max(clockBox.x, popoverBox.x) + 4;
      const y = Math.max(clockBox.y, popoverBox.y) + 4;
      expect(x).toBeLessThan(clockBox.x + clockBox.width);
      expect(y).toBeLessThan(clockBox.y + clockBox.height);
      const onTop = await page.evaluate(
        ([px, py]) => {
          const date = document.querySelector<HTMLElement>(
            ".global-simulation-clock",
          );
          if (date === null) {
            throw new Error("The date is missing");
          }
          date.style.pointerEvents = "auto";
          const hit = document.elementFromPoint(px ?? 0, py ?? 0);
          date.style.pointerEvents = "";
          return hit?.closest(".focus-popover") !== null;
        },
        [x, y],
      );
      expect(onTop).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`focus-and-dock-${size}.png`),
      });
    });
  });
}

test("on a tablet the flown-to planet's label and the Sun guide are not under the card", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/");
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  await expect(scene).toHaveAttribute("data-rendered-time-seconds", /-?\d+/u, {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const focus = page.getByRole("combobox", { name: "Focus" });
  await focus.fill("Jupiter");
  await focus.press("Enter");
  await expect(scene).toHaveAttribute("data-focus-body", "jupiter");
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
    { timeout: 30_000 },
  );
  const card = page.locator(".selected-body-detail");
  await expect(card).not.toHaveClass(/is-collapsed/u);
  for (const label of [
    page.locator('.body-label[data-body-id="jupiter"]'),
    page.locator(".sun-guide-label"),
  ]) {
    await expect(label).toBeVisible();
    await expect
      .poll(async () => {
        const [labelBox, cardBox] = await Promise.all([
          label.boundingBox(),
          card.boundingBox(),
        ]);
        if (labelBox === null || cardBox === null) {
          return "no box";
        }
        const apart =
          labelBox.x >= cardBox.x + cardBox.width ||
          labelBox.x + labelBox.width <= cardBox.x ||
          labelBox.y >= cardBox.y + cardBox.height ||
          labelBox.y + labelBox.height <= cardBox.y;
        const onScreen = labelBox.x >= 0 && labelBox.x + labelBox.width <= 768;
        return apart && onScreen ? "clear" : "under the card";
      })
      .toBe("clear");
  }
  await page.screenshot({ path: testInfo.outputPath("tablet-jupiter.png") });
});
