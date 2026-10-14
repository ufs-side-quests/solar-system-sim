import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

// The counters the init script below installs; absent until it runs.
// The animation-frame gate the trail-gap test installs.
type GatedWindow = Window & {
  holdAnimationFrames?: (held: boolean) => void;
};

type CountingWindow = Window & {
  animationFrames?: number;
  reactCommits?: number;
  __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown;
};

test.use({ viewport: { width: 1024, height: 768 } });

const sceneOf = (page: Page): Locator =>
  page.getByRole("img", { name: /Physics-driven Solar System/u });

// React reports every commit to a DevTools hook that is present before it
// loads, so a minimal hook counts the commits.
async function countFramesAndCommits(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const countingWindow: CountingWindow = window;
    countingWindow.animationFrames = 0;
    countingWindow.reactCommits = 0;
    const tick = (): void => {
      countingWindow.animationFrames =
        (countingWindow.animationFrames ?? 0) + 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    countingWindow.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      isDisabled: false,
      renderers: new Map(),
      inject: () => 1,
      checkDCE: () => undefined,
      onCommitFiberRoot: () => {
        countingWindow.reactCommits = (countingWindow.reactCommits ?? 0) + 1;
      },
      onCommitFiberUnmount: () => undefined,
      onPostCommitFiberRoot: () => undefined,
    };
  });
}

async function counters(
  page: Page,
): Promise<Readonly<{ frames: number; commits: number }>> {
  const values = await page.evaluate(() => {
    const countingWindow: CountingWindow = window;
    return [countingWindow.animationFrames, countingWindow.reactCommits];
  });
  const [frames, commits] = values;
  if (frames === undefined || commits === undefined) {
    throw new Error("Frame and commit counters are not installed");
  }
  return { frames, commits };
}

async function requiredAttribute(
  locator: Locator,
  name: string,
): Promise<string> {
  const value = await locator.getAttribute(name);
  if (value === null) {
    throw new Error(`The scene has no ${name} attribute`);
  }
  return value;
}

async function selectFocus(page: Page, label: string): Promise<void> {
  const focus = page.getByRole("combobox", { name: "Focus" });
  await focus.fill(label);
  await focus.press("Enter");
  await expect(focus).toHaveValue(label);
}

test("the Jupiter close-up recalculates style fewer than three times a frame", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await countFramesAndCommits(page);
  await page.goto("/");
  const scene = sceneOf(page);
  await expect(scene).toHaveAttribute("data-rendered-time-seconds", /-?\d+/u, {
    timeout: 30_000,
  });
  await selectFocus(page, "Jupiter");
  await expect(scene).toHaveAttribute("data-focus-body", "jupiter");
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
    { timeout: 40_000 },
  );
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const recalcStyleCount = async (): Promise<number> => {
    const { metrics } = await cdp.send("Performance.getMetrics");
    const metric = metrics.find((entry) => entry.name === "RecalcStyleCount");
    if (metric === undefined) {
      throw new Error("Chrome reports no RecalcStyleCount metric");
    }
    return metric.value;
  };
  const recalcsBefore = await recalcStyleCount();
  const before = await counters(page);
  await page.waitForTimeout(2_000);
  const recalcs = (await recalcStyleCount()) - recalcsBefore;
  const frames = (await counters(page)).frames - before.frames;
  // A slow runner draws fewer frames; ten still make a ratio.
  expect(frames).toBeGreaterThan(10);
  expect(recalcs / frames).toBeLessThan(3);
});

test("playback commits React at most twelve times a second and the clock keeps moving", async ({
  page,
}) => {
  await countFramesAndCommits(page);
  await page.goto("/");
  const scene = sceneOf(page);
  await expect(scene).toHaveAttribute("data-rendered-time-seconds", /-?\d+/u, {
    timeout: 30_000,
  });
  const clock = page.locator(".time-readout output");
  await page.waitForTimeout(2_000);
  const clockBefore = await clock.getAttribute("data-time-seconds");
  const before = await counters(page);
  await page.waitForTimeout(3_000);
  const commits = (await counters(page)).commits - before.commits;
  // The clock shows a new time in this window, so React did commit.
  expect(await clock.getAttribute("data-time-seconds")).not.toBe(clockBefore);
  expect(commits).toBeGreaterThan(0);
  expect(commits / 3).toBeLessThanOrEqual(12);
});

