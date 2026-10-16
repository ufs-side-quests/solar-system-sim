import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import sharp from "sharp";

// Lamps drawn on the sourced models (src/scene/model-lights.ts). The scene
// reports each lamp of the focused model with its screen position, colour, on
// state, facing (the cosine between the hull normal at the lamp and the
// direction to the camera) and sunlit share (how much of a lamp that fades on
// a sunlit hull still shows: 1 for every other lamp).

type ReportedLamp = Readonly<{
  name: string;
  color: string;
  x: number;
  y: number;
  on: boolean;
  facing: number;
  sunlitShare: number;
}>;

type Frame = Readonly<{ data: Buffer; width: number; channels: number }>;

async function openScene(page: Page, reducedMotion: boolean): Promise<Locator> {
  await page.emulateMedia({
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const scene = page.getByRole("img", {
    name: /Physics-driven Solar System/u,
  });
  await expect(scene).toHaveAttribute("data-rendered-time-seconds", /-?\d+/u, {
    timeout: 30_000,
  });
  // A paused clock keeps each model's pose near the start of the run.
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  return scene;
}

async function focusModel(
  page: Page,
  scene: Locator,
  name: string,
  bodyId: string,
): Promise<void> {
  await focusBody(page, scene, name, bodyId);
  await expect(scene).toHaveAttribute("data-model-light-body", bodyId, {
    timeout: 60_000,
  });
  await settleView(page, scene);
}

async function focusBody(
  page: Page,
  scene: Locator,
  name: string,
  bodyId: string,
): Promise<void> {
  const focus = page.getByRole("combobox", { name: "Focus" });
  await focus.fill(name);
  await focus.press("Enter");
  await expect(scene).toHaveAttribute("data-focus-body", bodyId);
  await expect(scene).toHaveAttribute("data-local-shadow-body", bodyId, {
    timeout: 60_000,
  });
}

async function settleView(page: Page, scene: Locator): Promise<void> {
  // Reduced motion moves the camera in one step and reports no phase.
  await expect
    .poll(
      async () =>
        String(await scene.getAttribute("data-camera-transition-phase")),
      {
        timeout: 60_000,
      },
    )
    .toMatch(/^settled$|^null$/u);
  await expect
    .poll(
      async () =>
        Math.abs(
          Number(await scene.getAttribute("data-camera-exposure")) /
            Number(await scene.getAttribute("data-camera-exposure-target")) -
            1,
        ),
      { timeout: 30_000 },
    )
    .toBeLessThan(0.005);
  // Only the model layer shows, so no panel or label covers a lamp.
  await page.addStyleTag({
    content:
      "body * { visibility: hidden; } .scene, .scene canvas.major-body-layer { visibility: visible; } .scene > :not(canvas.major-body-layer) { visibility: hidden; }",
  });
}

async function reportedLamps(scene: Locator): Promise<ReportedLamp[]> {
  const json = await scene.getAttribute("data-model-lights");
  if (json === null) throw new Error("data-model-lights is missing");
  return JSON.parse(json) as ReportedLamp[];
}

async function canvasFrame(page: Page): Promise<Frame> {
  const png = await page
    .locator("canvas.major-body-layer")
    .screenshot({ animations: "disabled" });
  const { data, info } = await sharp(png)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, channels: info.channels };
}

function pixelsNear(
  frame: Frame,
  lamp: ReportedLamp,
  radiusPx: number,
): [number, number, number][] {
  const pixels: [number, number, number][] = [];
  const height = frame.data.length / frame.width / frame.channels;
  for (let dy = -radiusPx; dy <= radiusPx; dy += 1) {
    for (let dx = -radiusPx; dx <= radiusPx; dx += 1) {
      if (dx * dx + dy * dy > radiusPx * radiusPx) continue;
      const x = Math.round(lamp.x) + dx;
      const y = Math.round(lamp.y) + dy;
      if (x < 0 || y < 0 || x >= frame.width || y >= height) continue;
      const offset = (y * frame.width + x) * frame.channels;
      pixels.push([
        frame.data[offset] ?? Number.NaN,
        frame.data[offset + 1] ?? Number.NaN,
        frame.data[offset + 2] ?? Number.NaN,
      ]);
    }
  }
  return pixels;
}

function lampRgb(lamp: ReportedLamp): number[] {
  return [1, 3, 5].map((start) =>
    Number.parseInt(lamp.color.slice(start, start + 2), 16),
  );
}

/** A lamp colour near white, which a sunlit hull can match. */
function nearWhite(lamp: ReportedLamp): boolean {
  const rgb = lampRgb(lamp);
  return Math.min(...rgb) / Math.max(...rgb) > 0.8;
}

/**
 * Pixels near a coloured lamp that are bright and of its hue: each channel,
 * as a share of the brightest, within 0.3 of the lamp colour's.
 */
function lampColouredPixels(frame: Frame, lamp: ReportedLamp): number {
  if (nearWhite(lamp)) {
    throw new Error(`${lamp.name} is near white; its hue is not testable`);
  }
  const rgb = lampRgb(lamp);
  const lampPeak = Math.max(...rgb);
  return pixelsNear(frame, lamp, 6).filter((pixel) => {
    const peak = Math.max(...pixel);
    return (
      peak >= 200 &&
      pixel.every(
        (channel, index) =>
          Math.abs(channel / peak - (rgb[index] ?? Number.NaN) / lampPeak) <=
          0.3,
      )
    );
  }).length;
}

/**
 * Pixels near a lamp at full white. Only a lamp core reaches them: without
 * lamps no hull pixel near any lamp of the four models does.
 */
function saturatedPixels(frame: Frame, lamp: ReportedLamp): number {
  return pixelsNear(frame, lamp, 2).filter((pixel) => Math.min(...pixel) >= 250)
    .length;
}

/** A lamp core, or for a coloured lamp its glow, drawn at the lamp. */
function lampDrawn(frame: Frame, lamp: ReportedLamp): boolean {
  return (
    saturatedPixels(frame, lamp) >= 1 ||
    (!nearWhite(lamp) && lampColouredPixels(frame, lamp) >= 3)
  );
}

// The lamp count, and the coloured lamps whose hue must show. A coloured
// glow added to a sunlit white hull turns near white, so the hue is tested
// where the lamp has dark sky or red paint around it.
const MODELS = [
  {
    name: "Deep Space Nine (fictional)",
    bodyId: "deep-space-nine",
    lampCount: 11,
    hueLamps: ["lower pylon 1", "lower pylon 2", "lower pylon 3"],
  },
  {
    name: "Tesla Roadster and Starman",
    bodyId: "roadster",
    lampCount: 8,
    hueLamps: ["left inner tail light", "left outer tail light"],
  },
  {
    name: "Discovery One (fictional)",
    bodyId: "discovery-one",
    lampCount: 3,
    hueLamps: [],
  },
  {
    name: "International Space Station (Earth)",
    bodyId: "iss",
    lampCount: 4,
    hueLamps: [],
  },
  {
    name: "Death Star II (fictional)",
    bodyId: "death-star-2",
    lampCount: 183,
    hueLamps: [],
  },
  {
    name: "USS Defiant (fictional)",
    bodyId: "uss-defiant",
    lampCount: 7,
    hueLamps: [],
  },
  {
    name: "Hubble Space Telescope",
    bodyId: "hubble",
    lampCount: 3,
    hueLamps: [],
  },
  {
    name: "James Webb Space Telescope",
    bodyId: "jwst",
    lampCount: 3,
    hueLamps: [],
  },
  {
    name: "Voyager 1",
    bodyId: "voyager-1",
    lampCount: 3,
    hueLamps: [],
  },
  {
    name: "Voyager 2",
    bodyId: "voyager-2",
    lampCount: 3,
    hueLamps: [],
  },
] as const;

for (const model of MODELS) {
  test(`draws the lamps of ${model.bodyId} on the hull`, async ({ page }) => {
    test.setTimeout(150_000);
    const scene = await openScene(page, true);
    await focusModel(page, scene, model.name, model.bodyId);
    await expect(scene).toHaveAttribute(
      "data-model-light-count",
      String(model.lampCount),
    );
    const lamps = await reportedLamps(scene);
    const frame = await canvasFrame(page);
    // Every lamp turned toward the camera draws at its reported place. A
    // lamp that fades on a sunlit hull is tested where its hull is dark;
    // every lamp of the first four models shows in sunlight.
    const facingLamps = lamps.filter(
      (lamp) => lamp.facing >= 0.1 && lamp.sunlitShare === 1,
    );
    expect(facingLamps.length, JSON.stringify(lamps)).toBeGreaterThan(0);
    for (const lamp of facingLamps) {
      expect(lamp.on, lamp.name).toBe(true);
      expect(lampDrawn(frame, lamp), lamp.name).toBe(true);
    }
    for (const name of model.hueLamps) {
      const lamp = lamps.find((entry) => entry.name === name);
      if (lamp === undefined) throw new Error(`${name} is not reported`);
      expect(lampColouredPixels(frame, lamp), name).toBeGreaterThanOrEqual(3);
    }
    if (model.bodyId === "roadster") {
      // The near headlights face across the camera's view, so their glow is
      // faint; their warm-white core still shows on the red front wing.
      for (const name of ["left headlight", "left outer headlight"]) {
        const lamp = lamps.find((entry) => entry.name === name);
        if (lamp === undefined) throw new Error(`${name} is not reported`);
        expect(saturatedPixels(frame, lamp), name).toBeGreaterThanOrEqual(1);
      }
    }
  });
}

test("hides a lamp on the far side of Deep Space Nine behind its hull", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const scene = await openScene(page, true);
  await focusModel(
    page,
    scene,
    "Deep Space Nine (fictional)",
    "deep-space-nine",
  );
  const lamps = await reportedLamps(scene);
  const frame = await canvasFrame(page);
  // Lamps whose hull normal points well away from the camera: the hull lies
  // between them and the camera, so no part of the lamp may draw.
  const farLamps = lamps.filter((lamp) => lamp.facing <= -0.6);
  expect(farLamps.length, JSON.stringify(lamps)).toBeGreaterThan(0);
  for (const lamp of farLamps) {
    expect(lamp.on, lamp.name).toBe(true);
    expect(lampDrawn(frame, lamp), lamp.name).toBe(false);
  }
});

