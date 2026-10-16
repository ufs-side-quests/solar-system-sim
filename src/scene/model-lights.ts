import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Points,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
} from "three";
import { z } from "zod";

import { ASTRONOMICAL_UNIT_M } from "../physics/solar-system";
import deathStarIIHullLampsJson from "./death-star-ii-hull-lamps.json";
import {
  DEATH_STAR_HULL_RADIUS,
  DEATH_STAR_TRENCH_HALF_LATITUDE_RAD,
  deathStarSuperlaserAnchors,
} from "./death-star-model";
import { fictionalOrbiterById } from "./fictional-orbiters";
import {
  LUMINOUS_SOLAR_CONSTANT_LX,
  SUNLIGHT_LUMINANCE_AT_1_AU,
} from "./window-lighting";

// Lamps on every sourced model: running lights, headlights, beacons and hull
// lamps drawn at runtime on the loaded model, so every GLB file stays
// unmodified. The Jovian monolith has none: the film's monolith shows no
// light. Each lamp is a point anchored at a position in the model's own glTF
// scene coordinates (the frame of the loaded gltf.scene, before the app
// centres and scales it). The point is a child of that scene, so it moves,
// turns and scales with the model and shows only while the model itself
// shows.
//
// Every anchor was found on the real geometry: a ray cast from outside the
// hull onto the model (in Blender 4, or in Node over the triangles that
// @gltf-transform reads; scripts kept out of the repository), the vertex
// clusters of a named material, or, on a part too thin for a ray, the
// model's extreme vertex in one direction. The unit test checks that each
// anchor lies on the hull of the installed GLB.
//
// Brightness follows window-lighting.ts: 1 scene radiance unit is about
// 21,000 cd/m2, so a lamp of luminance L cd/m2 has radiance
//   L x SUNLIGHT_LUMINANCE_AT_1_AU / LUMINOUS_SOLAR_CONSTANT_LX.
// The luminances below are assumptions for each kind of lamp, not
// measurements of any fixture:
//   beacon or headlamp lens  1,000,000 cd/m2 = about 48 units;
//   floodlight lens            200,000 cd/m2 = about 9.5 units;
//   brake-level tail lamp       50,000 cd/m2 = about 2.4 units;
//   hull lamp                   50,000 cd/m2 = about 2.4 units.
// A lit window is 300 cd/m2 (0.014 units), so the dimmest lamp is about 170
// times a window, and a sunlit mid-grey hull at 1 AU (about 21,000 cd/m2) is
// below every lamp. The core of the lamp is that radiance at the lamp's
// physical size, tone mapped like any surface: a beacon core reads white hot
// at every exposure the app uses, because tone-mapping.ts mixes a colour at
// the top of its shoulder to white, as ACES did.
//
// There is no bloom pass, so each lamp also draws a glow: the stand-in for a
// camera's glare around a bright source. Glare is a display effect, not light
// at the lamp, so the glow is set in display terms: it is added after tone
// mapping, with a peak of LAMP_GLOW_DISPLAY_PEAK in the lamp's hue, scaled
// down only when the core itself is not bright on screen. Tone mapping would
// turn a bright coloured glow white; added after it, the glow keeps the lamp's
// colour while the auto exposure changes by a factor of 27 between 1 AU and
// Jupiter. The glow also fades as the camera drops below the horizon of the
// hull the lamp sits on, so a lamp on the far side shows no halo around the
// hull's edge.
//
// A far lamp is drawn larger than its lens, at LAMP_MINIMUM_CORE_RADIUS_PX,
// so that a child sees it. A field of many such lamps would carpet a hull,
// so two fields of each lamp set how it shows in a field:
//   glowScale: the share of the standard glow radius the lamp draws. A
//   beacon draws all of it; a hull lamp in a field draws less, so the glows
//   of neighbouring lamps do not merge into a haze over the model; a running
//   lamp on a small ship draws more, up to LAMP_MAXIMUM_GLOW_SCALE, so it
//   reads as a coloured lamp and not a speck. No glow is ever wider than
//   LAMP_MAXIMUM_GLOW_RADIUS_PX.
//   onSunlitHull: "fade" for a lamp that shows only where the hull under it
//   is dark, as city lights show only on a planet's night side. On a sunlit
//   hull such a lamp, drawn larger than its lens, would dot the hull with
//   spots that a lamp of its true size could not make. "show" for a beacon
//   or a running light, which shows in sunlight too.
//
// Death Star II: its lit windows are calibrated at 300 cd/m2
// (window-lighting.ts), but they are the lit dots of a mostly black texture:
// the brightest texel holds that luminance and the texture's mean is about
// 1/490 of it (0.43 % of texels lit). At the default focus distance each dot
// is far smaller than a screen pixel, so the filtered texture shows the
// mean, and the night side reads black. A field of hull lamps, a green
// superlaser dish and red polar beacons give it lights at every distance.
// Death Star I has no lit windows at all, and gets the same set.

const BEACON_LUMINANCE_CD_M2 = 1_000_000;
const HEADLAMP_LUMINANCE_CD_M2 = 1_000_000;
const FLOODLIGHT_LUMINANCE_CD_M2 = 200_000;
const TAIL_LAMP_LUMINANCE_CD_M2 = 50_000;
const HULL_LAMP_LUMINANCE_CD_M2 = 50_000;

/**
 * The cosine between a lamp's hull normal and the direction to the Sun
 * where a lamp with onSunlitHull "fade" starts to fade, and where it is gone.
 */
const SUNLIT_FADE_START_COSINE = -0.1;
const SUNLIT_FADE_END_COSINE = 0.15;

