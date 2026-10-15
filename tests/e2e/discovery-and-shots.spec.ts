import { expect, test } from "@playwright/test";

async function selectFocus(
  focus: import("@playwright/test").Locator,
  label: string,
): Promise<void> {
  await focus.fill(label);
  await focus.press("Enter");
}

test("renders Discovery One and presents every cinematic shot", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.goto("/");
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  await expect(scene).toHaveAttribute(
    "data-rendered-time-seconds",
    /-?\d+(?:\.\d+)?/u,
    { timeout: 30_000 },
  );
  await expect(scene).not.toHaveAttribute(
    "data-discoveryone-model-loaded",
    "true",
  );

  // An unfound easter egg is selected by its full name only.
  await selectFocus(
    page.getByRole("combobox", { name: "Focus" }),
    "Discovery One (fictional)",
  );
  await expect(scene).toHaveAttribute("data-focus-body", "discovery-one");
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
    { timeout: 25_000 },
  );
  await expect(scene).toHaveAttribute(
    "data-discovery-one-visual-model",
    "cc-by-sketchfab-licensed-glb",
  );
  await expect(scene).toHaveAttribute(
    "data-discoveryone-model-loaded",
    "true",
    { timeout: 30_000 },
  );
  await expect(scene).toHaveAttribute(
    "data-discovery-one-geometry-visible",
    "true",
  );
  // GLB textures arrive after the quality profile is applied; they still
  // take its anisotropy.
  // The test browser (Chrome with WebGL) supports anisotropic filtering, so
  // the profile's anisotropy is above 1; at 1 a model texture left at the
  // default could not be told apart.
  const sceneAnisotropy = Number(
    await scene.getAttribute("data-texture-anisotropy"),
  );
  expect(sceneAnisotropy).toBeGreaterThan(1);
  await expect(scene).toHaveAttribute(
    "data-discoveryone-model-texture-anisotropy",
    String(sceneAnisotropy),
  );
  await expect(page.getByText("140.1 m long", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Display" }).click();
  await page.getByRole("tab", { name: "Camera" }).click();
  await page
    .getByRole("combobox", { name: "Zoom preset" })
    .selectOption("close");
  await page.getByRole("button", { name: "Close" }).click();
  await page.screenshot({
    path: testInfo.outputPath("discovery-one-focus.png"),
    animations: "disabled",
  });

  const shots = [
    ["Earth in daylight", "earth", "reality"],
    ["Saturn and its rings", "saturn", "reality"],
    ["Jupiter in daylight", "jupiter", "reality"],
    ["Moon in sunlight", "moon", "reality"],
    ["Voyager beyond the planets", "voyager-1", "reality"],
    ["Sun from Mercury", "mercury", "reality"],
    ["Planets racing round the Sun", "sun", "orrery"],
  ] as const;
  for (const [shotName, expectedFocus, expectedViewMode] of shots) {
    await page.getByRole("button", { name: "Display" }).click();
    await page.getByRole("tab", { name: "Camera" }).click();
    const shotButton = page.getByRole("button", {
      name: shotName,
      exact: true,
    });
    await expect(shotButton).toBeVisible();
    await shotButton.click();
    await expect(scene).toHaveAttribute("data-focus-body", expectedFocus, {
      timeout: 15_000,
    });
    await expect(scene).toHaveAttribute("data-view-mode", expectedViewMode);
    await expect(scene).toHaveAttribute(
      "data-camera-transition-phase",
      "settled",
      { timeout: 25_000 },
    );
    await expect(page.getByText(/Physics engine failed/u)).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(
        `${shotName.toLowerCase().replaceAll(" ", "-")}.png`,
      ),
      animations: "disabled",
    });
  }
});

