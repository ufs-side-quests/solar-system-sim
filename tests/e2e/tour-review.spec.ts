import { expect, test } from "@playwright/test";
import sharp from "sharp";

const TOUR_SCENES = [
  ["earth", "Earth is already enormous"],
  ["moon-gap", "Most of the picture is empty space"],
  ["sun-atmosphere", "The Sun is more than a yellow ball"],
  ["sun-from-mars", "The Sun seen from Mars"],
  ["jupiter", "Jupiter is a system of its own"],
  ["jupiter-from-io", "Jupiter fills Io's sky"],
  ["earth-from-jupiter", "Earth seen from Jupiter"],
  ["saturn", "Saturn's rings dwarf Earth"],
  ["saturn-from-titan", "Saturn seen from Titan"],
  ["neptune", "Neptune is thirty times farther out"],
  ["voyager-2", "Voyager 2 follows a different road"],
  ["voyager-1", "Voyager 1 is almost lost in the dark"],
  ["solar-system", "The heliosphere is not the edge of the Solar System"],
  [
    "oort-cloud",
    "The Oort Cloud may reach more than a third of the way to the next star",
  ],
  ["alpha-centauri", "Alpha Centauri is another scale entirely"],
] as const;

test("renders every authored tour scene without browser or simulation errors", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("canvas.major-body-layer")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Scale tour" }).click();
  const tour = page.getByRole("dialog", {
    name: "Scale of the Solar System tour",
  });
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });

  for (const [index, [stepId, title]] of TOUR_SCENES.entries()) {
    await expect(tour).toHaveAttribute("data-tour-step", stepId);
    await expect(tour.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.locator(".error")).toHaveCount(0);
    if (stepId === "solar-system") {
      await expect(scene).toHaveAttribute(
        "data-deep-space-layer",
        "same-three-scene",
      );
      await expect(scene).toHaveAttribute("data-heliosphere-visible", "true");
      await expect(scene).toHaveAttribute(
        "data-heliopause-voyager-1-au",
        "122",
      );
      await expect(scene).toHaveAttribute(
        "data-heliopause-voyager-2-au",
        "119",
      );
      await expect(page.getByText("Heliopause · about 120 AU")).toBeVisible();
      await expect(tour).toContainText("solar wind inflates");
    }
    if (stepId === "oort-cloud") {
      await expect(scene).toHaveAttribute("data-oort-cloud-visible", "true");
      await expect(scene).toHaveAttribute("data-oort-inner-min-au", "2000");
      await expect(scene).toHaveAttribute("data-oort-outer-max-au", "100000");
      await expect(
        page.getByText("Oort Cloud · estimated 2,000-100,000 AU"),
      ).toBeVisible();
      await expect(tour).toContainText("not mapped objects");
    }
    if (stepId === "alpha-centauri") {
      await expect(scene).toHaveAttribute(
        "data-alpha-centauri-visible",
        "true",
      );
      await expect(scene).toHaveAttribute("data-alpha-distance-au", "272000");
      await expect(scene).toHaveAttribute(
        "data-solar-system-share-percent",
        /0\.0808/u,
      );
      await expect(scene).toHaveAttribute(
        "data-oort-cloud-share-percent",
        /36\.764/u,
      );
      await expect(
        page.getByText("Alpha Centauri · 4.3 light-years"),
      ).toBeVisible();
    }
    await page.waitForTimeout(300);
    await page.screenshot({
      path: testInfo.outputPath(
        `${String(index + 1).padStart(2, "0")}-${stepId}.png`,
      ),
      fullPage: true,
    });
    if (index < TOUR_SCENES.length - 1) {
      await page.getByRole("button", { name: "Next" }).click();
    }
  }

  expect(errors).toEqual([]);
});