test("blinks the pylon lamps of Deep Space Nine, and holds them on under reduced motion", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const scene = await openScene(page, false);
  await focusModel(
    page,
    scene,
    "Deep Space Nine (fictional)",
    "deep-space-nine",
  );
  const pylon = (await reportedLamps(scene))
    .filter((lamp) => lamp.name.includes("pylon"))
    .reduce((best, lamp) => (lamp.facing > best.facing ? lamp : best));
  expect(pylon.facing).toBeGreaterThan(0);
  const lit = async (): Promise<boolean> =>
    lampDrawn(await canvasFrame(page), pylon);

  // The lamp blinks on the wall clock: 0.8 s on in every 2 s. Frames are
  // sampled until both states are seen.
  const seen = new Set<boolean>();
  await expect
    .poll(
      async () => {
        seen.add(await lit());
        return seen.size;
      },
      { timeout: 20_000, intervals: [0] },
    )
    .toBe(2);

  // Under reduced motion the lamp stays on for more than a whole period.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(async () => (await reportedLamps(scene)).every((lamp) => lamp.on))
    .toBe(true);
  const startedAt = Date.now();
  let frames = 0;
  while (Date.now() - startedAt < 3_000) {
    expect(await lit(), `frame ${String(frames)}`).toBe(true);
    frames += 1;
  }
  expect(frames).toBeGreaterThanOrEqual(3);
});