/** Scene radiance of a surface of the given luminance, as window-lighting.ts. */
export function lampRadianceFromLuminance(luminanceCdM2: number): number {
  if (!(luminanceCdM2 > 0)) {
    throw new Error("Lamp luminance must be positive");
  }
  return (
    (luminanceCdM2 * SUNLIGHT_LUMINANCE_AT_1_AU) / LUMINOUS_SOLAR_CONSTANT_LX
  );
}

/** The glow's peak display value, linear, added after tone mapping. */
const LAMP_GLOW_DISPLAY_PEAK = 1;
/** The glow's radius is this many times the core's projected radius. */
const LAMP_GLOW_RADIUS_PER_CORE = 4;
/** Smallest core radius, in CSS pixels, so a far lamp still reads. */
const LAMP_MINIMUM_CORE_RADIUS_PX = 2;
/** Smallest glow radius, in CSS pixels, so a far lamp still reads. */
const LAMP_MINIMUM_GLOW_RADIUS_PX = 7;
/** Largest glow radius, in CSS pixels, so a near lamp never fills the view. */
const LAMP_MAXIMUM_GLOW_RADIUS_PX = 28;
/**
 * Largest glow radius as a share of the model's projected radius, so lamps
 * never swamp a model that is small on screen. A lamp's glowScale applies
 * after this limit.
 */
const LAMP_MAXIMUM_GLOW_SHARE_OF_MODEL = 0.1;
/** Largest glowScale: the glow of a running lamp on a small ship. */
const LAMP_MAXIMUM_GLOW_SCALE = 2.5;

const vector3Schema = z.tuple([z.number(), z.number(), z.number()]);

const modelLightSchema = z.object({
  bodyId: z.enum([
    "deep-space-nine",
    "roadster",
    "discovery-one",
    "iss",
    "death-star-1",
    "death-star-2",
    "uss-defiant",
    "hubble",
    "jwst",
    "voyager-1",
    "voyager-2",
  ]),
  name: z.string().min(1),
  /** Anchor on the hull, in the model's glTF scene coordinates. */
  position: vector3Schema,
  /** Outward hull normal at the anchor, in the same coordinates. */
  normal: vector3Schema.refine(
    ([x, y, z]) => Math.abs(Math.hypot(x, y, z) - 1) < 0.01,
    "Lamp normal must be a unit vector",
  ),
  /** Authored sRGB colour of the lamp. */
  colorSrgbHex: z.string().regex(/^#[0-9a-f]{6}$/u),
  /** Radius of the emitting lens, in metres. */
  radiusM: z.number().positive(),
  luminanceCdM2: z.number().positive(),
  pattern: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("steady") }),
    z.object({
      kind: z.literal("blink"),
      periodSeconds: z.number().positive(),
      /** Start of the on time, as a share of the period. */
      phase: z.number().min(0).lt(1),
      /** Share of the period the lamp is on. */
      onFraction: z.number().gt(0).lt(1),
    }),
  ]),
  /**
   * Share of the standard glow radius: 1 for a lone lamp, less in a field,
   * more for a running lamp on a small ship.
   */
  glowScale: z.number().gt(0).max(LAMP_MAXIMUM_GLOW_SCALE),
  /** Whether the lamp shows on a sunlit hull, or fades there. */
  onSunlitHull: z.enum(["show", "fade"]),
  /**
   * authored-fiction: a fictional ship's lamp placed by the app.
   * playful-fiction: a real object with lamps it does not show in space.
   * decorative-not-documented: a lamp on a real object at a position that no
   * public source documents as a fixture.
   */
  basis: z.enum([
    "authored-fiction",
    "playful-fiction",
    "decorative-not-documented",
  ]),
});

export type ModelLight = z.infer<typeof modelLightSchema>;
type ModelLightInput = z.input<typeof modelLightSchema>;

/** A lamp that stands alone: the whole glow, and shown in sunlight. */
const LONE_LAMP = { glowScale: 1, onSunlitHull: "show" } as const;

/**
 * The USS Defiant's running lamps: shown in sunlight, with the widest glow.
 * At the default focus distance a lone lamp's glow has a radius of about 8
 * pixels, and on the dark hull of this small ship its hue showed only as a
 * speck. The wider glow puts a disc of the lamp's colour around a core of
 * the same size, so the lamp does not read as a white disc.
 */
const DEFIANT_LAMP = {
  glowScale: LAMP_MAXIMUM_GLOW_SCALE,
  onSunlitHull: "show",
} as const;

const DS9_BEACON = {
  ...LONE_LAMP,
  colorSrgbHex: "#ff2a1a",
  radiusM: 4,
  luminanceCdM2: BEACON_LUMINANCE_CD_M2,
  basis: "authored-fiction",
} as const;

const PYLON_BLINK_PERIOD_S = 2;
const PYLON_ON_FRACTION = 0.4;

type Vec3 = [number, number, number];
type LampPlace = [name: string, position: Vec3, normal: Vec3];

/**
 * The playful lamps of a real spacecraft: a white blinking beacon, and a
 * red and a green lamp, each with a lens 0.1 m in radius.
 */
function playfulLampSet(
  bodyId: "hubble" | "jwst" | "voyager-1" | "voyager-2",
  beacon: LampPlace,
  red: LampPlace,
  green: LampPlace,
): ModelLightInput[] {
  return (
    [
      [beacon, "#ffffff"],
      [red, "#ff2020"],
      [green, "#19ff7a"],
    ] as const
  ).map(([[name, position, normal], colorSrgbHex]) => ({
    bodyId,
    name,
    position,
    normal,
    colorSrgbHex,
    radiusM: 0.1,
    luminanceCdM2:
      colorSrgbHex === "#ffffff"
        ? BEACON_LUMINANCE_CD_M2
        : FLOODLIGHT_LUMINANCE_CD_M2,
    pattern:
      colorSrgbHex === "#ffffff"
        ? { kind: "blink", periodSeconds: 2, phase: 0, onFraction: 0.15 }
        : { kind: "steady" },
    basis: "playful-fiction",
    ...LONE_LAMP,
  }));
}