type ScreenBox = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}>;

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
]) {
  test(`at ${String(viewport.width)} x ${String(viewport.height)} the Oort Cloud shell and its label fit the view`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
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
    const scene = page.getByRole("img", {
      name: /Physics-driven Solar System/u,
    });
    const boxOf = async (
      locator: ReturnType<typeof page.locator>,
    ): Promise<ScreenBox> => {
      const box = await locator.boundingBox();
      if (box === null) throw new Error("The element must be laid out");
      return {
        left: box.x,
        top: box.y,
        right: box.x + box.width,
        bottom: box.y + box.height,
      };
    };
    const shellBounds = async (): Promise<ScreenBox> => {
      const value = await scene.getAttribute("data-oort-shell-screen-bounds");
      const [left, top, right, bottom] = (value ?? "").split(",").map(Number);
      if (
        left === undefined ||
        top === undefined ||
        right === undefined ||
        bottom === undefined ||
        [left, top, right, bottom].some((part) => !Number.isFinite(part))
      ) {
        throw new Error(
          `The shell must be outside the camera: ${String(value)}`,
        );
      }
      return { left, top, right, bottom };
    };
    const expectInside = (inner: ScreenBox, outer: ScreenBox, what: string) => {
      const detail = `${what}: ${JSON.stringify({ inner, outer })}`;
      expect(inner.left, detail).toBeGreaterThanOrEqual(outer.left);
      expect(inner.top, detail).toBeGreaterThanOrEqual(outer.top);
      expect(inner.right, detail).toBeLessThanOrEqual(outer.right);
      expect(inner.bottom, detail).toBeLessThanOrEqual(outer.bottom);
    };
    const view = {
      left: 0,
      top: 0,
      right: viewport.width,
      bottom: viewport.height,
    };
    const oortLabel = page.getByText("Oort Cloud · estimated 2,000-100,000 AU");
    const sunLabel = page.getByText("Sun · Solar System origin");

    for (const [index, stepId] of TOUR_SCENES.map(([id]) => id).entries()) {
      await expect(tour).toHaveAttribute("data-tour-step", stepId);
      if (stepId === "oort-cloud" || stepId === "alpha-centauri") {
        await expect(async () => {
          const shell = await shellBounds();
          // The whole shell is on screen, and it is the subject, not a dot.
          expectInside(shell, view, `${stepId} shell`);
          expect(shell.bottom - shell.top).toBeGreaterThan(
            viewport.height * (stepId === "oort-cloud" ? 0.5 : 0.3),
          );
          // Its label sits on the shell, and the Sun's label is clear of
          // the card.
          const label = await boxOf(oortLabel);
          expectInside(label, view, `${stepId} label`);
          expect(label.top).toBeGreaterThanOrEqual(shell.top);
          expect(label.bottom).toBeLessThanOrEqual(shell.bottom);
          const sun = await boxOf(sunLabel);
          const card = await boxOf(tour);
          expect(
            sun.right <= card.left ||
              sun.left >= card.right ||
              sun.bottom <= card.top ||
              sun.top >= card.bottom,
            `Sun label ${JSON.stringify({ sun, card })}`,
          ).toBe(true);
        }).toPass({ timeout: 10_000 });
      }
      if (stepId === "alpha-centauri") {
        expectInside(
          await boxOf(page.getByText("Alpha Centauri · 4.3 light-years")),
          view,
          "Alpha Centauri label",
        );
      }
      if (index < TOUR_SCENES.length - 1) {
        await tour.getByRole("button", { name: "Next" }).click();
      }
    }
  });
}

test("Saturn seen from Titan shows Saturn's sunlit side at the step's own time", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("canvas.major-body-layer")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Scale tour" }).click();
  const tour = page.getByRole("dialog", {
    name: "Scale of the Solar System tour",
  });
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  for (const [stepId] of TOUR_SCENES) {
    await expect(tour).toHaveAttribute("data-tour-step", stepId);
    if (stepId === "saturn-from-titan") break;
    await tour.getByRole("button", { name: "Next" }).click();
  }
  // Reduced motion holds the tour, so the clock stays at the step's time.
  await expect(page.locator("time.global-simulation-clock")).toHaveAttribute(
    "datetime",
    "2026-01-08T20:00:00Z",
    { timeout: 30_000 },
  );
  await expect(scene).toHaveAttribute("data-camera-target-body", "saturn");
  await expect(tour).toContainText("thin line");
  await expect(tour.getByText("exact model time")).toHaveText(
    "8 January 2026 · exact model time",
  );

  // The middle of Saturn's disc is sunlit, not the dark night side.
  await page.waitForTimeout(500);
  const x = Number(await scene.getAttribute("data-camera-target-screen-x"));
  const y = Number(await scene.getAttribute("data-camera-target-screen-y"));
  const sceneBox = await scene.boundingBox();
  if (sceneBox === null) throw new Error("The scene must be laid out");
  const png = await page.screenshot({
    clip: {
      x: sceneBox.x + x - 12,
      y: sceneBox.y + y - 20,
      width: 24,
      height: 12,
    },
    animations: "disabled",
  });
  const { data, info } = await sharp(png)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (const byte of data) sum += byte;
  const brightness = sum / (info.width * info.height * info.channels);
  await page.screenshot({
    path: testInfo.outputPath("saturn-from-titan.png"),
    animations: "disabled",
  });
  expect(brightness).toBeGreaterThan(60);
});
