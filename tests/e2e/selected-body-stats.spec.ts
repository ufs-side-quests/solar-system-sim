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
  await expect(page.getByText("How heavy", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Our home: other worlds are weighed against it"),
  ).toBeVisible();
  await page.getByText("More detail", { exact: true }).click();
  await expect(page.getByText("5.9722 × 10²⁴ kg")).toBeVisible();
  // Composition is under More detail.
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
  await page.getByText("More detail", { exact: true }).click();
  await expect(
    page.getByText("Speed relative to the Sun", { exact: true }),
  ).toBeVisible();

  await selectFocus(focus, "Moon");
  await expect(scene).toHaveAttribute("data-focus-body", "moon");
  await expect(
    page.getByText("Speed relative to Earth", { exact: true }),
  ).toBeVisible();

  // A catalogue moon has no installed mass, composition or surface map, so
  // the card leaves those rows out.
  await selectFocus(focus, "Amalthea (Jupiter)");
  const amaltheaCard = page.locator(".selected-body-detail");
  await expect(amaltheaCard).toContainText("Amalthea");
  for (const label of ["How heavy", "Composition", "Surface"]) {
    await expect(
      amaltheaCard.getByText(label, { exact: true }),
      label,
    ).toHaveCount(0);
  }
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
  // On a phone a flight leaves the card short; the facts are one tap away.
  await page
    .getByRole("button", { name: "Expand selected body details" })
    .click();
  await expect(
    page.getByText("Our home: other worlds are weighed against it"),
  ).toBeVisible();
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
  await expect(
    card.getByText("Real spacecraft pictures joined into one map"),
  ).toBeVisible();
  await expect(
    card.locator('[data-surface-classification="observational-composite"]'),
  ).toBeVisible();
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
  const sunCentreLabel = "Distance from the Sun, centre to centre (live)";
  await expect(row(sunCentreLabel)).toBeHidden();
  await card.getByText("More detail", { exact: true }).click();
  await expect(row(sunCentreLabel)).toHaveText(
    /^Distance from the Sun, centre to centre \(live\)4,[45]\d\d,\d{3},\d{3} km$/u,
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
    /^From Earththe gap is about (?:2[789]|3[01]) times as wide as Earth$/u,
  );
  await expect(row("Sunlight")).toHaveCount(0);
  await card.getByText("More detail", { exact: true }).click();
  await expect(row("Distance from Earth, centre to centre (live)")).toHaveText(
    /^Distance from Earth, centre to centre \(live\)(?:3[5-9]\d|40\d),\d{3} km$/u,
  );
  await page.screenshot({
    path: testInfo.outputPath("selected-body-distance-moon.png"),
    animations: "disabled",
  });
  await card.getByText("More detail", { exact: true }).click();

  await selectFocus(focus, "Io");
  await expect(scene).toHaveAttribute("data-focus-body", "io");
  await expect(row("From Jupiter")).toHaveText(
    /^From Jupiterthe gap is about 2\.[45] times as wide as Jupiter$/u,
  );

  await selectFocus(focus, "Deimos");
  await expect(scene).toHaveAttribute("data-focus-body", "deimos");
  await expect(row("From Mars")).toHaveText(
    "From Marsthe gap is about 3 times as wide as Mars",
  );

  await selectFocus(focus, "Phobos");
  await expect(scene).toHaveAttribute("data-focus-body", "phobos");
  await expect(row("From Mars")).toHaveText(
    "From Marsthe gap is almost as wide as Mars",
  );

  // Mercury runs from 46 to 70 million km, so Earth is 2.1 to 3.3 times as far.
  await selectFocus(focus, "Mercury");
  await expect(scene).toHaveAttribute("data-focus-body", "mercury");
  await expect(row("From the Sun")).toHaveText(
    /^From the Sunabout (?:4[67]|[56]\d|70) million km\. Earth is about (?:2\.\d|3\.[0-3]) times as far\.$/u,
  );

  // Saturn runs from 9.0 to 10.1 AU: sunlight takes 75 to 84 minutes.
  await selectFocus(focus, "Saturn");
  await expect(scene).toHaveAttribute("data-focus-body", "saturn");
  await expect(row("Sunlight")).toHaveText(
    /^Sunlighttakes about 1 hour (?:15|20|25) minutes to get here$/u,
  );
});