/** Pixels in a disc whose Rec. 709 luma (of the sRGB bytes) reaches a level. */
function brightPixelsInDisc(
  frame: Frame,
  centreX: number,
  centreY: number,
  radiusPx: number,
  lumaLevel: number,
): number {
  const height = frame.data.length / frame.width / frame.channels;
  let count = 0;
  for (
    let y = Math.max(0, Math.floor(centreY - radiusPx));
    y < Math.min(height, centreY + radiusPx);
    y += 1
  ) {
    for (
      let x = Math.max(0, Math.floor(centreX - radiusPx));
      x < Math.min(frame.width, centreX + radiusPx);
      x += 1
    ) {
      if ((x - centreX) ** 2 + (y - centreY) ** 2 > radiusPx ** 2) continue;
      const offset = (y * frame.width + x) * frame.channels;
      const luma =
        0.2126 * (frame.data[offset] ?? Number.NaN) +
        0.7152 * (frame.data[offset + 1] ?? Number.NaN) +
        0.0722 * (frame.data[offset + 2] ?? Number.NaN);
      if (luma >= lumaLevel) count += 1;
    }
  }
  return count;
}

/** Waits until the camera stops: two reads of its distance and phase agree. */
async function cameraAtRest(scene: Locator): Promise<void> {
  let last = "";
  await expect
    .poll(async () => {
      const now = `${String(await scene.getAttribute("data-camera-distance-au"))} ${String(await scene.getAttribute("data-camera-phase-angle-deg"))}`;
      const same = now === last;
      last = now;
      return same;
    })
    .toBe(true);
}

