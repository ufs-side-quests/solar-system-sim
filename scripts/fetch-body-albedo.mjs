// Writes src/data/body-albedo.snapshot.json: the albedo of each body that a
// focused model orbits or sits near, from the NASA NSSDCA fact sheets, and
// the mean colour of the body's installed surface map.
// Usage: pnpm data:body-albedo
//
// The bodies are the planetshine sources of the scene's models: Earth (ISS,
// Hubble), Io (Discovery One), Ganymede (Death Star II), Callisto (Death Star
// I, Deep Space Nine and the Defiant) and Jupiter (the Jovian monolith).
// NSSDCA gives a Bond and a geometric albedo for the planets, and only a
// visual geometric albedo for the moons. Each body names the reflectance law
// that src/scene/planetshine.ts applies and the albedo that law takes:
//   lambert: the cloud-covered planets, with the Bond albedo;
//   lommel-seeliger: the airless moons, with the geometric albedo.
//
// The colour is the area-weighted (cosine of latitude) mean of the installed
// equirectangular surface map in linear sRGB. Earth's map is cloud free, so
// its clouds are composited as the scene draws them: white at 0.72 times the
// cloud map's opacity. The colour sets only the hue of the planetshine; the
// albedo sets its brightness.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import sharp from "sharp";

const OUTPUT_PATH = resolve("src/data/body-albedo.snapshot.json");
const TEXTURE_SNAPSHOT_PATH = resolve("src/data/nasa-textures.snapshot.json");
const FACT_SHEET_ROOT = "https://nssdc.gsfc.nasa.gov/planetary/factsheet/";
/** The scene draws Earth's clouds as white at this opacity (SolarSystemScene). */
const EARTH_CLOUD_OPACITY = 0.72;

const BODIES = [
  { id: "earth", page: "earthfact.html", law: "lambert" },
  { id: "jupiter", page: "jupiterfact.html", law: "lambert" },
  {
    id: "io",
    page: "joviansatfact.html",
    law: "lommel-seeliger",
    row: "Io (I)",
  },
  {
    id: "ganymede",
    page: "joviansatfact.html",
    law: "lommel-seeliger",
    row: "Ganymede (III)",
  },
  {
    id: "callisto",
    page: "joviansatfact.html",
    law: "lommel-seeliger",
    row: "Callisto (IV)",
  },
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** The page's text with tags removed and white space collapsed. */
function pageText(html) {
  return html
    .replaceAll(/<sup>[^<]*<\/sup>/gu, "")
    .replaceAll(/<[^>]*>/gu, " ")
    .replaceAll("&nbsp;", " ")
    .replaceAll(/\s+/gu, " ");
}

function parseNumber(text, pattern, what) {
  const match = pattern.exec(text);
  if (match === null) {
    throw new Error(`${what} not found`);
  }
  const value = Number(match[1]);
  if (!(value > 0 && value < 1)) {
    throw new Error(`${what} ${match[1]} is out of range`);
  }
  return value;
}

function parseReflectance(text, body) {
  const what = (field) => `${body.id}: ${field} on ${body.page}`;
  if (body.law === "lambert") {
    // A planet sheet: "Bond albedo 0.294" (Earth), or the first column of
    // the table row (Jupiter, in a table that compares it with Earth).
    return {
      law: body.law,
      bondAlbedo: parseNumber(
        text,
        /Bond albedo (\d+\.\d+)/u,
        what("Bond albedo"),
      ),
      geometricAlbedo: parseNumber(
        text,
        /Geometric albedo (\d+\.\d+)/u,
        what("Geometric albedo"),
      ),
    };
  }
  // The Jovian satellite sheet: "Io (I) 893.2 1821.5 3530 0.62", whose
  // columns are mass, radius, density and visual geometric albedo.
  const row = body.row.replace(/[()]/gu, "\\$&");
  return {
    law: body.law,
    geometricAlbedo: parseNumber(
      text,
      new RegExp(`${row} [\\d.]+ [\\d.]+ [\\d.]+ (\\d+\\.\\d+)`, "u"),
      what(`${body.row} visual geometric albedo`),
    ),
  };
}

const srgbToLinear = (byte) => {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

async function readInstalledTexture(textures, id, size) {
  const asset = textures.assets.find((candidate) => candidate.id === id);
  if (asset === undefined) {
    throw new Error(`Texture ${id} is not in the texture snapshot`);
  }
  const bytes = await readFile(resolve("public", asset.file.slice(1)));
  if (sha256(bytes) !== asset.sha256) {
    throw new Error(
      `Installed texture ${asset.file} does not match its sha256`,
    );
  }
  const image = sharp(bytes).removeAlpha();
  if (size !== undefined)
    image.resize(size.width, size.height, { fit: "fill" });
  const { data, info } = await image
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { asset, data, info };
}

async function meanSurfaceColour(textures, id) {
  const surface = await readInstalledTexture(textures, id);
  const clouds =
    id === "earth"
      ? await readInstalledTexture(textures, "earth-clouds", surface.info)
      : undefined;
  const { width, height, channels } = surface.info;
  const sum = [0, 0, 0];
  let weightSum = 0;
  for (let y = 0; y < height; y += 1) {
    const weight = Math.cos(((y + 0.5) / height - 0.5) * Math.PI);
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      const cover =
        clouds === undefined
          ? 0
          : (EARTH_CLOUD_OPACITY *
              clouds.data[(y * width + x) * clouds.info.channels]) /
            255;
      for (let c = 0; c < 3; c += 1) {
        const linear = srgbToLinear(surface.data[offset + c]);
        sum[c] += weight * (linear * (1 - cover) + cover);
      }
      weightSum += weight;
    }
  }
  return {
    meanLinearSrgb: sum.map((value) => Number((value / weightSum).toFixed(5))),
    maps: [surface, clouds]
      .filter((map) => map !== undefined)
      .map(({ asset }) => ({ file: asset.file, sha256: asset.sha256 })),
  };
}

const textures = JSON.parse(await readFile(TEXTURE_SNAPSHOT_PATH, "utf8"));
const pages = new Map();
for (const page of new Set(BODIES.map((body) => body.page))) {
  const response = await fetch(`${FACT_SHEET_ROOT}${page}`);
  if (!response.ok) {
    throw new Error(`${page}: HTTP ${response.status}`);
  }
  const html = await response.text();
  pages.set(page, { text: pageText(html), sha256: sha256(html) });
}

const bodies = [];
for (const body of BODIES) {
  const page = pages.get(body.page);
  bodies.push({
    id: body.id,
    sourceUrl: `${FACT_SHEET_ROOT}${body.page}`,
    sourceResponseSha256: page.sha256,
    reflectance: parseReflectance(page.text, body),
    surfaceColour: await meanSurfaceColour(textures, body.id),
  });
}

const snapshot = {
  schemaVersion: "1.0.0",
  authority: "NASA Space Science Data Coordinated Archive (NSSDCA)",
  sourceUrl: FACT_SHEET_ROOT,
  retrievedAt: new Date().toISOString().replace(/\.\d+Z$/u, "Z"),
  albedoDefinitions:
    "Bond albedo: the share of the incident sunlight a body scatters in all directions. Visual geometric albedo: the zero-phase brightness of the disc against a flat white Lambert disc of the same size.",
  surfaceColourMethod: `Cosine-latitude weighted mean of the installed equirectangular surface map in linear sRGB; Earth adds its cloud map as white at ${EARTH_CLOUD_OPACITY} opacity, as the scene draws it`,
  bodies,
};
await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Wrote ${bodies.length} bodies to ${OUTPUT_PATH}`);
