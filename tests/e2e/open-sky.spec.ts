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
      if (stepId === "jupiter") {
        // A centred Jupiter sits at 512 px, under the card that ends at
        // 542 px: the picture has moved it into the open sky.
        const { panelRight } = await panelRightAndSceneWidth(
          sceneOf(page),
          tour,
        );
        expect(
          Number(await jupiterLabel.getAttribute("data-screen-x")),
        ).toBeGreaterThan(panelRight);
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
  const card = page.locator(".selected-body-detail");
  await expect(card).toBeVisible();
  const width = (await scene.boundingBox())?.width ?? Number.NaN;
  // Framed to fit, Jupiter's left rim reaches under the card, so the
  // picture moves it into the open sky.
  await expect(async () => {
    const disc = await bodyDisc(page, "jupiter");
    expect(disc.x - disc.radius).toBeGreaterThan(
      (await boxInScene(scene, card)).right,
    );
  }).toPass({ timeout: 15_000 });
  // One step out, the whole disc is clear of the card at the centre.
  await page.getByRole("button", { name: "Zoom out" }).click();
  await expect(async () => {
    const disc = await bodyDisc(page, "jupiter");
    expect(width / 2 - disc.radius).toBeGreaterThan(
      (await boxInScene(scene, card)).right,
    );
  }).toPass({ timeout: 15_000 });
  await expect(scene).toHaveAttribute("data-lens-shift-px", "0.000");
  expect(
    Number(await bodyLabel(page, "jupiter").getAttribute("data-screen-x")),
  ).toBeCloseTo(width / 2, 0);
});

// The scene's size and the shift it reports. A scene without the shift
// attribute fails, so a missing report never reads as "no shift".
async function lensFacts(
  scene: Locator,
): Promise<{ width: number; height: number; shiftPx: number }> {
  return scene.evaluate((element) => {
    const shift = element.getAttribute("data-lens-shift-px");
    if (shift === null) {
      throw new Error("The scene does not report data-lens-shift-px");
    }
    return {
      width: element.clientWidth,
      height: element.clientHeight,
      shiftPx: Number(shift),
    };
  });
}

// A panel's box in scene pixels.
async function boxInScene(
  scene: Locator,
  panel: Locator,
): Promise<{ left: number; right: number; top: number; bottom: number }> {
  const sceneBox = await scene.boundingBox();
  const panelBox = await panel.boundingBox();
  if (sceneBox === null || panelBox === null) {
    throw new Error("The scene or the panel has no box");
  }
  return {
    left: panelBox.x - sceneBox.x,
    right: panelBox.x + panelBox.width - sceneBox.x,
    top: panelBox.y - sceneBox.y,
    bottom: panelBox.y + panelBox.height - sceneBox.y,
  };
}

// A body's drawn disc: its centre and radius on screen, from its label.
async function bodyDisc(
  page: Page,
  bodyId: string,
): Promise<{ x: number; y: number; radius: number }> {
  const label = bodyLabel(page, bodyId);
  const values = await Promise.all(
    ["data-screen-x", "data-screen-y", "data-radius-pixels"].map(
      async (name) => {
        const value = await label.getAttribute(name);
        if (value === null) {
          throw new Error(`The ${bodyId} label has no ${name}`);
        }
        return Number(value);
      },
    ),
  );
  const [x, y, radius] = values as [number, number, number];
  return { x, y, radius };
}

