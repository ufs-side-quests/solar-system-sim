import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";
import sharp from "sharp";
import {
  CylinderGeometry,
  Group,
  Mesh,
  type Object3D,
  Texture,
  TextureLoader,
  Vector3,
} from "three";
import { describe, expect, it, vi } from "vitest";

import { createDeathStarModel } from "./death-star-model";
import { fictionalModelAssets } from "./fictional-model-assets";
import { fictionalOrbiterById } from "./fictional-orbiters";
import {
  lampRadianceFromLuminance,
  modelLightIsOn,
  modelLights,
  modelLightsByBodyId,
  modelLightSunlitShare,
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

// Death Star I is procedural (death-star-model.ts), with no installed model
// file: its own test below checks its lamps against its built geometry.
const PROCEDURAL_MODEL_BODY_IDS = ["death-star-1"];

describe("model lamps", () => {
  it("lights only installed models and the procedural Death Star I", () => {
    expect(new Set(modelLightsByBodyId.keys())).toEqual(
      new Set([...assets.keys(), ...PROCEDURAL_MODEL_BODY_IDS]),
    );
  });

  it.each(
    [...modelLightsByBodyId.keys()].filter(
      (bodyId) => !PROCEDURAL_MODEL_BODY_IDS.includes(bodyId),
    ),
  )(
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

describe("model lamps on every model", () => {
  it("gives every sourced model lamps", () => {
    for (const bodyId of assets.keys()) {
      expect(modelLightsByBodyId.get(bodyId)?.length, bodyId).toBeGreaterThan(
        0,
      );
    }
  });

  it("covers Death Star II with a field of hull lamps that fade in sunlight", async () => {
    const asset = assets.get("death-star-2");
    if (asset === undefined) throw new Error("Death Star II is not installed");
    const hull = await readHull(asset.modelUrl);
    const lights = modelLightsByBodyId.get("death-star-2") ?? [];
    const field = lights.filter((light) => light.name.startsWith("hull lamp"));
    expect(field.length).toBeGreaterThanOrEqual(150);
    const centre: Vec3 = [17.699, -1.375, -14.581];
    const directions = field.map((light) => {
      const offset = sub(light.position, centre);
      const length = Math.hypot(...offset);
      // On the outer hull, with the normal turned outward.
      expect(length, light.name).toBeGreaterThan(0.96 * 371.8);
      expect(dot(offset, light.normal) / length, light.name).toBeGreaterThan(
        0.5,
      );
      expect(light.onSunlitHull, light.name).toBe("fade");
      expect(light.glowScale, light.name).toBeLessThan(1);
      const direction: Vec3 = [
        offset[0] / length,
        offset[1] / length,
        offset[2] / length,
      ];
      return direction;
    });
    // Spread over the station: lamps in all six directions from the centre.
    for (const axis of [0, 1, 2] as const) {
      for (const sign of [1, -1]) {
        expect(
          directions.some((direction) => sign * direction[axis] > 0.9),
          `axis ${String(axis)} sign ${String(sign)}`,
        ).toBe(true);
      }
    }
    // The superlaser: a green lens and eight green emitters, all inside the
    // dish rim (16 degrees off the dish axis).
    const dishAxis: Vec3 = [-0.0135, 0.4324, 0.9016];
    const dish = lights.filter((light) => light.name.startsWith("superlaser"));
    expect(dish).toHaveLength(9);
    for (const light of dish) {
      const offset = sub(light.position, centre);
      expect(light.colorSrgbHex, light.name).toBe("#40ff50");
      expect(
        dot(offset, dishAxis) / Math.hypot(...offset),
        light.name,
      ).toBeGreaterThan(Math.cos((16 * Math.PI) / 180));
      expect(light.onSunlitHull, light.name).toBe("show");
    }
    // Red beacons on the two poles, blinking in turn.
    const poles = lights.filter((light) => light.name.includes("pole"));
    expect(poles).toHaveLength(2);
    const height = hull.max[1] - hull.min[1];
    for (const light of poles) {
      const tipY = light.position[1] > 0 ? hull.max[1] : hull.min[1];
      expect(Math.abs(light.position[1] - tipY), light.name).toBeLessThan(
        0.005 * height,
      );
      expect(light.pattern.kind, light.name).toBe("blink");
    }
    expect(
      poles
        .map((light) =>
          light.pattern.kind === "blink" ? light.pattern.phase : NaN,
        )
        .sort(),
    ).toEqual([0, 0.5]);
  }, 60_000);

  it("fades a lamp only on a sunlit hull, and only when it is set to", () => {
    const [fading] = (modelLightsByBodyId.get("death-star-2") ?? []).filter(
      (light) => light.onSunlitHull === "fade",
    );
    if (fading === undefined) throw new Error("No lamp fades in sunlight");
    expect(modelLightSunlitShare(fading, -1)).toBe(1);
    expect(modelLightSunlitShare(fading, -0.1)).toBe(1);
    expect(modelLightSunlitShare(fading, 0)).toBeGreaterThan(0);
    expect(modelLightSunlitShare(fading, 0)).toBeLessThan(1);
    expect(modelLightSunlitShare(fading, 0.15)).toBe(0);
    expect(modelLightSunlitShare(fading, 1)).toBe(0);
    for (const light of modelLights.filter(
      (entry) => entry.onSunlitHull === "show",
    )) {
      expect(modelLightSunlitShare(light, 1), light.name).toBe(1);
    }
    // Only the two Death Stars' hull fields fade.
    expect(
      new Set(
        modelLights
          .filter((light) => light.onSunlitHull === "fade")
          .map((light) => light.bodyId),
      ),
    ).toEqual(new Set(["death-star-1", "death-star-2"]));
  });

  it("covers Death Star I with hull lamps, a superlaser and pole beacons from its own geometry", async () => {
    const station = fictionalOrbiterById.get("death-star-1");
    if (station === undefined) throw new Error("Death Star I is not defined");
    // The model in its own frame. Its textures are not under test, and Node
    // has no image decoder, so a blank texture stands in for each.
    const load = vi
      .spyOn(TextureLoader.prototype, "load")
      .mockImplementation(() => new Texture());
    const model: Group = createDeathStarModel(station, (url) => {
      throw new Error(`${url} failed to load`);
    });
    load.mockRestore();
    model.scale.setScalar(1);
    model.updateMatrixWorld(true);
    const meshesUnder = (root: Object3D): Mesh[] => {
      const found: Mesh[] = [];
      root.traverse((object) => {
        // instanceof is the check; three types the result Mesh<any>.
        if (object instanceof Mesh) found.push(object as Mesh);
      });
      return found;
    };
    const meshesNamed = (name: string): Mesh[] =>
      meshesUnder(model).filter((mesh) => mesh.name === name);
    const [hullMesh] = meshesNamed(`${station.name} main hull`);
    if (hullMesh === undefined) throw new Error("Death Star I has no hull");
    hullMesh.geometry.computeBoundingSphere();
    const hullRadius = hullMesh.geometry.boundingSphere?.radius ?? NaN;
    const metresPerUnit = station.diameterM / 2 / hullRadius;
    const lights = modelLightsByBodyId.get("death-star-1") ?? [];
    const position = (light: ModelLight): Vector3 =>
      new Vector3(...light.position);

    // The dish axis, and the widest angle from it of any part of the dish.
    const dishRoot = model.getObjectByName("Recessed superlaser assembly");
    if (dishRoot === undefined) throw new Error("Death Star I has no dish");
    const axis = new Vector3(0, 0, 1).transformDirection(dishRoot.matrixWorld);
    let dishAngle = 0;
    for (const mesh of meshesUnder(dishRoot)) {
      const corners = mesh.geometry.getAttribute("position");
      for (let index = 0; index < corners.count; index += 1) {
        const corner = new Vector3()
          .fromBufferAttribute(corners, index)
          .applyMatrix4(mesh.matrixWorld);
        dishAngle = Math.max(dishAngle, corner.angleTo(axis));
      }
    }

    // The trench: rows of the hull texture whose mean is under half the
    // median row's, as latitudes (the texture runs from pole to pole).
    const { data, info } = await sharp(
      fileURLToPath(
        new URL(
          "../../public/textures/fictional/death-star-hull-v2.webp",
          import.meta.url,
        ),
      ),
    )
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const rowMeans = Array.from({ length: info.height }, (_, row) => {
      let sum = 0;
      for (let x = 0; x < info.width; x += 1) {
        sum += data[row * info.width + x] ?? NaN;
      }
      return sum / info.width;
    });
    const median = [...rowMeans].sort((a, b) => a - b)[info.height >> 1] ?? NaN;
    let trenchHalfLatitude = 0;
    rowMeans.forEach((mean, row) => {
      if (mean >= 0.5 * median) return;
      for (const edge of [row, row + 1]) {
        trenchHalfLatitude = Math.max(
          trenchHalfLatitude,
          Math.abs(Math.PI / 2 - (Math.PI * edge) / info.height),
        );
      }
    });
    expect(trenchHalfLatitude).toBeGreaterThan(0);
    expect(trenchHalfLatitude).toBeLessThan(0.1);

    // Hull lamps: on the hull, facing out, clear of the trench and the dish,
    // spread over the whole station, fading on the sunlit hull.
    const field = lights.filter((light) => light.name.startsWith("hull lamp"));
    expect(field.length).toBeGreaterThanOrEqual(250);
    for (const light of field) {
      const place = position(light);
      const lampAngle = light.radiusM / metresPerUnit / hullRadius;
      expect(place.length(), light.name).toBeCloseTo(hullRadius, 5);
      expect(
        new Vector3(...light.normal).dot(place) / place.length(),
        light.name,
      ).toBeGreaterThan(0.999);
      expect(
        Math.abs(Math.asin(place.y / place.length())) - lampAngle,
        light.name,
      ).toBeGreaterThan(trenchHalfLatitude);
      expect(place.angleTo(axis) - lampAngle, light.name).toBeGreaterThan(
        dishAngle,
      );
      expect(light.onSunlitHull, light.name).toBe("fade");
      expect(light.glowScale, light.name).toBeLessThan(1);
    }
    for (const axisIndex of [0, 1, 2] as const) {
      for (const sign of [1, -1]) {
        expect(
          field.some(
            (light) => (sign * light.position[axisIndex]) / hullRadius > 0.9,
          ),
          `axis ${String(axisIndex)} sign ${String(sign)}`,
        ).toBe(true);
      }
    }

    // The superlaser: a green lamp over the central emitter and over each of
    // the eight focusing nodes, each the size of its part's front face and
    // facing out along the dish axis.
    const dish = lights.filter((light) => light.name.startsWith("superlaser"));
    expect(dish).toHaveLength(9);
    const parts = [
      ...meshesNamed("Superlaser central emitter"),
      ...meshesNamed("Superlaser perimeter focusing node"),
    ];
    expect(parts).toHaveLength(9);
    for (const part of parts) {
      if (!(part.geometry instanceof CylinderGeometry)) {
        throw new Error(`${part.name} is not a cylinder`);
      }
      const frontRadius = part.geometry.parameters.radiusTop;
      const centre = part.getWorldPosition(new Vector3());
      const over = dish.filter((light) => {
        const offset = position(light).sub(centre);
        return (
          offset.sub(axis.clone().multiplyScalar(offset.dot(axis))).length() <
          frontRadius
        );
      });
      expect(over, part.name).toHaveLength(1);
      const [light] = over;
      if (light === undefined) continue;
      expect(
        light.radiusM / (frontRadius * metresPerUnit),
        light.name,
      ).toBeCloseTo(1, 5);
      expect(position(light).length(), light.name).toBeCloseTo(hullRadius, 5);
      expect(
        new Vector3(...light.normal).dot(axis),
        light.name,
      ).toBeGreaterThan(0.999);
      expect(light.colorSrgbHex, light.name).toBe("#40ff50");
      expect(light.onSunlitHull, light.name).toBe("show");
    }

    // Red beacons on the two poles, blinking in turn.
    const poles = lights.filter((light) => light.name.includes("pole"));
    expect(poles).toHaveLength(2);
    for (const light of poles) {
      expect(Math.abs(light.position[1]), light.name).toBeCloseTo(
        hullRadius,
        5,
      );
      expect(light.colorSrgbHex, light.name).toBe("#ff2a1a");
      expect(light.pattern.kind, light.name).toBe("blink");
    }
    expect(
      poles
        .map((light) =>
          light.pattern.kind === "blink" ? light.pattern.phase : NaN,
        )
        .sort(),
    ).toEqual([0, 0.5]);
    expect(lights).toHaveLength(field.length + 11);
    for (const light of lights) {
      expect(light.basis, light.name).toBe("authored-fiction");
    }
  });

  it("gives the USS Defiant navigation lamps, strobes, a deflector and impulse engines", async () => {
    const asset = assets.get("uss-defiant");
    if (asset === undefined) throw new Error("USS Defiant is not installed");
    const hull = await readHull(asset.modelUrl);
    const lights = modelLightsByBodyId.get("uss-defiant") ?? [];
    const byName = (name: string): ModelLight => {
      const light = lights.find((entry) => entry.name === name);
      if (light === undefined) throw new Error(`${name} is missing`);
      return light;
    };
    // The bow is +z and up is +y, so port is +x: red there, green to
    // starboard, each on the ship's widest point.
    const port = byName("port navigation lamp");
    const starboard = byName("starboard navigation lamp");
    expect(port.colorSrgbHex).toBe("#ff2020");
    expect(starboard.colorSrgbHex).toBe("#19ff7a");
    const width = hull.max[0] - hull.min[0];
    expect(hull.max[0] - port.position[0]).toBeLessThan(0.02 * width);
    expect(starboard.position[0] - hull.min[0]).toBeLessThan(0.02 * width);
    // White strobes that blink.
    for (const name of ["port strobe", "starboard strobe"]) {
      const strobe = byName(name);
      expect(strobe.colorSrgbHex, name).toBe("#ffffff");
      expect(strobe.pattern.kind, name).toBe("blink");
    }
    // The blue deflector at the bow, the red impulse engines at the stern.
    const length = hull.max[2] - hull.min[2];
    const deflector = byName("deflector");
    expect(deflector.colorSrgbHex).toBe("#3a8bff");
    expect(hull.max[2] - deflector.position[2]).toBeLessThan(0.05 * length);
    for (const name of ["port impulse engine", "starboard impulse engine"]) {
      const engine = byName(name);
      expect(engine.colorSrgbHex, name).toBe("#ff3010");
      expect(engine.position[2] - hull.min[2], name).toBeLessThan(
        0.05 * length,
      );
      expect(engine.normal[2], name).toBeLessThan(-0.9);
    }
    expect(lights).toHaveLength(7);
    for (const light of lights) {
      expect(light.basis, light.name).toBe("authored-fiction");
    }
  }, 60_000);

  it("marks the few Hubble, JWST and Voyager lamps as play", () => {
    for (const bodyId of ["hubble", "jwst", "voyager-1", "voyager-2"]) {
      const lights = modelLightsByBodyId.get(bodyId) ?? [];
      expect(lights, bodyId).toHaveLength(3);
      expect(lights.map((light) => light.colorSrgbHex).sort(), bodyId).toEqual([
        "#19ff7a",
        "#ff2020",
        "#ffffff",
      ]);
      for (const light of lights) {
        expect(light.basis, light.name).toBe("playful-fiction");
        expect(light.radiusM, light.name).toBeLessThanOrEqual(0.1);
      }
    }
  });
});
