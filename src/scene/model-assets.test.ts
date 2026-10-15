import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { fictionalModelAssets } from "./fictional-model-assets";
import { spacecraftAssets } from "./spacecraft-assets";
import { SUNLIGHT_COLOR } from "./visual-assets";
import {
  LIT_WINDOW_EMISSIVE_LINEAR_RGB,
  LIT_WINDOW_RADIANCE,
  portholeMaskFromHullTexture,
  SUNLIGHT_LUMINANCE_AT_1_AU,
} from "./window-lighting";

type GltfJson = Readonly<{
  nodes: readonly {
    name?: string;
    mesh?: number;
    rotation?: readonly number[];
    scale?: readonly number[];
    matrix?: readonly number[];
  }[];
  meshes: readonly {
    primitives: readonly {
      attributes: Record<string, number>;
      material?: number;
    }[];
  }[];
  accessors: readonly {
    min?: readonly number[];
    max?: readonly number[];
  }[];
  materials: readonly {
    name?: string;
    pbrMetallicRoughness?: {
      baseColorFactor?: readonly number[];
      metallicFactor?: number;
    };
    emissiveFactor?: readonly number[];
    emissiveTexture?: { index: number; texCoord?: number };
  }[];
  textures?: readonly {
    source?: number;
    extensions?: { EXT_texture_webp?: { source: number } };
  }[];
  images?: readonly { bufferView?: number }[];
  bufferViews?: readonly { byteOffset?: number; byteLength: number }[];
}>;

function modelBytes(modelUrl: string): Buffer {
  return readFileSync(
    fileURLToPath(new URL(`../../public${modelUrl}`, import.meta.url)),
  );
}

/** The JSON chunk of a binary glTF file. */
function gltfJson(modelUrl: string): GltfJson {
  const bytes = modelBytes(modelUrl);
  expect(bytes.toString("latin1", 0, 4)).toBe("glTF");
  const jsonLength = bytes.readUInt32LE(12);
  const json: unknown = JSON.parse(bytes.toString("utf8", 20, 20 + jsonLength));
  return json as GltfJson;
}

/** The bytes of a texture's image in a binary glTF file's BIN chunk. */
function textureImageBytes(
  modelUrl: string,
  gltf: GltfJson,
  textureIndex: number,
): Buffer {
  const texture = gltf.textures?.[textureIndex];
  const imageIndex =
    texture?.extensions?.EXT_texture_webp?.source ?? texture?.source;
  const viewIndex =
    imageIndex === undefined
      ? undefined
      : gltf.images?.[imageIndex]?.bufferView;
  const view =
    viewIndex === undefined ? undefined : gltf.bufferViews?.[viewIndex];
  if (view === undefined) {
    throw new Error(
      `${modelUrl} texture ${String(textureIndex)} has no image bytes`,
    );
  }
  const bytes = modelBytes(modelUrl);
  const binStart = 20 + bytes.readUInt32LE(12) + 8;
  const start = binStart + (view.byteOffset ?? 0);
  return bytes.subarray(start, start + view.byteLength);
}

/** Linear Rec. 709 luminance of the brightest texel of an sRGB image. */
async function maximumTexelLuminance(image: Buffer): Promise<number> {
  const { data, info } = await sharp(image)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const linear = (byte: number): number => {
    const encoded = byte / 255;
    return encoded <= 0.04045
      ? encoded / 12.92
      : ((encoded + 0.055) / 1.055) ** 2.4;
  };
  let maximum = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    maximum = Math.max(
      maximum,
      0.2126 * linear(data[offset] ?? Number.NaN) +
        0.7152 * linear(data[offset + 1] ?? Number.NaN) +
        0.0722 * linear(data[offset + 2] ?? Number.NaN),
    );
  }
  return maximum;
}

