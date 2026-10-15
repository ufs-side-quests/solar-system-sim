import { DataUtils, Matrix4, Vector3 } from "three";
import { z } from "zod";

import bodyAlbedoJson from "../data/body-albedo.snapshot.json";

// Planetshine: the light that a big sunlit planet or moon throws on the
// shadow side of a spacecraft near it. The focused model gets it as an
// environment map of its sky that holds only the parent's disc, so it never
// reaches a planet's night side the way a global ambient light would.
//
// The map draws every point of the parent that the model sees, at the
// radiance the parent's reflectance law gives for the Sun's incidence there
// (cosine mu0) and the model's view of it (cosine mu). E is the solar
// irradiance at the parent, the same at the model to well under 1%.
//   lambert (the cloudy planets, from the Bond albedo A):
//     L = A E mu0 / pi.
//     A Lambert sphere scatters exactly the share A of its sunlight.
//   lommel-seeliger (the airless moons, from the visual geometric albedo p):
//     L = (p E / pi) x 2 mu0 / (mu0 + mu).
//     This single-scattering law of dark regolith makes the full disc
//     uniform at zero phase, as the full Moon is, with mean radiance
//     p E / pi: the definition of p. NSSDCA gives no Bond albedo for the
//     moons, and converting p as a Lambert sphere (A = 1.5 p) would give Io
//     A = 0.93 and Europa above 1, so p is used under its own name.
// Far from the parent and at zero phase, a surface facing it then gets
//   lommel-seeliger: p x sin^2(angular radius) of the direct sunlight,
//   lambert:         (2/3) A x sin^2(angular radius),
// because a uniform disc of radiance L and angular radius a gives pi L
// sin^2(a) on a surface facing its centre, and a Lambert sphere's disc has
// the mean radiance (2/3) A E / pi at zero phase.

const linearSrgb = z.tuple([
  z.number().positive(),
  z.number().positive(),
  z.number().positive(),
]);
const albedo = z.number().gt(0).lt(1);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/u);

export const bodyAlbedoSnapshotSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  authority: z.literal("NASA Space Science Data Coordinated Archive (NSSDCA)"),
  sourceUrl: z.url(),
  retrievedAt: z.iso.datetime(),
  albedoDefinitions: z.string().min(1),
  surfaceColourMethod: z.string().min(1),
  bodies: z
    .array(
      z.object({
        id: z.string().min(1),
        sourceUrl: z.url(),
        sourceResponseSha256: sha256,
        reflectance: z.discriminatedUnion("law", [
          z.object({
            law: z.literal("lambert"),
            bondAlbedo: albedo,
            geometricAlbedo: albedo,
          }),
          z.object({
            law: z.literal("lommel-seeliger"),
            geometricAlbedo: albedo,
          }),
        ]),
        surfaceColour: z.object({
          meanLinearSrgb: linearSrgb,
          maps: z
            .array(
              z.object({
                file: z.string().startsWith("/textures/"),
                sha256,
              }),
            )
            .min(1),
        }),
      }),
    )
    .min(1),
});

const bodyAlbedoSnapshot = bodyAlbedoSnapshotSchema.parse(bodyAlbedoJson);

export type PlanetshineSource = (typeof bodyAlbedoSnapshot.bodies)[number];

export const planetshineSourceById: ReadonlyMap<string, PlanetshineSource> =
  new Map(bodyAlbedoSnapshot.bodies.map((body) => [body.id, body]));

/**
 * The body whose light fills the model's shadow side: the nearest natural
 * body up the model's parent chain. A heliocentric model has none. A planet
 * or moon parent without a sourced albedo is an error, not a dark sky.
 */
export function planetshineSourceId(
  bodyId: string,
  parentOf: (bodyId: string) => string | undefined,
  isNaturalBody: (bodyId: string) => boolean,
): string | undefined {
  let id = parentOf(bodyId);
  while (id !== undefined && id !== "sun") {
    if (planetshineSourceById.has(id)) return id;
    if (isNaturalBody(id)) {
      throw new Error(`Planetshine source ${id} has no sourced albedo`);
    }
    id = parentOf(id);
  }
  return undefined;
}

/**
 * Radiance of the parent's surface at incidence cosine mu0 and view cosine
 * mu, as a share of E / pi (E: the solar irradiance at the parent).
 */
export function planetshineReflectance(
  reflectance: PlanetshineSource["reflectance"],
  mu0: number,
  mu: number,
): number {
  if (mu0 <= 0 || mu <= 0) return 0;
  return reflectance.law === "lambert"
    ? reflectance.bondAlbedo * mu0
    : (reflectance.geometricAlbedo * 2 * mu0) / (mu0 + mu);
}

/** The planetshine map: a small equirectangular sky, 2.8 degrees a texel. */
export const PLANETSHINE_MAP_WIDTH = 128;
export const PLANETSHINE_MAP_HEIGHT = 64;
/** Samples per texel along each axis, so the disc edge is soft, not stepped. */
const SUBSAMPLES = 4;