/**
 * Turns the camera about the focused body, by drags across the canvas, until
 * the Sun lies behind the body: a phase angle of at least 140 degrees.
 */
async function turnToNightSide(page: Page, scene: Locator): Promise<number> {
  const canvas = page.locator("canvas.major-body-layer");
  const box = await canvas.boundingBox();
  if (box === null) throw new Error("The scene canvas has no box");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height * 0.8;
  for (let drag = 0; drag < 8; drag += 1) {
    const phase = Number(
      await scene.getAttribute("data-camera-phase-angle-deg"),
    );
    if (phase >= 140) return phase;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 100, startY, { steps: 10 });
    await page.mouse.up();
    await cameraAtRest(scene);
  }
  throw new Error("The camera did not reach the night side");
}

test("shows lamps on the night side of Death Star II, far and near", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const scene = await openScene(page, true);
  await focusBody(page, scene, "Death Star II (fictional)", "death-star-2");
  await expect(scene).toHaveAttribute("data-deathstar2-model-loaded", "true", {
    timeout: 60_000,
  });
  await settleView(page, scene);
  await turnToNightSide(page, scene);
  const label = page.locator('.body-label[data-body-id="death-star-2"]');
  // The inner 80 % of the disc: the thin sunlit crescent at the limb is
  // outside it, so only light on the night side counts.
  const nightSidePixels = async (): Promise<number> => {
    await cameraAtRest(scene);
    return brightPixelsInDisc(
      await canvasFrame(page),
      Number(await label.getAttribute("data-screen-x")),
      Number(await label.getAttribute("data-screen-y")),
      0.8 * Number(await label.getAttribute("data-radius-pixels")),
      160,
    );
  };
  // At the default focus distance, and two zoom steps closer.
  const far = await nightSidePixels();
  for (let press = 0; press < 2; press += 1) {
    // The style above hides the controls, so the click is dispatched.
    await page.locator('button[aria-label="Zoom in"]').dispatchEvent("click");
  }
  const near = await nightSidePixels();
  test.info().annotations.push({
    type: "night-side bright pixels",
    description: `far ${String(far)}, near ${String(near)}`,
  });
  expect(far, "far").toBeGreaterThanOrEqual(200);
  expect(near, "near").toBeGreaterThanOrEqual(200);
});

test("leaves the sunlit hull of Death Star II free of hull lamps", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const scene = await openScene(page, true);
  await focusModel(page, scene, "Death Star II (fictional)", "death-star-2");
  const lamps = await reportedLamps(scene);
  const frame = await canvasFrame(page);
  // Hull lamps turned toward the camera on the sunlit hull: they fade there,
  // so none of them draws its white-hot core. (Their warm hue is no test
  // here: the sunlit hull itself is warm grey.)
  const sunlitLamps = lamps.filter(
    (lamp) =>
      lamp.name.startsWith("hull lamp") &&
      lamp.facing >= 0.3 &&
      lamp.sunlitShare === 0,
  );
  expect(sunlitLamps.length, JSON.stringify(lamps)).toBeGreaterThanOrEqual(20);
  for (const lamp of sunlitLamps) {
    expect(saturatedPixels(frame, lamp), lamp.name).toBe(0);
  }
});
