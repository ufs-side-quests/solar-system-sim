import { expect, test } from "@playwright/test";

// The scene's subject is the target's disc and rings. Saturn's main rings
// reach 136,780 km (src/scene/ring-system.ts) from a planet of mean radius
// 58,232 km (src/data/major-bodies.snapshot.json).
const SATURN_RINGS_OVER_RADIUS = 136_780 / 58_232;

const OBSERVER_STEPS = [
  {
    id: "sun-from-mars",
    observerBodyId: "mars",
    targetBodyId: "sun",
    subjectOverDisc: 1,
  },
  {
    id: "jupiter-from-io",
    observerBodyId: "io",
    targetBodyId: "jupiter",
    subjectOverDisc: 1,
  },
  {
    id: "earth-from-jupiter",
    observerBodyId: "jupiter",
    targetBodyId: "earth",
    subjectOverDisc: 1,
  },
  {
    id: "saturn-from-titan",
    observerBodyId: "titan",
    targetBodyId: "saturn",
    subjectOverDisc: SATURN_RINGS_OVER_RADIUS,
  },
] as const;

async function advanceToStep(
  tour: import("@playwright/test").Locator,
  nextButton: import("@playwright/test").Locator,
  stepId: string,
  diagnostics: Readonly<{
    pageErrors: string[];
    consoleErrors: string[];
    lifecycleEvents: string[];
  }>,
): Promise<void> {
  for (let attempt = 0; attempt < 11; attempt += 1) {
    const currentStepId = await tour.getAttribute("data-tour-step");
    if (currentStepId === stepId) {
      return;
    }
    await nextButton.click();
    await tour.page().waitForTimeout(100);
    if ((await tour.count()) === 0) {
      throw new Error(
        `Tour disappeared after ${currentStepId ?? "unknown"}: ${JSON.stringify(diagnostics)}`,
      );
    }
    await expect(tour).not.toHaveAttribute(
      "data-tour-step",
      currentStepId ?? "",
    );
  }
  throw new Error(`Tour did not reach ${stepId}`);
}

