// Renders the size-lineup pictures with Blender and writes their snapshot.
// Usage: BLENDER=/path/to/Blender pnpm data:lineup-globes
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

import sharp from "sharp";

import {
  JUPITER_EQUATORIAL_RADIUS_KM,
  JUPITER_POLAR_RADIUS_KM,
  NEPTUNE_EQUATORIAL_RADIUS_KM,
  NEPTUNE_POLAR_RADIUS_KM,
  SATURN_EQUATORIAL_RADIUS_KM,
  SATURN_MAIN_RING_INNER_RADIUS_KM,
  SATURN_MAIN_RING_OUTER_RADIUS_KM,
  SATURN_POLAR_RADIUS_KM,
  URANUS_EQUATORIAL_RADIUS_KM,
  URANUS_POLAR_RADIUS_KM,
} from "../src/scene/ring-system.ts";
import { SIZE_LINEUP_BODY_IDS } from "../src/scene/size-lineup.ts";

const path = (relative) =>
  fileURLToPath(new URL(`../${relative}`, import.meta.url));
const readJson = (relative) => JSON.parse(readFileSync(path(relative), "utf8"));
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

const blender = process.env.BLENDER ?? "blender";
const textures = readJson("src/data/nasa-textures.snapshot.json");
const majorBodies = readJson("src/data/major-bodies.snapshot.json");

const LIMITATIONS =
  "Rendered globe view from the authority map; lighting is illustrative.";
/** Room around the widest edge so the antialiased limb is not cut. */
const FRAME_MARGIN = 1.02;
const render = {
  renderer: execFileSync(blender, ["--version"], { encoding: "utf8" })
    .split("\n")[0]
    .trim(),
  engine: "Cycles CPU",
  camera: "orthographic, north up",
  cameraElevationDeg: 15,
  globeTurnDeg: 270,
  light: "sun from the viewer's upper left",
  sunStrength: 4,
  sunAngleDeg: 0.53,
  ambientStrength: 0.06,
  samples: 64,
  transparentBounces: 16,
  webpQuality: 88,
};

/** The 3D globe flattens only these bodies; the rest are spheres. */
const OBLATENESS_KM = {
  jupiter: [JUPITER_EQUATORIAL_RADIUS_KM, JUPITER_POLAR_RADIUS_KM],
  saturn: [SATURN_EQUATORIAL_RADIUS_KM, SATURN_POLAR_RADIUS_KM],
  uranus: [URANUS_EQUATORIAL_RADIUS_KM, URANUS_POLAR_RADIUS_KM],
  neptune: [NEPTUNE_EQUATORIAL_RADIUS_KM, NEPTUNE_POLAR_RADIUS_KM],
};

function required(value, message) {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}

function sourceMap(id) {
  const asset = required(
    textures.assets.find((candidate) => candidate.id === id),
    `Texture snapshot has no ${id} map`,
  );
  return { file: asset.file, sha256: asset.sha256 };
}

const outputDirectory = "public/textures/lineup";
mkdirSync(path(outputDirectory), { recursive: true });
const elevation = (render.cameraElevationDeg * Math.PI) / 180;

const bodies = SIZE_LINEUP_BODY_IDS.map((id) => {
  const meanRadiusKm =
    required(
      majorBodies.bodies.find((body) => body.id === id),
      `Major-body snapshot has no ${id}`,
    ).meanRadiusM / 1_000;
  const [equatorialKm, polarKm] = OBLATENESS_KM[id] ?? [
    meanRadiusKm,
    meanRadiusKm,
  ];
  const equatorialRadius = equatorialKm / meanRadiusKm;
  const polarRadius = polarKm / meanRadiusKm;
  const surfaceMap = textures.assets.some(
    (asset) => asset.id === id && asset.role === "surface-color",
  )
    ? sourceMap(id)
    : undefined;
  const materialColor =
    surfaceMap === undefined
      ? required(
          textures.materialPresentations.find(
            (presentation) => presentation.id === id,
          ),
          `${id} has neither a surface map nor a material colour`,
        ).color
      : undefined;
  const rings =
    id === "saturn"
      ? {
          innerRadiusKm: SATURN_MAIN_RING_INNER_RADIUS_KM,
          outerRadiusKm: SATURN_MAIN_RING_OUTER_RADIUS_KM,
          profileMap: sourceMap("saturn-rings"),
        }
      : undefined;
  const outerRadius =
    rings === undefined ? equatorialRadius : rings.outerRadiusKm / meanRadiusKm;
  // Silhouette half height of the flattened globe seen from the camera.
  const globeHalfHeight = Math.hypot(
    polarRadius * Math.cos(elevation),
    equatorialRadius * Math.sin(elevation),
  );
  const halfHeight = Math.max(
    globeHalfHeight,
    rings === undefined ? 0 : outerRadius * Math.sin(elevation),
  );
  const width = id === "saturn" ? 1024 : id === "jupiter" ? 512 : 256;
  const height =
    rings === undefined
      ? width
      : 2 * Math.ceil((width * halfHeight) / outerRadius / 2);
  return {
    id,
    file: `/textures/lineup/${id}.webp`,
    meanRadiusKm,
    equatorialRadiusKm: equatorialKm,
    polarRadiusKm: polarKm,
    surfaceMap,
    materialColor,
    rings,
    frameHalfWidthMeanRadii: outerRadius * FRAME_MARGIN,
    width,
    height,
  };
});