// Waits for the render loop to draw this many more frames.
async function frames(page: Page, count: number): Promise<void> {
  await page.evaluate(
    (frameCount) =>
      new Promise<void>((resolve) => {
        let left = frameCount;
        const tick = (): void => {
          left -= 1;
          if (left <= 0) {
            resolve();
          } else {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      }),
    count,
  );
}

// The label of a small subject reaches this far below its centre: 24 px of
// offset plus half a label box, with room to spare.
const LABEL_REACH_PX = 40;

const TOUR_SUBJECTS = [
  { stepId: "earth", bodyId: "earth", fillsFrame: false },
  { stepId: "moon-gap", bodyId: "earth", fillsFrame: true },
  { stepId: "sun-atmosphere", bodyId: "sun", fillsFrame: false },
  { stepId: "sun-from-mars", bodyId: "sun", fillsFrame: false },
  { stepId: "jupiter", bodyId: "jupiter", fillsFrame: true },
] as const;

for (const viewport of [
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
]) {
  test(`at ${String(viewport.width)} x ${String(viewport.height)} the tour keeps each subject on the canvas and out from under the card`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator("canvas.major-body-layer")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Scale tour" }).click();
    const tour = page.getByRole("dialog", {
      name: "Scale of the Solar System tour",
    });
    const scene = sceneOf(page);
    let previousFocusDistance: string | null = null;
    for (const [index, subject] of TOUR_SUBJECTS.entries()) {
      await expect(tour).toHaveAttribute("data-tour-step", subject.stepId);
      // Reduced motion cuts to each shot: wait for the camera to take it.
      await expect
        .poll(async () => scene.getAttribute("data-focus-distance-au"))
        .not.toBe(previousFocusDistance);
      previousFocusDistance = await scene.getAttribute(
        "data-focus-distance-au",
      );
      await expect(async () => {
        const { width, height, shiftPx } = await lensFacts(scene);
        const disc = await bodyDisc(page, subject.bodyId);
        const card = await boxInScene(scene, tour);
        // The whole disc stays on the canvas.
        expect(disc.x - disc.radius).toBeGreaterThanOrEqual(0);
        expect(disc.x + disc.radius).toBeLessThanOrEqual(width);
        if (subject.fillsFrame && shiftPx > 0) {
          // The shot frames a circle as tall as the scene (the Moon's
          // orbit, Jupiter's moons): a moved picture keeps all of it.
          expect(disc.x + height / 2).toBeLessThanOrEqual(width + 0.001);
        }
        if (subject.stepId === "moon-gap") {
          const moon = await bodyDisc(page, "moon");
          expect(moon.x - moon.radius).toBeGreaterThanOrEqual(0);
          expect(moon.x + moon.radius).toBeLessThanOrEqual(width);
        }
        const rowsReach = subject.fillsFrame
          ? height / 2
          : Math.max(disc.radius, LABEL_REACH_PX);
        if (card.top >= height / 2 + rowsReach) {
          // A card below the subject and its label covers neither.
          expect(shiftPx).toBe(0);
        }
        const cardCoversDisc =
          card.top < height / 2 + disc.radius &&
          card.right > width / 2 - disc.radius;
        if (
          !subject.fillsFrame &&
          cardCoversDisc &&
          width - card.right >= 2 * disc.radius * 1.05
        ) {
          // There is room beside the card, so the whole disc is there.
          expect(disc.x - disc.radius).toBeGreaterThanOrEqual(card.right);
        }
      }).toPass({ timeout: 15_000 });
      if (index < TOUR_SUBJECTS.length - 1) {
        await tour.getByRole("button", { name: "Next" }).click();
      }
    }
  });
}

test.describe("at 1024 x 768 with Jupiter selected", () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  async function selectedJupiter(page: Page): Promise<{
    scene: Locator;
    card: Locator;
    openSkyShiftPx: number;
    settledShiftPx: number;
  }> {
    await pausedScene(page);
    const scene = await focusBody(page, "Jupiter");
    const card = page.locator(".selected-body-detail");
    await expect(card).toBeVisible();
    const { width } = await lensFacts(scene);
    const { right } = await boxInScene(scene, card);
    // Jupiter's disc fits in the open sky right of the card.
    const openSkyShiftPx = (right + width) / 2 - width / 2;
    await expect
      .poll(async () => (await lensFacts(scene)).shiftPx)
      .toBeCloseTo(openSkyShiftPx, 0);
    const settledShiftPx = (await lensFacts(scene)).shiftPx;
    return { scene, card, openSkyShiftPx, settledShiftPx };
  }

  test("the Display panel keeps Jupiter from being pushed under it", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const { scene, openSkyShiftPx } = await selectedJupiter(page);
    await page.getByRole("button", { name: "Display" }).click();
    const display = page.locator(".display-panel");
    await expect(display).toBeVisible();
    const { width } = await lensFacts(scene);
    // The disc is wider than the gap between the card and the panel, so it
    // stays centred rather than move under the panel.
    await expect.poll(async () => (await lensFacts(scene)).shiftPx).toBe(0);
    await expect
      .poll(async () => (await bodyDisc(page, "jupiter")).x)
      .toBeCloseTo(width / 2, 0);
    await page.getByRole("button", { name: "Display" }).click();
    await expect(display).toBeHidden();
    await expect
      .poll(async () => (await lensFacts(scene)).shiftPx)
      .toBeCloseTo(openSkyShiftPx, 0);
  });

  test("a drag holds the picture still until the finger lifts", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const { scene, card, settledShiftPx } = await selectedJupiter(page);
    const sceneBox = await scene.boundingBox();
    if (sceneBox === null) throw new Error("The scene has no box");
    // Press on open sky above Jupiter and start a drag.
    const startX = sceneBox.x + sceneBox.width - 80;
    const startY = sceneBox.y + 80;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 20, startY + 10, { steps: 3 });
    // The card collapses during the drag, from the keyboard.
    await card.getByRole("button", { name: "Collapse" }).focus();
    await page.keyboard.press("Enter");
    await expect(card).toHaveClass(/is-collapsed/u);
    await frames(page, 20);
    expect((await lensFacts(scene)).shiftPx).toBe(settledShiftPx);
    await page.mouse.up();
    await expect.poll(async () => (await lensFacts(scene)).shiftPx).toBe(0);
  });

  test("under reduced motion the picture moves in one step", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await pausedScene(page);
    const scene = sceneOf(page);
    // Record every shift the scene reports from here on.
    await scene.evaluate((element) => {
      const seen: string[] = [];
      Object.assign(window, { lensShiftsSeen: seen });
      new MutationObserver(() => {
        const value = element.getAttribute("data-lens-shift-px");
        if (value !== null && seen.at(-1) !== value) seen.push(value);
      }).observe(element, { attributeFilter: ["data-lens-shift-px"] });
    });
    // Reduced motion cuts to Jupiter with no flight.
    const focus = page.getByRole("combobox", { name: "Focus" });
    await focus.fill("Jupiter");
    await focus.press("Enter");
    await expect(scene).toHaveAttribute("data-focus-body", "jupiter");
    const card = page.locator(".selected-body-detail");
    await expect(card).toBeVisible();
    const { width } = await lensFacts(scene);
    const { right } = await boxInScene(scene, card);
    await expect
      .poll(async () => (await lensFacts(scene)).shiftPx)
      .toBeCloseTo((right + width) / 2 - width / 2, 0);
    const seen = await page.evaluate(
      () => (window as unknown as { lensShiftsSeen: string[] }).lensShiftsSeen,
    );
    // From centred straight to the open sky, with no step in between.
    expect(seen.map(Number).filter((shift) => shift !== 0)).toHaveLength(1);
  });
});

