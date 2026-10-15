// Repairs four installed GLB models from their original files and writes the
// repaired files over them. Each original is checked against its recorded
// sha256 before use: the ISS and Discovery One originals are read from git
// history by their blob ids, and the Deep Space Nine and Death Star II
// originals are downloaded once from their archive into .tmp/model-originals/.
// Usage: pnpm models:repair
// Afterwards copy the printed sha256 and byte lengths into
// src/scene/spacecraft-assets.ts and src/scene/fictional-model-assets.ts.
//
// - ISS (NASA 3D Resources): deletes seven stray meshes that float about
//   15 model units (about 36 m) above the top of the station.
// - Discovery One (CC BY 4.0): sets metallicFactor 0 on the 13 materials that
//   leave it unset. The glTF default of 1 makes the white hull bare metal,
//   and with no environment map bare metal renders almost black.
// - Deep Space Nine (CC BY 4.0): applies the node transforms, joins, welds
//   and simplifies the meshes, gives the hull one painted grey material,
//   lights windows on the habitat ring walls and the Promenade (see
//   lightDeepSpaceNineWindows), and compresses the result with Draco.
// - Death Star II (CC BY 4.0): gives every material its texture at full value
//   with no metal, scales the window emission to the calibrated lit-window
//   luminance, turns the superlaser dish to +z, and compresses the result
//   with WebP textures and Draco (see repairDeathStarII).
// The USS Defiant is not repaired here: its licence (Sketchfab Free Standard)
// may not allow a modified file to be shared. Its windows are lit at load.
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

import { getBounds, NodeIO } from "@gltf-transform/core";
import {
  ALL_EXTENSIONS,
  KHRDracoMeshCompression,
} from "@gltf-transform/extensions";
import {
  clearNodeTransform,
  join,
  prune,
  simplify,
  textureCompress,
  transformMesh,
  weld,
} from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

import { fictionalModelAssetByBodyId } from "../src/scene/fictional-model-assets.ts";
import {
  LIT_WINDOW_EMISSIVE_LINEAR_RGB,
  LIT_WINDOW_RADIANCE,
} from "../src/scene/window-lighting.ts";

const path = (relative) =>
  fileURLToPath(new URL(`../${relative}`, import.meta.url));

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function checkedOriginal(bytes, source, expected) {
  const actual = sha256(bytes);
  if (actual !== expected) {
    throw new Error(
      `Original ${source} has sha256 ${actual}, expected ${expected}`,
    );
  }
  return bytes;
}

