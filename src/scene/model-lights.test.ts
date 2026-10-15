import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";
import { describe, expect, it } from "vitest";

import { fictionalModelAssets } from "./fictional-model-assets";
import {
  lampRadianceFromLuminance,
  modelLightIsOn,
  modelLights,
  modelLightsByBodyId,
  type ModelLight,
} from "./model-lights";
import { spacecraftAssets } from "./spacecraft-assets";
import {
  LIT_WINDOW_LUMINANCE_CD_M2,
  LIT_WINDOW_RADIANCE,
  SUNLIGHT_LUMINANCE_AT_1_AU,
} from "./window-lighting";

type Vec3 = readonly [number, number, number];

type Triangle = readonly [Vec3, Vec3, Vec3];

type Hull = Readonly<{
  min: Vec3;
  max: Vec3;
  /** Triangles in the glTF scene's coordinates. */
  triangles: readonly Triangle[];
}>;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Distance from a point to a triangle (Ericson, Real-Time Collision Detection 5.1.5). */
function pointTriangleDistance(p: Vec3, a: Vec3, b: Vec3, c: Vec3): number {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(p, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  const at = (s: number, t: number): number =>
    Math.hypot(
      a[0] + ab[0] * s + ac[0] * t - p[0],
      a[1] + ab[1] * s + ac[1] * t - p[1],
      a[2] + ab[2] * s + ac[2] * t - p[2],
    );
  if (d1 <= 0 && d2 <= 0) return at(0, 0);
  const bp = sub(p, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return at(1, 0);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return at(d1 / (d1 - d3), 0);
  const cp = sub(p, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return at(0, 1);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return at(0, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return at(1 - w, w);
  }
  const denominator = 1 / (va + vb + vc);
  return at(vb * denominator, vc * denominator);
}

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "draco3d.decoder": await draco3d.createDecoderModule(),
  });

/** Every triangle of an installed model, in its glTF scene coordinates. */
async function readHull(modelUrl: string): Promise<Hull> {
  const document = await io.readBinary(
    readFileSync(
      fileURLToPath(new URL(`../../public${modelUrl}`, import.meta.url)),
    ),
  );
  const corners: Vec3[] = [];
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (mesh === null) continue;
    const m = node.getWorldMatrix();
    for (const primitive of mesh.listPrimitives()) {
      const positions = primitive.getAttribute("POSITION");
      if (positions === null) throw new Error(`${modelUrl} has no POSITION`);
      const indices = primitive.getIndices();
      const count =
        indices === null ? positions.getCount() : indices.getCount();
      const v = [0, 0, 0];
      for (let k = 0; k < count; k += 1) {
        positions.getElement(indices === null ? k : indices.getScalar(k), v);
        const [x = NaN, y = NaN, z = NaN] = v;
        corners.push([
          m[0] * x + m[4] * y + m[8] * z + m[12],
          m[1] * x + m[5] * y + m[9] * z + m[13],
          m[2] * x + m[6] * y + m[10] * z + m[14],
        ]);
      }
    }
  }
  const triangles: Triangle[] = [];
  for (let k = 0; k + 2 < corners.length; k += 3) {
    const [a, b, c] = corners.slice(k, k + 3);
    if (a === undefined || b === undefined || c === undefined) {
      throw new Error(`${modelUrl} has an incomplete triangle`);
    }
    triangles.push([a, b, c]);
  }
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const corner of corners) {
    for (const axis of [0, 1, 2] as const) {
      min[axis] = Math.min(min[axis], corner[axis]);
      max[axis] = Math.max(max[axis], corner[axis]);
    }
  }
  return { min, max, triangles };
}

function distanceToHull(hull: Hull, point: Vec3, reach: number): number {
  let best = Infinity;
  for (const triangle of hull.triangles) {
    // Skip triangles whose box is farther than the reach.
    const far = ([0, 1, 2] as const).some(
      (axis) =>
        point[axis] <
          Math.min(triangle[0][axis], triangle[1][axis], triangle[2][axis]) -
            reach ||
        point[axis] >
          Math.max(triangle[0][axis], triangle[1][axis], triangle[2][axis]) +
            reach,
    );
    if (far) continue;
    best = Math.min(best, pointTriangleDistance(point, ...triangle));
  }
  return best;
}

const assets: ReadonlyMap<
  string,
  Readonly<{ modelUrl: string; maximumDimensionM: number }>
> = new Map(
  [...spacecraftAssets, ...fictionalModelAssets].map((asset) => [
    asset.bodyId,
    asset,
  ]),
);

