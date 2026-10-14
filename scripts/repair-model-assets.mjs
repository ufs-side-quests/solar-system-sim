// Repairs three installed GLB models from their original files and writes the
// repaired files over them. The originals stay in git history: each is read
// by its git blob id and checked against its recorded sha256, so the repair
// can be run again from any full clone.
// Usage: pnpm models:repair
// Afterwards copy the printed sha256 and byte lengths into
// src/scene/spacecraft-assets.ts and src/scene/fictional-model-assets.ts.
//
// - ISS (NASA 3D Resources): deletes seven stray meshes that float about
//   15 model units (about 36 m) above the top of the station.
// - Discovery One (CC BY 4.0): sets metallicFactor 0 on the 13 materials that
//   leave it unset. The glTF default of 1 makes the white hull bare metal,
//   and with no environment map bare metal renders almost black.
// - Deep Space Nine (CC BY 4.0): deletes the emissive texture bindings that
//   have no emissive factor (they add nothing), and lights windows on the
//   habitat ring walls and the Promenade (see lightDeepSpaceNineWindows).
// The USS Defiant is not repaired here: its licence (Sketchfab Free Standard)
// may not allow a modified file to be shared. Its windows are lit at load.
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

import { getBounds, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import sharp from "sharp";

import { LIT_WINDOW_EMISSIVE_LINEAR_RGB } from "../src/scene/window-lighting.ts";

const path = (relative) =>
  fileURLToPath(new URL(`../${relative}`, import.meta.url));

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function readOriginal({ gitBlob, sha256: expected }) {
  const bytes = execFileSync("git", ["cat-file", "blob", gitBlob], {
    cwd: path("."),
    maxBuffer: 64 * 1024 * 1024,
  });
  const actual = sha256(bytes);
  if (actual !== expected) {
    throw new Error(
      `Original blob ${gitBlob} has sha256 ${actual}, expected ${expected}`,
    );
  }
  return bytes;
}

/** Mesh nodes named here sit about 15 units above the ISS; checked below. */
const ISS_STRAY_NODE_NAMES = [
  "bendedtru1",
  "bendedtru2",
  "bendedtru3",
  "bendedtrus",
  "pCylinder1",
  "pCylinder2",
  "pCylinder8",
];
const ISS_STRAY_MINIMUM_GAP_UNITS = 10;

function removeIssStrayMeshes(document) {
  const nodes = document.getRoot().listNodes();
  const stray = nodes.filter((node) =>
    ISS_STRAY_NODE_NAMES.includes(node.getName()),
  );
  if (stray.length !== ISS_STRAY_NODE_NAMES.length) {
    throw new Error(
      `Expected ${ISS_STRAY_NODE_NAMES.length} stray ISS nodes, found ${stray.length}`,
    );
  }
  const station = nodes.filter(
    (node) => node.getMesh() !== null && !stray.includes(node),
  );
  const stationTop = Math.max(...station.map((node) => getBounds(node).max[1]));
  for (const node of stray) {
    const bottom = getBounds(node).min[1];
    if (bottom - stationTop < ISS_STRAY_MINIMUM_GAP_UNITS) {
      throw new Error(
        `ISS node ${node.getName()} starts ${bottom - stationTop} units above the station, not a stray part`,
      );
    }
    node.dispose();
  }
}

const DISCOVERY_ONE_UNSET_METALLIC_MATERIALS = 13;

function makeDiscoveryOneHullDielectric(document) {
  // The original leaves metallicFactor unset on 13 materials, which reads as
  // the default 1. Its one explicit value is 0.97, so a factor of exactly 1
  // with no metallic texture is an unset factor.
  const unset = document
    .getRoot()
    .listMaterials()
    .filter(
      (material) =>
        material.getMetallicFactor() === 1 &&
        material.getMetallicRoughnessTexture() === null,
    );
  if (unset.length !== DISCOVERY_ONE_UNSET_METALLIC_MATERIALS) {
    throw new Error(
      `Expected ${DISCOVERY_ONE_UNSET_METALLIC_MATERIALS} Discovery One materials without a metallic factor, found ${unset.length}`,
    );
  }
  for (const material of unset) material.setMetallicFactor(0);
}

function removeDeadEmissiveBindings(document) {
  let removed = 0;
  for (const material of document.getRoot().listMaterials()) {
    if (
      material.getEmissiveTexture() !== null &&
      material.getEmissiveFactor().every((channel) => channel === 0)
    ) {
      material.setEmissiveTexture(null);
      removed += 1;
    }
  }
  if (removed === 0) {
    throw new Error("Deep Space Nine has no dead emissive binding to remove");
  }
}

// Deep Space Nine windows. The model's UVs overlap heavily (up to 7,055
// triangles share one 1/256 texel cell), so a mask cannot be baked into them.
// Window triangles move instead to their own primitives, with a second UV set
// (TEXCOORD_1) that runs around the station axis and a small repeating window
// texture. Model units: 1,451.82 m / 502.5 units = about 2.89 m per unit.
// The station axis is the mesh y axis; the rings lie in the x-z plane.
const WINDOW_REGIONS = [
  {
    // Inner and outer walls of the habitat ring, 3.5 m decks, 5 m window pitch.
    name: "habitat ring",
    radius: [75, 115],
    height: [-195, -160],
    radialNormal: (radial) => Math.abs(radial) >= 0.8,
    wallDirection: [0, 1],
    pitchAround: 1.75,
    pitchAlong: 1.2,
  },
  {
    // The Promenade: the upright outer wall of the core's widest band,
    // large windows at 15 m pitch around and 10 m up.
    name: "Promenade",
    radius: [50, 64],
    height: [-188, -166],
    radialNormal: (radial) => radial >= 0.9,
    wallDirection: [0, 1],
    pitchAround: 5.2,
    pitchAlong: 3.5,
  },
];
/** One window in a repeating 32 px tile: 37.5 % of the width, 31 % of the height. */
const WINDOW_TILE_PX = 32;
const WINDOW_TILE_LIT = { x: [10, 22], y: [11, 21] };

async function windowTileWebp() {
  const pixels = Buffer.alloc(WINDOW_TILE_PX * WINDOW_TILE_PX * 3);
  for (let y = WINDOW_TILE_LIT.y[0]; y < WINDOW_TILE_LIT.y[1]; y += 1) {
    for (let x = WINDOW_TILE_LIT.x[0]; x < WINDOW_TILE_LIT.x[1]; x += 1) {
      pixels.fill(
        255,
        (y * WINDOW_TILE_PX + x) * 3,
        (y * WINDOW_TILE_PX + x + 1) * 3,
      );
    }
  }
  return sharp(pixels, {
    raw: { width: WINDOW_TILE_PX, height: WINDOW_TILE_PX, channels: 3 },
  })
    .webp({ lossless: true })
    .toBuffer();
}

async function lightDeepSpaceNineWindows(document) {
  const root = document.getRoot();
  // Node transforms turn mesh y into world -z; read the axis in mesh space.
  const meshes = root.listMeshes();
  const axis = { x: 0, z: 0 };
  {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const mesh of meshes) {
      for (const primitive of mesh.listPrimitives()) {
        const position = primitive.getAttribute("POSITION");
        const min = position.getMin([]);
        const max = position.getMax([]);
        minX = Math.min(minX, min[0]);
        maxX = Math.max(maxX, max[0]);
        minZ = Math.min(minZ, min[2]);
        maxZ = Math.max(maxZ, max[2]);
      }
    }
    axis.x = (minX + maxX) / 2;
    axis.z = (minZ + maxZ) / 2;
  }
  const tile = document
    .createTexture("Deep Space Nine window tile")
    .setImage(await windowTileWebp())
    .setMimeType("image/webp");
  const counts = new Map(WINDOW_REGIONS.map((region) => [region.name, 0]));
  for (const mesh of meshes) {
    for (const primitive of [...mesh.listPrimitives()]) {
      const position = primitive.getAttribute("POSITION").getArray();
      const indices = primitive.getIndices().getArray();
      const kept = [];
      const windows = []; // [corner index, u, v] per corner
      for (let t = 0; t < indices.length; t += 3) {
        const corners = [indices[t], indices[t + 1], indices[t + 2]];
        const p = corners.map((corner) => [
          position[corner * 3] - axis.x,
          position[corner * 3 + 1],
          position[corner * 3 + 2] - axis.z,
        ]);
        const edgeA = [0, 1, 2].map((k) => p[1][k] - p[0][k]);
        const edgeB = [0, 1, 2].map((k) => p[2][k] - p[0][k]);
        const normal = [
          edgeA[1] * edgeB[2] - edgeA[2] * edgeB[1],
          edgeA[2] * edgeB[0] - edgeA[0] * edgeB[2],
          edgeA[0] * edgeB[1] - edgeA[1] * edgeB[0],
        ];
        const normalLength = Math.hypot(...normal);
        const centre = [0, 1, 2].map((k) => (p[0][k] + p[1][k] + p[2][k]) / 3);
        const radius = Math.hypot(centre[0], centre[2]);
        // Normal component out from the axis.
        const radialNormal =
          (normal[0] * centre[0] + normal[2] * centre[2]) /
          (normalLength * radius);
        const region =
          normalLength === 0 || radius === 0
            ? undefined
            : WINDOW_REGIONS.find(
                (candidate) =>
                  radius >= candidate.radius[0] &&
                  radius < candidate.radius[1] &&
                  centre[1] >= candidate.height[0] &&
                  centre[1] < candidate.height[1] &&
                  candidate.radialNormal(radialNormal),
              );
        if (region === undefined) {
          kept.push(...corners);
          continue;
        }
        counts.set(region.name, counts.get(region.name) + 1);
        // The window grid is a function of position only, so it runs on
        // unbroken across neighbouring triangles: u is arc length around the
        // axis (each corner's angle unwrapped next to the triangle centre's,
        // so no triangle spans the seam at +-pi), v is length along the
        // region's wall direction in the plane through the axis.
        const centreAngle = Math.atan2(centre[2], centre[0]);
        corners.forEach((corner, k) => {
          let angle = Math.atan2(p[k][2], p[k][0]) - centreAngle;
          angle -= 2 * Math.PI * Math.round(angle / (2 * Math.PI));
          const cornerRadius = Math.hypot(p[k][0], p[k][2]);
          windows.push([
            corner,
            ((centreAngle + angle) * cornerRadius) / region.pitchAround,
            (region.wallDirection[0] * cornerRadius +
              region.wallDirection[1] * p[k][1]) /
              region.pitchAlong,
          ]);
        });
      }
      if (windows.length === 0) continue;
      primitive.getIndices().setArray(new Uint32Array(kept));
      const source = primitive.getMaterial();
      const material = source
        .clone()
        .setName(`${source.getName()} windows`)
        .setEmissiveFactor(LIT_WINDOW_EMISSIVE_LINEAR_RGB)
        .setEmissiveTexture(tile);
      material.getEmissiveTextureInfo().setTexCoord(1);
      const windowPrimitive = document.createPrimitive().setMaterial(material);
      for (const semantic of primitive.listSemantics()) {
        const attribute = primitive.getAttribute(semantic);
        const size = attribute.getElementSize();
        const array = new Float32Array(windows.length * size);
        const element = [];
        windows.forEach(([corner], index) =>
          array.set(attribute.getElement(corner, element), index * size),
        );
        windowPrimitive.setAttribute(
          semantic,
          document
            .createAccessor()
            .setType(attribute.getType())
            .setArray(array)
            .setBuffer(attribute.getBuffer()),
        );
      }
      windowPrimitive.setAttribute(
        "TEXCOORD_1",
        document
          .createAccessor()
          .setType("VEC2")
          .setArray(new Float32Array(windows.flatMap(([, u, v]) => [u, v])))
          .setBuffer(primitive.getAttribute("POSITION").getBuffer()),
      );
      windowPrimitive.setIndices(
        document
          .createAccessor()
          .setType("SCALAR")
          .setArray(Uint32Array.from(windows, (_, index) => index))
          .setBuffer(primitive.getIndices().getBuffer()),
      );
      mesh.addPrimitive(windowPrimitive);
    }
  }
  for (const [name, count] of counts) {
    if (count === 0) {
      throw new Error(`No Deep Space Nine ${name} window triangles found`);
    }
    console.log(`Deep Space Nine ${name}: ${count} window triangles`);
  }
}