test("spacecraft and fictional cards keep distances steady and exact values in More detail", async ({
  page,
}, testInfo) => {
  // Four focus flights of up to 12 s each, plus the start.
  test.setTimeout(120_000);
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

  await selectFocus(focus, "Voyager 1 (interstellar space)");
  await expect(scene).toHaveAttribute("data-focus-body", "voyager-1");
  await expect(row("From the Sun")).toHaveText(
    /^From the Sunabout 1[67]\d times as far as Earth \(about 2[4-7] billion km\)$/u,
  );
  await expect(row("Sunlight")).toHaveText(
    /^Sunlighttakes about 2[2-4] hours to get here$/u,
  );
  const sunCentreLabel = "Distance from the Sun, centre to centre (live)";
  await expect(row(sunCentreLabel)).toBeHidden();
  await card.getByText("More detail", { exact: true }).click();
  await expect(row(sunCentreLabel)).toHaveText(
    /^Distance from the Sun, centre to centre \(live\)2\d,\d{3},\d{3},\d{3} km$/u,
  );
  await expect(row("Distance from the Sun in AU (live)")).toHaveText(
    /^Distance from the Sun in AU \(live\)1[67]\d\.\d{3} AU$/u,
  );
  await page.screenshot({
    path: testInfo.outputPath("selected-body-distance-voyager-1.png"),
    animations: "disabled",
  });
  await card.getByText("More detail", { exact: true }).click();

  // The Roadster runs from about 0.99 to 1.66 AU from the Sun.
  await selectFocus(focus, "Tesla Roadster and Starman");
  await expect(scene).toHaveAttribute("data-focus-body", "roadster");
  await expect(row("From the Sun")).toHaveText(
    /^From the Sun(?:about as far as Earth|about 1\.[1-7] times as far as Earth) \(about (?:1[4-9]\d|2[0-5]\d) million km\)$/u,
  );
  await expect(row("Sunlight")).toHaveText(
    /^Sunlighttakes about (?:[89]|1[0-4]) minutes to get here$/u,
  );

  await selectFocus(focus, "International Space Station (Earth)");
  await expect(scene).toHaveAttribute("data-focus-body", "iss");
  const issRow = row("From the centre of Earth");
  await expect(issRow).toHaveText(
    /^From the centre of Earthabout 6,[6-9]00 km$/u,
  );
  const issDistance = await issRow.textContent();
  if (issDistance === null) {
    throw new Error("The ISS distance row has no text");
  }
  await card.getByText("More detail", { exact: true }).click();
  await expect(row("From the centre of Earth (live)")).toHaveText(
    /^From the centre of Earth \(live\)6,[6-9]\d\d km$/u,
  );
  await card.getByText("More detail", { exact: true }).click();
  // The card row no longer switches units or digits with camera zoom.
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
    { timeout: 35_000 },
  );
  await expect(scene).toHaveAttribute("data-semantic-zoom-level", "surface");
  await expect(issRow).toHaveText(issDistance);
  await page.mouse.move(720, 450);
  await expect
    .poll(async () => {
      await page.mouse.wheel(0, 2_000);
      return scene.getAttribute("data-semantic-zoom-level");
    })
    .toBe("moon-system");
  await expect(issRow).toHaveText(issDistance);

  await selectFocus(focus, "USS Defiant (fictional)");
  await expect(scene).toHaveAttribute("data-focus-body", "uss-defiant");
  await expect(row("Distance from Deep Space Nine")).toHaveText(
    "Distance from Deep Space Nineabout 2.5 km",
  );
  await card.getByText("More detail", { exact: true }).click();
  await expect(row("Distance from Deep Space Nine (live)")).toHaveText(
    /^Distance from Deep Space Nine \(live\)2\.\d{1,3} km$/u,
  );
});