describe("model lamps", () => {
  it.each([...modelLightsByBodyId.keys()])(
    "anchors every %s lamp on the hull of its installed model",
    async (bodyId) => {
      const asset = assets.get(bodyId);
      const lights = modelLightsByBodyId.get(bodyId);
      if (asset === undefined || lights === undefined) {
        throw new Error(`${bodyId} has no model asset or lamps`);
      }
      const hull = await readHull(asset.modelUrl);
      const extent = sub(hull.max, hull.min);
      const metresPerUnit = asset.maximumDimensionM / Math.max(...extent);
      for (const light of lights) {
        for (const axis of [0, 1, 2] as const) {
          expect(light.position[axis], light.name).toBeGreaterThanOrEqual(
            hull.min[axis] - 1e-6 * extent[axis],
          );
          expect(light.position[axis], light.name).toBeLessThanOrEqual(
            hull.max[axis] + 1e-6 * extent[axis],
          );
        }
        // On the hull: no farther from a triangle than the lamp's own radius.
        const radiusUnits = light.radiusM / metresPerUnit;
        expect(
          distanceToHull(hull, light.position, radiusUnits),
          light.name,
        ).toBeLessThanOrEqual(radiusUnits);
      }
    },
    60_000,
  );

  it("sits the Deep Space Nine pylon lamps on the six pylon tips", async () => {
    const asset = assets.get("deep-space-nine");
    if (asset === undefined)
      throw new Error("Deep Space Nine is not installed");
    const hull = await readHull(asset.modelUrl);
    const pylons = modelLights.filter(
      (light) =>
        light.bodyId === "deep-space-nine" && light.name.includes("pylon"),
    );
    expect(pylons).toHaveLength(6);
    const height = hull.max[1] - hull.min[1];
    for (const light of pylons) {
      const tipY = light.position[1] > 0 ? hull.max[1] : hull.min[1];
      expect(Math.abs(light.position[1] - tipY), light.name).toBeLessThan(
        0.005 * height,
      );
      expect(light.pattern.kind, light.name).toBe("blink");
    }
    // The upper and lower pylons blink in turn.
    const phases = new Set(
      pylons.map((light) =>
        light.pattern.kind === "blink" ? light.pattern.phase : NaN,
      ),
    );
    expect([...phases].sort()).toEqual([0, 0.5]);
  });

  it("outshines the lit windows and a sunlit mid-grey hull at 1 AU", () => {
    // The same calibration as the windows: 300 cd/m2 is the window radiance.
    expect(lampRadianceFromLuminance(LIT_WINDOW_LUMINANCE_CD_M2)).toBeCloseTo(
      LIT_WINDOW_RADIANCE,
      12,
    );
    const sunlitGreyHull = (0.5 * SUNLIGHT_LUMINANCE_AT_1_AU) / Math.PI;
    for (const light of modelLights) {
      const radiance = lampRadianceFromLuminance(light.luminanceCdM2);
      expect(radiance, light.name).toBeGreaterThan(100 * LIT_WINDOW_RADIANCE);
      expect(radiance, light.name).toBeGreaterThan(sunlitGreyHull);
    }
  });

  it("blinks on the wall clock and stays on under reduced motion", () => {
    const blinking = modelLights.filter(
      (light): light is ModelLight & { pattern: { kind: "blink" } } =>
        light.pattern.kind === "blink",
    );
    expect(blinking.length).toBeGreaterThan(0);
    for (const light of blinking) {
      const { periodSeconds, onFraction } = light.pattern;
      expect(periodSeconds, light.name).toBeGreaterThanOrEqual(0.5);
      expect(periodSeconds, light.name).toBeLessThanOrEqual(5);
      const samples = 1_000;
      const onCount = Array.from({ length: samples }, (_, index) =>
        modelLightIsOn(light, 1_000 + (index * periodSeconds) / samples, false),
      ).filter(Boolean).length;
      expect(onCount / samples, light.name).toBeCloseTo(onFraction, 2);
      for (let index = 0; index < samples; index += 1) {
        const seconds = 1_000 + (index * periodSeconds) / samples;
        expect(modelLightIsOn(light, seconds, true), light.name).toBe(true);
      }
    }
    for (const light of modelLights.filter(
      (entry) => entry.pattern.kind === "steady",
    )) {
      expect(modelLightIsOn(light, 1_000.3, false), light.name).toBe(true);
    }
  });

  it("marks the Roadster lamps as play and the ISS lamps as decorative", () => {
    for (const light of modelLightsByBodyId.get("roadster") ?? []) {
      expect(light.basis, light.name).toBe("playful-fiction");
    }
    for (const light of modelLightsByBodyId.get("iss") ?? []) {
      expect(light.basis, light.name).toBe("decorative-not-documented");
    }
    expect(modelLightsByBodyId.get("roadster")?.length).toBe(8);
    expect(modelLightsByBodyId.get("iss")?.length).toBe(4);
  });
});