async function repairDeepSpaceNine(document) {
  removeDeadEmissiveBindings(document);
  await lightDeepSpaceNineWindows(document);
}

const MODEL_REPAIRS = [
  {
    output: "public/models/nasa/iss.glb",
    gitBlob: "884cdf03d96b28285c1cdfdd34fcfd4f5de0021d",
    sha256: "2ba4427413b0dd89a33d2acaf962dea8a96a3b1d8dceda05cc7aad547ffd3d16",
    repair: removeIssStrayMeshes,
  },
  {
    output: "public/models/community/discovery-one.glb",
    gitBlob: "a108f1d1fac423626e33c3882b9b22ed903f39b7",
    sha256: "b2cc068f824a5812b29045c10cd43f6d282a01244ed9b5ceec95ae02185498ac",
    repair: makeDiscoveryOneHullDielectric,
  },
  {
    output: "public/models/community/deep-space-nine.glb",
    gitBlob: "30aa3389aecc575aa14f60f446e3ccb737d002c5",
    sha256: "9f8d4af18650679039bb875e1de740938ddcc410f7acab3f6eb2d690a720d7ba",
    repair: repairDeepSpaceNine,
  },
];

// The originals are Draco compressed; the app loads Draco, so the repaired
// files are written with the same extension.
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "draco3d.decoder": await draco3d.createDecoderModule(),
    "draco3d.encoder": await draco3d.createEncoderModule(),
  });
for (const model of MODEL_REPAIRS) {
  const document = await io.readBinary(readOriginal(model));
  await model.repair(document);
  await document.transform(prune({ keepAttributes: true }));
  const bytes = await io.writeBinary(document);
  writeFileSync(path(model.output), bytes);
  console.log(
    `${model.output} sha256 ${sha256(bytes)} byteLength ${bytes.byteLength}`,
  );
}
