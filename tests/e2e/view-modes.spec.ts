import { expect, test } from "@playwright/test";

test("switches between physical, orrery, and schematic views without changing physics state", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(page.locator("canvas.major-body-layer")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Pause" }).click();

  const timeOutput = page.locator(".time-readout output");
  // The frame in progress settles on its exact endpoint after Pause, so the
  // paused time is taken once two consecutive polls read the same value.
  let lastRead: string | null = null;
  await expect
    .poll(
      async () => {
        const previous = lastRead;
        lastRead = await timeOutput.getAttribute("data-time-seconds");
        return lastRead !== null && lastRead === previous;
      },
      { intervals: [250], timeout: 10_000 },
    )
    .toBe(true);
  const pausedTime = await timeOutput.getAttribute("data-time-seconds");
  if (pausedTime === null) {
    throw new Error("Paused simulation time is unavailable");
  }
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  await expect(scene).toHaveAttribute("data-view-mode", "reality");
  await expect(scene).toHaveAttribute("data-tactical-overlay-visible", "false");
  const realityButton = page.getByRole("button", { name: "Reality" });
  await realityButton.focus();
  await expect(
    page.getByRole("tooltip", {
      name: /True physical sizes and positions/u,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Orrery" }).hover();
  await expect(
    page.getByRole("tooltip", {
      name: /Physical positions with enlarged bodies/u,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Map" }).hover();
  await expect(
    page.getByRole("tooltip", {
      name: /schematic navigation map/u,
    }),
  ).toBeVisible();
  const earth = page.locator('[data-body-id="earth"]');
  const moon = page.locator('[data-body-id="moon"]');
  const earthRadiusInReality = Number(
    await earth.getAttribute("data-displayed-radius-au"),
  );
  expect(earthRadiusInReality).toBeCloseTo(6_371_008.4 / 149_597_870_700, 12);
  await expect(earth).toHaveAttribute("data-body-rendered", "false");
  await expect(moon).toHaveAttribute("data-body-rendered", "false");
  await expect(scene).toHaveAttribute("data-known-moon-point-count", "0");
  await page.screenshot({
    path: testInfo.outputPath("physical-reality.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Display" }).click();
  const bodySizeBoost = page.getByRole("slider", { name: "Body size boost" });
  await expect(bodySizeBoost).toHaveCount(0);
  await expect(
    page.getByRole("checkbox", { name: "Asteroids" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Orrery" }).click();
  await expect(scene).toHaveAttribute("data-view-mode", "orrery");
  await expect
    .poll(async () =>
      Number(await earth.getAttribute("data-displayed-radius-au")),
    )
    .toBeGreaterThan(earthRadiusInReality);
  await expect(scene).toHaveAttribute("data-known-moon-point-count", "437");
  await expect(scene).toHaveAttribute("data-orbit-guide-count", "0");
  await page.getByRole("button", { name: "Display" }).click();
  await expect(bodySizeBoost).toBeVisible();
  await page.getByRole("tab", { name: "Guides" }).click();
  const orbitGuides = page.getByRole("checkbox", { name: "Orbit guides" });
  await expect(orbitGuides).not.toBeChecked();
  await orbitGuides.check();
  await expect
    .poll(async () =>
      Number(await scene.getAttribute("data-orbit-guide-count")),
    )
    .toBeGreaterThanOrEqual(8);
  await page.getByRole("button", { name: "Close" }).click();
  await expect
    .poll(async () =>
      Number(await scene.getAttribute("data-orrery-marker-count")),
    )
    .toBeGreaterThan(0);
  await page.screenshot({
    path: testInfo.outputPath("orrery-view.png"),
    fullPage: true,
  });
  await expect(timeOutput).toHaveAttribute("data-time-seconds", pausedTime);

  const focus = page.getByRole("combobox", { name: "Focus" });
  const sequenceBeforeEarth = await scene.getAttribute(
    "data-camera-transition-sequence",
  );
  await focus.fill("Earth");
  await focus.press("Enter");
  await expect
    .poll(async () => scene.getAttribute("data-camera-transition-sequence"))
    .not.toBe(sequenceBeforeEarth);
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
    {
      timeout: 15_000,
    },
  );
  await expect(scene).toHaveAttribute("data-tactical-overlay-visible", "false");
  await page.getByRole("button", { name: "Display" }).click();
  await page.getByRole("tab", { name: "Guides" }).click();
  const tacticalOverlay = page.getByRole("checkbox", {
    name: "Tactical overlay",
  });
  await expect(tacticalOverlay).not.toBeChecked();
  await tacticalOverlay.check();
  await expect(scene).toHaveAttribute("data-tactical-overlay-visible", "true");
  await page.getByRole("tab", { name: "Camera" }).click();
  const orientation = page.getByRole("group", { name: "View angle" });
  const sequenceBeforeVelocity = await scene.getAttribute(
    "data-camera-transition-sequence",
  );
  const distanceBeforeVelocity = Number(
    await scene.getAttribute("data-camera-distance-au"),
  );
  await orientation.getByRole("button", { name: "Along path" }).click();
  await expect(scene).toHaveAttribute(
    "data-camera-transition-sequence",
    sequenceBeforeVelocity ?? "",
  );
  await expect(scene).toHaveAttribute("data-camera-orientation", "velocity");
  await expect(scene).toHaveAttribute(
    "data-orientation-transition-phase",
    "settled",
    {
      timeout: 5_000,
    },
  );
  expect(
    Number(await scene.getAttribute("data-camera-distance-au")),
  ).toBeCloseTo(distanceBeforeVelocity, 8);
  await expect(scene).toHaveAttribute("data-camera-tracking", "continuous", {
    timeout: 10_000,
  });
  await expect(scene).toHaveAttribute("data-semantic-zoom-level", "surface");
  await page
    .getByRole("combobox", { name: "Zoom preset" })
    .selectOption("detail");
  await expect(scene).toHaveAttribute("data-semantic-zoom-level", "surface");
  await page
    .getByRole("combobox", { name: "Zoom preset" })
    .selectOption("close");
  const cameraDirectionBefore = await scene.getAttribute(
    "data-camera-direction",
  );
  const timeBeforeStep = await timeOutput.getAttribute("data-time-seconds");
  expect(timeBeforeStep).toMatch(/^-?\d/u);
  await page.getByRole("button", { name: "Step forward" }).click();
  await expect
    .poll(async () => scene.getAttribute("data-camera-direction"))
    .not.toBe(cameraDirectionBefore);
  // The readout is published at most every 100 ms, so the camera can move
  // before the stepped time reaches it.
  await expect(timeOutput).not.toHaveAttribute(
    "data-time-seconds",
    timeBeforeStep ?? "",
  );
  const trackedTime = await timeOutput.getAttribute("data-time-seconds");

  await page.getByRole("tab", { name: "Guides" }).click();
  const referenceFrame = page.getByRole("combobox", {
    name: "Reference frame",
  });
  await referenceFrame.selectOption("parent-relative");
  await expect(scene).toHaveAttribute(
    "data-reference-frame",
    "parent-relative",
  );
  await page.screenshot({
    path: testInfo.outputPath("tracked-earth.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Map" }).click();
  await page.getByRole("button", { name: "Close" }).click();
  const map = page.getByRole("region", {
    name: /Schematic Solar System map/u,
  });
  await expect(map).toBeVisible();
  await page.getByRole("button", { name: "Mars", exact: true }).click();
  await expect(focus).toHaveValue("Mars");
  await expect(
    page.getByRole("button", { name: "Mars", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Earth", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(timeOutput).toHaveAttribute(
    "data-time-seconds",
    trackedTime ?? "0",
  );
  await page.screenshot({
    path: testInfo.outputPath("schematic-map.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await realityButton.focus();
  const mobileTooltip = page.locator("#view-mode-reality-tooltip");
  await expect(mobileTooltip).toBeVisible();
  const mobileTooltipBox = await mobileTooltip.boundingBox();
  expect(mobileTooltipBox).not.toBeNull();
  expect(mobileTooltipBox?.x).toBeGreaterThanOrEqual(0);
  expect(
    (mobileTooltipBox?.x ?? 0) + (mobileTooltipBox?.width ?? 0),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: testInfo.outputPath("view-mode-tooltip-mobile.png"),
    animations: "disabled",
  });
});

test("draws Orrery bodies in their true size order", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(page.locator("canvas.major-body-layer")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Pause" }).click();
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  const displayedRadii = async (
    bodyIds: readonly string[],
  ): Promise<number[]> =>
    Promise.all(
      bodyIds.map(async (bodyId) =>
        Number(
          await page
            .locator(`[data-body-id="${bodyId}"]`)
            .getAttribute("data-displayed-radius-au"),
        ),
      ),
    );
  const expectLargestFirst = async (bodyIds: readonly string[]) => {
    await expect
      .poll(async () => {
        const radii = await displayedRadii(bodyIds);
        return radii.every(
          (radius, index) =>
            Number.isFinite(radius) &&
            radius > 0 &&
            (index === 0 || radius < (radii[index - 1] ?? 0)),
        );
      })
      .toBe(true);
  };

  await page.getByRole("button", { name: "Orrery" }).hover();
  await expect(
    page.getByRole("tooltip", {
      name: /Sizes are squeezed so small worlds stay visible\. The real Sun is about 10 times wider than Jupiter and 109 times wider than Earth\./u,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Orrery" }).click();
  await expect(scene).toHaveAttribute("data-view-mode", "orrery");
  // In the overview the Moon and the large moons would sit inside their
  // planets, so they are not drawn.
  for (const moonId of ["moon", "callisto", "titan", "charon"]) {
    await expect(page.locator(`[data-body-id="${moonId}"]`)).toHaveAttribute(
      "data-body-rendered",
      "false",
    );
  }
  await expect
    .poll(async () =>
      Number(await scene.getAttribute("data-known-moon-point-hidden-count")),
    )
    .toBeGreaterThan(0);
  await expectLargestFirst([
    "sun",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "earth",
    "venus",
    "mars",
    "mercury",
    "pluto",
  ]);
  await page.screenshot({
    path: testInfo.outputPath("orrery-size-order.png"),
  });

  const focus = page.getByRole("combobox", { name: "Focus" });
  await focus.fill("Jupiter");
  await focus.press("Enter");
  await expect(scene).toHaveAttribute("data-focus-body", "jupiter");
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
    { timeout: 20_000 },
  );
  await expectLargestFirst([
    "jupiter",
    "saturn",
    "earth",
    "ganymede",
    "callisto",
    "io",
    "europa",
  ]);
  await page.screenshot({
    path: testInfo.outputPath("orrery-jupiter-focus.png"),
  });

  for (const [focusName, focusId, largestFirst] of [
    ["Earth", "earth", ["jupiter", "earth", "venus", "moon"]],
    ["Pluto", "pluto", ["jupiter", "earth", "pluto", "charon"]],
  ] as const) {
    await focus.fill(focusName);
    await focus.press("Enter");
    await expect(scene).toHaveAttribute("data-focus-body", focusId);
    await expect(scene).toHaveAttribute(
      "data-camera-transition-phase",
      "settled",
      { timeout: 20_000 },
    );
    await expect(
      page.locator(`[data-body-id="${largestFirst[3]}"]`),
    ).toHaveAttribute("data-body-rendered", "true");
    await expectLargestFirst(largestFirst);
    await page.screenshot({
      path: testInfo.outputPath(`orrery-${focusId}-focus.png`),
    });
  }
});

test("the map puts a focused planet in the open sky, on its own orbit", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.locator("canvas.major-body-layer")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const focus = page.getByRole("combobox", { name: "Focus" });
  await focus.fill("Jupiter");
  await focus.press("Enter");
  await page.getByRole("button", { name: "Map" }).click();
  const map = page.getByRole("region", {
    name: /Schematic Solar System map/u,
  });
  await expect(map).toBeVisible();
  const centreOf = async (
    locator: ReturnType<typeof map.locator>,
  ): Promise<{ x: number; y: number; width: number; height: number }> => {
    const box = await locator.boundingBox();
    if (box === null) throw new Error("A map element has no box");
    return {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
      width: box.width,
      height: box.height,
    };
  };
  const jupiter = await centreOf(
    map
      .getByRole("button", { name: "Jupiter", exact: true })
      .locator(".schematic-dot"),
  );
  const sun = await centreOf(
    map
      .getByRole("button", { name: "Sun", exact: true })
      .locator(".schematic-dot"),
  );
  const mapBox = await map.boundingBox();
  const card = await page.locator(".selected-body-detail").boundingBox();
  const dock = await page.locator(".timeline-dock").boundingBox();
  if (mapBox === null || card === null || dock === null) {
    throw new Error("The map, the card or the time controls have no box");
  }
  // Each dot sits a few px right of its place, inside its button, so
  // places match within 8 px.
  const near = (a: number, b: number): void => {
    expect(Math.abs(a - b)).toBeLessThan(8);
  };
  // Jupiter is at the centre of the map, clear of the card and the time
  // controls.
  near(jupiter.x, mapBox.x + mapBox.width / 2);
  near(jupiter.y, mapBox.y + mapBox.height / 2);
  expect(jupiter.x).toBeGreaterThan(card.x + card.width);
  expect(jupiter.y).toBeLessThan(dock.y);
  // Jupiter's dot lies on its drawn orbit round the Sun's dot.
  const orbit = await centreOf(
    map.locator(".schematic-orbits circle.is-selected"),
  );
  near(orbit.x, sun.x);
  near(orbit.y, sun.y);
  near(Math.hypot(jupiter.x - sun.x, jupiter.y - sun.y), orbit.width / 2);
  await page.screenshot({ path: testInfo.outputPath("map-jupiter.png") });
});