test("a camera flight commits React at most twelve times a second", async ({
  page,
}) => {
  await countFramesAndCommits(page);
  await page.goto("/");
  const scene = sceneOf(page);
  await expect(scene).toHaveAttribute("data-rendered-time-seconds", /-?\d+/u, {
    timeout: 30_000,
  });
  await selectFocus(page, "Jupiter");
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    /orienting|travelling|arriving/u,
  );
  // The flight takes twelve seconds; the window starts after the selection.
  await page.waitForTimeout(500);
  const before = await counters(page);
  await page.waitForTimeout(3_000);
  const commits = (await counters(page)).commits - before.commits;
  // The whole window was flight: the scene reported its camera every frame.
  await expect(scene).not.toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
  );
  expect(commits).toBeGreaterThan(0);
  expect(commits / 3).toBeLessThanOrEqual(12);
});

test("hidden orbit guides wait, and a shown guide uses the newest state", async ({
  page,
}) => {
  await page.goto("/");
  const scene = sceneOf(page);
  await expect(scene).toHaveAttribute("data-rendered-time-seconds", /-?\d+/u, {
    timeout: 30_000,
  });
  await selectFocus(page, "Jupiter");
  await expect(scene).toHaveAttribute("data-focus-body", "jupiter");
  await page.getByRole("button", { name: "Display" }).click();
  await page.getByRole("tab", { name: "Guides" }).click();
  const orbitGuides = page.getByRole("checkbox", { name: "Orbit guides" });
  await expect(orbitGuides).not.toBeChecked();
  const renderedTime = async (): Promise<number> =>
    Number(await scene.getAttribute("data-rendered-time-seconds"));

  // Shown while time runs, the guides follow each new state.
  await orbitGuides.check();
  await expect
    .poll(async () =>
      Number(await scene.getAttribute("data-orbit-guide-count")),
    )
    .toBeGreaterThan(0);
  const shownTime = await requiredAttribute(
    scene,
    "data-orbit-guide-updated-time-seconds",
  );
  await expect
    .poll(async () =>
      scene.getAttribute("data-orbit-guide-updated-time-seconds"),
    )
    .not.toBe(shownTime);

  // Hidden, they are not computed while time runs on.
  await orbitGuides.uncheck();
  await expect(scene).toHaveAttribute("data-orbit-guide-count", "0");
  const hiddenTime = await requiredAttribute(
    scene,
    "data-orbit-guide-updated-time-seconds",
  );
  const renderedWhenHidden = await renderedTime();
  await expect.poll(renderedTime).toBeGreaterThan(renderedWhenHidden + 1);
  // The scene shows a time after the guides' state, so a newer solver state
  // has arrived while they were hidden.
  await expect.poll(renderedTime).toBeGreaterThan(Number(hiddenTime));
  await expect(scene).toHaveAttribute(
    "data-orbit-guide-updated-time-seconds",
    hiddenTime,
  );

  // Paused, the first frame that shows them draws them for the shown time.
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  // Paused, the shown frame has finished: no state is on its way.
  await expect(scene).toHaveAttribute("data-interpolation-fraction", "1.0000");
  await page.evaluate(() => {
    const container = document.querySelector<HTMLElement>(
      "[data-orbit-guide-count]",
    );
    if (container === null) {
      throw new Error("The scene has no orbit guide count");
    }
    const observer = new MutationObserver(() => {
      if (container.dataset.orbitGuideCount === "0") {
        return;
      }
      observer.disconnect();
      container.dataset.firstShownGuideTime =
        container.dataset.orbitGuideUpdatedTimeSeconds ?? "missing";
      container.dataset.firstShownRenderedTime =
        container.dataset.renderedTimeSeconds ?? "missing";
    });
    observer.observe(container, {
      attributes: true,
      attributeFilter: ["data-orbit-guide-count"],
    });
  });
  await page.getByRole("button", { name: "Display" }).click();
  await page.getByRole("tab", { name: "Guides" }).click();
  await orbitGuides.check();
  await expect(scene).toHaveAttribute("data-first-shown-guide-time", /\d/u);
  const firstShownRenderedTime = await requiredAttribute(
    scene,
    "data-first-shown-rendered-time",
  );
  expect(firstShownRenderedTime).not.toBe(hiddenTime);
  await expect(scene).toHaveAttribute(
    "data-first-shown-guide-time",
    firstShownRenderedTime,
  );
});

