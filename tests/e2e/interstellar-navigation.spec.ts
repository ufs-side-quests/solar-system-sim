import { expect, test } from "@playwright/test";

const sceneName = /Physics-driven Solar System/u;

async function focusObject(
  page: import("@playwright/test").Page,
  name: string,
): Promise<void> {
  const focus = page.getByRole("combobox", { name: "Focus" });
  await focus.fill(name);
  await focus.press("Enter");
}

function requiredArrivalDistance(
  distances: readonly number[],
  index: number,
): number {
  const distance = distances[index];
  if (distance === undefined) {
    throw new Error(`Arrival distance sample ${String(index)} is missing`);
  }
  return distance;
}

test("turns toward a new manual focus before travelling there directly", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.goto("/");
  const scene = page.getByRole("img", { name: sceneName });
  await expect(page.locator("canvas.major-body-layer")).toBeVisible({
    timeout: 30_000,
  });
  await focusObject(page, "Earth");
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
    {
      timeout: 15_000,
    },
  );
  await focusObject(page, "Jupiter");
  await expect(scene).toHaveAttribute(
    "data-camera-transition-interpolation",
    "orient-then-direct-flight",
  );
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "orienting",
  );
  await expect(scene).toHaveAttribute(
    "data-camera-transition-overview-anchor",
    "not-used-direct-flight",
  );
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "travelling",
    {
      timeout: 7_000,
    },
  );
  await expect(page.locator(".camera-journey")).toContainText(
    /Viewpoint speed .+(?:km\/s|light speed)/u,
  );
  await expect
    .poll(async () =>
      Number(await scene.getAttribute("data-camera-transition-speed-mps")),
    )
    .toBeGreaterThan(0);
  await expect(scene).toHaveAttribute(
    "data-camera-transition-speed-definition",
    "camera-displacement-per-real-second",
  );
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "arriving",
    {
      timeout: 12_000,
    },
  );
  const arrivalDistances: number[] = [];
  for (let sample = 0; sample < 4; sample += 1) {
    arrivalDistances.push(
      Number(
        await scene.getAttribute(
          "data-camera-transition-remaining-distance-au",
        ),
      ),
    );
    await page.locator("canvas.major-body-layer").screenshot({
      path: testInfo.outputPath(`jupiter-arrival-${String(sample + 1)}.png`),
      animations: "disabled",
    });
    await page.waitForTimeout(150);
  }
  expect(arrivalDistances.every(Number.isFinite)).toBe(true);
  expect(
    arrivalDistances.every(
      (distance, index) =>
        index === 0 ||
        distance <= requiredArrivalDistance(arrivalDistances, index - 1),
    ),
    `Arrival distances: ${arrivalDistances.join(", ")}`,
  ).toBe(true);
  const firstArrivalStep =
    requiredArrivalDistance(arrivalDistances, 0) -
    requiredArrivalDistance(arrivalDistances, 1);
  const finalArrivalStep =
    requiredArrivalDistance(arrivalDistances, 2) -
    requiredArrivalDistance(arrivalDistances, 3);
  expect(finalArrivalStep).toBeLessThan(firstArrivalStep);
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
    {
      timeout: 15_000,
    },
  );
  await expect(scene).toHaveAttribute("data-focus-body", "jupiter");
});

type FlightFrame = Readonly<{
  phase: string;
  elapsedMs: number;
  nearAu: number;
  destinationDistanceAu: number;
  radiusPixels: number;
  displayedRadiusAu: number;
}>;