type LampAnchor = readonly [position: Vec3, normal: Vec3];

/**
 * The lamps of a Death Star: a field of warm hull lamps that fade on the
 * sunlit hull, a green superlaser lens with its emitters around it, and a
 * red beacon on each pole, blinking in turn.
 */
function deathStarLampSet(
  bodyId: "death-star-1" | "death-star-2",
  parts: Readonly<{
    hullLamps: readonly LampAnchor[];
    lens: LampAnchor;
    lensRadiusM: number;
    emitters: readonly LampAnchor[];
    emitterRadiusM: number;
    northPole: LampAnchor;
    southPole: LampAnchor;
  }>,
): ModelLightInput[] {
  const superlaser = {
    bodyId,
    colorSrgbHex: "#40ff50",
    pattern: { kind: "steady" },
    basis: "authored-fiction",
    ...LONE_LAMP,
  } as const;
  return [
    ...parts.hullLamps.map(([position, normal], index): ModelLightInput => ({
      bodyId,
      name: `hull lamp ${String(index + 1)}`,
      position,
      normal,
      colorSrgbHex: "#ffe2a8",
      radiusM: DEATH_STAR_HULL_LAMP_RADIUS_M,
      luminanceCdM2: HULL_LAMP_LUMINANCE_CD_M2,
      pattern: { kind: "steady" },
      basis: "authored-fiction",
      glowScale: 0.4,
      onSunlitHull: "fade",
    })),
    {
      ...superlaser,
      name: "superlaser lens",
      position: parts.lens[0],
      normal: parts.lens[1],
      radiusM: parts.lensRadiusM,
      luminanceCdM2: BEACON_LUMINANCE_CD_M2,
    },
    ...parts.emitters.map(([position, normal], index): ModelLightInput => ({
      ...superlaser,
      name: `superlaser emitter ${String(index + 1)}`,
      position,
      normal,
      radiusM: parts.emitterRadiusM,
      luminanceCdM2: FLOODLIGHT_LUMINANCE_CD_M2,
    })),
    ...(
      [
        ["north pole beacon", parts.northPole, 0],
        ["south pole beacon", parts.southPole, 0.5],
      ] as const
    ).map(([name, [position, normal], phase]): ModelLightInput => ({
      ...DS9_BEACON,
      bodyId,
      name,
      position,
      normal,
      radiusM: DEATH_STAR_POLE_BEACON_RADIUS_M,
      pattern: {
        kind: "blink",
        periodSeconds: PYLON_BLINK_PERIOD_S,
        phase,
        onFraction: PYLON_ON_FRACTION,
      },
    })),
  ];
}

const DEATH_STAR_HULL_LAMP_RADIUS_M = 150;
const DEATH_STAR_POLE_BEACON_RADIUS_M = 1_500;
/** Directions in each Death Star's lattice of hull lamps. */
const DEATH_STAR_HULL_LATTICE_SIZE = 320;

/**
 * Death Star I's lamps, from its procedural model (death-star-model.ts): in
 * the model's frame the hull is a sphere of DEATH_STAR_HULL_RADIUS about the
 * origin with its poles on y, and the model's group scales it to the
 * station's diameter. The hull lamps lie on a Fibonacci lattice of the same
 * 320 directions as Death Star II's, less any lamp whose lens reaches the
 * equatorial trench or the superlaser dish's rim. The superlaser lamps sit
 * over the central emitter and the eight focusing nodes, each with the
 * part's own front radius, facing out along the dish axis.
 */
function deathStarILamps(): ModelLightInput[] {
  const station = fictionalOrbiterById.get("death-star-1");
  if (station === undefined) throw new Error("Death Star I is not defined");
  const metresPerUnit = station.diameterM / 2 / DEATH_STAR_HULL_RADIUS;
  const lampAngleRad =
    DEATH_STAR_HULL_LAMP_RADIUS_M / metresPerUnit / DEATH_STAR_HULL_RADIUS;
  const superlaser = deathStarSuperlaserAnchors();
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const hullLamps = Array.from(
    { length: DEATH_STAR_HULL_LATTICE_SIZE },
    (_, index) => {
      const y = 1 - (2 * (index + 0.5)) / DEATH_STAR_HULL_LATTICE_SIZE;
      const ring = Math.sqrt(1 - y * y);
      return new Vector3(
        Math.cos(goldenAngle * index) * ring,
        y,
        Math.sin(goldenAngle * index) * ring,
      );
    },
  )
    .filter(
      (direction) =>
        Math.abs(Math.asin(direction.y)) - lampAngleRad >
          DEATH_STAR_TRENCH_HALF_LATITUDE_RAD &&
        direction.angleTo(superlaser.axis) - lampAngleRad >
          superlaser.rimAngleRad,
    )
    .map((direction): LampAnchor => [
      direction.clone().multiplyScalar(DEATH_STAR_HULL_RADIUS).toArray(),
      direction.toArray(),
    ]);
  const axis = superlaser.axis.toArray();
  const [node] = superlaser.nodes;
  if (node === undefined) throw new Error("The superlaser has no nodes");
  return deathStarLampSet("death-star-1", {
    hullLamps,
    lens: [superlaser.emitter.position.toArray(), axis],
    lensRadiusM: superlaser.emitter.radius * metresPerUnit,
    emitters: superlaser.nodes.map(({ position }) => [
      position.toArray(),
      axis,
    ]),
    emitterRadiusM: node.radius * metresPerUnit,
    northPole: [
      [0, DEATH_STAR_HULL_RADIUS, 0],
      [0, 1, 0],
    ],
    southPole: [
      [0, -DEATH_STAR_HULL_RADIUS, 0],
      [0, -1, 0],
    ],
  });
}