test("one tap from the first screen sets the planets racing round the Sun", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  await expect(scene).toHaveAttribute(
    "data-rendered-time-seconds",
    /-?\d+(?:\.\d+)?/u,
    { timeout: 30_000 },
  );
  await expect(scene).toHaveAttribute("data-view-mode", "reality");
  await expect(scene).toHaveAttribute("data-orbit-guide-count", "0");

  await page
    .getByRole("button", { name: "Planets racing", exact: true })
    .click();

  await expect(scene).toHaveAttribute("data-view-mode", "orrery");
  await expect(scene).toHaveAttribute("data-focus-body", "sun");
  await expect
    .poll(async () =>
      Number(await scene.getAttribute("data-orbit-guide-count")),
    )
    .toBeGreaterThan(0);
  await expect(page.locator(".cinematic-shot-caption")).toContainText(
    "Closer planets go round faster. Watch Mercury lap Earth.",
  );
  const timeOutput = page.locator(".time-readout output");
  // The race runs from the snapshot epoch.
  const raceDays =
    Number(await timeOutput.getAttribute("data-time-seconds")) / 86_400;
  expect(raceDays).toBeGreaterThanOrEqual(0);
  expect(raceDays).toBeLessThan(120);
  await expect(scene).toHaveAttribute("data-planet-trails-visible", "true");
  await expect(page.locator(".run-status")).toContainText(
    "30 days/s requested",
  );
  const startTime = Number(await timeOutput.getAttribute("data-time-seconds"));
  await page.screenshot({
    path: testInfo.outputPath("planets-racing-0s.png"),
    animations: "disabled",
  });
  await expect
    .poll(
      async () =>
        (Number(await timeOutput.getAttribute("data-time-seconds")) -
          startTime) /
        86_400,
      { timeout: 10_000 },
    )
    .toBeGreaterThan(60);
  await page.screenshot({
    path: testInfo.outputPath("planets-racing-10s.png"),
    animations: "disabled",
  });
  await expect(page.getByText(/Simulation stopped/u)).toHaveCount(0);
});

async function startPlanetsRacing(
  page: import("@playwright/test").Page,
): Promise<import("@playwright/test").Locator> {
  await page.goto("/");
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  await expect(scene).toHaveAttribute(
    "data-rendered-time-seconds",
    /-?\d+(?:\.\d+)?/u,
    { timeout: 30_000 },
  );
  await page
    .getByRole("button", { name: "Planets racing", exact: true })
    .click();
  await expect(scene).toHaveAttribute("data-view-mode", "orrery");
  await expect(page.locator(".cinematic-shot-caption")).toBeVisible();
  return scene;
}

type RaceSample = Readonly<{
  atMs: number;
  days: number;
  seeking: boolean;
  outside: boolean;
}>;