test("trails start again after states that were never drawn", async ({
  page,
}) => {
  test.setTimeout(90_000);
  // Animation frames can be held, as a background tab holds them, while the
  // solver loop runs on timers and keeps publishing states.
  await page.addInitScript(() => {
    const gatedWindow: GatedWindow = window;
    const nativeRequest = window.requestAnimationFrame.bind(window);
    const nativeCancel = window.cancelAnimationFrame.bind(window);
    const heldCallbacks = new Map<number, FrameRequestCallback>();
    let held = false;
    let nextHeldId = -1;
    window.requestAnimationFrame = (callback) => {
      if (!held) {
        return nativeRequest(callback);
      }
      const id = nextHeldId;
      nextHeldId -= 1;
      heldCallbacks.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      if (!heldCallbacks.delete(id)) {
        nativeCancel(id);
      }
    };
    gatedWindow.holdAnimationFrames = (hold) => {
      held = hold;
      if (hold) {
        return;
      }
      const callbacks = [...heldCallbacks.values()];
      heldCallbacks.clear();
      for (const callback of callbacks) {
        nativeRequest(callback);
      }
    };
  });
  await page.goto("/");
  const scene = sceneOf(page);
  await expect(scene).toHaveAttribute("data-rendered-time-seconds", /-?\d+/u, {
    timeout: 30_000,
  });
  const moonTrailPoints = async (): Promise<number> =>
    Number(await requiredAttribute(scene, "data-moon-trail-points"));
  // A trail longer than the queue keeps, so a drawn gap cannot pass as one.
  await expect.poll(moonTrailPoints, { timeout: 30_000 }).toBeGreaterThan(80);
  // States queued before the scene first drew (its start) may already count.
  const gapsBefore = Number(
    (await scene.getAttribute("data-trail-gap-count")) ?? "0",
  );

  await page.evaluate(() => {
    const gatedWindow: GatedWindow = window;
    gatedWindow.holdAnimationFrames?.(true);
  });
  // At thirty solver states a second, six seconds queue far more than 64.
  await page.waitForTimeout(6_000);
  await page.evaluate(() => {
    const container = document.querySelector<HTMLElement>(
      "[data-moon-trail-points]",
    );
    if (container === null) {
      throw new Error("The scene has no moon trail point count");
    }
    const observer = new MutationObserver(() => {
      observer.disconnect();
      container.dataset.firstMoonTrailPointsAfterHold =
        container.dataset.moonTrailPoints ?? "missing";
    });
    observer.observe(container, {
      attributes: true,
      attributeFilter: ["data-moon-trail-points"],
    });
    const gatedWindow: GatedWindow = window;
    gatedWindow.holdAnimationFrames?.(false);
  });

  // The trails start again from the states the queue kept, instead of a
  // straight line from the old trail across the missing time.
  await expect(scene).toHaveAttribute(
    "data-trail-gap-count",
    String(gapsBefore + 1),
  );
  await expect(scene).toHaveAttribute(
    "data-first-moon-trail-points-after-hold",
    "64",
  );
});
