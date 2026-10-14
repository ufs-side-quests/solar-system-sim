import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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
    pbrMetallicRoughness?: { metallicFactor?: number };
    emissiveFactor?: readonly number[];
    emissiveTexture?: { index: number; texCoord?: number };
  }[];
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
