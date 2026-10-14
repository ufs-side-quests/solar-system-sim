import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";

async function selectFocus(focus: Locator, label: string): Promise<void> {
  await focus.fill(label);
  await focus.press("Enter");
}

test("selected body stats identify their source and velocity reference", async ({
  page,
}, testInfo) => {
  await page.goto("/");

  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  const focus = page.getByRole("combobox", { name: "Focus" });

  await expect(scene).toHaveAttribute(
    "data-rendered-time-seconds",
    /-?\d+(?:\.\d+)?/u,
    { timeout: 30_000 },
  );

  await selectFocus(focus, "Earth");
  await expect(scene).toHaveAttribute("data-focus-body", "earth");
  await expect(page.getByText("Mass", { exact: true })).toBeVisible();
  await expect(page.getByText("5.9722 × 10²⁴ kg")).toBeVisible();
  await expect(
    page.getByText("Speed relative to the Sun", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Composition", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "Iron-nickel core, silicate mantle and crust, with surface water",
    ),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Source" })).toHaveAttribute(
    "href",
    "https://science.nasa.gov/earth/facts/",
  );

  await selectFocus(focus, "Moon");
  await expect(scene).toHaveAttribute("data-focus-body", "moon");
  await expect(
    page.getByText("Speed relative to Earth", { exact: true }),
  ).toBeVisible();

  await selectFocus(focus, "Amalthea (Jupiter)");
  await expect(page.getByText("Not provided by source")).toBeVisible();
  await expect(
    page.getByText("Not provided by the installed authority snapshot"),
  ).toBeVisible();
  await expect(
    page.getByText("Speed relative to Jupiter", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Distance from Jupiter", { exact: true }),
  ).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath("selected-body-stats.png"),
    animations: "disabled",
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await selectFocus(focus, "Earth");
  await expect(page.getByText("5.9722 × 10²⁴ kg")).toBeVisible();
  await expect(page.getByRole("button", { name: "Display" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: testInfo.outputPath("selected-body-stats-mobile.png"),
    animations: "disabled",
  });
});

test("selected body card answers how big and how long a year is", async ({
  page,
}) => {
  await page.goto("/");
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  const focus = page.getByRole("combobox", { name: "Focus" });
  const card = page.locator(".selected-body-detail");
  await expect(scene).toHaveAttribute(
    "data-rendered-time-seconds",
    /-?\d+(?:\.\d+)?/u,
    { timeout: 30_000 },
  );

  await selectFocus(focus, "Mars");
  await expect(scene).toHaveAttribute("data-focus-body", "mars");
  await expect(card.getByText("Size", { exact: true })).toBeVisible();
  await expect(
    card.getByText("One trip around the Sun", { exact: true }),
  ).toBeVisible();
  await expect(
    card.locator("span", {
      has: page.getByText("One trip around the Sun", { exact: true }),
    }),
  ).toContainText("about 687 Earth days (1.9 years)");
  await expect(card).toContainText(
    /times faster than a jet airliner \(900 km\/h\)/u,
  );

  await selectFocus(focus, "Jupiter");
  await expect(scene).toHaveAttribute("data-focus-body", "jupiter");
  await expect(card.getByText("As wide as 11 Earths")).toBeVisible();
  await expect(card.getByText("Rotation angle", { exact: true })).toBeHidden();
  await card.getByText("More detail", { exact: true }).click();
  await expect(card.getByText("Rotation angle", { exact: true })).toBeVisible();
  await expect(card.getByText("observational-composite")).toBeVisible();
});

test("selected body card states sourced year lengths and planet spin", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  const focus = page.getByRole("combobox", { name: "Focus" });
  const card = page.locator(".selected-body-detail");
  const row = (label: string): Locator =>
    card.locator("span", {
      has: page.getByText(label, { exact: true }),
    });
  const timeOutput = page.locator(".time-readout output");
  await expect(scene).toHaveAttribute(
    "data-rendered-time-seconds",
    /-?\d+(?:\.\d+)?/u,
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Pause" }).click();

  const expectSourcedYears = async (): Promise<void> => {
    await selectFocus(focus, "Pluto");
    await expect(scene).toHaveAttribute("data-focus-body", "pluto");
    await expect(row("One trip around the Sun")).toHaveText(
      "One trip around the Sunabout 248 years",
    );
    await selectFocus(focus, "Earth");
    await expect(scene).toHaveAttribute("data-focus-body", "earth");
    await expect(row("One trip around the Sun")).toHaveText(
      "One trip around the Sunabout 365 Earth days (1 year)",
    );
  };

  await expectSourcedYears();
  await expect(row("One trip around the Sun")).toHaveAttribute(
    "title",
    "Sidereal orbital period · NASA NSSDC fact sheet",
  );
  await card.getByText("More detail", { exact: true }).click();
  await expect(row("This moment's orbit (live)")).toBeVisible();
  await expect(row("This moment's orbit (live)")).toContainText(
    /^This moment's orbit \(live\)3\d\d(?:\.\d)? days$/u,
  );
  await card.getByText("More detail", { exact: true }).click();

  const playbackRate = page.getByRole("slider", { name: "Playback rate" });
  await playbackRate.fill("4");
  await expect(page.locator(".playback-rate-control output")).toHaveText(
    "1 week / second",
  );
  const startSeconds = Number(
    await timeOutput.getAttribute("data-time-seconds"),
  );
  await page.getByRole("button", { name: "Step forward" }).click();
  await page.getByRole("button", { name: "Step forward" }).click();
  await expect
    .poll(
      async () =>
        Number(await timeOutput.getAttribute("data-time-seconds")) -
        startSeconds,
      { timeout: 60_000 },
    )
    .toBeCloseTo(14 * 86_400, 0);
  await expectSourcedYears();

  await selectFocus(focus, "Moon");
  await expect(scene).toHaveAttribute("data-focus-body", "moon");
  await expect(row("One trip around Earth")).toHaveText(
    "One trip around Earthabout 27 Earth days",
  );
  await expect(row("One spin")).toHaveText("One spinabout 27 Earth days");

  await selectFocus(focus, "Venus");
  await expect(scene).toHaveAttribute("data-focus-body", "venus");
  await expect(row("One spin")).toHaveText(
    "One spinabout 243 Earth days, spins backwards",
  );
  await expect(row("Surface")).toHaveText(
    "SurfaceRadar map of the ground under the clouds",
  );

  await selectFocus(focus, "Uranus");
  await expect(scene).toHaveAttribute("data-focus-body", "uranus");
  await expect(row("One trip around the Sun")).toHaveText(
    "One trip around the Sunabout 84 years",
  );
  await expect(row("One spin")).toHaveText(
    "One spinabout 17.2 hours, spins on its side",
  );

  await selectFocus(focus, "Jupiter");
  await expect(scene).toHaveAttribute("data-focus-body", "jupiter");
  await expect(row("One spin")).toHaveText("One spinabout 9.9 hours");
  await page.screenshot({
    path: testInfo.outputPath("selected-body-sourced-years.png"),
    animations: "disabled",
  });
});

test("selected body card gives distances a child can feel", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  const focus = page.getByRole("combobox", { name: "Focus" });
  const card = page.locator(".selected-body-detail");
  const row = (label: string): Locator =>
    card.locator("span", {
      has: page.getByText(label, { exact: true }),
    });
  await expect(scene).toHaveAttribute(
    "data-rendered-time-seconds",
    /-?\d+(?:\.\d+)?/u,
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Pause" }).click();

  await selectFocus(focus, "Neptune");
  await expect(scene).toHaveAttribute("data-focus-body", "neptune");
  await expect(row("From the Sun")).toHaveText(
    /^From the Sunabout 30 times as far as Earth \(about 4\.[45] billion km\)$/u,
  );
  await expect(row("Sunlight")).toHaveText(
    "Sunlighttakes about 4 hours to get here",
  );
  await expect(row("Distance from the Sun (live)")).toBeHidden();
  await card.getByText("More detail", { exact: true }).click();
  await expect(row("Distance from the Sun (live)")).toHaveText(
    /^Distance from the Sun \(live\)4,[45]\d\d,\d{3},\d{3} km$/u,
  );
  await expect(row("Distance from the Sun in AU (live)")).toHaveText(
    /^Distance from the Sun in AU \(live\)(?:29|30)\.\d{3} AU$/u,
  );
  await page.screenshot({
    path: testInfo.outputPath("selected-body-distance-neptune.png"),
    animations: "disabled",
  });
  await card.getByText("More detail", { exact: true }).click();

  await selectFocus(focus, "Earth");
  await expect(scene).toHaveAttribute("data-focus-body", "earth");
  await expect(row("From the Sun")).toHaveText(
    "From the Sunabout 150 million km",
  );
  await expect(row("Sunlight")).toHaveText(
    "Sunlighttakes about 8 minutes to get here",
  );

  await selectFocus(focus, "Moon");
  await expect(scene).toHaveAttribute("data-focus-body", "moon");
  await expect(row("From Earth")).toHaveText(
    /^From Earthabout (?:2[789]|3[01]) Earths would fit in the gap$/u,
  );
  await expect(row("Sunlight")).toHaveCount(0);
  await card.getByText("More detail", { exact: true }).click();
  await expect(row("Distance from Earth (live)")).toHaveText(
    /^Distance from Earth \(live\)(?:3[5-9]\d|40\d),\d{3} km$/u,
  );
  await page.screenshot({
    path: testInfo.outputPath("selected-body-distance-moon.png"),
    animations: "disabled",
  });
  await card.getByText("More detail", { exact: true }).click();

  await selectFocus(focus, "Io");
  await expect(scene).toHaveAttribute("data-focus-body", "io");
  await expect(row("From Jupiter")).toHaveText(
    /^From Jupiterabout 2\.[45] Jupiters would fit in the gap$/u,
  );
});