// The map is rebuilt only when it would visibly change: when the full-disc
// fill (sin^2 of the angular radius) changes by more than 1% of itself, or
// the phase by more than 1 degree. One degree of phase moves the fill of
// every model here by at most 1.1% of the direct sunlight (Discovery One near
// Io's terminator; planetshine.test measures it), about the 1 to 2% contrast
// a viewer can just see. At a fast playback rate the phase can pass 1 degree
// in every frame, so rebuilds are also at least PLANETSHINE_REBUILD_MIN_MS
// apart on the wall clock: never every frame.
const REBUILD_FILL_CHANGE = 0.01;
const REBUILD_PHASE_CHANGE_RAD = Math.PI / 180;
export const PLANETSHINE_REBUILD_MIN_MS = 250;

export type PlanetshineGeometry = Readonly<{
  /** Angular radius of the parent seen from the model: asin(R / d). */
  angularRadiusRad: number;
  /** Sun-parent-model angle: 0 when the model sees the full disc. */
  phaseAngleRad: number;
}>;

export function planetshineAngularRadiusRad(
  parentRadius: number,
  distance: number,
): number {
  if (!(parentRadius > 0) || !(distance > parentRadius)) {
    throw new Error(
      `Planetshine needs a model outside its parent: radius ${String(parentRadius)}, distance ${String(distance)}`,
    );
  }
  return Math.asin(parentRadius / distance);
}

export function planetshineNeedsRebuild(
  built: PlanetshineGeometry | undefined,
  next: PlanetshineGeometry,
): boolean {
  if (built === undefined) return true;
  const builtFill = Math.sin(built.angularRadiusRad) ** 2;
  const nextFill = Math.sin(next.angularRadiusRad) ** 2;
  return (
    Math.abs(nextFill - builtFill) > REBUILD_FILL_CHANGE * builtFill ||
    Math.abs(next.phaseAngleRad - built.phaseAngleRad) >
      REBUILD_PHASE_CHANGE_RAD
  );
}

const luminance = (rgb: readonly [number, number, number]): number =>
  0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];

/**
 * The colour of the parent's light, linear sRGB: sunlight times the parent's
 * mean surface colour, scaled to the sunlight's luminance over pi. The
 * reflectance law scales it.
 */
function reflectedSunlight(
  source: PlanetshineSource,
  sunlightLinearRgb: readonly [number, number, number],
): [number, number, number] {
  const surface = source.surfaceColour.meanLinearSrgb;
  const reflected: [number, number, number] = [
    sunlightLinearRgb[0] * surface[0],
    sunlightLinearRgb[1] * surface[1],
    sunlightLinearRgb[2] * surface[2],
  ];
  const scale = luminance(sunlightLinearRgb) / (Math.PI * luminance(reflected));
  return [reflected[0] * scale, reflected[1] * scale, reflected[2] * scale];
}

/**
 * Draws the parent into an RGBA half-float equirectangular map, in a frame
 * with the parent's centre on +z and the Sun, seen from the parent, in the
 * x-z plane on the +x side. A texel holds the radiance for one unit of
 * envMapIntensity, the solar irradiance in light-intensity units. Returns
 * the luminance of the irradiance that the written texels give a surface
 * facing the parent, per unit of envMapIntensity.
 */