test("anchors every observer scene at its origin while centring its look-at target", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const lifecycleEvents: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("crash", () => lifecycleEvents.push("page crashed"));
  page.on("close", () => lifecycleEvents.push("page closed"));
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  try {
    await page.goto("/");
    const scene = page.getByRole("img", {
      name: /Physics-driven Solar System/u,
    });
    await expect(page.locator("canvas.major-body-layer")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Scale tour" }).click();
    const tour = page.getByRole("dialog", {
      name: "Scale of the Solar System tour",
    });
    await page.getByRole("button", { name: "Pause tour" }).click();
    const nextButton = page.getByRole("button", { name: "Next" });

    for (const step of OBSERVER_STEPS) {
      await advanceToStep(tour, nextButton, step.id, {
        pageErrors,
        consoleErrors,
        lifecycleEvents,
      });
      await expect(scene).toHaveAttribute(
        "data-camera-observer-body",
        step.observerBodyId,
      );
      await expect(scene).toHaveAttribute(
        "data-camera-target-body",
        step.targetBodyId,
      );
      await expect(tour).toHaveAttribute(
        "data-tour-observer",
        step.observerBodyId,
      );
      await expect(tour).toHaveAttribute("data-tour-target", step.targetBodyId);
      await expect(scene).toHaveAttribute(
        "data-camera-transition-interpolation",
        "orient-then-direct-flight",
      );
      await expect(scene).toHaveAttribute(
        "data-camera-transition-route",
        "current-to-destination",
      );
      await expect(scene).toHaveAttribute(
        "data-camera-transition-route-points",
        "2",
      );
      await expect(scene).toHaveAttribute(
        "data-camera-transition-duration-ms",
        "12000",
      );
      await expect(scene).toHaveAttribute(
        "data-camera-transition-phase",
        "orienting",
      );
      await expect(scene).toHaveAttribute(
        "data-camera-transition-phase",
        "travelling",
        { timeout: 9_000 },
      );
      await expect(scene).toHaveAttribute(
        "data-camera-transition-phase",
        "settled",
        { timeout: 16_000 },
      );
      await expect(scene).toHaveAttribute(
        "data-focus-body",
        step.observerBodyId,
      );
      await expect(scene).toHaveAttribute(
        "data-camera-transition-overview-anchor",
        "not-used-direct-flight",
      );
      await expect(scene).toHaveAttribute(
        "data-camera-transition-destination-anchor",
        step.observerBodyId,
      );
      await expect
        .poll(async () =>
          Number(await scene.getAttribute("data-camera-observer-altitude-km")),
        )
        .toBeGreaterThan(0);

      const sceneSize = await scene.evaluate((element) => ({
        width: element.clientWidth,
        height: element.clientHeight,
      }));
      // The tour card moves the picture right when it covers the target:
      // when it crosses the rows of the target and its label, and reaches
      // past 40% of the width and the target's left edge. The target then
      // sits in the middle of the open sky beside the card, which is wide
      // enough at 1280 x 720 for every target here. The expected shift comes
      // from the card's box and the target's drawn size, not from the
      // reported shift.
      const subjectRadiusPx = Number(
        await scene.getAttribute("data-lens-subject-radius-px"),
      );
      const targetLabelRadiusPx = Number(
        await page
          .locator(`.body-label[data-body-id="${step.targetBodyId}"]`)
          .getAttribute("data-radius-pixels"),
      );
      // The scene's subject is the target's drawn disc and rings (an outline
      // a little wider than the label's small-angle radius).
      const discAndRingsPx = targetLabelRadiusPx * step.subjectOverDisc;
      expect(subjectRadiusPx).toBeGreaterThanOrEqual(discAndRingsPx);
      expect(subjectRadiusPx).toBeLessThanOrEqual(discAndRingsPx * 1.05);
      const sceneBox = await scene.boundingBox();
      const cardBox = await tour.boundingBox();
      if (sceneBox === null || cardBox === null) {
        throw new Error("The scene or the tour card has no box");
      }
      const cardRight = cardBox.x + cardBox.width - sceneBox.x;
      const cardTop = cardBox.y - sceneBox.y;
      // The target's label hangs 24 px plus half a label box (one font
      // size) below or above it, so a card across those rows covers it.
      const labelFontPx = await page
        .locator(`.body-label[data-body-id="${step.targetBodyId}"]`)
        .evaluate((label) =>
          Number.parseFloat(getComputedStyle(label).fontSize),
        );
      const subjectRowsReachPx = Math.max(subjectRadiusPx, 24 + labelFontPx);
      const cardCoversTarget =
        cardTop < sceneSize.height / 2 + subjectRowsReachPx &&
        cardRight > sceneSize.width * 0.4 &&
        cardRight > sceneSize.width / 2 - subjectRadiusPx;
      const expectedShiftPx = cardCoversTarget
        ? (cardRight + sceneSize.width) / 2 - sceneSize.width / 2
        : 0;
      // The shift glides for about 300 ms after the flight lands. The
      // attribute must be there: a missing one is not "no shift".
      await expect
        .poll(async () => {
          const shift = await scene.getAttribute("data-lens-shift-px");
          if (shift === null) {
            throw new Error("The scene does not report data-lens-shift-px");
          }
          return Number(shift);
        })
        .toBeCloseTo(expectedShiftPx, 3);
      const targetPosition = {
        x: Number(await scene.getAttribute("data-camera-target-screen-x")),
        y: Number(await scene.getAttribute("data-camera-target-screen-y")),
      };
      const openSkyCentreX = sceneSize.width / 2 + expectedShiftPx;
      expect(targetPosition.x).toBeCloseTo(openSkyCentreX, 3);
      expect(targetPosition.y).toBeCloseTo(sceneSize.height / 2, 3);
      if (step.targetBodyId === "earth") {
        await expect(
          page.getByRole("button", { name: "Earth", exact: true }),
        ).toBeVisible();
      }
      // A tour hides the time controls: its own Resume runs the clock.
      const clock = page.locator("time.global-simulation-clock");
      const secondsBeforeResume = Number(
        await clock.getAttribute("data-time-seconds"),
      );
      await tour.getByRole("button", { name: "Resume tour" }).click();
      await page.waitForTimeout(500);
      expect(Number(await clock.getAttribute("data-time-seconds"))).not.toBe(
        secondsBeforeResume,
      );
      const movingTargetPosition = {
        x: Number(await scene.getAttribute("data-camera-target-screen-x")),
        y: Number(await scene.getAttribute("data-camera-target-screen-y")),
      };
      expect(movingTargetPosition.x).toBeCloseTo(openSkyCentreX, 3);
      expect(movingTargetPosition.y).toBeCloseTo(sceneSize.height / 2, 3);
      await tour.getByRole("button", { name: "Pause tour" }).click();
      await page.screenshot({
        path: testInfo.outputPath(`${step.id}.png`),
        animations: "disabled",
      });
    }

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(lifecycleEvents).toEqual([]);
  } finally {
    await testInfo.attach("browser-events", {
      body: JSON.stringify({ pageErrors, consoleErrors, lifecycleEvents }),
      contentType: "application/json",
    });
  }
});