const absolute = (file) => path(`public${file}`);
const job = {
  ...render,
  bodies: bodies.map((body) => ({
    id: body.id,
    outputPath: absolute(body.file),
    width: body.width,
    height: body.height,
    frameHalfWidth: body.frameHalfWidthMeanRadii,
    equatorialRadius: body.equatorialRadiusKm / body.meanRadiusKm,
    polarRadius: body.polarRadiusKm / body.meanRadiusKm,
    ...(body.surfaceMap === undefined
      ? { materialColor: body.materialColor }
      : {
          surfaceMap: {
            path: absolute(body.surfaceMap.file),
            sha256: body.surfaceMap.sha256,
          },
        }),
    ...(body.rings === undefined
      ? {}
      : {
          rings: {
            innerRadius: body.rings.innerRadiusKm / body.meanRadiusKm,
            outerRadius: body.rings.outerRadiusKm / body.meanRadiusKm,
            profileMap: {
              path: absolute(body.rings.profileMap.file),
              sha256: body.rings.profileMap.sha256,
            },
          },
        }),
  })),
};
mkdirSync(path(".tmp"), { recursive: true });
const jobPath = path(".tmp/lineup-globes-job.json");
writeFileSync(jobPath, JSON.stringify(job, null, 2));
execFileSync(
  blender,
  [
    "-b",
    "--factory-startup",
    "--python-exit-code",
    "1",
    "--python",
    path("scripts/render-lineup-globes.py"),
    "--",
    jobPath,
  ],
  { stdio: "inherit" },
);

const pictures = await Promise.all(
  bodies.map(async (body) => {
    const output = readFileSync(absolute(body.file));
    const metadata = await sharp(output).metadata();
    if (
      metadata.format !== "webp" ||
      metadata.width !== body.width ||
      metadata.height !== body.height ||
      metadata.hasAlpha !== true
    ) {
      throw new Error(
        `${body.file} is ${String(metadata.format)} ${String(metadata.width)}x${String(metadata.height)}, expected a ${String(body.width)}x${String(body.height)} WebP with alpha`,
      );
    }
    return {
      id: body.id,
      file: body.file,
      contentType: "image/webp",
      width: body.width,
      height: body.height,
      byteLength: output.length,
      sha256: sha256(output),
      frameHalfWidthMeanRadii: Number(body.frameHalfWidthMeanRadii.toFixed(6)),
      meanRadiusKm: body.meanRadiusKm,
      equatorialRadiusKm: body.equatorialRadiusKm,
      polarRadiusKm: body.polarRadiusKm,
      ...(body.surfaceMap === undefined
        ? { materialColor: body.materialColor }
        : { surfaceMap: body.surfaceMap }),
      ...(body.rings === undefined ? {} : { rings: body.rings }),
      render,
      limitations: LIMITATIONS,
    };
  }),
);

const totalBytes = pictures.reduce(
  (sum, picture) => sum + picture.byteLength,
  0,
);
writeFileSync(
  path("src/data/lineup-globes.snapshot.json"),
  `${JSON.stringify(
    {
      schemaVersion: "1.0.0",
      generatedBy:
        "scripts/render-lineup-globes.mjs with scripts/render-lineup-globes.py",
      note: "Each picture is a rendered globe from the installed authority map named by its sha256. frameHalfWidthMeanRadii is half the picture width in units of the body's mean radius.",
      pictures,
    },
    null,
    2,
  )}\n`,
);
console.log(
  `render-lineup-globes: ${String(pictures.length)} pictures, ${String(totalBytes)} bytes`,
);
