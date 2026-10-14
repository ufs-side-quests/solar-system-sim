import { expect, test } from "@playwright/test";

// Surface maps that the scene requests only when a body becomes large enough on
// screen. The Earth night-light map and the Saturn ring profile load when the
// scene is built, so they are not part of this budget.
const SURFACE_MAP_REQUEST =
  /\/textures\/nasa\/(?!earth-night-lights\.|saturn-rings\.)([a-z-]+)\.(?:webp|png)$/u;
const REBOUND_WASM_REQUEST = /\/rebound[^/]*\.wasm(?:\?.*)?$/u;
const HELD_PHYSICS_MS = 5_000;

test("draws no body and requests no surface map before the first physics state", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const surfaceMapRequests: string[] = [];
  page.on("request", (request) => {
    const match = SURFACE_MAP_REQUEST.exec(new URL(request.url()).pathname);
    if (match?.[1] !== undefined) {
      surfaceMapRequests.push(match[1]);
    }
  });
  let releasePhysics = (): void => undefined;
  // The executor runs at once, so releasePhysics resolves this promise.
  const physicsReleased = new Promise<void>((resolve) => {
    releasePhysics = resolve;
  });
  let heldWasmRequests = 0;
  await page.route(REBOUND_WASM_REQUEST, async (route) => {
    heldWasmRequests += 1;
    await physicsReleased;
    await route.continue();
  });

  await page.goto("/");
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  await expect(scene).toHaveAttribute("data-semantic-zoom-level", /.+/u);
  await expect(
    page.getByText("Starting physics", { exact: true }),
  ).toBeVisible();
  const clock = page.locator(".global-simulation-clock");
  const startingClock = await clock.textContent();
  if (startingClock === null) {
    throw new Error("The simulation clock has no text before physics starts");
  }

  // Hold the solver like a slow link does, while the scene draws frames.
  const heldFrames = await page.evaluate(async (heldMs) => {
    const startedAt = performance.now();
    let frames = 0;
    while (performance.now() - startedAt < heldMs) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => {
          resolve();
        }),
      );
      frames += 1;
    }
    return frames;
  }, HELD_PHYSICS_MS);
  expect(heldFrames).toBeGreaterThan(30);
  expect(heldWasmRequests).toBeGreaterThan(0);
  await expect(
    page.getByText("Starting physics", { exact: true }),
  ).toBeVisible();
  await expect(clock).toHaveText(startingClock);

  const bodyLabels = page.locator(".body-label-layer > .body-label");
  await expect(bodyLabels.filter({ visible: true })).toHaveCount(0);
  await expect(
    page.locator(".body-marker-layer > .orrery-marker").filter({
      visible: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.locator('.body-label[data-surface-asset-state="loading"]'),
  ).toHaveCount(0);
  await expect(
    page.locator('.body-label[data-body-rendered="true"]'),
  ).toHaveCount(0);
  expect(surfaceMapRequests).toEqual([]);

  releasePhysics();
  await expect(page.getByText("Starting physics", { exact: true })).toBeHidden({
    timeout: 60_000,
  });
  await expect(clock).not.toHaveText(startingClock);
  const earthLabel = page.locator('.body-label[data-body-id="earth"]');
  await expect(earthLabel).toBeVisible();
  // The Sun is drawn from its own shader, with no surface map to fetch.
  await expect(page.locator('.body-label[data-body-id="sun"]')).toHaveAttribute(
    "data-surface-asset-state",
    "procedural",
  );
  // At the overview Ganymede is far below a pixel, so its map stays unloaded.
  await expect(
    page.locator('.body-label[data-body-id="ganymede"]'),
  ).not.toHaveAttribute("data-surface-asset-state", /loading|loaded/u);
  expect(surfaceMapRequests).not.toContain("ganymede");

  const focus = page.getByRole("combobox", { name: "Focus" });
  await focus.fill("Earth");
  await focus.press("Enter");
  await expect(scene).toHaveAttribute("data-focus-body", "earth");
  await expect(earthLabel).toHaveAttribute(
    "data-surface-asset-state",
    "loaded",
    { timeout: 60_000 },
  );
  expect(surfaceMapRequests).toContain("earth");
  expect(surfaceMapRequests).not.toContain("ganymede");
});
