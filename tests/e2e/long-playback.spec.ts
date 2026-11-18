import { expect, test } from "@playwright/test";

const TEN_YEARS_SECONDS = 10 * 365.25 * 86_400;

test("plays at one year per second for a decade without stopping the simulation", async ({
  page,
}) => {
  // The macOS CI runner achieves about 16 days a second at this rate (a
  // laptop about 190), so a decade takes up to about four minutes there.
  test.setTimeout(360_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  await expect(page.locator("canvas.major-body-layer")).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("slider", { name: "Playback rate" }).fill("6");
  await expect(
    page.getByText("1 year / second", { exact: true }),
  ).toBeVisible();

  // SGP4 reports ISS decay about nine years after the element epoch; the
  // clock must pass that date while the simulation keeps running.
  const timeOutput = page.locator(".time-readout output");
  await expect
    .poll(
      async () => Number(await timeOutput.getAttribute("data-time-seconds")),
      { timeout: 300_000 },
    )
    .toBeGreaterThan(TEN_YEARS_SECONDS);
  await expect(page.getByText(/Simulation stopped/u)).toHaveCount(0);
  await expect(
    page.getByRole("img", { name: /Physics-driven Solar System/u }),
  ).toHaveAttribute("data-iss-ephemeris-valid", "false");
  expect(pageErrors).toEqual([]);
});
