import { expect, test } from "@playwright/test";

async function selectFocus(
  focus: import("@playwright/test").Locator,
  label: string,
): Promise<void> {
  await focus.fill(label);
  await focus.press("Enter");
}

test("renders Discovery One and presents every cinematic shot", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.goto("/");
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  await expect(scene).toHaveAttribute(
    "data-rendered-time-seconds",
    /-?\d+(?:\.\d+)?/u,
    { timeout: 30_000 },
  );
  await expect(scene).not.toHaveAttribute(
    "data-discoveryone-model-loaded",
    "true",
  );

  await selectFocus(
    page.getByRole("combobox", { name: "Focus" }),
    "Discovery One",
  );
  await expect(scene).toHaveAttribute("data-focus-body", "discovery-one");
  await expect(scene).toHaveAttribute(
    "data-camera-transition-phase",
    "settled",
    { timeout: 25_000 },
  );
  await expect(scene).toHaveAttribute(
    "data-discovery-one-visual-model",
    "cc-by-sketchfab-licensed-glb",
  );
  await expect(scene).toHaveAttribute(
    "data-discoveryone-model-loaded",
    "true",
    { timeout: 30_000 },
  );
  await expect(scene).toHaveAttribute(
    "data-discovery-one-geometry-visible",
    "true",
  );
  await expect(page.getByText("140.1 m long", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Display" }).click();
  await page.getByRole("tab", { name: "Camera" }).click();
  await page
    .getByRole("combobox", { name: "Zoom preset" })
    .selectOption("close");
  await page.getByRole("button", { name: "Close" }).click();
  await page.screenshot({
    path: testInfo.outputPath("discovery-one-focus.png"),
    animations: "disabled",
  });

  const shots = [
    ["Earth in daylight", "earth"],
    ["Saturn and its rings", "saturn"],
    ["Jupiter in daylight", "jupiter"],
    ["Moon in sunlight", "moon"],
    ["Voyager beyond the planets", "voyager-1"],
    ["Sun from Mercury", "mercury"],
  ] as const;
  for (const [shotName, expectedFocus] of shots) {
    await page.getByRole("button", { name: "Display" }).click();
    await page.getByRole("tab", { name: "Camera" }).click();
    const shotButton = page.getByRole("button", {
      name: shotName,
      exact: true,
    });
    await expect(shotButton).toBeVisible();
    await shotButton.click();
    await expect(scene).toHaveAttribute("data-focus-body", expectedFocus, {
      timeout: 15_000,
    });
    await expect(scene).toHaveAttribute("data-view-mode", "reality");
    await expect(scene).toHaveAttribute(
      "data-camera-transition-phase",
      "settled",
      { timeout: 25_000 },
    );
    await expect(page.getByText(/Physics engine failed/u)).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(
        `${shotName.toLowerCase().replaceAll(" ", "-")}.png`,
      ),
      animations: "disabled",
    });
  }
});

test("one tap from the first screen sets the planets racing round the Sun", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  await expect(scene).toHaveAttribute(
    "data-rendered-time-seconds",
    /-?\d+(?:\.\d+)?/u,
    { timeout: 30_000 },
  );
  await expect(scene).toHaveAttribute("data-view-mode", "reality");
  await expect(scene).toHaveAttribute("data-orbit-guide-count", "0");

  await page
    .getByRole("button", { name: "Planets racing", exact: true })
    .click();

  await expect(scene).toHaveAttribute("data-view-mode", "orrery");
  await expect(scene).toHaveAttribute("data-focus-body", "sun");
  await expect(scene).toHaveAttribute("data-planet-trails-visible", "true");
  await expect
    .poll(async () =>
      Number(await scene.getAttribute("data-orbit-guide-count")),
    )
    .toBeGreaterThan(0);
  await expect(page.locator(".cinematic-shot-caption")).toContainText(
    "Closer planets go round faster. Watch Mercury lap Earth.",
  );
  await expect(page.locator(".run-status")).toContainText(
    "30 days/s requested",
  );
  const timeOutput = page.locator(".time-readout output");
  const startTime = Number(await timeOutput.getAttribute("data-time-seconds"));
  await page.screenshot({
    path: testInfo.outputPath("planets-racing-0s.png"),
    animations: "disabled",
  });
  await expect
    .poll(
      async () =>
        (Number(await timeOutput.getAttribute("data-time-seconds")) -
          startTime) /
        86_400,
      { timeout: 10_000 },
    )
    .toBeGreaterThan(60);
  await page.screenshot({
    path: testInfo.outputPath("planets-racing-10s.png"),
    animations: "disabled",
  });
  await expect(page.getByText(/Simulation stopped/u)).toHaveCount(0);
});
