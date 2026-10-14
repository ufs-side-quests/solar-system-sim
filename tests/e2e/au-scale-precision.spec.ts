import { expect, test } from "@playwright/test";

const FIXTURE_URL = "/tests/e2e/fixtures/au-scale-shadow-scene.ts";

// Scene units are AU, where float32 resolves about 9 km. A metre-scale shadow
// must still fall where the geometry puts it.
test("casts a 1 m block's shadow onto a floor 1.27 AU from the origin", async ({
  page,
}) => {
  // A page without the app, so only the fixture applies the patches.
  await page.goto(FIXTURE_URL);
  const { shadowed, lit } = await page.evaluate(async (url) => {
    const fixture = (await import(
      url
    )) as typeof import("./fixtures/au-scale-shadow-scene");
    return fixture.renderAuScaleShadow();
  }, FIXTURE_URL);
  // Measured: 0 in the shadow and 216 beside it; 216 in both without the
  // camera-relative lookup.
  expect(lit).toBeGreaterThan(100);
  expect(shadowed).toBeLessThan(lit / 4);
});