test("after Full screen and Exit at a planet step the hidden card moves nothing", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("canvas.major-body-layer")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Scale tour" }).click();
  const tour = page.getByRole("dialog", {
    name: "Scale of the Solar System tour",
  });
  await expect(tour).toHaveAttribute("data-tour-step", "earth");
  const scene = sceneOf(page);
  await tour.getByRole("button", { name: "Full screen" }).click();
  const app = page.locator("main.app-shell");
  await expect(app).toHaveAttribute("data-immersive-mode", "true");
  // The tour card covers Earth, so the picture has moved.
  await expect
    .poll(async () => (await lensFacts(scene)).shiftPx)
    .toBeGreaterThan(0);
  await tour.getByRole("button", { name: "Exit" }).click();
  await expect(tour).toBeHidden();
  await expect(app).toHaveAttribute("data-immersive-mode", "true");
  // Earth stays selected, but full screen hides its card.
  await expect(scene).toHaveAttribute("data-selected-body", "earth");
  await expect(page.locator(".selected-body-detail")).toBeHidden();
  const { width } = await lensFacts(scene);
  await expect.poll(async () => (await lensFacts(scene)).shiftPx).toBe(0);
  await expect
    .poll(async () => (await bodyDisc(page, "earth")).x)
    .toBeCloseTo(width / 2, 0);
});