export const modelLights: readonly ModelLight[] = modelLightSchema
  .array()
  .parse([
    // Deep Space Nine (fictional). The mesh is upright: +y is the station's
    // axis, and the app turns model +y onto the orbit normal. Vertex clusters
    // with |y| above 19 gave three upper and three lower pylon tips at
    // azimuth 90, -150 and -30 degrees (atan2(z, x)), radius about 13.3 model
    // units. A ray cast straight down (up for the lower tips) onto each tip
    // found its cap at y = +/-19.203. The upper and lower pylons blink in
    // turn. Ops (the top of the core) and the base of the core were found by
    // a ray along the axis, and three docking ring lamps by rays cast inward
    // at azimuth 30, 150 and -90 degrees, between the pylons.
    ...(
      [
        ["upper pylon 1", [0, 19.2032, 13.3], 1, 0],
        ["upper pylon 2", [-11.5, 19.2032, -6.64], 1, 0],
        ["upper pylon 3", [11.5, 19.2032, -6.64], 1, 0],
        ["lower pylon 1", [0, -19.2028, 13.3], -1, 0.5],
        ["lower pylon 2", [-11.5, -19.2028, -6.64], -1, 0.5],
        ["lower pylon 3", [11.5, -19.2028, -6.64], -1, 0.5],
      ] as const
    ).map(([name, position, up, phase]) => ({
      ...DS9_BEACON,
      bodyId: "deep-space-nine",
      name,
      position,
      normal: [0, up, 0],
      pattern: {
        kind: "blink",
        periodSeconds: PYLON_BLINK_PERIOD_S,
        phase,
        onFraction: PYLON_ON_FRACTION,
      },
    })),
    {
      bodyId: "deep-space-nine",
      name: "Ops",
      position: [0, 5.6163, 0],
      normal: [0, 1, 0],
      colorSrgbHex: "#ffffff",
      radiusM: 4,
      luminanceCdM2: FLOODLIGHT_LUMINANCE_CD_M2,
      pattern: { kind: "steady" },
      basis: "authored-fiction",
      ...LONE_LAMP,
    },
    {
      bodyId: "deep-space-nine",
      name: "core base",
      position: [0, -8.4169, 0],
      normal: [0.0365, -0.9992, 0.017],
      colorSrgbHex: "#ffffff",
      radiusM: 4,
      luminanceCdM2: FLOODLIGHT_LUMINANCE_CD_M2,
      pattern: { kind: "steady" },
      basis: "authored-fiction",
      ...LONE_LAMP,
    },
    ...(
      [
        ["docking ring 1", [23.3803, 0, 13.4978], [0.6079, 0.0284, 0.7935]],
        ["docking ring 2", [-23.2723, 0, 13.4355], [-0.8671, -0.0008, 0.4982]],
        ["docking ring 3", [0, 0, -26.8719], [0, 0, -1]],
      ] as const
    ).map(([name, position, normal]) => ({
      bodyId: "deep-space-nine",
      name,
      position,
      normal,
      colorSrgbHex: "#ff9020",
      radiusM: 3,
      luminanceCdM2: FLOODLIGHT_LUMINANCE_CD_M2,
      pattern: { kind: "steady" },
      basis: "authored-fiction",
      ...LONE_LAMP,
    })),

    // Tesla Roadster. The real car in space has no power, so its lamps are
    // dark: these lamps are a playful fiction for children, and no facts
    // text claims them. The car's front is +z ("headlight casing" vertices
    // lie at z 1.79 to 2.40) and its centre line is x = -0.136. Rays cast
    // backwards onto the front found the glass over the middle and outer
    // lamp of each headlight housing. The tail lamps are the round lenses of
    // materials _100035 and _100002 (two per side at z about -2.46 to
    // -2.52), found by rays cast forward onto the rear.
    ...(
      [
        ["left headlight", [-0.834, 1.19, 2.2349], [-0.0094, 0.8686, 0.4954]],
        ["right headlight", [0.564, 1.19, 2.2349], [0.0094, 0.8686, 0.4954]],
        [
          "left outer headlight",
          [-0.98, 1.2334, 2.1103],
          [-0.1938, 0.8994, 0.3918],
        ],
        [
          "right outer headlight",
          [0.708, 1.2335, 2.1104],
          [0.194, 0.8997, 0.3909],
        ],
      ] as const
    ).map(([name, position, normal]) => ({
      bodyId: "roadster",
      name,
      position,
      normal,
      colorSrgbHex: "#fff2dc",
      radiusM: 0.04,
      luminanceCdM2: HEADLAMP_LUMINANCE_CD_M2,
      pattern: { kind: "steady" },
      basis: "playful-fiction",
      ...LONE_LAMP,
    })),
    ...(
      [
        [
          "left inner tail light",
          [-0.712, 1.379, -2.5217],
          [0.0165, 0.0996, -0.9949],
        ],
        [
          "left outer tail light",
          [-0.91, 1.372, -2.4583],
          [-0.1719, -0.0206, -0.9849],
        ],
        [
          "right inner tail light",
          [0.441, 1.379, -2.5217],
          [0.0804, 0.0616, -0.9949],
        ],
        [
          "right outer tail light",
          [0.638, 1.372, -2.4584],
          [0.1731, -0.0634, -0.9829],
        ],
      ] as const
    ).map(([name, position, normal]) => ({
      bodyId: "roadster",
      name,
      position,
      normal,
      colorSrgbHex: "#ff1a0d",
      radiusM: 0.04,
      luminanceCdM2: TAIL_LAMP_LUMINANCE_CD_M2,
      pattern: { kind: "steady" },
      basis: "playful-fiction",
      ...LONE_LAMP,
    })),

    // Discovery One (2001: A Space Odyssey, fictional). The command sphere is
    // at +z (centre z = 477, radius 56.5) with +y up, so the ship's port side
    // is +x. Rays cast inward along x at the sphere's equator found its
    // sides for a red port and a green starboard lamp. A ray cast down onto
    // the top of the propulsion module (z = -427) found the anchor for a
    // white beacon. The film shows no running lights: these are authored.
    {
      bodyId: "discovery-one",
      name: "port lamp",
      position: [56.8631, 0, 477],
      normal: [0.9981, 0.0433, -0.0438],
      colorSrgbHex: "#ff2020",
      radiusM: 1,
      luminanceCdM2: FLOODLIGHT_LUMINANCE_CD_M2,
      pattern: { kind: "steady" },
      basis: "authored-fiction",
      ...LONE_LAMP,
    },
    {
      bodyId: "discovery-one",
      name: "starboard lamp",
      position: [-57.0409, 0, 477],
      normal: [-0.9981, 0.0433, -0.0439],
      colorSrgbHex: "#19ff7a",
      radiusM: 1,
      luminanceCdM2: FLOODLIGHT_LUMINANCE_CD_M2,
      pattern: { kind: "steady" },
      basis: "authored-fiction",
      ...LONE_LAMP,
    },
    {
      bodyId: "discovery-one",
      name: "propulsion beacon",
      position: [0, 29.6528, -427],
      normal: [0, 1, 0],
      colorSrgbHex: "#ffffff",
      radiusM: 1.2,
      luminanceCdM2: BEACON_LUMINANCE_CD_M2,
      pattern: {
        kind: "blink",
        periodSeconds: 1.5,
        phase: 0,
        onFraction: 0.15,
      },
      basis: "authored-fiction",
      ...LONE_LAMP,
    },

    // ISS. The real station carries floodlights and camera lights, not
    // running lights, and no public source gives their places on this NASA
    // model. So every ISS lamp is decorative: steady warm floodlights at
    // the two ends of the main truss (rays cast inward along z at the
    // truss, x = -1.04, y = 10.8) and at the two ends of the module stack
    // (rays cast along y at the top and bottom modules).
    ...(
      [
        ["truss end 1", [-1.04, 10.8, 21.1806], [-0.1018, -0.387, 0.9165]],
        ["truss end 2", [-1.04, 10.8, -21.3809], [-0.0766, -0.3878, -0.9185]],
        ["module stack top", [0.27, 16.017, 0], [0, 1, 0]],
        ["module stack bottom", [0.45, -2.8429, 0.05], [0, -1, 0]],
      ] as const
    ).map(([name, position, normal]) => ({
      bodyId: "iss",
      name,
      position,
      normal,
      colorSrgbHex: "#ffb050",
      radiusM: 0.3,
      luminanceCdM2: FLOODLIGHT_LUMINANCE_CD_M2,
      pattern: { kind: "steady" },
      basis: "decorative-not-documented",
      ...LONE_LAMP,
    })),

    // Death Star II (fictional). The repaired mesh (repair-model-assets.mjs)
    // has its superlaser dish near +z and its axis along y. A sphere fitted
    // to rays cast from outside onto the hull has its centre at (17.699,
    // -1.375, -14.581) and radius 371.8 units. Hull lamps: rays cast toward
    // the centre along a Fibonacci lattice of 320 directions. A ray that
    // ends more than 4 % inside that radius (in the open frame of the
    // unfinished part), lands within 17.6 degrees of the dish axis, or meets
    // a wall turned more than 60 degrees from the ray gets no lamp; 172 rays
    // remain (death-star-ii-hull-lamps.json: position, then normal). The
    // dish axis is the mean direction of the dish material's vertices on the
    // +z side, away from the polar caps that material also covers; its rim
    // lies 14 to 16 degrees off the axis. A ray down the axis found the
    // central lens; rays at 9.6 degrees off it, every 45 degrees around it,
    // found eight emitters on the dish. Rays along y through the centre found
    // the poles.
    ...deathStarLampSet("death-star-2", {
      hullLamps: z
        .tuple([
          z.number(),
          z.number(),
          z.number(),
          z.number(),
          z.number(),
          z.number(),
        ])
        .array()
        .parse(deathStarIIHullLampsJson)
        .map(([px, py, pz, nx, ny, nz]) => [
          [px, py, pz],
          [nx, ny, nz],
        ]),
      lens: [
        [12.9834, 149.4056, 299.8032],
        [-0.0761, 0.3646, 0.9281],
      ],
      lensRadiusM: 2_500,
      emitters: [
        [
          [72.7582, 151.636, 305.3514],
          [-0.1003, 0.4079, 0.9075],
        ],
        [
          [55.5783, 190.169, 287.3783],
          [-0.1425, 0.2886, 0.9468],
        ],
        [
          [13.2991, 205.7297, 278.7566],
          [-0.0298, 0.3486, 0.9368],
        ],
        [
          [-29.0084, 189.3065, 284.7524],
          [0.0259, 0.3698, 0.9288],
        ],
        [
          [-46.5461, 150.7248, 301.6615],
          [0.0463, 0.421, 0.9059],
        ],
        [
          [-29.3162, 112.6002, 319.55],
          [0.032, 0.4561, 0.8894],
        ],
        [
          [12.5593, 97.0219, 328.0763],
          [-0.0368, 0.4815, 0.8757],
        ],
        [
          [54.8311, 113.0917, 322.2562],
          [-0.0818, 0.4595, 0.8844],
        ],
      ],
      emitterRadiusM: 1_200,
      northPole: [
        [17.6992, 371.8115, -14.5812],
        [0.045, 0.9989, -0.0109],
      ],
      southPole: [
        [17.6992, -374.9731, -14.5812],
        [0.0166, -0.9984, 0.0549],
      ],
    }),

    // Death Star I (fictional): procedural, so its lamps come from its own
    // geometry (deathStarILamps).
    ...deathStarILamps(),

    // USS Defiant (fictional). Its licence keeps the file unmodified, so its
    // lamps are drawn here. The app flies the ship along model +z (the bow:
    // the "defront" texture covers the +z ends of the nacelle section and
    // "deback1" a -z face), with +y up, so port (left) is +x. Rays cast
    // inward along x at z = 0.3, where the nacelles are widest, found a red
    // port and a green starboard lamp; the extreme vertices along
    // (+/-0.5, 0, -0.866) are the two aft corners of the stern, where two
    // white strobes face out along that bisector (the aft faces of the
    // nacelles sit in a recess that hides a lamp from oblique views); a ray
    // cast aft at y = -0.1 found the grille on the front of the bow module
    // for the blue deflector; rays cast forward at x = +/-0.5 found the
    // stern's aft face (z = -4.79) for two red impulse engines. The lenses are small: a
    // lamp's core reads white hot, so a large lens would show a white disc,
    // and the small ones leave the hue to the glow.
    ...(
      [
        [
          "port navigation lamp",
          [3.329, 0, 0.3],
          [0.9596, 0.2792, -0.0359],
          "#ff2020",
        ],
        [
          "starboard navigation lamp",
          [-3.3784, 0, 0.3],
          [-0.96, 0.2786, -0.0278],
          "#19ff7a",
        ],
      ] as const
    ).map(([name, position, normal, colorSrgbHex]) => ({
      bodyId: "uss-defiant",
      name,
      position,
      normal,
      colorSrgbHex,
      radiusM: 0.75,
      luminanceCdM2: FLOODLIGHT_LUMINANCE_CD_M2,
      pattern: { kind: "steady" },
      basis: "authored-fiction",
      ...DEFIANT_LAMP,
    })),
    ...(
      [
        ["port strobe", [0.9555, -0.0431, -4.8466], [0.5, 0, -0.866]],
        ["starboard strobe", [-1.0098, -0.0431, -4.8466], [-0.5, 0, -0.866]],
      ] as const
    ).map(([name, position, normal]) => ({
      bodyId: "uss-defiant",
      name,
      position,
      normal,
      colorSrgbHex: "#ffffff",
      radiusM: 0.75,
      luminanceCdM2: BEACON_LUMINANCE_CD_M2,
      pattern: {
        kind: "blink",
        periodSeconds: 1.5,
        phase: 0,
        onFraction: 0.1,
      },
      basis: "authored-fiction",
      ...DEFIANT_LAMP,
    })),
    {
      bodyId: "uss-defiant",
      name: "deflector",
      position: [0, -0.1, 4.7773],
      normal: [0.1619, -0.5386, 0.8268],
      colorSrgbHex: "#3a8bff",
      radiusM: 0.8,
      luminanceCdM2: FLOODLIGHT_LUMINANCE_CD_M2,
      pattern: { kind: "steady" },
      basis: "authored-fiction",
      ...DEFIANT_LAMP,
    },
    ...(
      [
        [
          "port impulse engine",
          [0.5, 0.05, -4.7915],
          [-0.0465, 0.0153, -0.9988],
        ],
        [
          "starboard impulse engine",
          [-0.5, 0.05, -4.7911],
          [-0.0023, -0.0091, -1],
        ],
      ] as const
    ).map(([name, position, normal]) => ({
      bodyId: "uss-defiant",
      name,
      position,
      normal,
      colorSrgbHex: "#ff3010",
      radiusM: 0.6,
      luminanceCdM2: FLOODLIGHT_LUMINANCE_CD_M2,
      pattern: { kind: "steady" },
      basis: "authored-fiction",
      ...DEFIANT_LAMP,
    })),

    // Hubble, JWST and Voyager. The real spacecraft show no lamps in space,
    // so these few lamps are a playful fiction, as on the Roadster, and no
    // facts text claims them. Each set is a white blinking beacon and a red
    // and a green lamp at the two ends of the widest part.
    //
    // Hubble: the tube runs along y, with the aperture at +y; the solar
    // arrays lie in the plane y = -26. A ray cast along -z at y = 240 found
    // the forward shell for the beacon; rays cast inward along x in the
    // array plane found the outer edges of the two arrays.
    //
    // JWST: the mirror faces +z and the sunshield is the diamond in the x-z
    // plane. A ray cast along -z at y = 3.5 found the back of the secondary
    // mirror, at the tip of its tripod, for the beacon; the sunshield's two
    // short points are its extreme vertices along x.
    //
    // Voyager 1 and 2 share one model: the dish is the disc in the x-z plane
    // and the magnetometer boom ends at the model's extreme vertex along +z,
    // where the beacon sits (rounded inward, inside the model's bounds);
    // the dish rim's extreme vertices along x carry the red and green lamps.
    // The boom and rim are too thin for a ray.
    ...playfulLampSet(
      "hubble",
      ["aperture beacon", [0, 240, 57.3795], [0, 0, 1]],
      ["array tip red", [228.5265, -26, 0], [0.924, 0.3824, 0]],
      ["array tip green", [-228.4513, -26, 0], [-0.9296, 0.3686, 0]],
    ),
    ...playfulLampSet(
      "jwst",
      ["secondary mirror beacon", [0, 3.5, 8.545], [0, 0, 1]],
      ["sunshield tip red", [6.43562, -1.0832, 0.10674], [1, 0, 0]],
      ["sunshield tip green", [-6.43531, -1.0832, 0.10674], [-1, 0, 0]],
    ),
    ...(["voyager-1", "voyager-2"] as const).flatMap((bodyId) =>
      playfulLampSet(
        bodyId,
        [
          "magnetometer boom beacon",
          [0.00004, 0.15244, 0.23314],
          [0.0001, 0.5472, 0.837],
        ],
        ["dish rim red", [0.05, 0.04347, 0], [1, 0, 0]],
        ["dish rim green", [-0.05, 0.04347, 0], [-1, 0, 0]],
      ),
    ),
  ]);