describe("installed 3D model files", () => {
  it("match the sha256 and byte length in their manifests", () => {
    for (const asset of [...spacecraftAssets, ...fictionalModelAssets]) {
      const bytes = modelBytes(asset.modelUrl);
      expect(bytes.byteLength, asset.modelUrl).toBe(asset.byteLength);
      expect(
        createHash("sha256").update(bytes).digest("hex"),
        asset.modelUrl,
      ).toBe(asset.sha256);
    }
  });

  it("keep no stray meshes floating above the ISS", () => {
    const gltf = gltfJson("/models/nasa/iss.glb");
    const names = gltf.nodes.map((node) => node.name);
    for (const stray of [
      "bendedtru1",
      "bendedtru2",
      "bendedtru3",
      "bendedtrus",
      "pCylinder1",
      "pCylinder2",
      "pCylinder8",
    ]) {
      expect(names).not.toContain(stray);
    }
    // The station's top is at 25.8 model units; the strays sat at 40.8.
    const tops = gltf.meshes.flatMap((mesh) =>
      mesh.primitives.map(
        (primitive) =>
          gltf.accessors[primitive.attributes["POSITION"] ?? -1]?.max?.[1],
      ),
    );
    expect(tops.length).toBeGreaterThan(0);
    for (const top of tops) expect(top).toBeLessThan(30);
  });

  it("gives Discovery One a dielectric hull", () => {
    const factors = gltfJson("/models/community/discovery-one.glb")
      .materials.filter((material) => material.name !== "7_-_Default")
      .map((material) => material.pbrMetallicRoughness?.metallicFactor);
    expect(factors).toHaveLength(13);
    expect(factors).toEqual(Array<number>(13).fill(0));
  });

  it("holds Deep Space Nine upright in mesh space", () => {
    const gltf = gltfJson("/models/community/deep-space-nine.glb");
    expect(gltf.nodes.length).toBeGreaterThan(0);
    for (const node of gltf.nodes) {
      expect(node.rotation).toBeUndefined();
      expect(node.scale).toBeUndefined();
      expect(node.matrix).toBeUndefined();
    }
    const positions = gltf.meshes.flatMap((mesh) =>
      mesh.primitives.map(
        (primitive) => gltf.accessors[primitive.attributes["POSITION"] ?? -1],
      ),
    );
    const extent = [0, 1, 2].map(
      (axis) =>
        Math.max(...positions.map((accessor) => accessor?.max?.[axis] ?? NaN)) -
        Math.min(...positions.map((accessor) => accessor?.min?.[axis] ?? NaN)),
    );
    // The rings lie in the x-z plane; the pylons run along y.
    const [x = NaN, y = NaN, z = NaN] = extent;
    expect(Math.abs(x / z - 1)).toBeLessThan(0.02);
    expect(y / x).toBeGreaterThan(0.6);
    expect(y / x).toBeLessThan(0.75);
    // The lit habitat ring sits above the middle: Ops is up, not down.
    const windowMaterial = gltf.materials.findIndex((material) =>
      material.name?.endsWith(" windows"),
    );
    const windowPositions = gltf.meshes
      .flatMap((mesh) => mesh.primitives)
      .filter((primitive) => primitive.material === windowMaterial)
      .map(
        (primitive) => gltf.accessors[primitive.attributes["POSITION"] ?? -1],
      );
    expect(windowPositions).toHaveLength(1);
    const [windowBounds] = windowPositions;
    expect(windowBounds?.max?.[1]).toBeGreaterThan(0.9);
    expect(windowBounds?.min?.[1]).toBeGreaterThan(-0.6);
  });

  it("lights Deep Space Nine's windows at the calibrated level only", () => {
    const materials = gltfJson(
      "/models/community/deep-space-nine.glb",
    ).materials;
    const windows = materials.filter((material) =>
      material.name?.endsWith(" windows"),
    );
    expect(windows).toHaveLength(1);
    for (const material of materials) {
      if (material.emissiveTexture === undefined) continue;
      expect(windows).toContain(material);
      // The window primitive's only texture coordinates (TEXCOORD_0).
      expect(material.emissiveTexture.texCoord ?? 0).toBe(0);
      const factor = material.emissiveFactor ?? [];
      expect(factor).toHaveLength(3);
      factor.forEach((channel, index) =>
        expect(channel).toBeCloseTo(
          LIT_WINDOW_EMISSIVE_LINEAR_RGB[index] ?? Number.NaN,
          6,
        ),
      );
    }
  });

  it("gives Death Star II painted, non-metallic materials at full texture value", () => {
    const materials = gltfJson("/models/community/death-star-ii.glb").materials;
    expect(materials).toHaveLength(11);
    for (const material of materials) {
      // An absent factor is the glTF default: 1 for base colour, 1 (bare
      // metal) for metallic. The Sketchfab export set base colour 0 to 0.17
      // and left metallic unset.
      expect(
        material.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1],
        material.name,
      ).toEqual([1, 1, 1, 1]);
      expect(
        material.pbrMetallicRoughness?.metallicFactor ?? 1,
        material.name,
      ).toBe(0);
    }
  });

  it("lights Death Star II's windows at the calibrated level", async () => {
    const modelUrl = "/models/community/death-star-ii.glb";
    const gltf = gltfJson(modelUrl);
    const windows = gltf.materials.filter(
      (material) => material.emissiveTexture !== undefined,
    );
    // The decks and the outer hull panels; the export's factors were 1 and 0.8.
    expect(windows.map((material) => material.name)).toEqual([
      "05_-_Defaultasdasd windows",
      "06_-_Default windows",
    ]);
    const textureIndices = new Set(
      windows.map((material) => material.emissiveTexture?.index),
    );
    expect(textureIndices.size).toBe(1);
    const [textureIndex = Number.NaN] = textureIndices;
    const brightestTexel = await maximumTexelLuminance(
      textureImageBytes(modelUrl, gltf, textureIndex),
    );
    const luminance = (factor: readonly number[] | undefined): number =>
      0.2126 * (factor?.[0] ?? Number.NaN) +
      0.7152 * (factor?.[1] ?? Number.NaN) +
      0.0722 * (factor?.[2] ?? Number.NaN);
    const [decks, panels] = windows;
    expect(luminance(decks?.emissiveFactor) * brightestTexel).toBeCloseTo(
      LIT_WINDOW_RADIANCE,
      6,
    );
    expect(
      luminance(panels?.emissiveFactor) / luminance(decks?.emissiveFactor),
    ).toBeCloseTo(0.8, 6);
  });

  it("turns Death Star II's superlaser dish to +z", () => {
    const gltf = gltfJson("/models/community/death-star-ii.glb");
    for (const node of gltf.nodes) {
      expect(node.rotation).toBeUndefined();
      expect(node.scale).toBeUndefined();
      expect(node.matrix).toBeUndefined();
    }
    const bounds = (
      primitives: readonly { attributes: Record<string, number> }[],
    ) => {
      const accessors = primitives.map(
        (primitive) => gltf.accessors[primitive.attributes["POSITION"] ?? -1],
      );
      return [0, 1, 2].map((axis) => ({
        min: Math.min(...accessors.map((entry) => entry?.min?.[axis] ?? NaN)),
        max: Math.max(...accessors.map((entry) => entry?.max?.[axis] ?? NaN)),
      }));
    };
    const station = bounds(gltf.meshes.flatMap((mesh) => mesh.primitives));
    const dishMaterial = gltf.materials.findIndex(
      (material) => material.name === "03_-_Defaultasdsad",
    );
    // The dish material also covers the polar caps, which sit on the axis.
    const dish = bounds(
      gltf.meshes
        .flatMap((mesh) => mesh.primitives)
        .filter((primitive) => primitive.material === dishMaterial),
    );
    const radius = Math.max(
      ...station.map((extent) => (extent.max - extent.min) / 2),
    );
    const offset = (axis: number) =>
      ((dish[axis]?.min ?? NaN) +
        (dish[axis]?.max ?? NaN) -
        (station[axis]?.min ?? NaN) -
        (station[axis]?.max ?? NaN)) /
      2 /
      radius;
    expect(offset(2)).toBeGreaterThan(0.2);
    expect(Math.abs(offset(0))).toBeLessThan(0.05);
  });
});