test("at 1024 x 600 the surface view under the story card keeps its framing", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("canvas.major-body-layer")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Eclipse story" }).click();
  const story = page.getByRole("dialog", {
    name: "12 August 2026 eclipse story",
  });
  await page.getByRole("button", { name: "Next" }).click();
  await expect(story).toHaveAttribute(
    "data-tour-step",
    "london-before-contact",
  );
  const scene = sceneOf(page);
  await expect(scene).toHaveAttribute("data-surface-observer-body", "earth", {
    timeout: 30_000,
  });
  const { width, height } = await lensFacts(scene);
  const card = await boxInScene(scene, story);
  // The card reaches past the centre and across its rows, so without the
  // surface view's own framing the picture would move.
  expect(card.right).toBeGreaterThan(width / 2);
  expect(card.top).toBeLessThan(height / 2);
  await frames(page, 20);
  expect((await lensFacts(scene)).shiftPx).toBe(0);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`on a ${String(viewport.width)} x ${String(viewport.height)} phone the open card leaves Jupiter centred`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.locator("canvas.major-body-layer")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    const scene = await focusBody(page, "Jupiter");
    const card = page.locator(".selected-body-detail");
    // A phone opens the card short; open it in full.
    await card.getByRole("button", { name: "Expand" }).click();
    await expect(card).not.toHaveClass(/is-collapsed/u);
    const { width, height } = await lensFacts(scene);
    const box = await boxInScene(scene, card);
    // The open card reaches past the centre's rows on this phone.
    expect(box.right).toBeGreaterThan(width * 0.4);
    expect(box.top).toBeLessThan(height / 2 + LABEL_REACH_PX);
    await frames(page, 20);
    expect((await lensFacts(scene)).shiftPx).toBe(0);
    expect((await bodyDisc(page, "jupiter")).x).toBeCloseTo(width / 2, 0);
  });
}

// At 800 x 600 a collapsed card or a minimised tour card still reaches past
// 40% of the width and across the subject's rows: only its state keeps the
// picture centred.
test.describe("at 800 x 600", () => {
  test.use({ viewport: { width: 800, height: 600 } });

  test("a collapsed card leaves Jupiter centred", async ({ page }) => {
    test.setTimeout(90_000);
    await pausedScene(page);
    const scene = await focusBody(page, "Jupiter");
    const card = page.locator(".selected-body-detail");
    await expect(card).toBeVisible();
    await expect
      .poll(async () => (await lensFacts(scene)).shiftPx)
      .toBeGreaterThan(0);
    await card.getByRole("button", { name: "Collapse" }).click();
    await expect(card).toHaveClass(/is-collapsed/u);
    const { width, height } = await lensFacts(scene);
    const box = await boxInScene(scene, card);
    const jupiter = await bodyDisc(page, "jupiter");
    expect(box.right).toBeGreaterThan(width * 0.4);
    expect(box.top).toBeLessThan(height / 2 + jupiter.radius);
    await expect.poll(async () => (await lensFacts(scene)).shiftPx).toBe(0);
    await expect
      .poll(async () => (await bodyDisc(page, "jupiter")).x)
      .toBeCloseTo(width / 2, 0);
  });

  test("a minimised tour card leaves the Jupiter system centred", async ({
    page,
  }) => {
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
    for (const stepId of [
      "earth",
      "moon-gap",
      "sun-atmosphere",
      "sun-from-mars",
    ]) {
      await expect(tour).toHaveAttribute("data-tour-step", stepId);
      await tour.getByRole("button", { name: "Next" }).click();
    }
    await expect(tour).toHaveAttribute("data-tour-step", "jupiter");
    const scene = sceneOf(page);
    await expect
      .poll(async () => (await lensFacts(scene)).shiftPx)
      .toBeGreaterThan(0);
    await tour.getByRole("button", { name: "Minimise" }).click();
    await expect(tour).toHaveAttribute("data-tour-minimised", "true");
    const { width } = await lensFacts(scene);
    // The shot frames the whole height, so the minimised card along the
    // bottom still crosses its rows.
    expect((await boxInScene(scene, tour)).right).toBeGreaterThan(width * 0.4);
    await expect.poll(async () => (await lensFacts(scene)).shiftPx).toBe(0);
    await expect
      .poll(async () => (await bodyDisc(page, "jupiter")).x)
      .toBeCloseTo(width / 2, 0);
  });
});

