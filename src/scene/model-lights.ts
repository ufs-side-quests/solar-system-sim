import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Points,
  ShaderMaterial,
  SRGBColorSpace,
} from "three";
import { z } from "zod";

import { ASTRONOMICAL_UNIT_M } from "../physics/solar-system";
import {
  LUMINOUS_SOLAR_CONSTANT_LX,
  SUNLIGHT_LUMINANCE_AT_1_AU,
} from "./window-lighting";

// Lamps on four models: running lights, headlights and floodlights drawn at
// runtime on the loaded model, so every GLB file stays unmodified. Each lamp
// is a point anchored at a position in the model's own glTF scene
// coordinates (the frame of the loaded gltf.scene, before the app centres and
// scales it). The point is a child of that scene, so it moves, turns and
// scales with the model and shows only while the model itself shows.
//
// Every anchor was found on the real geometry: a ray cast in Blender 4 from
// outside the hull onto the model (scripts kept out of the repository), or
// the vertex clusters of a named material read with @gltf-transform. The
// unit test checks that each anchor lies on the hull of the installed GLB.
//
// Brightness follows window-lighting.ts: 1 scene radiance unit is about
// 21,000 cd/m2, so a lamp of luminance L cd/m2 has radiance
//   L x SUNLIGHT_LUMINANCE_AT_1_AU / LUMINOUS_SOLAR_CONSTANT_LX.
// The luminances below are assumptions for each kind of lamp, not
// measurements of any fixture:
//   beacon or headlamp lens  1,000,000 cd/m2 = about 48 units;
//   floodlight lens            200,000 cd/m2 = about 9.5 units;
//   brake-level tail lamp       50,000 cd/m2 = about 2.4 units.
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

const BEACON_LUMINANCE_CD_M2 = 1_000_000;
const HEADLAMP_LUMINANCE_CD_M2 = 1_000_000;
const FLOODLIGHT_LUMINANCE_CD_M2 = 200_000;
const TAIL_LAMP_LUMINANCE_CD_M2 = 50_000;

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
 * never swamp a model that is small on screen.
 */
const LAMP_MAXIMUM_GLOW_SHARE_OF_MODEL = 0.1;

const vector3Schema = z.tuple([z.number(), z.number(), z.number()]);

const modelLightSchema = z.object({
  bodyId: z.enum(["deep-space-nine", "roadster", "discovery-one", "iss"]),
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

const DS9_BEACON = {
  colorSrgbHex: "#ff2a1a",
  radiusM: 4,
  luminanceCdM2: BEACON_LUMINANCE_CD_M2,
  basis: "authored-fiction",
} as const;

const PYLON_BLINK_PERIOD_S = 2;
const PYLON_ON_FRACTION = 0.4;

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
    })),
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
    lit[index] = 1;
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("lampNormal", new BufferAttribute(normals, 3));
  geometry.setAttribute("lampRadiance", new BufferAttribute(radiance, 3));
  geometry.setAttribute("lampGlowColor", new BufferAttribute(glowColor, 3));
  geometry.setAttribute("lampRadiusAu", new BufferAttribute(radiusAu, 1));
  const litAttribute = new BufferAttribute(lit, 1);
  litAttribute.setUsage(DynamicDrawUsage);
  geometry.setAttribute("lampLit", litAttribute);
  const uniforms = {
    drawingBufferHeight: { value: 1 },
    pixelRatio: { value: 1 },
    maximumGlowRadiusPx: { value: LAMP_MAXIMUM_GLOW_RADIUS_PX },
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
      attribute float lampLit;
      uniform float drawingBufferHeight;
      uniform float pixelRatio;
      uniform float maximumGlowRadiusPx;
      varying vec3 vRadiance;
      varying vec3 vGlowColor;
      varying float vCoreShare;
      varying float vGlareShown;
      void main() {
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
        glowPx = min(glowPx, maximumGlowRadiusPx * pixelRatio);
        corePx = min(corePx, glowPx);
        gl_PointSize = 2.0 * glowPx;
        // A lamp that is off goes outside the clip volume: a point of size 0
        // may still draw one pixel.
        if (lampLit < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
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
        gl_FragColor = vec4(toneMapping(vRadiance * core) + glow, 0.0);
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
    },
  };
}