describe("lit window calibration", () => {
  it("reads the sunlight luminance from the scene's sunlight colour", () => {
    // IEC 61966-2-1 decoding of each sRGB byte, then Rec. 709 weights.
    const linear = [1, 3, 5].map((start) => {
      const encoded =
        Number.parseInt(SUNLIGHT_COLOR.slice(start, start + 2), 16) / 255;
      return encoded <= 0.04045
        ? encoded / 12.92
        : ((encoded + 0.055) / 1.055) ** 2.4;
    });
    expect(SUNLIGHT_COLOR).toBe("#fff1ea");
    expect(SUNLIGHT_LUMINANCE_AT_1_AU).toBeCloseTo(
      7 *
        (0.2126 * (linear[0] ?? Number.NaN) +
          0.7152 * (linear[1] ?? Number.NaN) +
          0.0722 * (linear[2] ?? Number.NaN)),
      10,
    );
    expect(SUNLIGHT_LUMINANCE_AT_1_AU).toBeCloseTo(6.31, 2);
  });

  it("puts 300 cd/m2 at about 0.014 scene radiance units", () => {
    // 133,000 lx / 6.31 scene units = about 21,000 cd/m2 per radiance unit.
    expect(LIT_WINDOW_RADIANCE).toBeCloseTo(300 / 21_080, 5);
    const [red, green, blue] = LIT_WINDOW_EMISSIVE_LINEAR_RGB;
    expect(0.2126 * red + 0.7152 * green + 0.0722 * blue).toBeCloseTo(
      LIT_WINDOW_RADIANCE,
      10,
    );
  });

  it("masks black portholes and leaves the grey hull dark", () => {
    const hull = [0xbf, 0xc4, 0xc8, 255];
    const porthole = [0, 0, 0, 255];
    const mask = portholeMaskFromHullTexture(
      new Uint8ClampedArray([...hull, ...porthole]),
    );
    expect([...mask]).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
    expect(() => portholeMaskFromHullTexture(new Uint8ClampedArray(3))).toThrow(
      "Hull texture must be non-empty RGBA bytes",
    );
  });
});