export function writePlanetshineMap(
  data: Uint16Array,
  geometry: PlanetshineGeometry,
  source: PlanetshineSource,
  sunlightLinearRgb: readonly [number, number, number],
): number {
  const width = PLANETSHINE_MAP_WIDTH;
  const height = PLANETSHINE_MAP_HEIGHT;
  if (data.length !== width * height * 4) {
    throw new Error("Planetshine map data has the wrong size");
  }
  const colour = reflectedSunlight(source, sunlightLinearRgb);
  const { angularRadiusRad, phaseAngleRad } = geometry;
  // Parent radius 1, centre (0, 0, D). The Sun, from the parent, lies at the
  // phase angle from the parent-to-model direction, which is -z.
  const distance = 1 / Math.sin(angularRadiusRad);
  const sunX = Math.sin(phaseAngleRad);
  const sunZ = -Math.cos(phaseAngleRad);
  // Texels whose centre is farther from +z than this miss the disc.
  const texelReach = angularRadiusRad + (2 * Math.PI) / width;
  const zero = DataUtils.toHalfFloat(0);
  const one = DataUtils.toHalfFloat(1);
  let irradiance = 0;
  for (let row = 0; row < height; row += 1) {
    const latitudeLow = (row / height - 0.5) * Math.PI;
    const latitudeHigh = ((row + 1) / height - 0.5) * Math.PI;
    const texelSolidAngle =
      ((2 * Math.PI) / width) *
      (Math.sin(latitudeHigh) - Math.sin(latitudeLow));
    for (let column = 0; column < width; column += 1) {
      const centreLongitude = ((column + 0.5) / width - 0.5) * 2 * Math.PI;
      const centreLatitude = (latitudeLow + latitudeHigh) / 2;
      // three's equirectangular direction: (cos lat cos lon, sin lat,
      // cos lat sin lon), so +z is longitude 90 degrees on the equator.
      const centreZ = Math.cos(centreLatitude) * Math.sin(centreLongitude);
      let reflectance = 0;
      if (Math.acos(Math.min(1, centreZ)) <= texelReach) {
        for (let sv = 0; sv < SUBSAMPLES; sv += 1) {
          const latitude =
            ((row + (sv + 0.5) / SUBSAMPLES) / height - 0.5) * Math.PI;
          for (let su = 0; su < SUBSAMPLES; su += 1) {
            const longitude =
              ((column + (su + 0.5) / SUBSAMPLES) / width - 0.5) * 2 * Math.PI;
            const x = Math.cos(latitude) * Math.cos(longitude);
            const y = Math.sin(latitude);
            const z = Math.cos(latitude) * Math.sin(longitude);
            // Ray from the model along (x, y, z) against the unit sphere.
            const along = distance * z;
            const discriminant = along * along - (distance * distance - 1);
            if (along <= 0 || discriminant < 0) continue;
            const hit = along - Math.sqrt(discriminant);
            // Surface normal n = hit point - centre.
            const nx = hit * x;
            const ny = hit * y;
            const nz = hit * z - distance;
            reflectance += planetshineReflectance(
              source.reflectance,
              nx * sunX + nz * sunZ,
              -(nx * x + ny * y + nz * z),
            );
          }
        }
      }
      const share = reflectance / (SUBSAMPLES * SUBSAMPLES);
      const offset = (row * width + column) * 4;
      for (let c = 0; c < 3; c += 1) {
        data[offset + c] =
          share === 0
            ? zero
            : DataUtils.toHalfFloat(share * (colour[c] ?? Number.NaN));
      }
      data[offset + 3] = one;
      if (share > 0 && centreZ > 0) {
        // The irradiance from the values written, not from the formula.
        irradiance +=
          luminance([
            DataUtils.fromHalfFloat(data[offset] ?? Number.NaN),
            DataUtils.fromHalfFloat(data[offset + 1] ?? Number.NaN),
            DataUtils.fromHalfFloat(data[offset + 2] ?? Number.NaN),
          ]) *
          centreZ *
          texelSolidAngle;
      }
    }
  }
  if (!Number.isFinite(irradiance)) {
    throw new Error("Planetshine map irradiance is not finite");
  }
  return irradiance;
}

const basisX = new Vector3();
const basisY = new Vector3();
const basisZ = new Vector3();
const sunFromParent = new Vector3();

/**
 * Writes into `rotation` the turn from the map's frame to the scene: +z to
 * the parent, +x towards the Sun across the parent. three samples the map
 * along rotation^-1 x (world direction) when material.envMapRotation is set
 * from this matrix. Returns the geometry the map must show.
 */
export function planetshineFrame(
  modelPosition: Vector3,
  parentPosition: Vector3,
  sunPosition: Vector3,
  parentRadius: number,
  rotation: Matrix4,
): PlanetshineGeometry {
  basisZ.subVectors(parentPosition, modelPosition);
  const angularRadiusRad = planetshineAngularRadiusRad(
    parentRadius,
    basisZ.length(),
  );
  basisZ.normalize();
  sunFromParent.subVectors(sunPosition, parentPosition).normalize();
  const phaseAngleRad = Math.acos(
    Math.min(1, Math.max(-1, -sunFromParent.dot(basisZ))),
  );
  basisX
    .copy(sunFromParent)
    .addScaledVector(basisZ, -sunFromParent.dot(basisZ));
  if (basisX.lengthSq() < 1e-12) {
    // The Sun is on the parent axis: the lit disc is round, any x will do.
    basisX.set(1, 0, 0).addScaledVector(basisZ, -basisZ.x);
    if (basisX.lengthSq() < 1e-12) basisX.set(0, 1, 0);
  }
  basisX.normalize();
  basisY.crossVectors(basisZ, basisX);
  rotation.makeBasis(basisX, basisY, basisZ);
  return { angularRadiusRad, phaseAngleRad };
}

/**
 * Planetshine as a share of the direct sunlight: the irradiance the map
 * gives a surface facing the parent, over the irradiance the sunlight gives
 * a surface square to the Sun. Both from the values given to three.
 */
export function planetshineFillRatio(
  envMapIntensity: number,
  mapIrradiancePerIntensity: number,
  sunlightIntensity: number,
  sunlightLinearRgb: readonly [number, number, number],
): number {
  const direct = sunlightIntensity * luminance(sunlightLinearRgb);
  if (!(direct > 0)) {
    throw new Error("Planetshine ratio needs a positive direct sunlight");
  }
  return (envMapIntensity * mapIrradiancePerIntensity) / direct;
}