export const modelLightsByBodyId: ReadonlyMap<string, readonly ModelLight[]> =
  new Map(
    [...new Set(modelLights.map((light) => light.bodyId))].map((bodyId) => [
      bodyId,
      modelLights.filter((light) => light.bodyId === bodyId),
    ]),
  );

/**
 * Whether a lamp is lit at a wall-clock time. Lamps run on the wall clock,
 * not the simulation clock, and stay on under reduced motion.
 */
export function modelLightIsOn(
  light: ModelLight,
  wallClockSeconds: number,
  reducedMotion: boolean,
): boolean {
  if (light.pattern.kind === "steady" || reducedMotion) return true;
  const { periodSeconds, phase, onFraction } = light.pattern;
  const cycle = (wallClockSeconds / periodSeconds - phase) % 1;
  return (cycle < 0 ? cycle + 1 : cycle) < onFraction;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * How much of a lamp shows, from 0 to 1, given the cosine between its hull
 * normal and the direction to the Sun. The shader applies the same rule.
 */
export function modelLightSunlitShare(
  light: ModelLight,
  sunCosine: number,
): number {
  if (light.onSunlitHull === "show") return 1;
  return (
    1 - smoothstep(SUNLIT_FADE_START_COSINE, SUNLIT_FADE_END_COSINE, sunCosine)
  );
}

export type ModelLightPoints = Readonly<{
  lights: readonly ModelLight[];
  points: Points<BufferGeometry, ShaderMaterial>;
  /** Writes each lamp's on or off state and the frame's size limits. */
  update: (
    frame: Readonly<{
      wallClockSeconds: number;
      reducedMotion: boolean;
      pixelRatio: number;
      drawingBufferHeightPx: number;
      /** The model's projected radius in CSS pixels. */
      modelRadiusPx: number;
      /** Unit vector from the model to the Sun, in world coordinates. */
      sunDirection: Readonly<{ x: number; y: number; z: number }>;
    }>,
  ) => void;
}>;

/** One point per lamp, for a model's glTF scene. */
export function createModelLightPoints(
  lights: readonly ModelLight[],
): ModelLightPoints {
  if (lights.length === 0) {
    throw new Error("A model light set needs at least one lamp");
  }
  const positions = new Float32Array(lights.length * 3);
  const radiance = new Float32Array(lights.length * 3);
  const glowColor = new Float32Array(lights.length * 3);
  const normals = new Float32Array(lights.length * 3);
  const radiusAu = new Float32Array(lights.length);
  const glowScale = new Float32Array(lights.length);
  const fadesInSunlight = new Float32Array(lights.length);
  const lit = new Float32Array(lights.length);
  const color = new Color();
  lights.forEach((light, index) => {
    positions.set(light.position, index * 3);
    normals.set(light.normal, index * 3);
    color.setStyle(light.colorSrgbHex, SRGBColorSpace);
    const luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
    const peak = Math.max(color.r, color.g, color.b);
    const coreRadiance = lampRadianceFromLuminance(light.luminanceCdM2);
    radiance.set(
      [color.r, color.g, color.b].map(
        (channel) => (channel / luminance) * coreRadiance,
      ),
      index * 3,
    );
    glowColor.set(
      [color.r, color.g, color.b].map((channel) => channel / peak),
      index * 3,
    );
    radiusAu[index] = light.radiusM / ASTRONOMICAL_UNIT_M;
    glowScale[index] = light.glowScale;
    fadesInSunlight[index] = light.onSunlitHull === "fade" ? 1 : 0;
    lit[index] = 1;
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("lampNormal", new BufferAttribute(normals, 3));
  geometry.setAttribute("lampRadiance", new BufferAttribute(radiance, 3));
  geometry.setAttribute("lampGlowColor", new BufferAttribute(glowColor, 3));
  geometry.setAttribute("lampRadiusAu", new BufferAttribute(radiusAu, 1));
  geometry.setAttribute("lampGlowScale", new BufferAttribute(glowScale, 1));
  geometry.setAttribute(
    "lampFadesInSunlight",
    new BufferAttribute(fadesInSunlight, 1),
  );
  const litAttribute = new BufferAttribute(lit, 1);
  litAttribute.setUsage(DynamicDrawUsage);
  geometry.setAttribute("lampLit", litAttribute);
  const uniforms = {
    drawingBufferHeight: { value: 1 },
    pixelRatio: { value: 1 },
    maximumGlowRadiusPx: { value: LAMP_MAXIMUM_GLOW_RADIUS_PX },
    sunDirection: { value: new Vector3(1, 0, 0) },
  };
  const material = new ShaderMaterial({
    uniforms,
    // The log depth chunks are the app's metre log depth
    // (au-scale-precision.ts), so the hull in front of a lamp hides it.
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute vec3 lampNormal;
      attribute vec3 lampRadiance;
      attribute vec3 lampGlowColor;
      attribute float lampRadiusAu;
      attribute float lampGlowScale;
      attribute float lampFadesInSunlight;
      attribute float lampLit;
      uniform float drawingBufferHeight;
      uniform float pixelRatio;
      uniform float maximumGlowRadiusPx;
      uniform vec3 sunDirection;
      varying vec3 vRadiance;
      varying vec3 vGlowColor;
      varying float vCoreShare;
      varying float vGlareShown;
      varying float vSunlitShare;
      void main() {
        // A lamp that fades in sunlight shows only where the hull under it
        // faces away from the Sun (modelLightSunlitShare).
        float sunCosine = dot(
          normalize(mat3(modelMatrix) * lampNormal),
          sunDirection
        );
        float sunlitShare = mix(
          1.0,
          1.0 - smoothstep(
            ${SUNLIT_FADE_START_COSINE.toFixed(2)},
            ${SUNLIT_FADE_END_COSINE.toFixed(2)},
            sunCosine
          ),
          lampFadesInSunlight
        );
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float depth = -mvPosition.z;
        // The glare fades as the camera drops below the horizon of the hull
        // the lamp sits on. The core stays: the depth test alone decides
        // whether the hull hides it.
        float facing = dot(
          normalize(normalMatrix * lampNormal),
          normalize(-mvPosition.xyz)
        );
        vGlareShown = smoothstep(-0.3, 0.2, facing);
        // Pull the lamp two lens radii toward the camera, so the hull it sits
        // on does not cut it, while any thicker hull in front still hides it.
        mvPosition.xyz += normalize(-mvPosition.xyz) * 2.0 * lampRadiusAu;
        gl_Position = projectionMatrix * mvPosition;
        #include <logdepthbuf_vertex>
        float corePx = max(
          lampRadiusAu * projectionMatrix[1][1] * 0.5 * drawingBufferHeight / depth,
          ${LAMP_MINIMUM_CORE_RADIUS_PX.toFixed(1)} * pixelRatio
        );
        float glowPx = clamp(
          corePx * ${LAMP_GLOW_RADIUS_PER_CORE.toFixed(1)},
          ${LAMP_MINIMUM_GLOW_RADIUS_PX.toFixed(1)} * pixelRatio,
          ${LAMP_MAXIMUM_GLOW_RADIUS_PX.toFixed(1)} * pixelRatio
        );
        // A glowScale above 1 may widen the glow past the model's share,
        // but never past the largest glow.
        glowPx = min(
          min(glowPx, maximumGlowRadiusPx * pixelRatio) * lampGlowScale,
          ${LAMP_MAXIMUM_GLOW_RADIUS_PX.toFixed(1)} * pixelRatio
        );
        corePx = min(corePx, glowPx);
        gl_PointSize = 2.0 * glowPx;
        // A lamp that is off, or wholly faded in sunlight, goes outside the
        // clip volume: a point of size 0 may still draw one pixel.
        if (lampLit < 0.5 || sunlitShare <= 0.0) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }
        vSunlitShare = sunlitShare;
        vCoreShare = corePx / glowPx;
        vRadiance = lampRadiance;
        vGlowColor = lampGlowColor;
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      varying vec3 vRadiance;
      varying vec3 vGlowColor;
      varying float vCoreShare;
      varying float vGlareShown;
      varying float vSunlitShare;
      void main() {
        float r = length(gl_PointCoord - vec2(0.5)) * 2.0;
        if (r >= 1.0) discard;
        float core = 1.0 - smoothstep(vCoreShare * 0.7, vCoreShare, r);
        // The core is radiance, tone mapped like any surface. Glare falls off
        // from the core's edge to the glow's rim; it is a display effect, so
        // it is added after tone mapping in the lamp's own hue, and fades
        // only when the core is dim on screen.
        float edge = max(r - vCoreShare, 0.0) / max(1.0 - vCoreShare, 1e-3);
        float glare = (1.0 - edge) * (1.0 - edge) * exp(-2.0 * edge);
        float coreDisplay =
          dot(vRadiance, vec3(0.2126, 0.7152, 0.0722)) * toneMappingExposure;
        vec3 glow = vGlowColor * ${LAMP_GLOW_DISPLAY_PEAK.toFixed(2)} * glare
          * vGlareShown * min(coreDisplay, 1.0);
        // Alpha 0 with premultiplied additive blending adds the light and
        // leaves the canvas alpha alone, so the page behind a transparent
        // canvas still shows through the glow.
        gl_FragColor = vec4(
          (toneMapping(vRadiance * core) + glow) * vSunlitShare,
          0.0
        );
        #include <logdepthbuf_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: AdditiveBlending,
    premultipliedAlpha: true,
  });
  const points = new Points(geometry, material);
  points.name = "Model lamps";
  points.frustumCulled = false;
  points.renderOrder = 1;
  return {
    lights,
    points,
    update: ({
      wallClockSeconds,
      reducedMotion,
      pixelRatio,
      drawingBufferHeightPx,
      modelRadiusPx,
      sunDirection,
    }) => {
      let changed = false;
      for (const [index, light] of lights.entries()) {
        const value = modelLightIsOn(light, wallClockSeconds, reducedMotion)
          ? 1
          : 0;
        if (lit[index] !== value) {
          lit[index] = value;
          changed = true;
        }
      }
      if (changed) litAttribute.needsUpdate = true;
      uniforms.drawingBufferHeight.value = drawingBufferHeightPx;
      uniforms.pixelRatio.value = pixelRatio;
      uniforms.maximumGlowRadiusPx.value =
        modelRadiusPx * LAMP_MAXIMUM_GLOW_SHARE_OF_MODEL;
      uniforms.sunDirection.value.set(
        sunDirection.x,
        sunDirection.y,
        sunDirection.z,
      );
    },
  };
}