test.describe("at 1280 x 800", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  for (const name of ["Earth", "Jupiter", "Pluto", "Moon"]) {
    test(`the selected-body card leaves ${name}'s whole disc in the open sky`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await pausedScene(page);
      const scene = await focusBody(page, name);
      const card = page.locator(".selected-body-detail");
      await expect(card).toBeVisible();
      await expect(async () => {
        const { width } = await lensFacts(scene);
        const box = await boxInScene(scene, card);
        const disc = await bodyDisc(page, name.toLowerCase());
        expect(disc.x - disc.radius).toBeGreaterThan(box.right);
        expect(disc.x + disc.radius).toBeLessThanOrEqual(width);
      }).toPass({ timeout: 15_000 });
      if (name === "Moon") {
        // Every Apollo landing-site label on the near side is clear of the
        // card.
        const labels = await page.locator(".apollo-site-label:visible").all();
        expect(labels.length).toBeGreaterThan(0);
        for (const label of labels) {
          expect(await boxesOverlap(label, card)).toBe(false);
        }
      }
    });
  }
});

// The upward shift the scene reports. A scene without it fails, so a missing
// report never reads as "no shift".
async function lensShiftUpPx(scene: Locator): Promise<number> {
  const shift = await scene.getAttribute("data-lens-shift-up-px");
  if (shift === null) {
    throw new Error("The scene does not report data-lens-shift-up-px");
  }
  return Number(shift);
}

test.describe("on a 390 x 844 phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the Scale tour puts Earth and Saturn in the open sky above its card", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator("canvas.major-body-layer")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Scale tour" }).click();
    const tour = page.getByRole("dialog", {
      name: "Scale of the Solar System tour",
    });
    const scene = sceneOf(page);
    for (const stepId of [
      "earth",
      "moon-gap",
      "sun-atmosphere",
      "sun-from-mars",
      "jupiter",
      "jupiter-from-io",
      "earth-from-jupiter",
      "saturn",
    ]) {
      await expect(tour).toHaveAttribute("data-tour-step", stepId);
      if (stepId === "earth" || stepId === "saturn") {
        await expect(async () => {
          const card = await boxInScene(scene, tour);
          const label = bodyLabel(page, stepId);
          const y = Number(await label.getAttribute("data-screen-y"));
          const radius = Number(
            await scene.getAttribute("data-lens-subject-radius-px"),
          );
          // The full-width card crosses the subject, so the picture moves up.
          expect(await lensShiftUpPx(scene)).toBeGreaterThan(0);
          // The subject's centre and label are above the card, and its top
          // stays on the canvas.
          expect(y).toBeLessThan(card.top);
          expect(y - radius).toBeGreaterThanOrEqual(-0.5);
          // Either all of it is above the card, or it has moved up as far
          // as it fits.
          expect(y + radius <= card.top + 0.5 || y - radius <= 0.5).toBe(true);
        }).toPass({ timeout: 15_000 });
        await page.screenshot({
          path: test.info().outputPath(`phone-tour-${stepId}.png`),
        });
      }
      if (stepId !== "saturn") {
        await tour.getByRole("button", { name: "Next" }).click();
      }
    }
  });
});