// Reads the flight's own data and one body's label together on every frame
// of the next flight, until it settles.
async function recordNextFlight(
  scene: import("@playwright/test").Locator,
  bodyId: string,
  startFlight: () => Promise<void>,
): Promise<FlightFrame[]> {
  const sequenceBefore = await scene.getAttribute(
    "data-camera-transition-sequence",
  );
  const recording = scene.evaluate(
    (element, input) =>
      new Promise<FlightFrame[]>((resolve, reject) => {
        const label = document.querySelector<HTMLElement>(
          `.body-label[data-body-id="${input.bodyId}"]`,
        );
        if (label === null) {
          reject(new Error(`The ${input.bodyId} label is missing`));
          return;
        }
        const frames: FlightFrame[] = [];
        const deadline = performance.now() + 40_000;
        const step = (): void => {
          const data = element.dataset;
          if ((data.cameraTransitionSequence ?? null) !== input.before) {
            const phase = data.cameraTransitionPhase ?? "";
            frames.push({
              phase,
              elapsedMs: Number(data.cameraTransitionElapsedMs),
              nearAu: Number(data.cameraNearAu),
              destinationDistanceAu: Number(
                data.cameraTransitionDestinationDistanceAu,
              ),
              radiusPixels: Number(label.dataset.radiusPixels),
              displayedRadiusAu: Number(label.dataset.displayedRadiusAu),
            });
            if (phase === "settled") {
              resolve(frames);
              return;
            }
          }
          if (performance.now() > deadline) {
            reject(new Error("The flight did not settle within 40 s"));
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    { bodyId, before: sequenceBefore },
  );
  await startFlight();
  return recording;
}

// The near plane cuts away everything closer to the camera than it, so it
// must stay nearer than the destination's closest surface on every frame of
// the move, and the camera must stay outside the destination.
function expectDestinationNeverClipped(
  frames: readonly FlightFrame[],
  bodyId: string,
): void {
  const moving = frames.filter(
    (frame) => frame.phase === "travelling" || frame.phase === "arriving",
  );
  expect(moving.length).toBeGreaterThan(10);
  const clipped = moving.filter(
    (frame) =>
      !(frame.destinationDistanceAu - frame.displayedRadiusAu > frame.nearAu),
  );
  expect(
    clipped.map(
      (frame) =>
        `${frame.elapsedMs.toFixed(0)} ms: ${bodyId} surface ${(
          (frame.destinationDistanceAu - frame.displayedRadiusAu) *
          149_597_870.7
        ).toFixed(3)} km away, near plane ${(
          frame.nearAu * 149_597_870.7
        ).toFixed(3)} km`,
    ),
  ).toEqual([]);
}

test("the destination planet grows on screen through the last seconds of a flight", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/");
  const scene = page.getByRole("img", { name: sceneName });
  await expect(page.locator("canvas.major-body-layer")).toBeVisible({
    timeout: 30_000,
  });
  // Paused time keeps Jupiter still, so only the camera changes its size.
  await page.getByRole("button", { name: "Pause" }).click();
  const frames = await recordNextFlight(scene, "jupiter", () =>
    focusObject(page, "Jupiter"),
  );
  const durationMs = Number(
    await scene.getAttribute("data-camera-transition-duration-ms"),
  );
  expect(durationMs).toBe(12_000);
  // The first frame of the flight at or after the window opens, with the
  // elapsed time and the radius read on that same frame.
  const radiusInWindow = (from: number, to: number): number => {
    const frame = frames.find(
      (candidate) =>
        candidate.phase !== "settled" &&
        candidate.elapsedMs >= durationMs * from,
    );
    if (frame === undefined) {
      throw new Error(
        `No flight frame at or after ${String(from)} of the flight; elapsed ms: ${frames
          .map((candidate) => candidate.elapsedMs.toFixed(0))
          .join(", ")}`,
      );
    }
    expect(
      frame.elapsedMs,
      `The frame read at ${frame.elapsedMs.toFixed(0)} ms is outside ${String(
        from,
      )} to ${String(to)} of the flight`,
    ).toBeLessThanOrEqual(durationMs * to);
    return frame.radiusPixels;
  };
  // A straight-line flight keeps Jupiter under a pixel until the last moment;
  // the approach should show a disc well before arrival and keep growing.
  const atThreeQuarters = radiusInWindow(0.75, 0.8);
  const atNineTenths = radiusInWindow(0.88, 0.93);
  expect(atThreeQuarters).toBeGreaterThan(5);
  expect(atNineTenths).toBeGreaterThan(atThreeQuarters * 2);
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
  );
  expect(
    Number(
      await page
        .locator('.body-label[data-body-id="jupiter"]')
        .getAttribute("data-radius-pixels"),
    ),
  ).toBeGreaterThan(atNineTenths);
});

test("a flight to Phobos never cuts into Phobos", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  const scene = page.getByRole("img", { name: sceneName });
  await expect(page.locator("canvas.major-body-layer")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Pause" }).click();
  const frames = await recordNextFlight(scene, "phobos", () =>
    focusObject(page, "Phobos"),
  );
  await expect(scene).toHaveAttribute("data-focus-body", "phobos");
  expectDestinationNeverClipped(frames, "phobos");
});

test("Show on Moon never cuts into the Moon on the way to the site", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/");
  const scene = page.getByRole("img", { name: sceneName });
  await expect(page.locator("canvas.major-body-layer")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Pause" }).click();
  await focusObject(page, "Moon");
  await expect(scene).toHaveAttribute("data-focus-body", "moon");
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
    { timeout: 20_000 },
  );
  const apollo11 = page.getByRole("button", {
    name: "Apollo 11 landing site at Tranquility Base",
  });
  await expect(apollo11).toBeVisible();
  await apollo11.click();
  const detail = page.getByRole("complementary");
  const frames = await recordNextFlight(scene, "moon", () =>
    detail.getByRole("button", { name: "Show on Moon" }).click(),
  );
  await expect(scene).toHaveAttribute(
    "data-camera-orientation",
    "apollo-site-inspection",
  );
  expectDestinationNeverClipped(frames, "moon");
});

test("mouse wheel can dolly from the Solar System to Alpha Centauri scale", async ({
  page,
}) => {
  await page.goto("/");
  const scene = page.getByRole("img", { name: sceneName });
  const canvas = page.locator("canvas.major-body-layer");
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  const bounds = await canvas.boundingBox();
  if (bounds === null) {
    throw new Error("Solar System canvas has no screen bounds");
  }
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  for (let step = 0; step < 4; step += 1) {
    await page.mouse.wheel(0, 5_000);
    await page.waitForTimeout(100);
  }
  await expect
    .poll(async () =>
      Number(await scene.getAttribute("data-camera-distance-au")),
    )
    .toBeGreaterThan(40_000);
  await expect(scene).toHaveAttribute("data-alpha-centauri-visible", "true");
  await expect(scene).toHaveAttribute(
    "data-semantic-zoom-level",
    "interstellar",
  );
  await page.getByRole("button", { name: "Display" }).click();
  await page.getByRole("tab", { name: "Camera" }).click();
  const zoomOutput = page
    .getByText("Camera zoom", { exact: true })
    .locator("..")
    .locator("output");
  await expect(zoomOutput).toContainText("e");
});

test("renders and focuses the fictional Jovian monolith at true scale", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.goto("/");
  const scene = page.getByRole("img", { name: sceneName });
  await expect(page.locator("canvas.major-body-layer")).toBeVisible({
    timeout: 30_000,
  });
  await focusObject(page, "Jovian Monolith (fictional)");
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "orienting",
  );
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
    { timeout: 25_000 },
  );
  await expect(scene).toHaveAttribute("data-focus-body", "jovian-monolith");
  await expect(scene).toHaveAttribute(
    "data-jovian-monolith-physics",
    "display-only-jupiter-io-l1-no-gravity",
  );
  await expect(scene).toHaveAttribute(
    "data-jovian-monolith-dimensions-m",
    "222.222,888.889,2000.000",
  );
  await expect
    .poll(async () =>
      Number(
        await scene.getAttribute("data-jovian-monolith-distance-from-io-km"),
      ),
    )
    .toBeGreaterThan(10_000);
  await expect(scene).toHaveAttribute(
    "data-jovian-monolith-geometry-visible",
    "true",
  );
  await expect(
    page.getByRole("button", {
      name: "Jovian Monolith (fictional)",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("jovian-monolith.png"),
    animations: "disabled",
  });
});
