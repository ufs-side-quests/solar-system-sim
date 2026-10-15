import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";

const DEGREE = Math.PI / 180;
const EARTH_RADIUS_KM = 6_371;
// Horizons puts Hubble 6,841.6 to 6,861.8 km from Earth's centre over the
// installed coverage; the band widens that by the 10 km propagation bound
// that operational-spacecraft.test.ts checks.
const EARTH_ANGULAR_RADIUS_BAND_DEG = {
  minimum: Math.asin(EARTH_RADIUS_KM / 6_872) / DEGREE,
  maximum: Math.asin(EARTH_RADIUS_KM / 6_831) / DEGREE,
};

async function expectHubbleOnEarthOrbit(scene: Locator): Promise<void> {
  await expect(scene).toHaveAttribute("data-model-planetshine-source", "earth");
  const angularRadiusDeg = Number(
    await scene.getAttribute("data-model-planetshine-angular-radius-deg"),
  );
  expect(angularRadiusDeg).toBeGreaterThan(
    EARTH_ANGULAR_RADIUS_BAND_DEG.minimum,
  );
  expect(angularRadiusDeg).toBeLessThan(EARTH_ANGULAR_RADIUS_BAND_DEG.maximum);
}

test("keeps Hubble on its real orbit around the drawn Earth while time moves", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  await expect(scene).toHaveAttribute("data-rendered-time-seconds", /-?\d+/u, {
    timeout: 30_000,
  });

  const focus = page.getByRole("combobox", { name: "Focus" });
  await focus.fill("Hubble Space Telescope");
  await focus.press("Enter");
  await expect(scene).toHaveAttribute("data-focus-body", "hubble");
  await expect(scene).toHaveAttribute("data-hubble-model-loaded", "true", {
    timeout: 60_000,
  });
  await expect(scene).toHaveAttribute(
    "data-model-planetshine-source",
    "earth",
    {
      timeout: 60_000,
    },
  );
  await expectHubbleOnEarthOrbit(scene);

  const renderedTime = async (): Promise<number> =>
    Number(await scene.getAttribute("data-rendered-time-seconds"));
  // One step at 1 hour / second moves the clock one hour: two Hubble samples.
  await page.getByRole("slider", { name: "Playback rate" }).fill("2");
  const beforeStep = await renderedTime();
  await page.getByRole("button", { name: "Step forward" }).click();
  await expect
    .poll(renderedTime, { timeout: 60_000 })
    .toBeCloseTo(beforeStep + 3_600, 0);
  await expectHubbleOnEarthOrbit(scene);

  // Running draws Hubble at every frame's display time, between samples too.
  const beforeRun = await renderedTime();
  await page.getByRole("button", { name: "Run forward" }).click();
  await expect
    .poll(renderedTime, { timeout: 60_000 })
    .toBeGreaterThan(beforeRun + 2 * 3_600);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expectHubbleOnEarthOrbit(scene);

  expect(pageErrors).toEqual([]);
});
