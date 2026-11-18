import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { FICTIONAL_ORBITERS } from "../../src/scene/fictional-orbiters";

const ASTRONOMICAL_UNIT_M = 149_597_870_700;
// Zoom stops 1.2 radii from the focused body's centre (MINIMUM_CAMERA_DISTANCE_RADII).
const FLOOR_RADII = 1.2;

const snapshot = JSON.parse(
  readFileSync("src/data/major-bodies.snapshot.json", "utf8"),
) as { bodies: { id: string; meanRadiusM: number }[] };

function meanRadiusM(id: string): number {
  const body = snapshot.bodies.find((candidate) => candidate.id === id);
  if (body === undefined) {
    throw new Error(`The snapshot has no ${id}`);
  }
  return body.meanRadiusM;
}

function deathStarIIRadiusM(): number {
  const orbiter = FICTIONAL_ORBITERS.find(
    (candidate) => candidate.id === "death-star-2",
  );
  if (orbiter === undefined) {
    throw new Error("Death Star II is not a fictional orbiter");
  }
  return orbiter.diameterM / 2;
}

async function openScene(page: Page): Promise<Locator> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  await expect(scene).toHaveAttribute("data-rendered-time-seconds", /-?\d+/u, {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  return scene;
}

// One press of Zoom in or Zoom out. It returns once the scene has moved the
// camera and the button shows whether the camera is now at that limit.
async function pressZoom(
  page: Page,
  scene: Locator,
  name: "Zoom in" | "Zoom out",
): Promise<void> {
  const button = page.getByRole("button", { name });
  const limit =
    name === "Zoom in" ? "data-zoom-at-nearest" : "data-zoom-at-farthest";
  const before = await scene.getAttribute("data-camera-navigation-sequence");
  await button.click();
  await expect(scene).not.toHaveAttribute(
    "data-camera-navigation-sequence",
    before ?? "",
  );
  await expect
    .poll(
      async () =>
        String(await button.isDisabled()) === (await scene.getAttribute(limit)),
    )
    .toBe(true);
}

// Each press moves 1/1.7 closer. The press count takes the camera far past
// the floor from where the view starts; Zoom in turns off at the floor, so
// the presses stop there.
async function zoomIn(
  page: Page,
  scene: Locator,
  presses: number,
): Promise<number> {
  const zoomInButton = page.getByRole("button", { name: "Zoom in" });
  for (let press = 0; press < presses; press += 1) {
    if (await zoomInButton.isDisabled()) {
      break;
    }
    await pressZoom(page, scene, "Zoom in");
  }
  let lastDistance = Number.NaN;
  await expect
    .poll(async () => {
      const distance = Number(
        await scene.getAttribute("data-camera-distance-au"),
      );
      const settled = distance === lastDistance;
      lastDistance = distance;
      return settled;
    })
    .toBe(true);
  return lastDistance;
}

const FOCUSED_BODIES = [
  { name: "Earth", id: "earth", radiusM: meanRadiusM("earth") },
  {
    name: "Death Star II (fictional)",
    id: "death-star-2",
    radiusM: deathStarIIRadiusM(),
  },
  // Half the Roadster's 3.946 m length (spacecraft-assets.ts).
  { name: "Tesla Roadster and Starman", id: "roadster", radiusM: 3.946 / 2 },
] as const;

for (const body of FOCUSED_BODIES) {
  test(`zoom stops outside ${body.name}`, async ({ page }) => {
    test.setTimeout(90_000);
    const scene = await openScene(page);
    const focus = page.getByRole("combobox", { name: "Focus" });
    await focus.fill(body.name);
    await focus.press("Enter");
    await expect(scene).toHaveAttribute("data-focus-body", body.id, {
      timeout: 30_000,
    });
    const distanceAu = await zoomIn(page, scene, 10);
    const floorAu = (body.radiusM * FLOOR_RADII) / ASTRONOMICAL_UNIT_M;
    expect(distanceAu).toBeGreaterThanOrEqual(floorAu * 0.999);
  });
}

test("zoom from the overview stops outside the Sun", async ({ page }) => {
  test.setTimeout(90_000);
  const scene = await openScene(page);
  // The overview starts tens of AU out: 30 presses come 8 million times closer.
  const distanceAu = await zoomIn(page, scene, 30);
  const floorAu = (meanRadiusM("sun") * FLOOR_RADII) / ASTRONOMICAL_UNIT_M;
  expect(distanceAu).toBeGreaterThanOrEqual(floorAu * 0.999);
});

test("Zoom in and Zoom out turn off at the floor and the ceiling", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const scene = await openScene(page);
  const zoomInButton = page.getByRole("button", { name: "Zoom in" });
  const zoomOutButton = page.getByRole("button", { name: "Zoom out" });
  const focus = page.getByRole("combobox", { name: "Focus" });
  await focus.fill("Earth");
  await focus.press("Enter");
  await expect(scene).toHaveAttribute("data-focus-body", "earth");
  await expect(zoomInButton).toBeEnabled();
  const distanceAu = await zoomIn(page, scene, 20);
  const floorAu = (meanRadiusM("earth") * FLOOR_RADII) / ASTRONOMICAL_UNIT_M;
  expect(distanceAu).toBeLessThanOrEqual(floorAu * 1.001);
  await expect(zoomInButton).toBeDisabled();
  await expect(zoomOutButton).toBeEnabled();
  await pressZoom(page, scene, "Zoom out");
  await expect(zoomInButton).toBeEnabled();

  for (let press = 0; press < 60; press += 1) {
    if (await zoomOutButton.isDisabled()) {
      break;
    }
    await pressZoom(page, scene, "Zoom out");
  }
  await expect(zoomOutButton).toBeDisabled();
  await expect(zoomInButton).toBeEnabled();
});
