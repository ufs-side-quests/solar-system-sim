import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { fictionalModelAssets } from "./fictional-model-assets";
import { spacecraftAssets } from "./spacecraft-assets";
import {
  LIT_WINDOW_EMISSIVE_LINEAR_RGB,
  LIT_WINDOW_RADIANCE,
  portholeMaskFromHullTexture,
} from "./window-lighting";

type GltfJson = Readonly<{
  nodes: readonly { name?: string; mesh?: number }[];
  meshes: readonly {
    primitives: readonly { attributes: Record<string, number> }[];
  }[];
  accessors: readonly { max?: readonly number[] }[];
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

  it("lights Deep Space Nine's windows at the calibrated level only", () => {
    const materials = gltfJson(
      "/models/community/deep-space-nine.glb",
    ).materials;
    const windows = materials.filter((material) =>
      material.name?.endsWith(" windows"),
    );
    expect(windows).toHaveLength(3);
    for (const material of materials) {
      if (material.emissiveTexture === undefined) continue;
      expect(windows).toContain(material);
      expect(material.emissiveTexture.texCoord).toBe(1);
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
  it("puts 300 cd/m2 at about 0.016 scene radiance units", () => {
    expect(LIT_WINDOW_RADIANCE).toBeCloseTo(300 / 19_000, 4);
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