test("the planets race starts at once from any date and repeats from the epoch", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  const timeOutput = page.locator(".time-readout output");
  await expect(timeOutput).toHaveAttribute("data-time-seconds", /\d/u, {
    timeout: 30_000,
  });
  const simulationDays = async (): Promise<number> =>
    Number(await timeOutput.getAttribute("data-time-seconds")) / 86_400;
  // Move the clock well away from the epoch first.
  await page.getByRole("slider", { name: "Playback rate" }).fill("5");
  await expect(
    page.getByText("30 days / second", { exact: true }),
  ).toBeVisible();
  await expect.poll(simulationDays, { timeout: 30_000 }).toBeGreaterThan(200);
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Run forward" })).toBeVisible();
  expect(await simulationDays()).toBeGreaterThan(200);

  // Sample the clock on every animation frame from the tap onward.
  await page.evaluate(() => {
    const samples: RaceSample[] = [];
    (window as unknown as { raceSamples: RaceSample[] }).raceSamples = samples;
    const sample = (): void => {
      const output = document.querySelector(".time-readout output");
      const validity = document.querySelector(".model-validity");
      samples.push({
        atMs: performance.now(),
        days: Number(output?.getAttribute("data-time-seconds")) / 86_400,
        seeking:
          document
            .querySelector(".run-status")
            ?.textContent.startsWith("Seeking") === true,
        outside:
          validity?.getAttribute("data-outside-validated-window") === "true",
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    // Every time the clock shows, including one shown for less than a
    // frame: the time it showed just before each fall back to the epoch
    // after the race started.
    const loopEnds: number[] = [];
    (window as unknown as { raceLoopEnds: number[] }).raceLoopEnds = loopEnds;
    const output = document.querySelector(".time-readout output");
    if (output === null) {
      throw new Error("The clock readout is missing");
    }
    let raceStarted = false;
    new MutationObserver((records) => {
      const shownSeconds = [
        ...records.map((record) => Number(record.oldValue)),
        Number(output.getAttribute("data-time-seconds")),
      ];
      for (const [index, seconds] of shownSeconds.entries()) {
        const previousSeconds = shownSeconds[index - 1];
        if (previousSeconds === undefined || seconds >= 86_400) {
          continue;
        }
        if (raceStarted && previousSeconds >= 86_400) {
          loopEnds.push(previousSeconds);
        }
        raceStarted = true;
      }
    }).observe(output, {
      attributes: true,
      attributeFilter: ["data-time-seconds"],
      attributeOldValue: true,
    });
  });
  const tappedAtMs = await page.evaluate(() => performance.now());
  await page
    .getByRole("button", { name: "Planets racing", exact: true })
    .click();
  // One loop is 360 days at 30 days per second, about 12 seconds on an idle
  // machine; wait for the real loop (a sample at the loop end followed by
  // one back at the epoch) rather than a fixed time.
  await page.waitForFunction(
    (afterMs) => {
      const raceSamples = (
        window as unknown as { raceSamples: RaceSample[] }
      ).raceSamples.filter((sample) => sample.atMs >= afterMs);
      const loopIndex = raceSamples.findIndex((sample) => sample.days >= 359);
      return (
        loopIndex >= 0 &&
        raceSamples.slice(loopIndex).some((sample) => sample.days < 1)
      );
    },
    tappedAtMs,
    { polling: 250, timeout: 60_000 },
  );
  const samples = await page.evaluate(
    () => (window as unknown as { raceSamples: RaceSample[] }).raceSamples,
  );

  // The first tap starts the race at the epoch at once.
  const started = samples.find(
    (sample) => sample.atMs >= tappedAtMs && sample.days < 1,
  );
  if (started === undefined) {
    throw new Error("The race never started at the epoch");
  }
  const firstTapMs = started.atMs - tappedAtMs;
  // The loop point: the clock reaches 360 days, then falls back to the epoch.
  const loopPointIndex = samples.findIndex(
    (sample) => sample.atMs > started.atMs && sample.days >= 359,
  );
  const restarted = samples
    .slice(loopPointIndex)
    .find((sample) => sample.days < 1);
  const loopPoint = samples[loopPointIndex];
  if (loopPoint === undefined || restarted === undefined) {
    throw new Error("The race never restarted from the epoch");
  }
  const loopMs = restarted.atMs - loopPoint.atMs;
  let longestSeekMs = 0;
  let seekingSinceMs: number | null = null;
  for (const sample of samples) {
    seekingSinceMs = sample.seeking ? (seekingSinceMs ?? sample.atMs) : null;
    if (seekingSinceMs !== null) {
      longestSeekMs = Math.max(longestSeekMs, sample.atMs - seekingSinceMs);
    }
  }
  console.log(
    JSON.stringify({
      firstTapMs,
      loopMs,
      longestSeekMs,
      loopPointDays: loopPoint.days,
    }),
  );
  expect(firstTapMs).toBeLessThan(2_000);
  expect(loopMs).toBeLessThan(2_000);
  // The race shows its whole loop: the clock on screen reaches the loop end
  // (REBOUND can land up to a second short of it) before it starts again.
  const loopEnds = await page.evaluate(
    () => (window as unknown as { raceLoopEnds: number[] }).raceLoopEnds,
  );
  expect(loopEnds.length).toBeGreaterThan(0);
  for (const loopEndSeconds of loopEnds) {
    expect(loopEndSeconds).toBeGreaterThanOrEqual(360 * 86_400 - 1);
  }
  expect(longestSeekMs).toBeLessThan(2_000);
  expect(samples.filter((sample) => sample.outside)).toEqual([]);
  // Forward playback is clamped at the 360-day loop end, so even a slow
  // machine never shows a later time once the race has started. Earlier
  // samples hold the paused pre-race clock, which can be anywhere.
  const raceDays = samples
    .filter((sample) => sample.atMs >= started.atMs)
    .map((sample) => sample.days);
  expect(Math.max(...raceDays)).toBeLessThanOrEqual(360);
  await expect(page.getByText(/Outside ±1 year/u)).toHaveCount(0);
  await expect(page.locator(".cinematic-shot-caption")).toBeVisible();
  await expect(page.getByText(/Simulation stopped/u)).toHaveCount(0);
});

test("running the clock backward ends the planets race", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1024, height: 768 });
  await startPlanetsRacing(page);
  const racingButton = page.getByRole("button", {
    name: "Planets racing",
    exact: true,
  });
  const timeOutput = page.locator(".time-readout output");
  const simulationDays = async (): Promise<number> =>
    Number(await timeOutput.getAttribute("data-time-seconds")) / 86_400;
  await expect.poll(simulationDays).toBeGreaterThan(30);

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(racingButton).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Run backward" }).click();

  await expect(racingButton).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".cinematic-shot-caption")).toHaveCount(0);
  // The end of the shot brings back the rate from before it.
  await expect(page.locator(".playback-rate-control output")).toHaveText(
    "1 hour / second",
  );
  const daysAtBackwardStart = await simulationDays();
  await expect.poll(simulationDays).toBeLessThan(daysAtBackwardStart);
  // The clock keeps running backward, below the epoch, as without the shot.
  await page.getByRole("slider", { name: "Playback rate" }).fill("5");
  await expect.poll(simulationDays, { timeout: 20_000 }).toBeLessThan(-10);
  await expect(page.getByText(/Simulation stopped/u)).toHaveCount(0);
});