async function readOriginal({ gitBlob, url, sha256: expected }) {
  if (gitBlob !== undefined) {
    const bytes = execFileSync("git", ["cat-file", "blob", gitBlob], {
      cwd: path("."),
      maxBuffer: 64 * 1024 * 1024,
    });
    return checkedOriginal(bytes, `git blob ${gitBlob}`, expected);
  }
  const cached = path(`.tmp/model-originals/${expected}.glb`);
  if (existsSync(cached)) {
    return checkedOriginal(readFileSync(cached), cached, expected);
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download of ${url} failed: HTTP ${response.status}`);
  }
  const bytes = checkedOriginal(
    Buffer.from(await response.arrayBuffer()),
    url,
    expected,
  );
  mkdirSync(path(".tmp/model-originals"), { recursive: true });
  writeFileSync(cached, bytes);
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

// Deep Space Nine. The original is one white material on six meshes that
// together hold about 410,000 triangles, posed by a root node that turns the
// station axis to +y. Its node transforms are applied to the vertices, so the
// file holds the station upright in mesh space (the rings in the x-z plane,
// the upper pylons and Ops at +y), and the six meshes join into one.
// Simplification stops at meshoptimizer's error limit of 0.02 % of the mesh's
// size, about 0.3 m on the 1,451.82 m station: a 1,200 px Blender close-up
// 130 m wide changed in 0.06 % of its pixels.
const DEEP_SPACE_NINE_SIMPLIFY_ERROR = 0.0002;
const DEEP_SPACE_NINE_MAXIMUM_TRIANGLES = 200_000;

/** Painted mid grey with a slight warm tint, as the station looks on screen. */
const DEEP_SPACE_NINE_HULL = {
  name: "Deep Space Nine hull",
  baseColorFactor: [0.45, 0.42, 0.37, 1],
  metallicFactor: 0,
  roughnessFactor: 0.6,
};

// Deep Space Nine windows. The original has no texture coordinates, so window
// triangles move to their own primitive with a TEXCOORD_0 set that runs
// around the station axis and a small repeating window texture.
// The station axis is the mesh y axis; the rings lie in the x-z plane.
// Radii and heights are model units, read from the walls' geometry (about
// 25.8 m per unit); pitches are metres. The window columns are lines of
// constant angle: each region has a whole number of them,
// round(2 pi r / pitchAround) at the middle radius r of its band, so they
// meet at the +-pi seam. Away from that radius the pitch around scales with
// the radius.
const WINDOW_REGIONS = [
  {
    // The habitat ring, 3.5 m decks, 5 m window pitch: its inner wall faces
    // the axis, its outer wall faces out, and each gets its own column count.
    name: "habitat ring inner wall",
    radius: [8.9, 9.7],
    height: [-0.25, 1.05],
    radialNormal: (radial) => radial <= -0.8,
    pitchAroundM: 5,
    pitchAlongM: 3.5,
  },
  {
    name: "habitat ring outer wall",
    radius: [10.9, 11.8],
    height: [-0.5, 1.05],
    radialNormal: (radial) => radial >= 0.8,
    pitchAroundM: 5,
    pitchAlongM: 3.5,
  },
  {
    // The Promenade: the upright outer wall of the core's widest band,
    // large windows at 15 m pitch around and 10 m up.
    name: "Promenade",
    radius: [5.6, 6.2],
    height: [-0.4, 0.4],
    radialNormal: (radial) => radial >= 0.9,
    pitchAroundM: 15,
    pitchAlongM: 10,
  },
];
const windowColumns = (region, metresPerUnit) =>
  Math.round(
    (Math.PI * (region.radius[0] + region.radius[1]) * metresPerUnit) /
      region.pitchAroundM,
  );

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

async function lightDeepSpaceNineWindows(document, mesh) {
  const [primitive] = mesh.listPrimitives();
  const { min, max } = getBounds(document.getRoot().listScenes()[0]);
  const metresPerUnit =
    fictionalModelAssetByBodyId.get("deep-space-nine").maximumDimensionM /
    Math.max(...max.map((value, axis) => value - min[axis]));
  const axis = { x: (min[0] + max[0]) / 2, z: (min[2] + max[2]) / 2 };
  const counts = new Map(WINDOW_REGIONS.map((region) => [region.name, 0]));
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
      (normal[0] * centre[0] + normal[2] * centre[2]) / (normalLength * radius);
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
    // unbroken across neighbouring triangles: u counts window columns
    // around the axis (each corner's angle unwrapped next to the triangle
    // centre's, so no triangle spans the seam at +-pi; across the seam u
    // jumps by the whole column count), v counts decks up the axis.
    const centreAngle = Math.atan2(centre[2], centre[0]);
    const columns = windowColumns(region, metresPerUnit);
    corners.forEach((corner, k) => {
      let angle = Math.atan2(p[k][2], p[k][0]) - centreAngle;
      angle -= 2 * Math.PI * Math.round(angle / (2 * Math.PI));
      windows.push([
        corner,
        ((centreAngle + angle) * columns) / (2 * Math.PI),
        (p[k][1] * metresPerUnit) / region.pitchAlongM,
      ]);
    });
  }
  for (const [name, count] of counts) {
    if (count === 0) {
      throw new Error(`No Deep Space Nine ${name} window triangles found`);
    }
    const region = WINDOW_REGIONS.find((candidate) => candidate.name === name);
    console.log(
      `Deep Space Nine ${name}: ${count} window triangles, ${windowColumns(region, metresPerUnit)} columns`,
    );
  }
  primitive.getIndices().setArray(new Uint32Array(kept));
  const source = primitive.getMaterial();
  const material = source
    .clone()
    .setName(`${source.getName()} windows`)
    .setEmissiveFactor(LIT_WINDOW_EMISSIVE_LINEAR_RGB)
    .setEmissiveTexture(
      document
        .createTexture("Deep Space Nine window tile")
        .setImage(await windowTileWebp())
        .setMimeType("image/webp"),
    );
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
    "TEXCOORD_0",
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

// Draco quantises each attribute over its whole range. The window u runs over
// about 368 tiles, so the default 12 bits step it by 368 / 4,095 = 0.09 of a
// tile (an error up to 0.045 of a tile, an eighth of a window's width); 16
// bits step it by 0.0056. The station spans 56.3 units, so 16-bit positions step by 0.00086
// units, about 2 cm. Draco options apply to the whole file.
const DEEP_SPACE_NINE_DRACO_QUANTIZATION_BITS = { POSITION: 16, TEX_COORD: 16 };

async function repairDeepSpaceNine(document) {
  const root = document.getRoot();
  const bake = (node) => {
    clearNodeTransform(node);
    node.listChildren().forEach(bake);
  };
  root.listScenes()[0].listChildren().forEach(bake);
  await MeshoptSimplifier.ready;
  await document.transform(
    join(),
    weld(),
    simplify({
      simplifier: MeshoptSimplifier,
      ratio: 0,
      error: DEEP_SPACE_NINE_SIMPLIFY_ERROR,
    }),
  );
  const meshes = root.listMeshes();
  if (
    meshes.length !== 1 ||
    meshes[0].listPrimitives().length !== 1 ||
    root.listMaterials().length !== 1
  ) {
    throw new Error(
      "Expected one Deep Space Nine mesh with one primitive and one material",
    );
  }
  const [mesh] = meshes;
  const [primitive] = mesh.listPrimitives();
  const triangles = primitive.getIndices().getCount() / 3;
  if (triangles > DEEP_SPACE_NINE_MAXIMUM_TRIANGLES) {
    throw new Error(
      `Deep Space Nine keeps ${triangles} triangles, more than ${DEEP_SPACE_NINE_MAXIMUM_TRIANGLES}`,
    );
  }
  console.log(`Deep Space Nine: ${triangles} triangles after simplification`);
  primitive
    .getMaterial()
    .setName(DEEP_SPACE_NINE_HULL.name)
    .setBaseColorFactor(DEEP_SPACE_NINE_HULL.baseColorFactor)
    .setMetallicFactor(DEEP_SPACE_NINE_HULL.metallicFactor)
    .setRoughnessFactor(DEEP_SPACE_NINE_HULL.roughnessFactor);
  await lightDeepSpaceNineWindows(document, mesh);
  document
    .createExtension(KHRDracoMeshCompression)
    .setRequired(true)
    .setEncoderOptions({
      quantizationBits: DEEP_SPACE_NINE_DRACO_QUANTIZATION_BITS,
    });
}

// Death Star II. The Sketchfab export was made for a viewer that lights the
// model with a bright environment map. This scene has one sun and no
// environment, and in it the export renders almost black:
// - baseColorFactor is 0 to 0.17 on nine of its eleven materials (0.05 on the
//   outer hull panels), so the grey panel textures reach the screen at 0 to
//   17 % of their value;
// - metallicFactor is unset, which reads as 1, and the blue channel of the
//   metallic-roughness textures makes most of the hull 40 % to 70 % metal;
//   with no environment map bare metal reflects nothing but the Sun's
//   highlight.
// The hull textures are the author's painted grey panels, so each material
// takes its texture at full value and becomes a painted, dielectric surface.
// The roughness texture stays.
// The windows texture (lit dots on the hull panels and the decks) has an
// emissive factor of 1 and 0.8: 1 scene radiance unit is about 21,000 cd/m2
// (window-lighting.ts), so the brightest windows would be about 8,500 cd/m2.
// The factors are scaled so that the brightest window texel on the decks
// emits the calibrated lit-window luminance (300 cd/m2), and the hull panels
// keep the author's 0.8 of it. Two trench floor materials carry the same
// texture with no emissive factor; they emit nothing and lose the reference.
// The model has no superlaser emission: the dish material has no emissive
// texture or factor.
// The superlaser dish faces the model's +x axis. The app turns a focused
// Death Star's +z axis to the camera (the authored Death Star I has its dish
// near +z), so the station turns about its axis to put the dish at +z and
// keeps its latitude.
const DEATH_STAR_II_MATERIALS = 11;
const DEATH_STAR_II_WINDOW_MATERIALS = 2;
const DEATH_STAR_II_DISH_MATERIAL = "03_-_Defaultasdsad";
// Draco steps over each attribute's range: 16 bits put the hull's 750 units
// in steps of 0.011 units (about 3 m on the 200 km station) and the window
// and panel coordinates, which run to 16 texture repeats, in steps of a
// quarter texel. The defaults (14 and 12 bits) step positions by about 12 m,
// more than a third of the 30 to 40 m between stacked hull shells.
const DEATH_STAR_II_DRACO_QUANTIZATION_BITS = { POSITION: 16, TEX_COORD: 16 };
const DEATH_STAR_II_WEBP_QUALITY = 80;

/** Linear Rec. 709 luminance of the brightest texel of an sRGB image. */
async function maximumTexelLuminance(image) {
  const { data, info } = await sharp(Buffer.from(image))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const linear = (byte) => {
    const encoded = byte / 255;
    return encoded <= 0.04045
      ? encoded / 12.92
      : ((encoded + 0.055) / 1.055) ** 2.4;
  };
  let maximum = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    maximum = Math.max(
      maximum,
      0.2126 * linear(data[offset]) +
        0.7152 * linear(data[offset + 1]) +
        0.0722 * linear(data[offset + 2]),
    );
  }
  return maximum;
}

async function repairDeathStarII(document) {
  const root = document.getRoot();
  const materials = root.listMaterials();
  if (materials.length !== DEATH_STAR_II_MATERIALS) {
    throw new Error(
      `Expected ${DEATH_STAR_II_MATERIALS} Death Star II materials, found ${materials.length}`,
    );
  }

  // Apply each mesh node's world transform to its mesh, so the file holds the
  // station in mesh space. clearNodeTransform is not used here: in
  // @gltf-transform/functions 4.4.2 it multiplies a child's matrix by its
  // parent's in the wrong order, and on this hierarchy that moves four meshes
  // by up to 48 units (13 km).
  const meshNodes = root.listNodes().filter((node) => node.getMesh() !== null);
  if (
    new Set(meshNodes.map((node) => node.getMesh())).size !== meshNodes.length
  ) {
    throw new Error("A Death Star II mesh is shared by two nodes");
  }
  const worldMatrices = meshNodes.map((node) => node.getWorldMatrix());
  meshNodes.forEach((node, index) =>
    transformMesh(node.getMesh(), worldMatrices[index]),
  );
  for (const node of root.listNodes()) {
    node.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }

  // The dish material also covers the two polar caps, which balance about
  // the axis, so its vertex centroid lies off the axis toward the dish.
  const { min, max } = getBounds(root.listScenes()[0]);
  const centre = min.map((value, axis) => (value + max[axis]) / 2);
  const dishPrimitives = meshNodes
    .flatMap((node) => node.getMesh().listPrimitives())
    .filter(
      (primitive) =>
        primitive.getMaterial().getName() === DEATH_STAR_II_DISH_MATERIAL,
    );
  if (dishPrimitives.length !== 1) {
    throw new Error(
      `Expected one Death Star II dish primitive, found ${dishPrimitives.length}`,
    );
  }
  const dishPositions = dishPrimitives[0].getAttribute("POSITION");
  const dish = [0, 0, 0];
  const vertex = [];
  for (let index = 0; index < dishPositions.getCount(); index += 1) {
    dishPositions.getElement(index, vertex);
    for (let axis = 0; axis < 3; axis += 1) {
      dish[axis] += vertex[axis] - centre[axis];
    }
  }
  // A turn of a about +y takes (x, z) to (x cos a + z sin a, z cos a - x sin a),
  // so a = atan2(-x, z) takes the dish to +z.
  const angle = Math.atan2(-dish[0], dish[2]);
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  for (const node of meshNodes) {
    transformMesh(node.getMesh(), [
      cos,
      0,
      -sin,
      0,
      0,
      1,
      0,
      0,
      sin,
      0,
      cos,
      0,
      0,
      0,
      0,
      1,
    ]);
  }
  console.log(
    `Death Star II: dish turned ${((angle * 180) / Math.PI).toFixed(1)} degrees about y to +z`,
  );

  // The windows texture, mostly black, stays lossless, so its brightest
  // texel (the calibration reference below) is the author's.
  await document.transform(
    textureCompress({
      encoder: sharp,
      targetFormat: "webp",
      slots: /^emissiveTexture$/u,
      lossless: true,
    }),
    textureCompress({
      encoder: sharp,
      targetFormat: "webp",
      slots: /^(?!emissiveTexture$)/u,
      quality: DEATH_STAR_II_WEBP_QUALITY,
    }),
  );

  const emissiveTextures = new Set(
    materials.flatMap((material) => material.getEmissiveTexture() ?? []),
  );
  if (emissiveTextures.size !== 1) {
    throw new Error(
      `Expected one Death Star II emissive texture, found ${emissiveTextures.size}`,
    );
  }
  const [windowTexture] = emissiveTextures;
  const brightestWindow = await maximumTexelLuminance(windowTexture.getImage());
  const authoredMaximum = Math.max(
    ...materials.flatMap((material) => material.getEmissiveFactor()),
  );
  const windowScale = LIT_WINDOW_RADIANCE / (brightestWindow * authoredMaximum);
  console.log(
    `Death Star II: brightest window texel ${brightestWindow.toFixed(4)}, emissive factors scaled by ${windowScale.toExponential(4)}`,
  );
  let windowMaterials = 0;
  for (const material of materials) {
    material.setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0);
    if (material.getEmissiveTexture() === null) continue;
    if (material.getEmissiveFactor().every((factor) => factor === 0)) {
      // The two trench floors carry the windows texture with the default
      // emissive factor of 0, so they emit nothing; the reference goes.
      material.setEmissiveTexture(null);
      continue;
    }
    // The app reports materials named "... windows" as lit at the
    // calibrated level, as for Deep Space Nine.
    material
      .setName(`${material.getName()} windows`)
      .setEmissiveFactor(
        material.getEmissiveFactor().map((factor) => factor * windowScale),
      );
    windowMaterials += 1;
  }
  if (windowMaterials !== DEATH_STAR_II_WINDOW_MATERIALS) {
    throw new Error(
      `Expected ${DEATH_STAR_II_WINDOW_MATERIALS} Death Star II window materials, found ${windowMaterials}`,
    );
  }

  // The export carries up to five texture coordinate sets; keep the ones a
  // material reads.
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const material = primitive.getMaterial();
      // A slot's texture info is null when the slot has no texture.
      const used = new Set(
        [
          material.getBaseColorTextureInfo(),
          material.getEmissiveTextureInfo(),
          material.getNormalTextureInfo(),
          material.getOcclusionTextureInfo(),
          material.getMetallicRoughnessTextureInfo(),
        ]
          .filter((info) => info !== null)
          .map((info) => `TEXCOORD_${info.getTexCoord()}`),
      );
      for (const semantic of primitive.listSemantics()) {
        if (semantic.startsWith("TEXCOORD_") && !used.has(semantic)) {
          primitive.setAttribute(semantic, null);
        }
      }
    }
  }

  document
    .createExtension(KHRDracoMeshCompression)
    .setRequired(true)
    .setEncoderOptions({
      quantizationBits: DEATH_STAR_II_DRACO_QUANTIZATION_BITS,
    });
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
    url: "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-121/3e1743fc00be4d83848c7d890b8a5988.glb",
    sha256: "bd81edfcfb06c9871b30d345d9540d252b703c03fd3c7fb135e6a9831650947b",
    repair: repairDeepSpaceNine,
  },
  {
    output: "public/models/community/death-star-ii.glb",
    url: "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-084/17ccca0dbb6b4e338fa999202f9e6685.glb",
    sha256: "f4e2003cac1abc5887d0a631d8bc51a00091920fd76235f4e38244ca36a13ed1",
    repair: repairDeathStarII,
  },
];

// The ISS and Discovery One originals are Draco compressed, and Deep Space
// Nine and Death Star II gain the extension above; the app loads Draco.
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "draco3d.decoder": await draco3d.createDecoderModule(),
    "draco3d.encoder": await draco3d.createEncoderModule(),
  });
for (const model of MODEL_REPAIRS) {
  const document = await io.readBinary(await readOriginal(model));
  await model.repair(document);
  await document.transform(prune({ keepAttributes: true }));
  const bytes = await io.writeBinary(document);
  writeFileSync(path(model.output), bytes);
  console.log(
    `${model.output} sha256 ${sha256(bytes)} byteLength ${bytes.byteLength}`,
  );
}