test("the card and the time line use words a child can read", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  await expect(scene).toHaveAttribute(
    "data-rendered-time-seconds",
    /-?\d+(?:\.\d+)?/u,
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Pause" }).click();
  const focus = page.getByRole("combobox", { name: "Focus" });
  const card = page.locator(".selected-body-detail");
  const more = card.locator(".selected-body-more");
  // The main card is everything outside "More detail".
  const mainText = async (): Promise<string> =>
    card.evaluate((element) => {
      const copy = element.cloneNode(true) as HTMLElement;
      copy.querySelector(".selected-body-more")?.remove();
      return copy.textContent;
    });
  const jargon =
    /× 10|Not provided|authority snapshot|Neutral|asset|Geocentric|OMM|SGP4|observational-composite/u;

  await selectFocus(focus, "Jupiter");
  await expect(scene).toHaveAttribute("data-focus-body", "jupiter");
  await expect(card).toContainText("How heavy");
  await expect(card).toContainText("As heavy as 318 Earths");
  expect(await mainText()).not.toMatch(jargon);
  await more.getByText("More detail", { exact: true }).click();
  await expect(more).toContainText("1.8981 × 10²⁷ kg");
  await expect(more).not.toContainText("observational-composite");

  for (const name of ["Amalthea (Jupiter)", "Pasiphae (Jupiter)"]) {
    await selectFocus(focus, name);
    await expect(card).toContainText(name.replace(/ \(.*/u, ""));
    expect(await mainText()).not.toMatch(jargon);
  }

  await selectFocus(focus, "International Space Station (Earth)");
  await expect(scene).toHaveAttribute("data-focus-body", "iss");
  await expect(card).toContainText("From the centre of Earth");
  expect(await mainText()).not.toMatch(jargon);
  await more.getByText("More detail", { exact: true }).click();
  await expect(more).toContainText("SGP4");
  await expect(more).toContainText("±7 day OMM window");

  const time = page.locator(".time-readout output");
  await expect(time).toHaveText(/after the start$/u);
  await expect(time).toHaveAttribute("title", /^TDB \+/u);
});

test("spacecraft and fictional cards use plain words, with exact values in More detail", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  await expect(scene).toHaveAttribute(
    "data-rendered-time-seconds",
    /-?\d+(?:\.\d+)?/u,
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Pause" }).click();
  const focus = page.getByRole("combobox", { name: "Focus" });
  const card = page.locator(".selected-body-detail");
  const more = card.locator(".selected-body-more");
  const mainText = async (): Promise<string> =>
    card.evaluate((element) => {
      const copy = element.cloneNode(true) as HTMLElement;
      copy.querySelector(".selected-body-more")?.remove();
      return copy.textContent;
    });
  const jargon =
    /Orbit data|Horizons|Hermite|REBOUND|two-body|massless|gravity|barycentric|Display-only|Canonical|\d,\d{3} kg|Maximum footprint|Unknown · fictional|Fictional ·/u;

  for (const [name, bodyId, heavy] of [
    ["Hubble Space Telescope", "hubble", "About 11 tonnes"],
    ["Voyager 1 (interstellar space)", "voyager-1", "About 733 kg"],
    ["International Space Station (Earth)", "iss", "About 420 tonnes"],
    ["Death Star I (fictional)", "death-star-1", "Made up"],
    ["Discovery One (fictional)", "discovery-one", "Made up"],
    ["Jovian Monolith (fictional)", "jovian-monolith", "Nobody knows"],
  ] as const) {
    await selectFocus(focus, name);
    await expect(scene).toHaveAttribute("data-focus-body", bodyId);
    await expect(card).toContainText("How heavy");
    await expect(card).toContainText("Its path");
    await expect(card).toContainText(heavy);
    expect(await mainText(), name).not.toMatch(jargon);
    await more.getByText("More detail", { exact: true }).click();
    await expect(more).toContainText("Orbit data");
    await expect(more).toContainText("Mass");
    await more.getByText("More detail", { exact: true }).click();
  }
});