test("Pause and Run backward stop the planets race where it is on screen", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1024, height: 768 });
  const scene = await startPlanetsRacing(page);
  await expect
    .poll(
      async () =>
        Number(await scene.getAttribute("data-rendered-time-seconds")) / 86_400,
    )
    .toBeGreaterThan(30);
  // A loaded machine draws frames late, so the solver runs a batch of race
  // frames ahead of the screen.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.evaluate(() => {
    const record = {
      atPauseDays: Number.NaN,
      atBackwardDays: Number.NaN,
      afterPauseDays: [] as number[],
      afterBackwardDays: [] as number[],
    };
    (window as unknown as { raceStop: typeof record }).raceStop = record;
    const renderedDays = (): number =>
      Number(
        document.querySelector<HTMLElement>("[data-rendered-time-seconds]")
          ?.dataset.renderedTimeSeconds,
      ) / 86_400;
    document.addEventListener(
      "click",
      (event) => {
        const name =
          event.target instanceof HTMLElement ? event.target.textContent : "";
        if (name === "Pause") record.atPauseDays = renderedDays();
        if (name === "Run backward") record.atBackwardDays = renderedDays();
      },
      true,
    );
    const sample = (): void => {
      if (Number.isFinite(record.atBackwardDays)) {
        record.afterBackwardDays.push(renderedDays());
      } else if (Number.isFinite(record.atPauseDays)) {
        record.afterPauseDays.push(renderedDays());
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.getByRole("button", { name: "Pause" }).click();
  await page.waitForTimeout(1_500);
  await page.getByRole("button", { name: "Run backward" }).click();
  await expect(page.locator(".playback-rate-control output")).toHaveText(
    "1 hour / second",
  );
  await page.waitForTimeout(3_000);
  const record = await page.evaluate(
    () =>
      (
        window as unknown as {
          raceStop: {
            atPauseDays: number;
            atBackwardDays: number;
            afterPauseDays: number[];
            afterBackwardDays: number[];
          };
        }
      ).raceStop,
  );
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  // Each new time the scene drew while paused.
  const drawnAfterPause = record.afterPauseDays.filter(
    (days, index, all) =>
      days !== record.atPauseDays && days !== all[index - 1],
  );
  console.log(
    JSON.stringify({ atPauseDays: record.atPauseDays, drawnAfterPause }),
  );
  // The draw already under way at the click may still land; after it the
  // planets stand still. Before the fix the race's frames handed over ahead
  // of the screen kept them moving, by days to a month, over later draws.
  expect(drawnAfterPause.length).toBeLessThanOrEqual(1);
  expect(Math.max(...record.afterBackwardDays)).toBeLessThanOrEqual(
    record.atBackwardDays,
  );
  await expect(page.getByText(/Simulation stopped/u)).toHaveCount(0);
});

test("a discovery message takes the shot caption's place", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/");
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  await expect(scene).toHaveAttribute(
    "data-rendered-time-seconds",
    /-?\d+(?:\.\d+)?/u,
    { timeout: 30_000 },
  );
  // Selecting the Roadster finds it, an easter egg.
  await selectFocus(
    page.getByRole("combobox", { name: "Focus" }),
    "Tesla Roadster and Starman",
  );
  const toast = page.getByRole("status").filter({ hasText: "You found" });
  await expect(toast).toBeVisible();

  await page
    .getByRole("button", { name: "Planets racing", exact: true })
    .click();

  await expect(scene).toHaveAttribute("data-view-mode", "orrery");
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  const caption = page.locator(".cinematic-shot-caption");
  await expect(toast).toBeVisible();
  await expect(caption).toHaveCount(0);
  // The caption comes back when the message goes.
  await expect(toast).toHaveCount(0, { timeout: 10_000 });
  await expect(caption).toBeVisible();
});

