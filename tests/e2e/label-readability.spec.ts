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

for (const view of ["Reality", "Orrery"] as const) {
  test(`a keyboard-focused label in ${view} view is readable with a solid focus ring`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const scene = await pausedScene(page);
    if (view === "Orrery") {
      await page.getByRole("button", { name: "Orrery" }).click();
      await expect(scene).toHaveAttribute("data-view-mode", "orrery");
    }
    // Start the keyboard walk from empty space at the left of the scene.
    await page.mouse.click(5, 450);
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    // In Reality view the first Tab stop is a label. Orrery view marks body
    // labels as brackets: walk on to the first one.
    await expect(focused).toHaveClass(/\bbody-label\b/u);
    if (view === "Orrery") {
      for (
        let step = 0;
        step < 20 &&
        !(await focused.evaluate((element) =>
          element.classList.contains("is-bracket"),
        ));
        step += 1
      ) {
        await page.keyboard.press("Tab");
      }
      await expect(focused).toHaveClass(/\bis-bracket\b/u);
    }
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
    // The dark chip keeps the ring clear over the bright Sun. Buttons fade
    // their background in, so these assertions wait for the end of the fade.
    await expect(focused).toHaveCSS("background-color", "rgba(2, 5, 9, 0.92)");
    await expect(focused).toHaveCSS(
      "box-shadow",
      "rgba(2, 5, 9, 0.88) 0px 0px 0px 5px",
    );
  });
}

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

// startLiveChangeLog sets the log; it is absent until then.
type LiveLogWindow = Window & { liveChanges?: string[] };

// Logs every text change of a shown live region anywhere in the page. An
// <output> is a status region, so it is live unless it says aria-live="off".
async function startLiveChangeLog(page: Page): Promise<void> {
  await page.evaluate(() => {
    const liveSelector =
      '[aria-live], output, [role="status"], [role="alert"], [role="log"], [role="timer"], [role="marquee"]';
    const logWindow: LiveLogWindow = window;
    const log: string[] = [];
    logWindow.liveChanges = log;
    const lastText = new Map<Element, string>();
    for (const region of document.querySelectorAll(liveSelector)) {
      lastText.set(region, region.textContent);
    }
    new MutationObserver((records) => {
      for (const record of records) {
        const node =
          record.target instanceof Element
            ? record.target
            : record.target.parentElement;
        const region = node?.closest(liveSelector);
        if (
          region === null ||
          region === undefined ||
          region.getAttribute("aria-live") === "off" ||
          !region.checkVisibility()
        ) {
          continue;
        }
        if (lastText.get(region) !== region.textContent) {
          lastText.set(region, region.textContent);
          log.push(`${region.className}: ${region.textContent.trim()}`);
        }
      }
    }).observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
}

const liveChanges = async (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const logWindow: LiveLogWindow = window;
    if (logWindow.liveChanges === undefined) {
      throw new Error("The live change log was not started");
    }
    return logWindow.liveChanges;
  });

// The scene's own flight announcer, which only a screen reader hears.
const flightAnnouncer = (scene: Locator): Locator =>
  scene.locator('.visually-hidden[aria-live="polite"]');

for (const tab of ["View", "Camera"] as const) {
  test(`a flight announces where it goes and its arrival, not its speed, with the ${tab} settings open`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const scene = await pausedScene(page);
    // The exposure (View) and magnification (Camera) readouts follow every
    // frame of a flight; they must not speak each change.
    await page.getByRole("button", { name: "Display" }).click();
    await page.getByRole("tab", { name: tab }).click();
    await expect(
      page.getByRole("tab", { name: tab, selected: true }),
    ).toBeVisible();
    const mars = page.locator('.body-label[data-body-id="mars"]');
    await mars.click();
    await expect(scene).toHaveAttribute("data-selected-body", "mars");
    await startLiveChangeLog(page);
    await mars.click();
    await expect(scene).toHaveAttribute("data-focus-body", "mars");
    await expect(scene).toHaveAttribute(
      "data-camera-transition-phase",
      "settled",
      { timeout: 40_000 },
    );
    const changes = await liveChanges(page);
    expect(changes.length, changes.join("\n")).toBeGreaterThan(0);
    // The selection hint clears, "Flying to Mars", the view scale twice
    // (planet system, surface detail), "Arrived at Mars".
    expect(changes.length, changes.join("\n")).toBeLessThanOrEqual(5);
    await expect(flightAnnouncer(scene)).toHaveText("Arrived at Mars");
    await expect(page.locator(".camera-journey")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
}

test("the running clock does not speak every tick", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await pausedScene(page);
  await startLiveChangeLog(page);
  const readout = page.locator(".time-readout output");
  await page.getByRole("button", { name: "Run forward", exact: true }).click();
  // Watch the readout tick twice.
  for (let tick = 0; tick < 2; tick += 1) {
    const text = await readout.textContent();
    await expect(readout).not.toHaveText(text ?? "");
  }
  const changes = await liveChanges(page);
  expect(
    changes.filter((change) => change.includes("TDB")),
    changes.join("\n"),
  ).toEqual([]);
});

test("a drag during a flight ends its announcement", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const scene = await pausedScene(page);
  const mars = page.locator('.body-label[data-body-id="mars"]');
  await mars.click();
  await expect(scene).toHaveAttribute("data-selected-body", "mars");
  await mars.click();
  await expect(flightAnnouncer(scene)).toHaveText("Flying to Mars");
  await expect(scene).not.toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
  );
  // A drag on empty sky at the right of the scene takes the camera.
  await expect
    .poll(() =>
      page.evaluate(() =>
        document
          .elementFromPoint(1300, 200)
          ?.classList.contains("major-body-layer"),
      ),
    )
    .toBe(true);
  await page.mouse.move(1300, 200);
  await page.mouse.down();
  await page.mouse.move(1250, 230, { steps: 8 });
  await page.mouse.up();
  await expect(scene).toHaveAttribute("data-camera-transition-interrupted");
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
  );
  await expect(flightAnnouncer(scene)).toHaveText("");
});

test("a tour flight leaves the speaking to the tour", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const scene = page.getByRole("img", { name: /Physics-driven Solar System/u });
  await expect(page.locator("canvas.major-body-layer")).toBeVisible({
    timeout: 30_000,
  });
  const tour = page.getByRole("dialog", {
    name: "Scale of the Solar System tour",
  });
  await startLiveChangeLog(page);
  await page.getByRole("button", { name: "Scale tour" }).click();
  await expect(tour).toHaveAttribute("data-tour-step", "earth");
  const sequenceBeforeMoonGap = await scene.getAttribute(
    "data-camera-transition-sequence",
  );
  await tour.getByRole("button", { name: "Next" }).click();
  await expect(tour).toHaveAttribute("data-tour-step", "moon-gap");
  await expect
    .poll(async () => scene.getAttribute("data-camera-transition-sequence"))
    .not.toBe(sequenceBeforeMoonGap);
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
    { timeout: 30_000 },
  );
  await expect(flightAnnouncer(scene)).toHaveText("");
  const changes = await liveChanges(page);
  expect(
    changes.filter((change) => /Flying to|Arrived at/u.test(change)),
    changes.join("\n"),
  ).toEqual([]);
});

test("labels without a font size stop the scene with an error, not silent overlaps", async ({
  page,
}) => {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = ".body-label { font-size: 0 !important; }";
      document.head.append(style);
    });
  });
  const error = page.waitForEvent("pageerror", { timeout: 30_000 });
  await page.goto("/");
  expect((await error).message).toContain(
    "Body label font size is unavailable",
  );
});