test("a tour ends the planets racing shot", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1024, height: 768 });
  await startPlanetsRacing(page);
  const racingButton = page.getByRole("button", {
    name: "Planets racing",
    exact: true,
  });
  const caption = page.locator(".cinematic-shot-caption");
  await expect(racingButton).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Scale tour" }).click();
  // The tour hides the camera dock, so the button is read while hidden.
  await expect(page.locator(".planets-racing-launch-button")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(caption).toHaveCount(0);

  // Exit restores the pre-tour playback, so the clock runs again at once;
  // with the clock running, the old shot must not come back.
  await page.getByRole("button", { name: "Exit" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(caption).toHaveCount(0);
  await expect(racingButton).toHaveAttribute("aria-pressed", "false");
});

test("a surface view entered during a shot opens in Reality", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  await expect(scene).toHaveAttribute(
    "data-rendered-time-seconds",
    /-?\d+(?:\.\d+)?/u,
    { timeout: 30_000 },
  );
  // The view from before the shot is Orrery, which the shot's end restores.
  await page.getByRole("button", { name: "Orrery", exact: true }).click();
  await page
    .getByRole("button", { name: "Planets racing", exact: true })
    .click();
  await expect(page.locator(".cinematic-shot-caption")).toBeVisible();

  await page.getByRole("button", { name: "Display" }).click();
  await page.getByRole("tab", { name: "Camera" }).click();
  await page
    .getByRole("dialog", { name: "Display controls" })
    .getByText("Surface observer", { exact: true })
    .click();
  await page.getByRole("button", { name: "Enter surface view" }).click();

  await expect(scene).toHaveAttribute("data-surface-observer-body", "earth");
  await expect(scene).toHaveAttribute("data-view-mode", "reality");
  await expect(
    page.getByRole("button", { name: "Reality", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("the shot caption hides while the clock is paused", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await startPlanetsRacing(page);
  const caption = page.locator(".cinematic-shot-caption");
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(caption).toHaveCount(0);
  await page.getByRole("button", { name: "Run forward" }).click();
  await expect(caption).toBeVisible();
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
]) {
  test(`the shot caption clears the camera dock at ${String(viewport.width)} px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await startPlanetsRacing(page);
    const caption = await page.locator(".cinematic-shot-caption").boundingBox();
    const dock = await page.locator(".camera-dock").boundingBox();
    if (caption === null || dock === null) {
      throw new Error("Caption and camera dock must both be laid out");
    }
    const overlaps =
      caption.x < dock.x + dock.width &&
      dock.x < caption.x + caption.width &&
      caption.y < dock.y + dock.height &&
      dock.y < caption.y + caption.height;
    expect(overlaps, JSON.stringify({ caption, dock })).toBe(false);
    expect(caption.x + caption.width).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({
      path: testInfo.outputPath(
        `planets-racing-caption-${String(viewport.width)}.png`,
      ),
      animations: "disabled",
    });
  });
}

test("the shot caption clears the camera journey label at 768 px", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/");
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  await expect(scene).toHaveAttribute(
    "data-rendered-time-seconds",
    /-?\d+(?:\.\d+)?/u,
    { timeout: 30_000 },
  );
  await selectFocus(page.getByRole("combobox", { name: "Focus" }), "Earth");
  await expect(scene).toHaveAttribute("data-focus-body", "earth");
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
    { timeout: 40_000 },
  );
  await page
    .getByRole("button", { name: "Planets racing", exact: true })
    .click();
  const caption = page.locator(".cinematic-shot-caption");
  const journey = page.locator(".camera-journey");
  await expect(caption).toBeVisible();
  // The camera flies from Earth to the Sun with its journey label showing.
  await expect(journey).toBeVisible();
  let sampled = 0;
  while (await journey.isVisible()) {
    const captionBox = await caption.boundingBox();
    const journeyBox = await journey.boundingBox();
    if (captionBox === null || journeyBox === null) {
      break;
    }
    sampled += 1;
    const overlaps =
      captionBox.x < journeyBox.x + journeyBox.width &&
      journeyBox.x < captionBox.x + captionBox.width &&
      captionBox.y < journeyBox.y + journeyBox.height &&
      journeyBox.y < captionBox.y + captionBox.height;
    expect(overlaps, JSON.stringify({ captionBox, journeyBox })).toBe(false);
    await page.waitForTimeout(100);
  }
  expect(sampled).toBeGreaterThan(0);
});

test("the planets race fits Mars's orbit across a phone", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const scene = await startPlanetsRacing(page);
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
    { timeout: 40_000 },
  );
  // The camera moves out by the scene's portrait aspect ratio.
  const sceneBox = await scene.boundingBox();
  if (sceneBox === null) {
    throw new Error("The scene must be laid out");
  }
  expect(
    Number(await scene.getAttribute("data-camera-distance-au")),
  ).toBeCloseTo(6 / (sceneBox.width / sceneBox.height), 6);
  const mars = scene.locator(".body-label", { hasText: /^Mars$/u });
  // Mars goes most of the way round its orbit in 20 seconds of the race.
  for (let sample = 0; sample < 40; sample += 1) {
    const box = await mars.boundingBox();
    if (box === null) {
      throw new Error("The Mars label must stay laid out");
    }
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await page.waitForTimeout(500);
  }
});
