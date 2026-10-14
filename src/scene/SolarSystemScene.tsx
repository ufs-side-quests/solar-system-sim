import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  DynamicDrawUsage,
  GridHelper,
  Group,
  Line,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Matrix4,
  Material,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  PointLight,
  PCFShadowMap,
  Quaternion,
  Raycaster,
  RingGeometry,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  ShaderMaterial,
  Texture,
  TextureLoader,
  type IUniform,
  type Object3D,
  Vector3,
  Vector2,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

import {
  easterEgg,
  type EasterEggId,
  HIDDEN_SURPRISE_LABEL,
  HIDDEN_SURPRISES_GROUP,
  segmentClearsSphere,
  isEasterEggId,
} from "../tour/easter-eggs";
import { bodyDisplayName } from "./body-display-name";
import { loadSbdbSnapshot } from "../catalogue/sbdb";
import { PHONE_LAYOUT_QUERY } from "../phone-layout";
import type { BodyState, SimulationState } from "../physics/contracts";
import {
  ISS_BODY_ID,
  ISS_BOUNDING_RADIUS_M,
  ISS_EPOCH_SIMULATION_SECONDS,
  ISS_PARENT_BODY_ID,
  isIssEphemerisWithinValidity,
  issSnapshot,
} from "../physics/iss-ephemeris";
import {
  additionalAvailableKnownSatellites,
  knownSatelliteById,
  knownSatelliteSnapshot,
} from "../physics/known-satellites";
import {
  ASTRONOMICAL_UNIT_M,
  majorBodySnapshot,
} from "../physics/solar-system";
import {
  isVoyagerBodyId,
  voyagerById,
  voyagerSnapshot,
} from "../physics/voyager-ephemeris";
import {
  isOperationalSpacecraftBodyId,
  operationalSpacecraftSnapshot,
} from "../physics/operational-spacecraft";
import {
  focusDistanceAu,
  focusNearPlaneAu,
  portraitFitDistanceAu,
  sunlitModelViewDirection,
} from "./camera-focus";
import {
  applyCameraRelativeDirectionalShadows,
  applyMetreLogDepth,
} from "./au-scale-precision";
import {
  GravityWellLayer,
  type GravityWellDiagnostics,
} from "./GravityWellLayer";
import type {
  GravityPotentialSource,
  GravityWellMode,
  GravityWellScale,
} from "./gravity-potential";
import type { SimulationFrame, TrailQueue } from "./interpolation";
import { placeBodyLabel, type LabelRectangle } from "./label-placement";
import {
  bodyOrientationAngles,
  bodyOrientationQuaternion,
} from "./orientation";
import {
  apolloLandingSites,
  isApolloLandingSiteId,
  moonFixedSurfaceUnitVector,
} from "./lunar-landing-sites";
import {
  createApolloSurfaceSiteModel,
  MOON_SURFACE_RADIUS_M,
} from "./apollo-surface-model";
import type {
  CameraNavigationCommand,
  CameraOrientationPreset,
} from "./camera-view";
import {
  circularOrbitSolution,
  orbitNormalForInclination,
  orbitRadialDirection,
  type CameraOrbitConfiguration,
} from "./camera-orbit";
import { PARENT_BODY_ID } from "./body-facts";
import {
  type AnchoredCameraMove,
  anchoredCameraMove,
  applyAnchoredCameraMove,
  chooseTurnSide,
  formatViewpointSpeed,
  sampleDirectCameraTransition,
  sampleOrientationTransition,
} from "./camera-transition";
import {
  JOVIAN_MONOLITH_BODY_ID,
  JOVIAN_MONOLITH_BOUNDING_RADIUS_M,
  JOVIAN_MONOLITH_DIMENSIONS_M,
  JOVIAN_MONOLITH_NAME,
  JOVIAN_MONOLITH_PRIMARY_BODY_ID,
  jovianMonolithState,
} from "./jovian-monolith";
import {
  createDeathStarModel,
  DEATH_STAR_MODEL_VISUAL_SOURCE,
} from "./death-star-model";
import {
  FICTIONAL_ORBITERS,
  fictionalOrbiterById,
  fictionalOrbiterStateById,
  isFictionalOrbiterId,
} from "./fictional-orbiters";
import {
  DISCOVERY_ONE_BODY_ID,
  DISCOVERY_ONE_BOUNDING_RADIUS_M,
  DISCOVERY_ONE_NAME,
  DISCOVERY_ONE_PARENT_BODY_ID,
  discoveryOneState,
} from "./discovery-one";
import {
  DEEP_SPACE_NINE_BODY_ID,
  DEEP_SPACE_NINE_OBJECTS,
  deepSpaceNineObjectStateById,
  deepSpaceNineParentBodyId,
  isDeepSpaceNineObjectId,
  USS_DEFIANT_BODY_ID,
} from "./deep-space-nine";
import { fictionalModelAssets } from "./fictional-model-assets";
import {
  DEFIANT_PORTHOLE_MATERIAL,
  DEFIANT_WINDOW_MATERIAL,
  LIT_WINDOW_LUMINANCE_CD_M2,
  lightPaintedPortholes,
  setLitWindowEmissive,
  SOLAR_IRRADIANCE_AT_1_AU,
} from "./window-lighting";
import { osculatingOrbitPositionsM } from "./osculating-orbit";
import {
  limbObserverViewpoint,
  surfaceObserverViewpoint,
} from "./observer-camera";
import {
  DISCRETE_RING_SYSTEMS,
  discreteRingSystemExtent,
  isDiscreteRingBodyId,
  JUPITER_EQUATORIAL_RADIUS_KM,
  JUPITER_POLAR_RADIUS_KM,
  NEPTUNE_EQUATORIAL_RADIUS_KM,
  NEPTUNE_POLAR_RADIUS_KM,
  ringRadiusRatio,
  SATURN_EQUATORIAL_RADIUS_KM,
  SATURN_MAIN_RING_INNER_RADIUS_KM,
  SATURN_MAIN_RING_OUTER_RADIUS_KM,
  SATURN_POLAR_RADIUS_KM,
  URANUS_EQUATORIAL_RADIUS_KM,
  URANUS_POLAR_RADIUS_KM,
} from "./ring-system";
import { icrfToScene, j2000EclipticToScene } from "./reference-frames";
import {
  surfaceHorizonPoint,
  surfaceObserverFrame,
  type SurfaceObserverConfiguration,
  type SurfaceObserverFrame,
} from "./surface-observer";
import { isPhysicalBodyResolvable, orreryLayout } from "./scale";
import { SmallBodyGpuLayer } from "./SmallBodyGpuLayer";
import type { SmallBodyGpuStatus } from "./SmallBodyGpuLayer";
import { pointInsideViewport, rayToViewportEdge } from "./sun-guide";
import {
  hipparcosStarSnapshot,
  starDirectionIcrs,
  starDisplayColor,
  starDisplayOpacity,
  starDisplaySizeCssPixels,
} from "./star-catalogue";
import type { HipparcosStar } from "./star-catalogue";
import type { ObjectVisibility } from "./visibility";
import { isMajorBodyVisible } from "./visibility";
import {
  nearestPlanetWayfinders,
  wayfinderPlanetCount,
  type WayfinderMode,
} from "./wayfinder";
import {
  nasaEarthCloudAsset,
  nasaEarthNightLightAsset,
  nasaMaterialPresentationByBodyId,
  nasaMoonHeightAsset,
  nasaSaturnRingAsset,
  nasaSurfaceNormalByBodyId,
  nasaSurfaceRoughnessByBodyId,
  nasaTextureByBodyId,
  SUNLIGHT_COLOR,
} from "./visual-assets";
import { solarPhotosphere } from "./solar-photosphere";
import type { ReferenceFrame, SemanticZoomLevel, ViewMode } from "./view-mode";
import {
  adaptExposure,
  solarExposureForDistanceAu,
  VISUAL_QUALITY_PROFILES,
  type VisualQuality,
} from "./visual-quality";
import { ROADSTER_BODY_ID, spacecraftAssets } from "./spacecraft-assets";
import { enforceOpaqueTwoSidedExterior } from "./model-exterior-materials";
import {
  eclipseTransmissionAtPoint,
  exposureMultiplierFromEv,
  selectSolarOccluders,
  type ExposureMode,
} from "./physical-lighting";
import {
  eclipticDirection,
  eclipticSkyDirection,
  TROPICAL_ZODIAC_SIGNS,
} from "./zodiac";

// The focused model's shadow light stays on while the camera is within this
// many model radii: farther out the model is about 2 pixels wide.
const LOCAL_MODEL_SUNLIGHT_RANGE_RADII = 1_000;
const LOCAL_SHADOW_MAP_SIZE = 2048;
// The shadow box spans 2.8 model radii; a lookup offset of 1.5 texels along the
// normal removes acne stripes on sunlit faces.
const LOCAL_SHADOW_NORMAL_BIAS_RADII = (2.8 * 1.5) / LOCAL_SHADOW_MAP_SIZE;
const ECLIPTIC_NORTH = j2000EclipticToScene({ x: 0, y: 0, z: 1 }).normalize();
const ECLIPTIC_FORWARD = j2000EclipticToScene({ x: 0, y: 1, z: 0 }).normalize();
const ECLIPTIC_RIGHT = ECLIPTIC_FORWARD.clone()
  .cross(ECLIPTIC_NORTH)
  .normalize();
const PERSPECTIVE_CAMERA_DIRECTION = ECLIPTIC_FORWARD.clone()
  .add(ECLIPTIC_NORTH.clone().multiplyScalar(0.48))
  .normalize();
const SOLAR_SYSTEM_CAMERA_POSITION =
  PERSPECTIVE_CAMERA_DIRECTION.clone().multiplyScalar(90);
const VOYAGER_MODEL_HGA_BORESIGHT = new Vector3(0, 1, 0);
// Map dots closer than this, in map canvas pixels, read as one spot.
const NAVIGATION_MAP_SAME_SPOT_PX = 2;
const NAVIGATION_MAP_RANGES = [
  { value: "auto", label: "Auto" },
  { value: "2", label: "2 AU" },
  { value: "10", label: "10 AU" },
  { value: "50", label: "50 AU" },
  { value: "200", label: "200 AU" },
  { value: "2000", label: "2k AU" },
  { value: "100000", label: "100k AU" },
  { value: "300000", label: "300k AU" },
] as const;
const sourcedModelAssets = [...spacecraftAssets, ...fictionalModelAssets];
const sourcedModelAssetByBodyId: ReadonlyMap<
  string,
  (typeof sourcedModelAssets)[number]
> = new Map(sourcedModelAssets.map((asset) => [asset.bodyId, asset]));

function voyagerEarthPointingQuaternion(
  probePosition: Vector3,
  earthPosition: Vector3,
): Quaternion {
  const boresight = earthPosition.clone().sub(probePosition);
  if (boresight.lengthSq() <= Number.EPSILON) {
    throw new Error("Voyager and Earth positions cannot coincide");
  }
  boresight.normalize();
  let crossAxis = ECLIPTIC_NORTH.clone().cross(boresight);
  if (crossAxis.lengthSq() <= 1e-12) {
    crossAxis = ECLIPTIC_FORWARD.clone().cross(boresight);
  }
  crossAxis.normalize();
  const rollAxis = crossAxis.clone().cross(boresight).normalize();
  return new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(crossAxis, boresight, rollAxis),
  );
}

const MAX_MOON_TRAIL_POINTS = 8_192;
const MAX_PLANET_TRAIL_POINTS = 8_192;
const PLANET_TRAIL_BODY_IDS = [
  "mercury",
  "venus",
  "earth",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
] as const;
const LABEL_MINIMUM_RADIUS_PIXELS = 0.5;
// A press on the canvas that moves no farther than this is a tap: it selects
// the body under it, and during a camera flight it keeps the flight.
const TAP_SLOP_PX = 8;
// Every body label names its body; this hint describes the selected one.
const LABEL_TITLE = "Select to see facts, select again to fly there";
const FLY_HINT_ID = "body-label-fly-hint";
const SPACECRAFT_FOCUS_CLEARANCE = 6;
const DEFAULT_CAMERA_NEAR_AU = 0.000_001;
// Fixed: applyMetreLogDepth maps this far plane to depth 1 in the shaders.
const DEFAULT_CAMERA_FAR_AU = 1_000_000;
const ORIENTATION_PRESET_TRANSITION_DURATION_MS = 1_200;
// Scratch values for the per-frame camera moves, so a frame allocates none.
const scratchCameraMove: AnchoredCameraMove = {
  anchor: new Vector3(),
  rotation: new Quaternion(),
  scale: 1,
};
const scratchOrientationTarget = new Vector3();
const scratchOrientationStart = new Vector3();
const scratchOrientationEnd = new Vector3();
const ALPHA_CENTAURI_DISTANCE_AU = 272_000;
const VOYAGER_1_HELIOPAUSE_AU = 122;
const VOYAGER_2_HELIOPAUSE_AU = 119;
const OORT_CLOUD_INNER_MIN_AU = 2_000;
const OORT_CLOUD_INNER_MAX_AU = 5_000;
const OORT_CLOUD_OUTER_MIN_AU = 10_000;
const OORT_CLOUD_OUTER_MAX_AU = 100_000;
const PREVIOUS_SOLAR_SYSTEM_VIEW_AU = 220;
const SMALL_BODY_GPU_UPDATE_INTERVAL_MS = 200;
const SUN_GUIDE_UPDATE_INTERVAL_MS = 100;
const STAR_SPHERE_RADIUS_AU = 1_500;
const ZODIAC_SPHERE_RADIUS_AU = STAR_SPHERE_RADIUS_AU * 0.985;
const STAR_TOOLTIP_DELAY_MS = 1_000;
const STAR_TOOLTIP_PICK_RADIUS_CSS_PIXELS = 7;
const STAR_COMMON_NAMES = new Map<number, string>([
  [32_349, "Sirius"],
  [71_683, "Alpha Centauri"],
  [91_262, "Vega"],
]);

function starTooltipText(star: HipparcosStar): string {
  const commonName = STAR_COMMON_NAMES.get(star.hipId);
  const title =
    commonName === undefined
      ? `HIP ${String(star.hipId)}`
      : `${commonName} · HIP ${String(star.hipId)}`;
  const colourIndex =
    star.colorIndexBv === null
      ? "B−V unavailable"
      : `B−V ${star.colorIndexBv.toFixed(2)}`;
  return `${title} · V ${star.visualMagnitude.toFixed(2)} · RA ${star.raDeg.toFixed(2)}° · Dec ${star.decDeg.toFixed(2)}° · ${colourIndex}`;
}
const JULIAN_YEAR_SECONDS = 365.25 * 86_400;
const SOLAR_SYSTEM_EPOCH_JULIAN_YEAR =
  2000 + (majorBodySnapshot.epoch.value - 2_451_545) / 365.25;
const majorBodyById = new Map(
  majorBodySnapshot.bodies.map((body) => [body.id, body]),
);

function spacecraftBoundingRadiusM(bodyId: string): number | undefined {
  if (bodyId === JOVIAN_MONOLITH_BODY_ID) {
    return JOVIAN_MONOLITH_BOUNDING_RADIUS_M;
  }
  if (bodyId === DISCOVERY_ONE_BODY_ID) {
    return DISCOVERY_ONE_BOUNDING_RADIUS_M;
  }
  const deepSpaceNineObject = DEEP_SPACE_NINE_OBJECTS.find(
    (object) => object.id === bodyId,
  );
  if (deepSpaceNineObject !== undefined) {
    return deepSpaceNineObject.maximumDimensionM / 2;
  }
  const fictionalOrbiter = fictionalOrbiterById.get(
    isFictionalOrbiterId(bodyId) ? bodyId : "death-star-1",
  );
  if (isFictionalOrbiterId(bodyId)) {
    if (fictionalOrbiter === undefined) {
      throw new Error(`Fictional orbiter ${bodyId} is unavailable`);
    }
    return fictionalOrbiter.diameterM / 2;
  }
  const asset = spacecraftAssets.find(
    (candidate) => candidate.bodyId === bodyId,
  );
  const operationalSpacecraft = operationalSpacecraftSnapshot.spacecraft.find(
    (candidate) => candidate.id === bodyId,
  );
  return asset?.maximumDimensionM === undefined
    ? operationalSpacecraft?.maximumDimensionM === undefined
      ? undefined
      : operationalSpacecraft.maximumDimensionM / 2
    : asset.maximumDimensionM / 2;
}

function spacecraftFocusDistanceAu(bodyId: string): number {
  const radiusM = spacecraftBoundingRadiusM(bodyId);
  if (radiusM === undefined) {
    throw new Error(`Physical dimensions are unavailable for ${bodyId}`);
  }
  return (radiusM * SPACECRAFT_FOCUS_CLEARANCE) / ASTRONOMICAL_UNIT_M;
}

type TimedTrailPoint = Readonly<{
  position: Vector3;
  timeSeconds: number;
}>;

type TrailGeometry = Readonly<{
  geometry: BufferGeometry;
  positions: Float32Array;
  colors: Float32Array;
  positionAttribute: BufferAttribute;
  colorAttribute: BufferAttribute;
}>;

// Writes and uploads only the drawn points of a trail.
function writeTrailGeometry(
  trail: TrailGeometry,
  points: readonly TimedTrailPoint[],
  fade: number,
  color: readonly [number, number, number],
): void {
  for (const [index, point] of points.entries()) {
    trail.positions[index * 3] = point.position.x;
    trail.positions[index * 3 + 1] = point.position.y;
    trail.positions[index * 3 + 2] = point.position.z;
  }
  writeTrailColors(trail.colors, points.length, fade, color);
  for (const attribute of [trail.positionAttribute, trail.colorAttribute]) {
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(0, points.length * 3);
    attribute.needsUpdate = true;
  }
  trail.geometry.setDrawRange(0, points.length);
}

function writeTrailColors(
  colors: Float32Array,
  pointCount: number,
  fade: number,
  color: readonly [number, number, number],
): void {
  const denominator = Math.max(1, pointCount - 1);
  for (let index = 0; index < pointCount; index += 1) {
    const ageFraction = index / denominator;
    const brightness = 1 - fade * (1 - ageFraction) * 0.92;
    colors[index * 3] = color[0] * brightness;
    colors[index * 3 + 1] = color[1] * brightness;
    colors[index * 3 + 2] = color[2] * brightness;
  }
}

// The frame loop writes each value only when it changes: every write queues a
// mutation record, and a changed attribute can invalidate style.
function setData(
  element: HTMLElement | SVGElement,
  key: string,
  value: string,
): void {
  if (element.dataset[key] !== value) {
    element.dataset[key] = value;
  }
}

function setHidden(element: HTMLElement, hidden: boolean): void {
  if (element.hidden !== hidden) {
    element.hidden = hidden;
  }
}

function setAttr(element: Element, name: string, value: string): void {
  if (element.getAttribute(name) !== value) {
    element.setAttribute(name, value);
  }
}

// Chrome reads style.transform back rounded to six significant digits, so a
// read-back comparison never matches; the last written value is kept here.
// Hundredths of a pixel are below what a screen can show.
const writtenTransforms = new WeakMap<HTMLElement | SVGElement, string>();

function setTransform(
  element: HTMLElement | SVGElement,
  xPx: number,
  yPx: number,
): void {
  const transform = `translate(${xPx.toFixed(2)}px, ${yPx.toFixed(2)}px)`;
  if (writtenTransforms.get(element) !== transform) {
    writtenTransforms.set(element, transform);
    element.style.transform = transform;
  }
}

function scenePosition(positionM: readonly [number, number, number]): Vector3 {
  return icrfToScene({
    x: positionM[0] / ASTRONOMICAL_UNIT_M,
    y: positionM[1] / ASTRONOMICAL_UNIT_M,
    z: positionM[2] / ASTRONOMICAL_UNIT_M,
  });
}

function setRequiredNumberUniform(
  material: ShaderMaterial,
  name: string,
  value: number,
): void {
  const uniform: unknown = material.uniforms[name];
  if (
    typeof uniform !== "object" ||
    uniform === null ||
    !("value" in uniform) ||
    typeof uniform.value !== "number"
  ) {
    throw new Error(
      `Shader material is missing required numeric uniform ${name}`,
    );
  }
  uniform.value = value;
}

function requiredVectorUniform(
  material: ShaderMaterial,
  name: string,
): IUniform<Vector3> {
  const uniform: unknown = material.uniforms[name];
  if (
    typeof uniform !== "object" ||
    uniform === null ||
    !("value" in uniform)
  ) {
    throw new Error(
      `Shader material is missing required Vector3 uniform ${name}`,
    );
  }
  const value: unknown = uniform.value;
  if (!(value instanceof Vector3)) {
    throw new Error(
      `Shader material is missing required Vector3 uniform ${name}`,
    );
  }
  return { value };
}

function bodyStateById(
  state: SimulationState,
  bodyId: string,
): BodyState | undefined {
  if (bodyId === JOVIAN_MONOLITH_BODY_ID) {
    return jovianMonolithState(state);
  }
  if (bodyId === DISCOVERY_ONE_BODY_ID) {
    return discoveryOneState(state);
  }
  if (isDeepSpaceNineObjectId(bodyId)) {
    return deepSpaceNineObjectStateById(state, bodyId);
  }
  if (isFictionalOrbiterId(bodyId)) {
    return fictionalOrbiterStateById(state, bodyId);
  }
  return state.bodies.find((body) => body.id === bodyId);
}

function gravityFieldExtentAu(
  focusBodyId: string | null,
  bodyVisibility: number,
): number {
  if (focusBodyId === null || focusBodyId === "sun") {
    return 80;
  }
  if (focusBodyId === ISS_BODY_ID) {
    return 0.000_12;
  }
  if (
    isVoyagerBodyId(focusBodyId) ||
    isOperationalSpacecraftBodyId(focusBodyId) ||
    focusBodyId === JOVIAN_MONOLITH_BODY_ID ||
    focusBodyId === DISCOVERY_ONE_BODY_ID ||
    isDeepSpaceNineObjectId(focusBodyId) ||
    isFictionalOrbiterId(focusBodyId)
  ) {
    return 0.000_001;
  }
  const definition = majorBodyById.get(focusBodyId);
  if (definition !== undefined) {
    return Math.max(
      focusDistanceAu(definition, bodyVisibility) * 1.2,
      (definition.meanRadiusM / ASTRONOMICAL_UNIT_M) * 24,
    );
  }
  if (knownSatelliteById.has(focusBodyId)) {
    return 0.006;
  }
  throw new Error(`Gravity field focus ${focusBodyId} is unavailable`);
}

function formatPotentialMagnitude(valueJPerKg: number): string {
  if (!Number.isFinite(valueJPerKg) || valueJPerKg <= 0) {
    throw new Error(
      "Gravity potential legend requires a positive finite value",
    );
  }
  return valueJPerKg.toExponential(2).replace("e+", "e");
}

function parentBodyId(bodyId: string): string | undefined {
  return bodyId === ISS_BODY_ID
    ? ISS_PARENT_BODY_ID
    : bodyId === "hubble"
      ? "earth"
      : bodyId === JOVIAN_MONOLITH_BODY_ID
        ? JOVIAN_MONOLITH_PRIMARY_BODY_ID
        : bodyId === DISCOVERY_ONE_BODY_ID
          ? DISCOVERY_ONE_PARENT_BODY_ID
          : isDeepSpaceNineObjectId(bodyId)
            ? deepSpaceNineParentBodyId(bodyId)
            : isFictionalOrbiterId(bodyId)
              ? fictionalOrbiterById.get(bodyId)?.parentBodyId
              : bodyId === "jwst" || isVoyagerBodyId(bodyId)
                ? "sun"
                : (knownSatelliteById.get(bodyId)?.parentId ??
                  PARENT_BODY_ID[bodyId]);
}

// The planet or dwarf planet whose system holds the focus, so the Orrery
// shows its moons. A spacecraft counts with the body it orbits. The Sun, the
// overview and heliocentric objects open no system.
function orrerySystemRootId(focusBodyId: string | null): string | undefined {
  let bodyId = focusBodyId ?? undefined;
  while (bodyId !== undefined && bodyId !== "sun") {
    const definition = majorBodyById.get(bodyId);
    if (definition?.type === "planet" || definition?.type === "dwarf-planet") {
      return bodyId;
    }
    bodyId = parentBodyId(bodyId);
  }
  return undefined;
}

function formatTacticalDistance(distanceAu: number): string {
  if (distanceAu >= 0.1) {
    return `${distanceAu.toLocaleString(undefined, { maximumFractionDigits: 2 })} AU`;
  }
  const distanceKm = (distanceAu * ASTRONOMICAL_UNIT_M) / 1_000;
  if (distanceKm >= 1_000_000) {
    return `${(distanceKm / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })} million km`;
  }
  return `${distanceKm.toLocaleString(undefined, { maximumFractionDigits: 0 })} km`;
}

export type ExposureStatus = Readonly<{
  ev: number;
  multiplier: number;
  mode: ExposureMode;
}>;

type OrbitGuide = Readonly<{
  geometry: BufferGeometry;
  positions: Float32Array;
  positionAttribute: BufferAttribute;
  material: LineBasicMaterial;
  line: LineLoop;
}>;

type SolarSystemSceneProps = Readonly<{
  // The newest solver frame and the states its trails still have to draw;
  // the frame loop reads them on every animation frame, not React.
  frameRef: RefObject<SimulationFrame | undefined>;
  trailQueueRef: RefObject<TrailQueue>;
  displayedStateRef: RefObject<SimulationState | undefined>;
  bodyVisibility: number;
  focusBodyId: string | null;
  selectedBodyId: string | null;
  apolloInspectionSiteId: string | null;
  showMoonTrail: boolean;
  showPlanetTrails: boolean;
  showMinorBodyTrails: boolean;
  referenceFrame: ReferenceFrame;
  trailDurationSeconds: number;
  trailFade: number;
  clearTrailsToken: number;
  showEclipticPlane: boolean;
  showZodiac: boolean;
  showLabels: boolean;
  // A tour speaks for itself, so a flight is announced only outside tours.
  announceFlights: boolean;
  showApolloSites: boolean;
  spacecraftLabelBodyIds: readonly string[] | undefined;
  resetViewToken: number;
  cameraZoom: number;
  cameraDistanceOverrideAu: number | undefined;
  // Move the override distance out in a portrait view (cool shots).
  fitCameraDistanceToPortrait: boolean;
  cameraTargetBodyId: string | undefined;
  observerCameraStyle: "surface-facing" | "limb" | "shadow-axis";
  cameraTransitionSequence: number;
  cameraTransitionDurationMs: number;
  cameraNavigationCommand: CameraNavigationCommand;
  orbitViewEnabled: boolean;
  orbitConfiguration: CameraOrbitConfiguration | null;
  orientationPreset: CameraOrientationPreset;
  orientationPresetToken: number;
  viewMode: Exclude<ViewMode, "schematic">;
  showTacticalOverlay: boolean;
  showOrbitGuides: boolean;
  wayfinderMode: WayfinderMode;
  orbitGuideScope: "system" | "all";
  gravityWellMode: GravityWellMode;
  gravityWellScale: GravityWellScale;
  objectVisibility: ObjectVisibility;
  surfaceObserver: SurfaceObserverConfiguration | null;
  surfaceObserverLookResetToken: number;
  visualQuality: VisualQuality;
  exposureMode: ExposureMode;
  manualExposureEv: number;
  deepSpacePresentation:
    "heliosphere-scale" | "oort-cloud-scale" | "interstellar-scale" | undefined;
  eclipseShadowVisible: boolean;
  foundEasterEggIds: ReadonlySet<EasterEggId>;
  onSelectBody(bodyId: string): void;
  // A first press on a label, a body in the scene or the map.
  onPickBody(bodyId: string): void;
  onFocusBody(bodyId: string): void;
  // The navigation map's bottom edge in scene pixels, or null when hidden.
  onNavigationMapBottomChange(bottomPx: number | null): void;
  onOrientationChange(preset: CameraOrientationPreset): void;
  onOrbitViewChange(enabled: boolean): void;
  onSemanticZoomChange(level: SemanticZoomLevel): void;
  onViewZoomChange(zoom: number): void;
  /** The camera transition with this sequence has settled or was interrupted. */
  onCameraTransitionSettled(sequence: number): void;
  onGpuStatus(status: SmallBodyGpuStatus): void;
  onGpuError(message: string): void;
  onExposureStatusChange(status: ExposureStatus): void;
}>;

export function SolarSystemScene({
  frameRef,
  trailQueueRef,
  displayedStateRef,
  bodyVisibility,
  focusBodyId,
  selectedBodyId,
  apolloInspectionSiteId,
  showMoonTrail,
  showPlanetTrails,
  showMinorBodyTrails,
  referenceFrame,
  trailDurationSeconds,
  trailFade,
  clearTrailsToken,
  showEclipticPlane,
  showZodiac,
  showLabels,
  announceFlights,
  showApolloSites,
  spacecraftLabelBodyIds,
  resetViewToken,
  cameraZoom,
  cameraDistanceOverrideAu,
  fitCameraDistanceToPortrait,
  cameraTargetBodyId,
  observerCameraStyle,
  cameraTransitionSequence,
  cameraTransitionDurationMs,
  cameraNavigationCommand,
  orbitViewEnabled,
  orbitConfiguration,
  orientationPreset,
  orientationPresetToken,
  viewMode,
  showTacticalOverlay,
  showOrbitGuides,
  wayfinderMode,
  orbitGuideScope,
  gravityWellMode,
  gravityWellScale,
  objectVisibility,
  surfaceObserver,
  surfaceObserverLookResetToken,
  visualQuality,
  exposureMode,
  manualExposureEv,
  deepSpacePresentation,
  eclipseShadowVisible,
  foundEasterEggIds,
  onSelectBody,
  onPickBody,
  onFocusBody,
  onNavigationMapBottomChange,
  onOrientationChange,
  onOrbitViewChange,
  onSemanticZoomChange,
  onViewZoomChange,
  onCameraTransitionSettled,
  onGpuStatus,
  onGpuError,
  onExposureStatusChange,
}: SolarSystemSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bodyVisibilityRef = useRef(bodyVisibility);
  const focusBodyIdRef = useRef(focusBodyId);
  const selectedBodyIdRef = useRef(selectedBodyId);
  const apolloInspectionSiteIdRef = useRef(apolloInspectionSiteId);
  const showMoonTrailRef = useRef(showMoonTrail);
  const showPlanetTrailsRef = useRef(showPlanetTrails);
  const showMinorBodyTrailsRef = useRef(showMinorBodyTrails);
  const referenceFrameRef = useRef(referenceFrame);
  const trailDurationSecondsRef = useRef(trailDurationSeconds);
  const trailFadeRef = useRef(trailFade);
  const clearTrailsTokenRef = useRef(clearTrailsToken);
  const showEclipticPlaneRef = useRef(showEclipticPlane);
  const showZodiacRef = useRef(showZodiac);
  const showLabelsRef = useRef(showLabels);
  const announceFlightsRef = useRef(announceFlights);
  const showApolloSitesRef = useRef(showApolloSites);
  const spacecraftLabelBodyIdsRef = useRef(spacecraftLabelBodyIds);
  const resetViewTokenRef = useRef(resetViewToken);
  const cameraZoomRef = useRef(cameraZoom);
  const cameraDistanceOverrideAuRef = useRef(cameraDistanceOverrideAu);
  const fitCameraDistanceToPortraitRef = useRef(fitCameraDistanceToPortrait);
  const cameraTargetBodyIdRef = useRef(cameraTargetBodyId);
  const observerCameraStyleRef = useRef(observerCameraStyle);
  const eclipseShadowVisibleRef = useRef(eclipseShadowVisible);
  const foundEasterEggIdsRef = useRef(foundEasterEggIds);
  const cameraTransitionSequenceRef = useRef(cameraTransitionSequence);
  const cameraTransitionDurationMsRef = useRef(cameraTransitionDurationMs);
  const cameraNavigationCommandRef = useRef(cameraNavigationCommand);
  const orbitViewEnabledRef = useRef(orbitViewEnabled);
  const orbitConfigurationRef = useRef(orbitConfiguration);
  const orientationPresetRef = useRef(orientationPreset);
  const orientationPresetTokenRef = useRef(orientationPresetToken);
  const viewModeRef = useRef(viewMode);
  const showTacticalOverlayRef = useRef(showTacticalOverlay);
  const showOrbitGuidesRef = useRef(showOrbitGuides);
  const wayfinderModeRef = useRef(wayfinderMode);
  const orbitGuideScopeRef = useRef(orbitGuideScope);
  const gravityWellModeRef = useRef(gravityWellMode);
  const gravityWellScaleRef = useRef(gravityWellScale);
  const objectVisibilityRef = useRef(objectVisibility);
  const surfaceObserverRef = useRef(surfaceObserver);
  const surfaceObserverLookResetTokenRef = useRef(
    surfaceObserverLookResetToken,
  );
  const visualQualityRef = useRef(visualQuality);
  const exposureModeRef = useRef(exposureMode);
  const manualExposureEvRef = useRef(manualExposureEv);
  const deepSpacePresentationRef = useRef(deepSpacePresentation);
  const onViewZoomChangeRef = useRef(onViewZoomChange);
  const onCameraTransitionSettledRef = useRef(onCameraTransitionSettled);
  const onOrbitViewChangeRef = useRef(onOrbitViewChange);
  const onExposureStatusChangeRef = useRef(onExposureStatusChange);
  bodyVisibilityRef.current = bodyVisibility;
  focusBodyIdRef.current = focusBodyId;
  selectedBodyIdRef.current = selectedBodyId;
  apolloInspectionSiteIdRef.current = apolloInspectionSiteId;
  showMoonTrailRef.current = showMoonTrail;
  showPlanetTrailsRef.current = showPlanetTrails;
  showMinorBodyTrailsRef.current = showMinorBodyTrails;
  referenceFrameRef.current = referenceFrame;
  trailDurationSecondsRef.current = trailDurationSeconds;
  trailFadeRef.current = trailFade;
  clearTrailsTokenRef.current = clearTrailsToken;
  showEclipticPlaneRef.current = showEclipticPlane;
  showZodiacRef.current = showZodiac;
  showLabelsRef.current = showLabels;
  announceFlightsRef.current = announceFlights;
  showApolloSitesRef.current = showApolloSites;
  spacecraftLabelBodyIdsRef.current = spacecraftLabelBodyIds;
  resetViewTokenRef.current = resetViewToken;
  cameraZoomRef.current = cameraZoom;
  cameraDistanceOverrideAuRef.current = cameraDistanceOverrideAu;
  fitCameraDistanceToPortraitRef.current = fitCameraDistanceToPortrait;
  cameraTargetBodyIdRef.current = cameraTargetBodyId;
  observerCameraStyleRef.current = observerCameraStyle;
  eclipseShadowVisibleRef.current = eclipseShadowVisible;
  foundEasterEggIdsRef.current = foundEasterEggIds;
  cameraTransitionSequenceRef.current = cameraTransitionSequence;
  cameraTransitionDurationMsRef.current = cameraTransitionDurationMs;
  cameraNavigationCommandRef.current = cameraNavigationCommand;
  orbitViewEnabledRef.current = orbitViewEnabled;
  orbitConfigurationRef.current = orbitConfiguration;
  orientationPresetRef.current = orientationPreset;
  orientationPresetTokenRef.current = orientationPresetToken;
  viewModeRef.current = viewMode;
  showTacticalOverlayRef.current = showTacticalOverlay;
  showOrbitGuidesRef.current = showOrbitGuides;
  wayfinderModeRef.current = wayfinderMode;
  orbitGuideScopeRef.current = orbitGuideScope;
  gravityWellModeRef.current = gravityWellMode;
  gravityWellScaleRef.current = gravityWellScale;
  objectVisibilityRef.current = objectVisibility;
  surfaceObserverRef.current = surfaceObserver;
  surfaceObserverLookResetTokenRef.current = surfaceObserverLookResetToken;
  visualQualityRef.current = visualQuality;
  exposureModeRef.current = exposureMode;
  manualExposureEvRef.current = manualExposureEv;
  deepSpacePresentationRef.current = deepSpacePresentation;
  onViewZoomChangeRef.current = onViewZoomChange;
  onCameraTransitionSettledRef.current = onCameraTransitionSettled;
  onOrbitViewChangeRef.current = onOrbitViewChange;
  onExposureStatusChangeRef.current = onExposureStatusChange;

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      throw new Error("Scene container is missing");
    }

    const scene = new Scene();
    const gravityWellLayer = new GravityWellLayer(scene, ECLIPTIC_NORTH);
    const camera = new PerspectiveCamera(
      45,
      1,
      DEFAULT_CAMERA_NEAR_AU,
      DEFAULT_CAMERA_FAR_AU,
    );
    camera.position.copy(SOLAR_SYSTEM_CAMERA_POSITION);
    applyMetreLogDepth(ASTRONOMICAL_UNIT_M, DEFAULT_CAMERA_FAR_AU);
    const renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      logarithmicDepthBuffer: true,
    });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    renderer.toneMappingExposure =
      VISUAL_QUALITY_PROFILES[visualQualityRef.current].baseExposure;
    renderer.domElement.className = "major-body-layer";
    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio,
        VISUAL_QUALITY_PROFILES[visualQualityRef.current].maximumPixelRatio,
      ),
    );
    container.append(renderer.domElement);
    const gpuCanvas = document.createElement("canvas");
    gpuCanvas.className = "small-body-layer";
    gpuCanvas.hidden = true;
    gpuCanvas.setAttribute("aria-hidden", "true");
    container.append(gpuCanvas);
    const labelLayer = document.createElement("div");
    labelLayer.className = "body-label-layer";
    container.append(labelLayer);
    const flyHint = document.createElement("span");
    flyHint.id = FLY_HINT_ID;
    flyHint.hidden = true;
    flyHint.textContent = "Select again to fly there.";
    labelLayer.append(flyHint);
    // An Apollo site is "flown to" once the Moon shows it; any other body once
    // it is the camera focus.
    const isFlownTo = (bodyId: string): boolean =>
      isApolloLandingSiteId(bodyId)
        ? apolloInspectionSiteIdRef.current === bodyId
        : focusBodyIdRef.current === bodyId;
    // One gesture for every label and canvas pick, so a tap, a click and the
    // Enter key all work alike: the first press selects the body and shows its
    // facts; a press on the selected body flies there. Once there, a further
    // press changes nothing.
    const pickBody = (bodyId: string): void => {
      if (selectedBodyIdRef.current !== bodyId) {
        onPickBody(bodyId);
        return;
      }
      if (!isFlownTo(bodyId)) {
        onFocusBody(bodyId);
      }
    };
    const showLabelSelection = (label: HTMLElement, bodyId: string): void => {
      const selected = selectedBodyIdRef.current === bodyId;
      const flownTo = isFlownTo(bodyId);
      label.classList.toggle("is-selected", selected);
      label.classList.toggle("is-focused", flownTo);
      setAttr(label, "aria-pressed", String(selected));
      if (selected && !flownTo) {
        setAttr(label, "aria-describedby", FLY_HINT_ID);
      } else {
        label.removeAttribute("aria-describedby");
      }
    };
    const cameraJourney = document.createElement("div");
    cameraJourney.className = "camera-journey";
    // The visible text changes every frame with the viewpoint speed, so screen
    // readers hear only the start and the end of a flight, from its sibling.
    cameraJourney.setAttribute("aria-hidden", "true");
    cameraJourney.hidden = true;
    container.append(cameraJourney);
    const cameraJourneyAnnouncer = document.createElement("div");
    cameraJourneyAnnouncer.className = "visually-hidden";
    cameraJourneyAnnouncer.setAttribute("aria-live", "polite");
    container.append(cameraJourneyAnnouncer);
    const markerLayer = document.createElement("div");
    markerLayer.className = "body-marker-layer";
    markerLayer.setAttribute("aria-hidden", "true");
    container.append(markerLayer);
    const bodyMarkers = new Map<string, HTMLSpanElement>();
    for (const body of majorBodySnapshot.bodies) {
      const marker = document.createElement("span");
      marker.className = "orrery-marker";
      marker.hidden = true;
      markerLayer.append(marker);
      bodyMarkers.set(body.id, marker);
    }
    const focusedKnownMoonLabel = document.createElement("button");
    focusedKnownMoonLabel.type = "button";
    focusedKnownMoonLabel.className = "body-label";
    focusedKnownMoonLabel.hidden = true;
    focusedKnownMoonLabel.addEventListener("click", () => {
      const bodyId = focusedKnownMoonLabel.dataset["bodyId"];
      if (bodyId !== undefined) {
        pickBody(bodyId);
      }
    });
    labelLayer.append(focusedKnownMoonLabel);
    const issLabel = document.createElement("button");
    issLabel.type = "button";
    issLabel.className = "body-label";
    issLabel.textContent = "International Space Station";
    issLabel.dataset["bodyId"] = ISS_BODY_ID;
    issLabel.title = LABEL_TITLE;
    issLabel.addEventListener("click", () => pickBody(ISS_BODY_ID));
    issLabel.hidden = true;
    labelLayer.append(issLabel);
    const issMarker = document.createElement("span");
    issMarker.className = "orrery-marker";
    issMarker.hidden = true;
    markerLayer.append(issMarker);
    const voyagerLabels = new Map<string, HTMLButtonElement>();
    const voyagerMarkers = new Map<string, HTMLSpanElement>();
    for (const probe of voyagerSnapshot.probes) {
      const label = document.createElement("button");
      label.type = "button";
      label.className = "body-label";
      label.textContent = probe.name;
      label.dataset["bodyId"] = probe.id;
      label.title = LABEL_TITLE;
      label.addEventListener("click", () => pickBody(probe.id));
      label.hidden = true;
      labelLayer.append(label);
      voyagerLabels.set(probe.id, label);
      const marker = document.createElement("span");
      marker.className = "orrery-marker";
      marker.hidden = true;
      markerLayer.append(marker);
      voyagerMarkers.set(probe.id, marker);
    }
    const operationalSpacecraftLabels = new Map<string, HTMLButtonElement>();
    const operationalSpacecraftMarkers = new Map<string, HTMLSpanElement>();
    for (const spacecraft of operationalSpacecraftSnapshot.spacecraft) {
      const label = document.createElement("button");
      label.type = "button";
      label.className = "body-label";
      label.textContent = spacecraft.name;
      label.dataset["bodyId"] = spacecraft.id;
      label.title = LABEL_TITLE;
      label.addEventListener("click", () => pickBody(spacecraft.id));
      label.hidden = true;
      labelLayer.append(label);
      operationalSpacecraftLabels.set(spacecraft.id, label);
      const marker = document.createElement("span");
      marker.className = "orrery-marker";
      marker.hidden = true;
      markerLayer.append(marker);
      operationalSpacecraftMarkers.set(spacecraft.id, marker);
    }
    const apolloSiteLabels = new Map<string, HTMLButtonElement>();
    for (const site of apolloLandingSites) {
      const label = document.createElement("button");
      label.type = "button";
      label.className = "body-label apollo-site-label";
      label.textContent = site.mission;
      label.dataset["bodyId"] = site.id;
      label.setAttribute(
        "aria-label",
        `${site.mission} landing site at ${site.siteName}`,
      );
      label.title = `${site.siteName} · select for mission details, select again to show it on the Moon`;
      label.addEventListener("click", () => pickBody(site.id));
      label.hidden = true;
      labelLayer.append(label);
      apolloSiteLabels.set(site.id, label);
    }
    const tacticalOverlay = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    tacticalOverlay.classList.add("tactical-overlay");
    tacticalOverlay.setAttribute("aria-hidden", "true");
    const createTacticalLine = (className: string): SVGLineElement => {
      const line = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line",
      );
      line.classList.add(className);
      tacticalOverlay.append(line);
      return line;
    };
    const parentConnection = createTacticalLine("tactical-parent-line");
    const planeDropLine = createTacticalLine("tactical-plane-line");
    const velocityVector = createTacticalLine("tactical-velocity-line");
    velocityVector.setAttribute("marker-end", "url(#tactical-arrow)");
    const definitions = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "defs",
    );
    const arrowMarker = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "marker",
    );
    arrowMarker.id = "tactical-arrow";
    arrowMarker.setAttribute("viewBox", "0 0 10 10");
    arrowMarker.setAttribute("refX", "8");
    arrowMarker.setAttribute("refY", "5");
    arrowMarker.setAttribute("markerWidth", "5");
    arrowMarker.setAttribute("markerHeight", "5");
    arrowMarker.setAttribute("orient", "auto-start-reverse");
    const arrowPath = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    arrowPath.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
    arrowMarker.append(arrowPath);
    definitions.append(arrowMarker);
    tacticalOverlay.prepend(definitions);
    const rangeRings = Array.from({ length: 3 }, () => {
      const circle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      circle.classList.add("tactical-range-ring");
      tacticalOverlay.append(circle);
      return circle;
    });
    container.append(tacticalOverlay);
    const focusBracket = document.createElement("div");
    focusBracket.className = "focus-bracket";
    focusBracket.setAttribute("aria-hidden", "true");
    focusBracket.hidden = true;
    container.append(focusBracket);
    const rangeLegend = document.createElement("span");
    rangeLegend.className = "range-legend";
    rangeLegend.hidden = true;
    container.append(rangeLegend);

    const sunGuideOverlay = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    sunGuideOverlay.classList.add("sun-guide-overlay");
    sunGuideOverlay.setAttribute("aria-hidden", "true");
    const sunGuideDefinitions = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "defs",
    );
    const sunGuideArrow = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "marker",
    );
    sunGuideArrow.id = "sun-guide-arrow";
    sunGuideArrow.setAttribute("viewBox", "0 0 10 10");
    sunGuideArrow.setAttribute("refX", "8");
    sunGuideArrow.setAttribute("refY", "5");
    sunGuideArrow.setAttribute("markerWidth", "5");
    sunGuideArrow.setAttribute("markerHeight", "5");
    sunGuideArrow.setAttribute("orient", "auto");
    const sunGuideArrowPath = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    sunGuideArrowPath.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
    sunGuideArrow.append(sunGuideArrowPath);
    sunGuideDefinitions.append(sunGuideArrow);
    const planetGuideArrow = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "marker",
    );
    planetGuideArrow.id = "planet-guide-arrow";
    planetGuideArrow.setAttribute("viewBox", "0 0 10 10");
    planetGuideArrow.setAttribute("refX", "8");
    planetGuideArrow.setAttribute("refY", "5");
    planetGuideArrow.setAttribute("markerWidth", "5");
    planetGuideArrow.setAttribute("markerHeight", "5");
    planetGuideArrow.setAttribute("orient", "auto");
    const planetGuideArrowPath = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    planetGuideArrowPath.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
    planetGuideArrow.append(planetGuideArrowPath);
    sunGuideDefinitions.append(planetGuideArrow);
    sunGuideOverlay.append(sunGuideDefinitions);
    const sunGuideLine = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "line",
    );
    sunGuideLine.classList.add("wayfinder-line", "sun-guide-line");
    sunGuideLine.setAttribute("marker-end", "url(#sun-guide-arrow)");
    sunGuideOverlay.append(sunGuideLine);
    const sunGuideEndpoint = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    sunGuideEndpoint.classList.add("wayfinder-endpoint", "sun-guide-endpoint");
    sunGuideEndpoint.setAttribute("r", "3");
    sunGuideOverlay.append(sunGuideEndpoint);
    container.append(sunGuideOverlay);
    const sunGuideLabel = document.createElement("button");
    sunGuideLabel.type = "button";
    sunGuideLabel.className = "wayfinder-label sun-guide-label";
    sunGuideLabel.title = LABEL_TITLE;
    sunGuideLabel.addEventListener("click", () => pickBody("sun"));
    sunGuideLabel.hidden = true;
    container.append(sunGuideLabel);
    const planetWayfinderVisuals = Array.from({ length: 2 }, (_, index) => {
      const line = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line",
      );
      line.classList.add("wayfinder-line", "planet-guide-line");
      line.setAttribute("marker-end", "url(#planet-guide-arrow)");
      line.dataset["wayfinderRank"] = String(index + 1);
      sunGuideOverlay.append(line);
      const endpoint = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      endpoint.classList.add("wayfinder-endpoint", "planet-guide-endpoint");
      endpoint.setAttribute("r", "3");
      endpoint.dataset["wayfinderRank"] = String(index + 1);
      sunGuideOverlay.append(endpoint);
      const label = document.createElement("button");
      label.type = "button";
      label.className = "wayfinder-label planet-guide-label";
      label.dataset["wayfinderRank"] = String(index + 1);
      const labelBodyId = (): string => {
        const targetBodyId = label.dataset["targetBodyId"];
        if (targetBodyId === undefined || targetBodyId === "") {
          throw new Error("Planet wayfinder target is unavailable");
        }
        return targetBodyId;
      };
      label.addEventListener("click", () => pickBody(labelBodyId()));
      label.hidden = true;
      container.append(label);
      return { line, endpoint, label };
    });

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);
    let interruptCameraTransition: () => void = () => undefined;
    // A press that begins on the canvas counts as a tap until it moves past
    // TAP_SLOP_PX: children touch the screen while they watch, and a tap must
    // not strand them mid-flight, pause a tour, or end orbit view. A drag past
    // it, a second finger, or the wheel still hands the camera to the child.
    const canvasPresses = new Map<number, { x: number; y: number }>();
    let tapPending = false;
    const handleCanvasPressDown = (event: PointerEvent): void => {
      if (event.target !== renderer.domElement) return;
      canvasPresses.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      tapPending = canvasPresses.size === 1;
    };
    const handleCanvasPressMove = (event: PointerEvent): void => {
      if (!tapPending) return;
      const press = canvasPresses.get(event.pointerId);
      if (press === undefined) return;
      if (
        Math.hypot(event.clientX - press.x, event.clientY - press.y) <=
        TAP_SLOP_PX
      ) {
        // OrbitControls never sees the jitter, so it adds no rotation or
        // damping that would fight a flight or move a settled view.
        event.stopPropagation();
        return;
      }
      tapPending = false;
      // Surface view disables the controls: its drag is free look, which
      // turns the observer's head and keeps a story playing.
      if (controls.enabled) handleControlStart();
    };
    const handleCanvasPressEnd = (event: PointerEvent): void => {
      canvasPresses.delete(event.pointerId);
      if (canvasPresses.size === 0) tapPending = false;
    };
    // Capture on the container runs before the canvas listeners and before
    // OrbitControls' document listeners, so a dropped move reaches neither.
    container.addEventListener("pointerdown", handleCanvasPressDown, true);
    container.addEventListener("pointermove", handleCanvasPressMove, true);
    container.addEventListener("pointerup", handleCanvasPressEnd, true);
    container.addEventListener("pointercancel", handleCanvasPressEnd, true);
    const handleControlStart = (): void => {
      if (tapPending) return;
      interruptCameraTransition();
      if (orbitViewEnabledRef.current) {
        orbitViewEnabledRef.current = false;
        onOrbitViewChangeRef.current(false);
      }
      // A drag past the tap slop starts in a pointermove, which React renders
      // later than a press: the frame loop must stop applying the old preset
      // at once, or it pulls the camera back before the new props arrive.
      orientationPresetRef.current = "custom";
      onOrientationChange("custom");
      container.dataset["cameraOrientation"] = "custom";
    };
    controls.addEventListener("start", handleControlStart);
    // One sunlight at a time: three culls lights by camera layers only, never
    // per mesh, so each light reaches every lit surface. The frame loop turns
    // the point light off while the focused model's shadow light is on.
    const sunlight = new PointLight(
      SUNLIGHT_COLOR,
      SOLAR_IRRADIANCE_AT_1_AU,
      0,
      2,
    );
    sunlight.name = "Sunlight direction source";
    scene.add(sunlight);
    const localModelSunlight = new DirectionalLight(
      SUNLIGHT_COLOR,
      SOLAR_IRRADIANCE_AT_1_AU,
    );
    localModelSunlight.name = "Focused model solar shadow light";
    localModelSunlight.castShadow = true;
    localModelSunlight.shadow.mapSize.set(
      LOCAL_SHADOW_MAP_SIZE,
      LOCAL_SHADOW_MAP_SIZE,
    );
    localModelSunlight.shadow.bias = -0.00002;
    applyCameraRelativeDirectionalShadows(localModelSunlight, camera);
    localModelSunlight.visible = false;
    scene.add(localModelSunlight);
    scene.add(localModelSunlight.target);
    container.dataset["solarIlluminationModel"] = "inverse-square";

    const starGeometry = new BufferGeometry();
    const starCount = hipparcosStarSnapshot.stars.length;
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    const starSizes = new Float32Array(starCount);
    const starOpacities = new Float32Array(starCount);
    for (const [index, star] of hipparcosStarSnapshot.stars.entries()) {
      const color = starDisplayColor(star.colorIndexBv);
      starColors[index * 3] = color[0];
      starColors[index * 3 + 1] = color[1];
      starColors[index * 3 + 2] = color[2];
      starSizes[index] = starDisplaySizeCssPixels(star.visualMagnitude);
      starOpacities[index] = starDisplayOpacity(star.visualMagnitude);
    }
    const starPositionAttribute = new BufferAttribute(starPositions, 3);
    starPositionAttribute.setUsage(DynamicDrawUsage);
    starGeometry.setAttribute("position", starPositionAttribute);
    starGeometry.setAttribute("starColor", new BufferAttribute(starColors, 3));
    starGeometry.setAttribute("pointSize", new BufferAttribute(starSizes, 1));
    starGeometry.setAttribute(
      "pointOpacity",
      new BufferAttribute(starOpacities, 1),
    );
    const starMaterial = new ShaderMaterial({
      uniforms: {
        pixelRatio: { value: renderer.getPixelRatio() },
      },
      vertexShader: `
        attribute vec3 starColor;
        attribute float pointSize;
        attribute float pointOpacity;
        uniform float pixelRatio;
        varying vec3 vStarColor;
        varying float vPointOpacity;
        void main() {
          vStarColor = starColor;
          vPointOpacity = pointOpacity;
          gl_PointSize = pointSize * pixelRatio;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vStarColor;
        varying float vPointOpacity;
        void main() {
          float radius = length(gl_PointCoord - vec2(0.5));
          float edge = 1.0 - smoothstep(0.28, 0.5, radius);
          if (edge <= 0.0) {
            discard;
          }
          gl_FragColor = vec4(vStarColor, vPointOpacity * edge);
        }
      `,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const stars = new Points(starGeometry, starMaterial);
    stars.name = "ESA Hipparcos ICRS visible-star catalogue";
    scene.add(stars);
    let lastStarUpdateJulianYear = Number.NaN;
    const updateStarPositions = (simulationTimeSeconds: number): void => {
      const julianYear =
        SOLAR_SYSTEM_EPOCH_JULIAN_YEAR +
        simulationTimeSeconds / JULIAN_YEAR_SECONDS;
      if (
        Number.isFinite(lastStarUpdateJulianYear) &&
        Math.abs(julianYear - lastStarUpdateJulianYear) < 1 / 365.25
      ) {
        return;
      }
      for (const [index, star] of hipparcosStarSnapshot.stars.entries()) {
        const direction = starDirectionIcrs(star, julianYear);
        starPositions[index * 3] = direction[0] * STAR_SPHERE_RADIUS_AU;
        starPositions[index * 3 + 1] = direction[2] * STAR_SPHERE_RADIUS_AU;
        starPositions[index * 3 + 2] = -direction[1] * STAR_SPHERE_RADIUS_AU;
      }
      starPositionAttribute.needsUpdate = true;
      lastStarUpdateJulianYear = julianYear;
      container.dataset["starEpochJulianYear"] = julianYear.toFixed(6);
    };
    updateStarPositions(0);
    const brightStarCandidateIndexes = hipparcosStarSnapshot.stars
      .map((star, index) => ({ index, magnitude: star.visualMagnitude }))
      .sort((left, right) => left.magnitude - right.magnitude)
      .slice(0, 96)
      .map(({ index }) => index);

    const unitSphere = new SphereGeometry(1, 256, 192);
    const bodyMeshes = new Map<string, Mesh>();
    const atmosphereMeshes = new Map<string, Mesh>();
    const atmosphereMaterials = new Map<string, ShaderMaterial>();
    const surfaceMaterials = new Map<string, MeshStandardMaterial>();
    type SolarOcclusionUniforms = Readonly<{
      receiverBodyId: string;
      sunFromReceiverAu: IUniform<Vector3>;
      occluderCount: IUniform<number>;
      occluderFromReceiverAu: IUniform<Vector3[]>;
      occluderRadiusAu: IUniform<Float32Array>;
    }>;
    const eclipseSunDefinition = majorBodyById.get("sun");
    const eclipseEarthDefinition = majorBodyById.get("earth");
    if (
      eclipseSunDefinition === undefined ||
      eclipseEarthDefinition === undefined
    ) {
      throw new Error(
        "Physical lighting requires the Sun and Earth definitions",
      );
    }
    const solarOcclusionUniforms: SolarOcclusionUniforms[] = [];
    const configureSolarOcclusion = (
      material: MeshStandardMaterial,
      receiverBodyId: string,
      receiverRadiusAu: number,
    ): void => {
      const uniforms: SolarOcclusionUniforms = {
        receiverBodyId,
        sunFromReceiverAu: { value: new Vector3() },
        occluderCount: { value: 0 },
        occluderFromReceiverAu: {
          value: Array.from({ length: 8 }, () => new Vector3()),
        },
        occluderRadiusAu: { value: new Float32Array(8) },
      };
      solarOcclusionUniforms.push(uniforms);
      material.onBeforeCompile = (shader) => {
        shader.uniforms["solarSunFromReceiverAu"] = uniforms.sunFromReceiverAu;
        shader.uniforms["solarOccluderCount"] = uniforms.occluderCount;
        shader.uniforms["solarOccluderFromReceiverAu"] =
          uniforms.occluderFromReceiverAu;
        shader.uniforms["solarOccluderRadiusAu"] = uniforms.occluderRadiusAu;
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying vec3 vSolarSurfaceOffsetAu;",
          )
          .replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\nvSolarSurfaceOffsetAu = mat3(modelMatrix) * position;",
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>
uniform vec3 solarSunFromReceiverAu;
uniform int solarOccluderCount;
uniform vec3 solarOccluderFromReceiverAu[8];
uniform float solarOccluderRadiusAu[8];
varying vec3 vSolarSurfaceOffsetAu;

const float ECLIPSE_PI = 3.141592653589793;
const float ECLIPSE_SUN_RADIUS_AU = ${String(
              eclipseSunDefinition.meanRadiusM / ASTRONOMICAL_UNIT_M,
            )};
const float ECLIPSE_RECEIVER_RADIUS_AU = ${String(receiverRadiusAu)};

float eclipseDiscOverlapFraction(
  float sunRadius,
  float moonRadius,
  float separation
) {
  if (separation >= sunRadius + moonRadius) {
    return 0.0;
  }
  if (moonRadius >= separation + sunRadius) {
    return 1.0;
  }
  if (sunRadius >= separation + moonRadius) {
    return moonRadius * moonRadius / (sunRadius * sunRadius);
  }
  float separationSquared = separation * separation;
  float sunSquared = sunRadius * sunRadius;
  float moonSquared = moonRadius * moonRadius;
  float sunSector = acos(clamp(
    (separationSquared + sunSquared - moonSquared) /
      (2.0 * separation * sunRadius),
    -1.0,
    1.0
  ));
  float moonSector = acos(clamp(
    (separationSquared + moonSquared - sunSquared) /
      (2.0 * separation * moonRadius),
    -1.0,
    1.0
  ));
  float lensRoot = sqrt(max(
    0.0,
    (-separation + sunRadius + moonRadius) *
      (separation + sunRadius - moonRadius) *
      (separation - sunRadius + moonRadius) *
      (separation + sunRadius + moonRadius)
  ));
  float overlapArea =
    sunSquared * sunSector + moonSquared * moonSector - 0.5 * lensRoot;
  return clamp(overlapArea / (ECLIPSE_PI * sunSquared), 0.0, 1.0);
}

float physicalEclipseTransmission() {
  vec3 physicalSurfaceOffsetAu =
    normalize(vSolarSurfaceOffsetAu) * ECLIPSE_RECEIVER_RADIUS_AU;
  vec3 toSun = solarSunFromReceiverAu - physicalSurfaceOffsetAu;
  float sunDistance = length(toSun);
  float sunAngularRadius = asin(clamp(
    ECLIPSE_SUN_RADIUS_AU / sunDistance,
    0.0,
    1.0
  ));
  vec3 sunDirection = normalize(toSun);
  float transmission = 1.0;
  for (int index = 0; index < 8; index++) {
    if (index >= solarOccluderCount) break;
    vec3 toOccluder =
      solarOccluderFromReceiverAu[index] - physicalSurfaceOffsetAu;
    float occluderDistance = length(toOccluder);
    float occluderAngularRadius = asin(clamp(
      solarOccluderRadiusAu[index] / occluderDistance,
      0.0,
      1.0
    ));
    float angularSeparation = acos(clamp(
      dot(sunDirection, normalize(toOccluder)),
      -1.0,
      1.0
    ));
    transmission *= 1.0 - eclipseDiscOverlapFraction(
      sunAngularRadius,
      occluderAngularRadius,
      angularSeparation
    );
  }
  return clamp(transmission, 0.0, 1.0);
}`,
          )
          .replace(
            "#include <emissivemap_fragment>",
            `#include <emissivemap_fragment>
${
  receiverBodyId === "earth"
    ? `float solarSurfaceCosine = dot(
  normalize(vSolarSurfaceOffsetAu),
  normalize(solarSunFromReceiverAu)
);
totalEmissiveRadiance *= 1.0 - smoothstep(-0.20, 0.15, solarSurfaceCosine);`
    : ""
}`,
          )
          .replace(
            "#include <lights_fragment_end>",
            `#include <lights_fragment_end>
float solarTransmission = physicalEclipseTransmission();
reflectedLight.directDiffuse *= solarTransmission;
reflectedLight.directSpecular *= solarTransmission;`,
          );
      };
      material.customProgramCacheKey = () =>
        "all-body-finite-solar-disc-eclipse-occlusion-v2";
      material.needsUpdate = true;
    };
    const ringVisuals = new Map<
      string,
      Readonly<{
        referenceMesh: Mesh;
        materials: readonly ShaderMaterial[];
        surfaceShadowSunDirectionLocal?: IUniform<Vector3>;
      }>
    >();
    const bodyLabels = new Map<string, HTMLButtonElement>();
    const additionalSelectableMeshes: Mesh[] = [];
    const materials: Material[] = [starMaterial];
    const geometries: BufferGeometry[] = [unitSphere, starGeometry];
    const textures: Texture[] = [];
    // A texture takes the active profile's anisotropy when it joins the
    // scene; applyVisualQuality sets them all again when the profile changes.
    const trackTexture = (texture: Texture): void => {
      if (textures.includes(texture)) {
        return;
      }
      texture.anisotropy = Math.min(
        renderer.capabilities.getMaxAnisotropy(),
        VISUAL_QUALITY_PROFILES[visualQualityRef.current]
          .textureAnisotropyLimit,
      );
      textures.push(texture);
    };
    const modelTexturesByBodyId = new Map<string, readonly Texture[]>();
    const reportModelTextureAnisotropy = (bodyId: string): void => {
      const modelTextures = modelTexturesByBodyId.get(bodyId);
      if (modelTextures === undefined) {
        throw new Error(`${bodyId} model textures are unavailable`);
      }
      container.dataset[`${bodyId.replaceAll("-", "")}ModelTextureAnisotropy`] =
        String(Math.min(...modelTextures.map((texture) => texture.anisotropy)));
    };

    const eclipseShadowGroup = new Group();
    eclipseShadowGroup.name = "Calculated lunar shadow on Earth";
    eclipseShadowGroup.visible = false;
    scene.add(eclipseShadowGroup);
    const eclipseShadowLocator = document.createElement("span");
    eclipseShadowLocator.className = "eclipse-shadow-locator";
    eclipseShadowLocator.textContent = "Umbra";
    eclipseShadowLocator.hidden = true;
    labelLayer.append(eclipseShadowLocator);
    const eclipseShadowLeftEarth = document.createElement("p");
    eclipseShadowLeftEarth.className = "eclipse-shadow-status";
    eclipseShadowLeftEarth.setAttribute("role", "status");
    eclipseShadowLeftEarth.textContent =
      "The Moon's dark shadow is not on Earth now";
    eclipseShadowLeftEarth.hidden = true;
    labelLayer.append(eclipseShadowLeftEarth);

    // An easter egg near the focused or selected body shows its label as a
    // hidden surprise, unless that body hides it from the camera. Tour steps
    // never hint: the label list is undefined only while no step is active.
    const easterEggHintVisible = (
      eggId: EasterEggId,
      eggPosition: Vector3,
    ): boolean => {
      if (spacecraftLabelBodyIdsRef.current !== undefined) {
        return false;
      }
      for (const hintBodyId of easterEgg(eggId).hintBodyIds) {
        if (
          focusBodyIdRef.current !== hintBodyId &&
          selectedBodyIdRef.current !== hintBodyId
        ) {
          continue;
        }
        const hintMesh = bodyMeshes.get(hintBodyId);
        if (hintMesh === undefined) {
          throw new Error(`Easter egg hint body ${hintBodyId} is unavailable`);
        }
        if (
          segmentClearsSphere(
            camera.position,
            eggPosition,
            hintMesh.position,
            hintMesh.scale.x,
          )
        ) {
          return true;
        }
      }
      return false;
    };
    // The real name appears once the child has selected the egg.
    const nameEasterEggLabel = (
      label: HTMLButtonElement,
      eggId: EasterEggId,
      name: string,
    ): void => {
      const found = foundEasterEggIdsRef.current.has(eggId);
      const text = found ? name : HIDDEN_SURPRISE_LABEL;
      if (label.textContent !== text) {
        label.textContent = text;
        label.classList.toggle("is-hidden-surprise", !found);
      }
    };

    const monolithGeometry = new BoxGeometry(
      JOVIAN_MONOLITH_DIMENSIONS_M.thickness / ASTRONOMICAL_UNIT_M,
      JOVIAN_MONOLITH_DIMENSIONS_M.length / ASTRONOMICAL_UNIT_M,
      JOVIAN_MONOLITH_DIMENSIONS_M.width / ASTRONOMICAL_UNIT_M,
    );
    const monolithMaterial = new MeshStandardMaterial({
      color: 0x020303,
      roughness: 0.28,
      metalness: 0.16,
    });
    const monolithMesh = new Mesh(monolithGeometry, monolithMaterial);
    monolithMesh.name = JOVIAN_MONOLITH_NAME;
    monolithMesh.userData["bodyId"] = JOVIAN_MONOLITH_BODY_ID;
    monolithMesh.visible = false;
    bodyMeshes.set(JOVIAN_MONOLITH_BODY_ID, monolithMesh);
    scene.add(monolithMesh);
    geometries.push(monolithGeometry);
    materials.push(monolithMaterial);

    const monolithLabel = document.createElement("button");
    monolithLabel.type = "button";
    monolithLabel.className = "body-label";
    monolithLabel.textContent = JOVIAN_MONOLITH_NAME;
    monolithLabel.dataset["bodyId"] = JOVIAN_MONOLITH_BODY_ID;
    monolithLabel.title = LABEL_TITLE;
    monolithLabel.addEventListener("click", () =>
      pickBody(JOVIAN_MONOLITH_BODY_ID),
    );
    monolithLabel.hidden = true;
    labelLayer.append(monolithLabel);
    bodyLabels.set(JOVIAN_MONOLITH_BODY_ID, monolithLabel);
    const monolithMarker = document.createElement("span");
    monolithMarker.className = "orrery-marker";
    monolithMarker.hidden = true;
    markerLayer.append(monolithMarker);
    bodyMarkers.set(JOVIAN_MONOLITH_BODY_ID, monolithMarker);
    container.dataset["jovianMonolithPhysics"] =
      "display-only-jupiter-io-l1-no-gravity";
    container.dataset["jovianMonolithDimensionsM"] = [
      JOVIAN_MONOLITH_DIMENSIONS_M.thickness,
      JOVIAN_MONOLITH_DIMENSIONS_M.width,
      JOVIAN_MONOLITH_DIMENSIONS_M.length,
    ]
      .map((value) => value.toFixed(3))
      .join(",");

    const discoveryOneGroup = new Group();
    discoveryOneGroup.name = "Discovery One licensed model anchor";
    discoveryOneGroup.visible = false;
    scene.add(discoveryOneGroup);
    const discoveryOneLabel = document.createElement("button");
    discoveryOneLabel.type = "button";
    discoveryOneLabel.className = "body-label fictional-object-label";
    discoveryOneLabel.textContent = DISCOVERY_ONE_NAME;
    discoveryOneLabel.dataset["bodyId"] = DISCOVERY_ONE_BODY_ID;
    discoveryOneLabel.title = LABEL_TITLE;
    discoveryOneLabel.addEventListener("click", () =>
      pickBody(DISCOVERY_ONE_BODY_ID),
    );
    discoveryOneLabel.hidden = true;
    labelLayer.append(discoveryOneLabel);
    const discoveryOneMarker = document.createElement("span");
    discoveryOneMarker.className = "orrery-marker";
    discoveryOneMarker.hidden = true;
    markerLayer.append(discoveryOneMarker);
    container.dataset["discoveryOneVisualModel"] =
      "cc-by-sketchfab-licensed-glb";
    container.dataset["discoveryOnePhysics"] =
      "authored-massless-circular-two-body-orbit-around-io";

    const fictionalOrbiterGroups = new Map<string, Group>();
    const fictionalOrbiterLabels = new Map<string, HTMLButtonElement>();
    const fictionalOrbiterMarkers = new Map<string, HTMLSpanElement>();
    // Bodies whose on-demand 3D model is in the scene. Until then an Orrery
    // marker stays, so a focused object never shows only a label.
    const loadedModelBodyIds = new Set<string>();
    // Death Star I is built, and its textures requested, only when the frame
    // loop first needs to draw it.
    const ensureDeathStarModel = (): void => {
      if (loadedModelBodyIds.has("death-star-1")) {
        return;
      }
      const orbiter = fictionalOrbiterById.get("death-star-1");
      const anchor = fictionalOrbiterGroups.get("death-star-1");
      if (orbiter === undefined || anchor === undefined) {
        throw new Error("Death Star I scene objects are unavailable");
      }
      loadedModelBodyIds.add("death-star-1");
      const model = createDeathStarModel(orbiter, (url) => {
        onGpuError(
          `Fictional model texture ${url} failed to load for ${orbiter.name}`,
        );
      });
      anchor.add(model);
      model.traverse((object) => {
        if (object.type === "Mesh") {
          const modelMesh = object as Mesh;
          additionalSelectableMeshes.push(modelMesh);
          geometries.push(modelMesh.geometry);
          const objectMaterials = Array.isArray(modelMesh.material)
            ? modelMesh.material
            : [modelMesh.material];
          materials.push(...objectMaterials);
          for (const material of objectMaterials) {
            for (const propertyName of Object.keys(material)) {
              const value: unknown = Reflect.get(material, propertyName);
              if (value instanceof Texture) {
                trackTexture(value as Texture);
              }
            }
          }
        }
      });
    };
    for (const orbiter of FICTIONAL_ORBITERS) {
      const group = new Group();
      const visualSource =
        orbiter.id === "death-star-2"
          ? "cc-by-sketchfab-pbr-glb"
          : DEATH_STAR_MODEL_VISUAL_SOURCE;
      group.name = `${orbiter.name} model anchor`;
      group.userData["visualSource"] = visualSource;
      group.visible = false;
      scene.add(group);
      fictionalOrbiterGroups.set(orbiter.id, group);
      container.dataset[`${orbiter.id.replaceAll("-", "")}VisualModel`] =
        visualSource;
      const label = document.createElement("button");
      label.type = "button";
      label.className = "body-label fictional-object-label";
      label.textContent = orbiter.name;
      label.dataset["bodyId"] = orbiter.id;
      label.title = LABEL_TITLE;
      label.addEventListener("click", () => pickBody(orbiter.id));
      label.hidden = true;
      labelLayer.append(label);
      fictionalOrbiterLabels.set(orbiter.id, label);
      const marker = document.createElement("span");
      marker.className = "orrery-marker";
      marker.hidden = true;
      markerLayer.append(marker);
      fictionalOrbiterMarkers.set(orbiter.id, marker);
    }
    container.dataset["fictionalOrbiterPhysics"] =
      "hypothetical-massless-two-body-no-gravity-backreaction";
    container.dataset["fictionalOrbiterCount"] = String(
      FICTIONAL_ORBITERS.length,
    );

    const deepSpaceNineGroups = new Map<string, Group>();
    const deepSpaceNineLabels = new Map<string, HTMLButtonElement>();
    const deepSpaceNineMarkers = new Map<string, HTMLSpanElement>();
    for (const object of DEEP_SPACE_NINE_OBJECTS) {
      const group = new Group();
      group.name = `${object.name} licensed model anchor`;
      group.visible = false;
      scene.add(group);
      deepSpaceNineGroups.set(object.id, group);
      const label = document.createElement("button");
      label.type = "button";
      label.className = "body-label fictional-object-label";
      label.textContent = object.name;
      label.dataset["bodyId"] = object.id;
      label.title = LABEL_TITLE;
      label.addEventListener("click", () => pickBody(object.id));
      label.hidden = true;
      labelLayer.append(label);
      deepSpaceNineLabels.set(object.id, label);
      const marker = document.createElement("span");
      marker.className = "orrery-marker";
      marker.hidden = true;
      markerLayer.append(marker);
      deepSpaceNineMarkers.set(object.id, marker);
    }
    container.dataset["deepSpaceNinePresentation"] =
      "licensed-models-hypothetical-jovian-exhibit";
    container.dataset["ussDefiantMotion"] =
      "explicit-fictional-scripted-defence-patrol-no-invented-gravity";

    const zodiacGroup = new Group();
    zodiacGroup.name = "Tropical zodiac reference on the J2000 ecliptic";
    zodiacGroup.visible = false;
    scene.add(zodiacGroup);
    const zodiacCirclePositions = new Float32Array(360 * 3);
    for (let longitudeDeg = 0; longitudeDeg < 360; longitudeDeg += 1) {
      const [x, y, z] = eclipticDirection(longitudeDeg);
      const direction = j2000EclipticToScene({ x, y, z }).multiplyScalar(
        ZODIAC_SPHERE_RADIUS_AU,
      );
      const offset = longitudeDeg * 3;
      zodiacCirclePositions[offset] = direction.x;
      zodiacCirclePositions[offset + 1] = direction.y;
      zodiacCirclePositions[offset + 2] = direction.z;
    }
    const zodiacCircleGeometry = new BufferGeometry();
    zodiacCircleGeometry.setAttribute(
      "position",
      new BufferAttribute(zodiacCirclePositions, 3),
    );
    const zodiacMaterial = new LineBasicMaterial({
      color: 0xd8b770,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      toneMapped: false,
    });
    const zodiacCircle = new LineLoop(zodiacCircleGeometry, zodiacMaterial);
    zodiacCircle.name = "Twelve-sign tropical zodiac ecliptic circle";
    zodiacGroup.add(zodiacCircle);

    const zodiacTickPositions = new Float32Array(
      TROPICAL_ZODIAC_SIGNS.length * 2 * 3,
    );
    for (const [index, sign] of TROPICAL_ZODIAC_SIGNS.entries()) {
      const [innerX, innerY, innerZ] = eclipticSkyDirection(
        sign.startLongitudeDeg,
        -10,
      );
      const [outerX, outerY, outerZ] = eclipticSkyDirection(
        sign.startLongitudeDeg,
        10,
      );
      const inner = j2000EclipticToScene({
        x: innerX,
        y: innerY,
        z: innerZ,
      }).multiplyScalar(ZODIAC_SPHERE_RADIUS_AU);
      const outer = j2000EclipticToScene({
        x: outerX,
        y: outerY,
        z: outerZ,
      }).multiplyScalar(ZODIAC_SPHERE_RADIUS_AU);
      const offset = index * 6;
      zodiacTickPositions.set([inner.x, inner.y, inner.z], offset);
      zodiacTickPositions.set([outer.x, outer.y, outer.z], offset + 3);
    }
    const zodiacTickGeometry = new BufferGeometry();
    zodiacTickGeometry.setAttribute(
      "position",
      new BufferAttribute(zodiacTickPositions, 3),
    );
    const zodiacTicks = new LineSegments(zodiacTickGeometry, zodiacMaterial);
    zodiacTicks.name = "Tropical zodiac thirty-degree boundaries";
    zodiacGroup.add(zodiacTicks);
    const zodiacLabels = TROPICAL_ZODIAC_SIGNS.map((sign, index) => {
      const [x, y, z] = eclipticSkyDirection(
        sign.centreLongitudeDeg,
        index % 2 === 0 ? 14 : -14,
      );
      const label = document.createElement("span");
      label.className = "zodiac-label";
      label.textContent = `${sign.glyph}\uFE0E ${sign.name}`;
      label.dataset["zodiacSign"] = sign.name;
      label.setAttribute("aria-hidden", "true");
      label.hidden = true;
      container.append(label);
      return {
        element: label,
        direction: j2000EclipticToScene({ x, y, z }).normalize(),
      };
    });
    const zodiacLegend = document.createElement("div");
    zodiacLegend.className = "zodiac-legend";
    zodiacLegend.setAttribute("aria-label", "Twelve tropical zodiac signs");
    const zodiacLegendTitle = document.createElement("strong");
    zodiacLegendTitle.textContent = "ZODIAC SKY REFERENCE";
    zodiacLegend.append(zodiacLegendTitle);
    const zodiacLegendSigns = document.createElement("div");
    for (const sign of TROPICAL_ZODIAC_SIGNS) {
      const item = document.createElement("span");
      item.textContent = `${sign.glyph}\uFE0E ${sign.name}`;
      zodiacLegendSigns.append(item);
    }
    zodiacLegend.append(zodiacLegendSigns);
    zodiacLegend.hidden = true;
    container.append(zodiacLegend);
    geometries.push(zodiacCircleGeometry, zodiacTickGeometry);
    materials.push(zodiacMaterial);
    container.dataset["zodiacReference"] =
      "tropical-twelve-equal-signs-on-j2000-ecliptic";
    container.dataset["zodiacSignCount"] = String(TROPICAL_ZODIAC_SIGNS.length);
    container.dataset["zodiacSolarSystemParallax"] =
      "negligible-at-display-scale";

    const alphaCentauri = hipparcosStarSnapshot.stars.find(
      (star) => star.hipId === 71_683,
    );
    if (alphaCentauri === undefined) {
      throw new Error("Alpha Centauri is missing from the Hipparcos snapshot");
    }
    const alphaDirectionIcrs = starDirectionIcrs(alphaCentauri, 2000);
    const alphaCentauriOffset = new Vector3(
      alphaDirectionIcrs[0],
      alphaDirectionIcrs[2],
      -alphaDirectionIcrs[1],
    ).multiplyScalar(ALPHA_CENTAURI_DISTANCE_AU);
    const deepSpaceGroup = new Group();
    deepSpaceGroup.name = "Solar outer regions and Alpha Centauri scale";
    scene.add(deepSpaceGroup);
    const makeBoundarySphere = (
      radiusAu: number,
      color: number,
      opacity: number,
    ): Mesh => {
      const geometry = new SphereGeometry(radiusAu, 64, 40);
      const tint = new Color(color);
      const material = new ShaderMaterial({
        uniforms: {
          boundaryColor: { value: tint },
          boundaryOpacity: { value: opacity },
        },
        vertexShader: `
          varying vec3 vNormalView;
          varying vec3 vViewDirection;
          void main() {
            vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
            vNormalView = normalize(normalMatrix * normal);
            vViewDirection = normalize(-viewPosition.xyz);
            gl_Position = projectionMatrix * viewPosition;
          }
        `,
        fragmentShader: `
          uniform vec3 boundaryColor;
          uniform float boundaryOpacity;
          varying vec3 vNormalView;
          varying vec3 vViewDirection;
          void main() {
            float rim = pow(1.0 - abs(dot(vNormalView, vViewDirection)), 3.2);
            float alpha = boundaryOpacity * (0.08 + rim * 0.92);
            gl_FragColor = vec4(boundaryColor, alpha);
          }
        `,
        side: DoubleSide,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      });
      const sphere = new Mesh(geometry, material);
      deepSpaceGroup.add(sphere);
      geometries.push(geometry);
      materials.push(material);
      return sphere;
    };
    const terminationShock = makeBoundarySphere(90, 0x64b5df, 0.16);
    terminationShock.name = "Approximate termination shock";
    const heliopause = makeBoundarySphere(120, 0x7cd6ff, 0.32);
    heliopause.name = "Approximate heliopause";
    const innerOortBoundary = makeBoundarySphere(
      OORT_CLOUD_INNER_MIN_AU,
      0x8fa8d7,
      0.12,
    );
    const outerOortBoundary = makeBoundarySphere(
      OORT_CLOUD_OUTER_MAX_AU,
      0xaebde8,
      0.2,
    );
    const oortPositions = new Float32Array(8_000 * 3);
    const deterministicUnit = (seed: number): number => {
      const value = Math.sin(seed * 12.9898 + 78.233) * 43_758.5453;
      return value - Math.floor(value);
    };
    for (let index = 0; index < 8_000; index += 1) {
      const unit = deterministicUnit(index * 3 + 1);
      const radius =
        OORT_CLOUD_INNER_MIN_AU +
        Math.cbrt(unit) * (OORT_CLOUD_OUTER_MAX_AU - OORT_CLOUD_INNER_MIN_AU);
      const z = 1 - 2 * deterministicUnit(index * 3 + 2);
      const angle = deterministicUnit(index * 3 + 3) * Math.PI * 2;
      const radial = Math.sqrt(1 - z * z);
      oortPositions[index * 3] = radius * radial * Math.cos(angle);
      oortPositions[index * 3 + 1] = radius * z;
      oortPositions[index * 3 + 2] = radius * radial * Math.sin(angle);
    }
    const oortGeometry = new BufferGeometry();
    oortGeometry.setAttribute(
      "position",
      new BufferAttribute(oortPositions, 3),
    );
    const oortMaterial = new PointsMaterial({
      color: 0xaec6ee,
      size: 0.85,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
      toneMapped: false,
    });
    const oortCloud = new Points(oortGeometry, oortMaterial);
    oortCloud.name = "Illustrative Oort Cloud population";
    deepSpaceGroup.add(oortCloud);
    geometries.push(oortGeometry);
    materials.push(oortMaterial);
    const alphaGeometry = new BufferGeometry();
    alphaGeometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(alphaCentauriOffset.toArray()), 3),
    );
    const alphaMaterial = new PointsMaterial({
      color: 0xffe2aa,
      size: 9,
      sizeAttenuation: false,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      toneMapped: false,
    });
    const alphaMarker = new Points(alphaGeometry, alphaMaterial);
    alphaMarker.name = "Alpha Centauri Hipparcos locator";
    deepSpaceGroup.add(alphaMarker);
    geometries.push(alphaGeometry);
    materials.push(alphaMaterial);
    const surfaceHorizonGeometry = new BufferGeometry();
    const surfaceHorizonPositions = new Float32Array(96 * 3);
    const surfaceHorizonPositionAttribute = new BufferAttribute(
      surfaceHorizonPositions,
      3,
    );
    surfaceHorizonPositionAttribute.setUsage(DynamicDrawUsage);
    surfaceHorizonGeometry.setAttribute(
      "position",
      surfaceHorizonPositionAttribute,
    );
    const surfaceHorizonMaterial = new LineBasicMaterial({
      color: 0x9bd7ff,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    const surfaceHorizon = new LineLoop(
      surfaceHorizonGeometry,
      surfaceHorizonMaterial,
    );
    surfaceHorizon.name = "Geometric surface horizon guide";
    surfaceHorizon.visible = false;
    scene.add(surfaceHorizon);
    geometries.push(surfaceHorizonGeometry);
    materials.push(surfaceHorizonMaterial);
    const compassLabels = new Map<number, HTMLSpanElement>();
    for (const [azimuthDeg, labelText] of [
      [0, "N"],
      [90, "E"],
      [180, "S"],
      [270, "W"],
    ] as const) {
      const label = document.createElement("span");
      label.className = "surface-compass-label";
      label.textContent = labelText;
      label.hidden = true;
      labelLayer.append(label);
      compassLabels.set(azimuthDeg, label);
    }
    const textureLoader = new TextureLoader();
    const loadedTextures = new WeakSet<Texture>();
    const textureRequestedBodyIds = new Set<string>();
    const loadedSurfaceAssetBodyIds = new Set<string>();
    const loadTexture = (
      url: string,
      isColor: boolean,
      onLoad?: () => void,
      onError?: () => void,
    ): Texture => {
      const texture = textureLoader.load(
        url,
        (loadedTexture) => {
          loadedTextures.add(loadedTexture);
          onLoad?.();
        },
        undefined,
        onError,
      );
      if (isColor) {
        texture.colorSpace = SRGBColorSpace;
      }
      trackTexture(texture);
      return texture;
    };

    let solarCoronaMaterial: ShaderMaterial | undefined;
    let solarCoronaMesh: Mesh | undefined;
    let earthCloudMaterial: MeshStandardMaterial | undefined;

    const atmospherePresentations: Readonly<
      Record<
        string,
        Readonly<{
          rayleighColor: number;
          mieColor: number;
          rayleighStrength: number;
          mieStrength: number;
          mieG: number;
        }>
      >
    > = {
      earth: {
        rayleighColor: 0x4e9cff,
        mieColor: 0xffd5ad,
        rayleighStrength: 0.42,
        mieStrength: 0.1,
        mieG: 0.74,
      },
      venus: {
        rayleighColor: 0xf1d8ab,
        mieColor: 0xffb56f,
        rayleighStrength: 0.32,
        mieStrength: 0.28,
        mieG: 0.8,
      },
      mars: {
        rayleighColor: 0xc98262,
        mieColor: 0xf0ad72,
        rayleighStrength: 0.12,
        mieStrength: 0.16,
        mieG: 0.72,
      },
      jupiter: {
        rayleighColor: 0xd9c4a8,
        mieColor: 0xffe3bd,
        rayleighStrength: 0.09,
        mieStrength: 0.08,
        mieG: 0.68,
      },
      saturn: {
        rayleighColor: 0xe1cca4,
        mieColor: 0xffe5b6,
        rayleighStrength: 0.1,
        mieStrength: 0.09,
        mieG: 0.7,
      },
      uranus: {
        rayleighColor: 0x91dfe7,
        mieColor: 0xd8fbff,
        rayleighStrength: 0.13,
        mieStrength: 0.05,
        mieG: 0.65,
      },
      neptune: {
        rayleighColor: 0x4b78e8,
        mieColor: 0xb5ceff,
        rayleighStrength: 0.15,
        mieStrength: 0.05,
        mieG: 0.66,
      },
      titan: {
        rayleighColor: 0xc78643,
        mieColor: 0xf3a24c,
        rayleighStrength: 0.1,
        mieStrength: 0.34,
        mieG: 0.82,
      },
    };

    for (const body of majorBodySnapshot.bodies) {
      const asset = nasaTextureByBodyId.get(body.id);
      const materialPresentation = nasaMaterialPresentationByBodyId.get(
        body.id,
      );
      let material: Material;
      if (body.type === "star") {
        const { centreLinearSrgb, limbDarkeningU, limbDarkeningV } =
          solarPhotosphere;
        material = new ShaderMaterial({
          uniforms: {
            centreLinearSrgb: { value: new Vector3(...centreLinearSrgb) },
            limbDarkeningU: { value: new Vector3(...limbDarkeningU) },
            limbDarkeningV: { value: new Vector3(...limbDarkeningV) },
          },
          vertexShader: `
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            void main() {
              vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
              vNormal = normalize(normalMatrix * normal);
              vViewPosition = viewPosition.xyz;
              gl_Position = projectionMatrix * viewPosition;
            }
          `,
          // Allen's law per linear sRGB channel, from the derived photosphere
          // (scripts/derive-solar-photosphere.mjs): the limb is darker and
          // redder, and the whole disc adds up to the effective-temperature
          // blackbody.
          // No measured granule map exists for an arbitrary time, so the disc
          // draws none; in the tour view a granule is about a fifth of a pixel.
          fragmentShader: `
            uniform vec3 centreLinearSrgb;
            uniform vec3 limbDarkeningU;
            uniform vec3 limbDarkeningV;
            varying vec3 vNormal;
            varying vec3 vViewPosition;

            void main() {
              float mu = clamp(
                dot(normalize(vNormal), normalize(-vViewPosition)),
                0.0,
                1.0
              );
              vec3 darkening = 1.0 - limbDarkeningU - limbDarkeningV +
                limbDarkeningU * mu + limbDarkeningV * mu * mu;
              gl_FragColor = vec4(centreLinearSrgb * darkening, 1.0);
              #include <colorspace_fragment>
            }
          `,
          toneMapped: false,
        });
      } else {
        const surfaceMaterial = new MeshStandardMaterial({
          color:
            asset !== undefined
              ? 0xffffff
              : (materialPresentation?.color ?? 0x9a9a9a),
          roughness: body.type === "moon" ? 0.92 : 0.74,
          metalness: 0,
        });
        configureSolarOcclusion(
          surfaceMaterial,
          body.id,
          body.meanRadiusM / ASTRONOMICAL_UNIT_M,
        );
        surfaceMaterials.set(body.id, surfaceMaterial);
        material = surfaceMaterial;
      }
      materials.push(material);
      const mesh = new Mesh(unitSphere, material);
      mesh.name = body.name;
      mesh.userData["bodyId"] = body.id;
      bodyMeshes.set(body.id, mesh);
      scene.add(mesh);

      if (body.type === "star") {
        const chromosphereMaterial = new ShaderMaterial({
          uniforms: {
            glowColor: { value: new Color(0xffb066) },
          },
          vertexShader: `
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            void main() {
              vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
              vNormal = normalize(normalMatrix * normal);
              vViewPosition = viewPosition.xyz;
              gl_Position = projectionMatrix * viewPosition;
            }
          `,
          fragmentShader: `
            uniform vec3 glowColor;
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            void main() {
              float rim = pow(1.0 - max(dot(vNormal, normalize(-vViewPosition)), 0.0), 5.0);
              gl_FragColor = vec4(glowColor, rim * 0.075);
            }
          `,
          transparent: true,
          blending: AdditiveBlending,
          depthWrite: false,
        });
        materials.push(chromosphereMaterial);
        const chromosphere = new Mesh(unitSphere, chromosphereMaterial);
        chromosphere.name = "Sun chromosphere presentation rim";
        chromosphere.userData["bodyId"] = body.id;
        chromosphere.scale.setScalar(1.018);
        mesh.add(chromosphere);

        const coronaMaterial = new ShaderMaterial({
          uniforms: {
            opacity: {
              value:
                VISUAL_QUALITY_PROFILES[visualQualityRef.current].coronaOpacity,
            },
            cameraPositionLocal: { value: new Vector3(0, 0, 8) },
          },
          vertexShader: `
            varying vec3 vLocalPosition;
            void main() {
              vLocalPosition = position;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform float opacity;
            uniform vec3 cameraPositionLocal;
            varying vec3 vLocalPosition;

            void main() {
              vec3 rayDirection = normalize(vLocalPosition - cameraPositionLocal);
              float closestDistance = max(
                0.0,
                -dot(cameraPositionLocal, rayDirection)
              );
              vec3 closestPoint =
                cameraPositionLocal + rayDirection * closestDistance;
              const float photosphereRadius = 0.3125;
              float radius = length(closestPoint) / photosphereRadius;
              if (radius < 0.985 || radius > 3.15) discard;

              vec3 direction = normalize(closestPoint);
              float azimuth = atan(direction.z, direction.x);
              float latitude = abs(direction.y);
              float polarStreamer = pow(latitude, 1.8) * 1.35;
              float equatorialSheet =
                exp(-pow(latitude / 0.22, 2.0)) * 0.48;
              float broadStreamers = pow(
                0.5 + 0.5 * sin(azimuth * 5.0 + sin(azimuth * 3.0) * 1.2),
                1.8
              );
              float fineStreamers =
                0.82 + 0.18 * sin(azimuth * 17.0 + radius * 5.5);
              float radialFalloff = pow(radius, -3.65);
              float outerFade = 1.0 - smoothstep(2.45, 3.15, radius);
              float density = radialFalloff * outerFade *
                (0.34 + polarStreamer + equatorialSheet + broadStreamers * 0.32) *
                fineStreamers;
              float alpha = clamp(density * opacity * 1.35, 0.0, 0.82);
              if (alpha < 0.001) discard;
              vec3 electronScattering = mix(
                vec3(1.0, 0.88, 0.70),
                vec3(0.78, 0.88, 1.0),
                smoothstep(1.0, 2.8, radius)
              );
              gl_FragColor = vec4(electronScattering * alpha, alpha);
            }
          `,
          transparent: true,
          blending: AdditiveBlending,
          depthWrite: false,
          depthTest: true,
          toneMapped: false,
          side: DoubleSide,
        });
        solarCoronaMaterial = coronaMaterial;
        materials.push(coronaMaterial);
        const corona = new Mesh(unitSphere, coronaMaterial);
        corona.name = "Sun electron-scattering corona shell";
        corona.userData["bodyId"] = body.id;
        corona.scale.setScalar(3.2);
        corona.renderOrder = -1;
        mesh.add(corona);
        solarCoronaMesh = corona;

        container.dataset["solarPresentation"] =
          "physical-limb-darkening-and-corona-scattering";
        container.dataset["solarPhotosphere"] =
          "blackbody-colour-allen-limb-darkening";
        container.dataset["solarCoronaLayers"] = "3d-shell";
        container.dataset["solarProminenceCount"] = "0";
      }

      const label = document.createElement("button");
      label.type = "button";
      label.className = "body-label";
      label.textContent = body.name;
      // The frame loop shows the label once a physics state places the body.
      label.hidden = true;
      label.dataset["bodyId"] = body.id;
      label.title = LABEL_TITLE;
      label.addEventListener("click", () => pickBody(body.id));
      label.dataset["surfaceAssetState"] =
        body.type === "star"
          ? "derived"
          : asset !== undefined
            ? "pending"
            : materialPresentation !== undefined
              ? "material"
              : "neutral";
      labelLayer.append(label);
      bodyLabels.set(body.id, label);

      const atmospherePresentation = atmospherePresentations[body.id];
      if (atmospherePresentation !== undefined) {
        const atmosphereMaterial = new ShaderMaterial({
          uniforms: {
            rayleighColor: {
              value: new Color(atmospherePresentation.rayleighColor),
            },
            mieColor: { value: new Color(atmospherePresentation.mieColor) },
            rayleighStrength: {
              value: atmospherePresentation.rayleighStrength,
            },
            mieStrength: { value: atmospherePresentation.mieStrength },
            mieG: { value: atmospherePresentation.mieG },
            qualityStrength: {
              value:
                VISUAL_QUALITY_PROFILES[visualQualityRef.current]
                  .atmosphereStrength,
            },
            solarFlux: { value: 1 },
            eclipseTransmission: { value: 1 },
            sunDirectionLocal: { value: new Vector3(1, 0, 0) },
            cameraPositionLocal: { value: new Vector3(0, 0, 4) },
            planetRadius: {
              value:
                1 /
                (body.id === "earth"
                  ? 1.025
                  : body.type === "moon"
                    ? 1.02
                    : 1.012),
            },
          },
          vertexShader: `
            varying vec3 vAtmospherePosition;
            void main() {
              vAtmospherePosition = position;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            const float PI = 3.141592653589793;
            uniform vec3 rayleighColor;
            uniform vec3 mieColor;
            uniform float rayleighStrength;
            uniform float mieStrength;
            uniform float mieG;
            uniform float qualityStrength;
            uniform float solarFlux;
            uniform float eclipseTransmission;
            uniform vec3 sunDirectionLocal;
            uniform vec3 cameraPositionLocal;
            uniform float planetRadius;
            varying vec3 vAtmospherePosition;

            float outerSphereExit(vec3 origin, vec3 direction) {
              float projected = dot(origin, direction);
              float discriminant = projected * projected - dot(origin, origin) + 1.0;
              return max(0.0, -projected + sqrt(max(discriminant, 0.0)));
            }

            float innerSphereEntry(vec3 origin, vec3 direction) {
              float projected = dot(origin, direction);
              float discriminant =
                projected * projected - dot(origin, origin) + planetRadius * planetRadius;
              if (discriminant <= 0.0) return 1e9;
              float distance = -projected - sqrt(discriminant);
              return distance > 0.0 ? distance : 1e9;
            }

            vec2 densityAt(vec3 position) {
              float height = clamp(
                (length(position) - planetRadius) / (1.0 - planetRadius),
                0.0,
                1.0
              );
              return vec2(exp(-height * 7.5), exp(-height * 22.0));
            }

            vec2 sunOpticalDepth(vec3 origin) {
              float pathLength = outerSphereExit(origin, sunDirectionLocal);
              float stepLength = pathLength / 4.0;
              vec2 depth = vec2(0.0);
              for (int sampleIndex = 0; sampleIndex < 4; sampleIndex++) {
                float distance = (float(sampleIndex) + 0.5) * stepLength;
                depth += densityAt(origin + sunDirectionLocal * distance) * stepLength;
              }
              return depth;
            }

            void main() {
              vec3 rayDirection = normalize(vAtmospherePosition - cameraPositionLocal);
              vec3 rayOrigin = vAtmospherePosition - rayDirection * 0.0001;
              float pathLength = min(
                outerSphereExit(rayOrigin, rayDirection),
                innerSphereEntry(rayOrigin, rayDirection)
              );
              if (pathLength <= 0.0) discard;
              float stepLength = pathLength / 8.0;
              vec2 viewDepth = vec2(0.0);
              vec3 accumulated = vec3(0.0);
              float scatteringAngleCosine = dot(-rayDirection, sunDirectionLocal);
              float rayleighPhase =
                3.0 * (1.0 + scatteringAngleCosine * scatteringAngleCosine) /
                (16.0 * PI);
              float mieDenominator = max(
                1.0 + mieG * mieG - 2.0 * mieG * scatteringAngleCosine,
                0.001
              );
              float miePhase =
                (1.0 - mieG * mieG) /
                (4.0 * PI * pow(mieDenominator, 1.5));
              for (int sampleIndex = 0; sampleIndex < 8; sampleIndex++) {
                float distance = (float(sampleIndex) + 0.5) * stepLength;
                vec3 samplePosition = rayOrigin + rayDirection * distance;
                vec2 localDensity = densityAt(samplePosition);
                viewDepth += localDensity * stepLength;
                vec2 totalDepth = viewDepth + sunOpticalDepth(samplePosition);
                vec3 extinction = exp(
                  -(rayleighColor * totalDepth.x * rayleighStrength * 4.0 +
                    mieColor * totalDepth.y * mieStrength * 4.0)
                );
                vec3 scatterSource =
                  rayleighColor * localDensity.x * rayleighStrength * rayleighPhase +
                  mieColor * localDensity.y * mieStrength * min(miePhase, 2.4);
                accumulated += extinction * scatterSource * stepLength;
              }
              vec3 radiance = accumulated * solarFlux * eclipseTransmission * qualityStrength * 5.0;
              float alpha = clamp(max(radiance.r, max(radiance.g, radiance.b)), 0.0, 0.72);
              gl_FragColor = vec4(radiance, alpha);
            }
          `,
          transparent: true,
          blending: AdditiveBlending,
          depthWrite: false,
        });
        materials.push(atmosphereMaterial);
        const atmosphere = new Mesh(unitSphere, atmosphereMaterial);
        atmosphere.name = `${body.name} atmosphere visualization`;
        atmosphere.scale.setScalar(
          body.id === "earth" ? 1.025 : body.type === "moon" ? 1.02 : 1.012,
        );
        mesh.add(atmosphere);
        atmosphereMeshes.set(body.id, atmosphere);
        atmosphereMaterials.set(body.id, atmosphereMaterial);
        container.dataset["atmosphereModel"] =
          "optical-depth-ray-marched-single-scattering";
      }

      if (body.id === "saturn" || isDiscreteRingBodyId(body.id)) {
        if (body.id === "saturn" && nasaSaturnRingAsset === undefined) {
          throw new Error("Cassini Saturn ring profile is missing");
        }
        const observedRingProfile =
          body.id === "saturn" ? nasaSaturnRingAsset : undefined;
        const discreteRingSystem = isDiscreteRingBodyId(body.id)
          ? DISCRETE_RING_SYSTEMS[body.id]
          : undefined;
        const discreteRingExtent =
          discreteRingSystem === undefined
            ? undefined
            : discreteRingSystemExtent(discreteRingSystem);
        const innerRadius =
          body.id === "saturn"
            ? ringRadiusRatio(
                SATURN_MAIN_RING_INNER_RADIUS_KM,
                SATURN_EQUATORIAL_RADIUS_KM,
              )
            : ringRadiusRatio(
                discreteRingExtent?.innerRadiusKm ??
                  (() => {
                    throw new Error(`${body.name} ring extent is missing`);
                  })(),
                discreteRingSystem?.equatorialRadiusKm ??
                  (() => {
                    throw new Error(`${body.name} ring scale is missing`);
                  })(),
              );
        const outerRadius =
          body.id === "saturn"
            ? ringRadiusRatio(
                SATURN_MAIN_RING_OUTER_RADIUS_KM,
                SATURN_EQUATORIAL_RADIUS_KM,
              )
            : ringRadiusRatio(
                discreteRingExtent?.outerRadiusKm ??
                  (() => {
                    throw new Error(`${body.name} ring extent is missing`);
                  })(),
                discreteRingSystem?.equatorialRadiusKm ??
                  (() => {
                    throw new Error(`${body.name} ring scale is missing`);
                  })(),
              );
        const ringGeometry = new RingGeometry(innerRadius, outerRadius, 192);
        ringGeometry.rotateX(Math.PI / 2);
        geometries.push(ringGeometry);
        let observedRingTexture: Texture | undefined;
        if (observedRingProfile !== undefined) {
          container.dataset["saturnRingAssetState"] = "loading";
          observedRingTexture = loadTexture(
            observedRingProfile.file,
            true,
            () => {
              container.dataset["saturnRingAssetState"] = "loaded";
            },
            () => {
              container.dataset["saturnRingAssetState"] = "failed";
              onGpuError(
                `Authority ring asset ${observedRingProfile.file} failed to load for Saturn`,
              );
            },
          );
          container.dataset["saturnRingProfile"] = "Cassini PIA06175";
        }
        const ringMaterial = new ShaderMaterial({
          uniforms: {
            ringColor: {
              value: new Color(body.id === "saturn" ? 0xd9c49a : 0x9fb2b4),
            },
            innerRadius: { value: innerRadius },
            outerRadius: { value: outerRadius },
            observedRingProfile: { value: observedRingTexture ?? null },
            useObservedRingProfile: {
              value: observedRingTexture === undefined ? 0 : 1,
            },
            sunDirectionLocal: { value: new Vector3(0, 0, 1) },
            cameraPositionLocal: { value: new Vector3(0, 1, 4) },
            solarFlux: { value: 1 },
            displayExposure: { value: 1 },
            visibilityGain: { value: 1 },
            discreteRingCount: {
              value: discreteRingSystem?.rings.length ?? 0,
            },
            discreteRingCenters: {
              value: new Float32Array(
                Array.from({ length: 13 }, (_, index) => {
                  const ring = discreteRingSystem?.rings[index];
                  return ring === undefined || discreteRingSystem === undefined
                    ? 0
                    : ringRadiusRatio(
                        ring.radiusKm,
                        discreteRingSystem.equatorialRadiusKm,
                      );
                }),
              ),
            },
            discreteRingWidths: {
              value: new Float32Array(
                Array.from({ length: 13 }, (_, index) => {
                  const ring = discreteRingSystem?.rings[index];
                  return ring === undefined || discreteRingSystem === undefined
                    ? 0
                    : ringRadiusRatio(
                        ring.widthKm,
                        discreteRingSystem.equatorialRadiusKm,
                      );
                }),
              ),
            },
            discreteRingOpticalDepths: {
              value: new Float32Array(
                Array.from(
                  { length: 13 },
                  (_, index) =>
                    discreteRingSystem?.rings[index]?.opticalDepth ?? 0,
                ),
              ),
            },
          },
          vertexShader: `
            #include <common>
            #include <logdepthbuf_pars_vertex>
            varying float vRadius;
            varying vec3 vLocalPosition;
            void main() {
              vRadius = length(position.xz);
              vLocalPosition = position;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              #include <logdepthbuf_vertex>
            }
          `,
          fragmentShader: `
            #include <common>
            #include <logdepthbuf_pars_fragment>
            const float OBSERVED_ICE_LIGHT_NORMALIZATION = 1.2;
            uniform vec3 ringColor;
            uniform float innerRadius;
            uniform float outerRadius;
            uniform sampler2D observedRingProfile;
            uniform float useObservedRingProfile;
            uniform vec3 sunDirectionLocal;
            uniform vec3 cameraPositionLocal;
            uniform float solarFlux;
            uniform float displayExposure;
            uniform float visibilityGain;
            uniform int discreteRingCount;
            uniform float discreteRingCenters[13];
            uniform float discreteRingWidths[13];
            uniform float discreteRingOpticalDepths[13];
            varying float vRadius;
            varying vec3 vLocalPosition;
            void main() {
              #include <logdepthbuf_fragment>
              float normalizedRadius = (vRadius - innerRadius) / (outerRadius - innerRadius);
              float edge = smoothstep(0.0, 0.025, normalizedRadius) * (1.0 - smoothstep(0.975, 1.0, normalizedRadius));
              vec3 ringNormal = vec3(0.0, gl_FrontFacing ? 1.0 : -1.0, 0.0);
              float incidence = abs(dot(ringNormal, normalize(sunDirectionLocal)));
              float directLight = 0.08 + 0.92 * sqrt(incidence);
              vec3 rayOrigin = vec3(vLocalPosition.x, 0.0, vLocalPosition.z);
              vec3 rayDirection = normalize(sunDirectionLocal);
              float rayProjection = dot(rayOrigin, rayDirection);
              float discriminant =
                rayProjection * rayProjection - (dot(rayOrigin, rayOrigin) - 1.0);
              float planetShadow = 1.0;
              if (discriminant > 0.0) {
                float nearestHit = -rayProjection - sqrt(discriminant);
                if (nearestHit > 0.0) {
                  planetShadow = 0.045;
                }
              }
              if (useObservedRingProfile > 0.5) {
                vec3 observed = texture2D(
                  observedRingProfile,
                  vec2(clamp(normalizedRadius, 0.0, 1.0), 0.5)
                ).rgb;
                float luminance = dot(observed, vec3(0.2126, 0.7152, 0.0722));
                float opticalDensity = clamp(
                  pow(max(luminance, 0.0), 0.42) * 1.05,
                  0.0,
                  1.0
                );
                vec3 observedChromaticity = clamp(
                  observed / max(luminance, 0.004),
                  vec3(0.65),
                  vec3(1.35)
                );
                float measuredReflectance =
                  0.12 + 0.88 * opticalDensity;
                // The Cassini mosaic supplies the radial natural-colour
                // structure. Slightly reduce its photographic colour cast,
                // while retaining the measured warm ice and fine banding.
                vec3 iceAlbedo = clamp(
                  vec3(measuredReflectance) *
                    mix(vec3(1.0), observedChromaticity, 0.18) *
                    vec3(1.04, 1.015, 0.96),
                  vec3(0.0),
                  vec3(1.0)
                );
                // A rendered texel is an unresolved column of separate ice
                // particles. Dense bands scatter more light between particles;
                // sparse divisions transmit the background instead of becoming
                // opaque black paint.
                float particleScattering =
                  (0.08 + 0.18 * (1.0 - incidence)) *
                  (0.20 + 0.80 * opticalDensity);
                float illumination =
                  (directLight * planetShadow + particleScattering) *
                  solarFlux * displayExposure *
                  OBSERVED_ICE_LIGHT_NORMALIZATION;
                float viewSine = max(
                  abs(normalize(cameraPositionLocal - vLocalPosition).y),
                  0.06
                );
                float slantOpticalDepth =
                  opticalDensity / viewSine;
                float alpha =
                  smoothstep(0.001, 0.012, luminance) *
                  (1.0 - exp(-slantOpticalDepth * 1.2)) * edge;
                gl_FragColor = vec4(
                  iceAlbedo * illumination,
                  clamp(alpha, 0.0, 0.995)
                );
              } else {
                float radialPixelFootprint = max(fwidth(vRadius), 0.000001);
                float accumulatedAlpha = 0.0;
                vec3 accumulatedColor = vec3(0.0);
                for (int ringIndex = 0; ringIndex < 13; ringIndex++) {
                  if (ringIndex >= discreteRingCount) {
                    continue;
                  }
                  float ringWidth = discreteRingWidths[ringIndex];
                  float distanceFromCenter = abs(
                    vRadius - discreteRingCenters[ringIndex]
                  );
                  float radialEnvelope = 1.0 - smoothstep(
                    ringWidth * 0.5,
                    ringWidth * 0.5 + radialPixelFootprint,
                    distanceFromCenter
                  );
                  float subpixelCoverage = min(
                    1.0,
                    ringWidth / radialPixelFootprint
                  );
                  float opticalAlpha = 1.0 - exp(
                    -discreteRingOpticalDepths[ringIndex]
                  );
                  float presentationAlpha = 1.0 - exp(
                    -opticalAlpha * visibilityGain
                  );
                  float ringAlpha =
                    radialEnvelope * subpixelCoverage * presentationAlpha;
                  vec3 particleColor =
                    ${body.id === "uranus" ? "ringIndex == 11" : "false"}
                      ? vec3(0.46, 0.20, 0.16)
                      : ${body.id === "uranus" ? "ringIndex == 12" : "false"}
                        ? vec3(0.16, 0.34, 0.50)
                        : ${body.id === "uranus" ? "vec3(0.34, 0.36, 0.35)" : "vec3(0.27, 0.23, 0.19)"};
                  accumulatedColor += particleColor * ringAlpha;
                  accumulatedAlpha = 1.0 -
                    (1.0 - accumulatedAlpha) * (1.0 - ringAlpha);
                }
                if (accumulatedAlpha < 0.0000001) {
                  discard;
                }
                float particleScattering = 0.08 + 0.07 * (1.0 - incidence);
                float physicalIllumination =
                  (directLight * planetShadow + particleScattering) *
                  solarFlux * displayExposure;
                float illumination = visibilityGain > 1.0
                  ? 0.65 + 0.35 * directLight * planetShadow
                  : physicalIllumination;
                gl_FragColor = vec4(
                  accumulatedColor /
                    max(accumulatedAlpha, 0.0000001) * illumination,
                  accumulatedAlpha * edge
                );
              }
            }
          `,
          side: DoubleSide,
          transparent: true,
          depthTest: true,
          depthWrite: false,
          toneMapped: true,
        });
        materials.push(ringMaterial);
        const rings = new Mesh(ringGeometry, ringMaterial);
        rings.name =
          body.id === "saturn"
            ? "Saturn continuous Cassini-observed ring sheet"
            : `${body.name} continuous physical ring sheet`;
        rings.renderOrder = 0;
        mesh.add(rings);
        let surfaceShadowSunDirectionLocal: IUniform<Vector3> | undefined;
        if (body.id === "saturn") {
          const saturnSurfaceMaterial = surfaceMaterials.get(body.id);
          if (
            saturnSurfaceMaterial === undefined ||
            observedRingTexture === undefined
          ) {
            throw new Error(
              "Saturn ring shadow requires its surface and ring profile",
            );
          }
          surfaceShadowSunDirectionLocal = { value: new Vector3(0, 1, 0) };
          const shadowSunUniform = surfaceShadowSunDirectionLocal;
          const configureExistingSurfaceShader =
            saturnSurfaceMaterial.onBeforeCompile.bind(saturnSurfaceMaterial);
          saturnSurfaceMaterial.onBeforeCompile = (shader) => {
            configureExistingSurfaceShader(shader, renderer);
            shader.uniforms["ringShadowProfile"] = {
              value: observedRingTexture,
            };
            shader.uniforms["ringShadowSunDirectionLocal"] = shadowSunUniform;
            shader.vertexShader = shader.vertexShader
              .replace(
                "#include <common>",
                "#include <common>\nvarying vec3 vRingShadowLocalPosition;",
              )
              .replace(
                "#include <begin_vertex>",
                "#include <begin_vertex>\nvRingShadowLocalPosition = position;",
              );
            shader.fragmentShader = shader.fragmentShader
              .replace(
                "#include <common>",
                `#include <common>
uniform sampler2D ringShadowProfile;
uniform vec3 ringShadowSunDirectionLocal;
varying vec3 vRingShadowLocalPosition;

float saturnRingTransmission(vec3 surfacePosition) {
  vec3 sunDirection = normalize(ringShadowSunDirectionLocal);
  if (abs(sunDirection.y) < 0.00001) {
    return 1.0;
  }
  float rayDistance = -surfacePosition.y / sunDirection.y;
  if (rayDistance <= 0.0) {
    return 1.0;
  }
  vec3 ringPlaneIntersection =
    surfacePosition + sunDirection * rayDistance;
  float ringRadius = length(ringPlaneIntersection.xz);
  float normalizedRadius =
    (ringRadius - ${innerRadius.toFixed(9)}) /
    ${String(outerRadius - innerRadius)};
  if (normalizedRadius <= 0.0 || normalizedRadius >= 1.0) {
    return 1.0;
  }
  vec3 observed = texture2D(
    ringShadowProfile,
    vec2(clamp(normalizedRadius, 0.0, 1.0), 0.5)
  ).rgb;
  float luminance = dot(observed, vec3(0.2126, 0.7152, 0.0722));
  float opticalDensity = clamp(
    pow(max(luminance, 0.0), 0.42) * 1.05,
    0.0,
    1.0
  );
  float slantPath = 1.0 / max(abs(sunDirection.y), 0.08);
  float directTransmission = exp(
    -opticalDensity * min(slantPath, 8.0) * 0.82
  );
  return 0.38 + 0.62 * directTransmission;
}`,
              )
              .replace(
                "#include <opaque_fragment>",
                `outgoingLight *= saturnRingTransmission(
  vRingShadowLocalPosition
);
#include <opaque_fragment>`,
              );
          };
          const existingProgramCacheKey =
            saturnSurfaceMaterial.customProgramCacheKey();
          saturnSurfaceMaterial.customProgramCacheKey = () =>
            `${existingProgramCacheKey}-saturn-cassini-ring-shadow-v4`;
          saturnSurfaceMaterial.needsUpdate = true;
        }
        ringVisuals.set(body.id, {
          referenceMesh: rings,
          materials: [ringMaterial],
          ...(surfaceShadowSunDirectionLocal === undefined
            ? {}
            : { surfaceShadowSunDirectionLocal }),
        });
        if (body.id === "saturn") {
          container.dataset["saturnRingLighting"] =
            "cassini-profile-solar-incidence-mutual-shadowing-and-depth-occlusion";
          container.dataset["saturnRingExposure"] = "live-camera-exposure";
          container.dataset["saturnRingOcclusion"] =
            "continuous-sheet-against-opaque-globe-logarithmic-depth-buffer";
        } else if (
          discreteRingSystem !== undefined &&
          discreteRingExtent !== undefined
        ) {
          container.dataset[`${body.id}RingModel`] =
            body.id === "uranus"
              ? "pds-13-ring-radii-widths-optical-depths"
              : "pds-radii-widths-optical-depths";
          container.dataset[`${body.id}RingCount`] = String(
            discreteRingSystem.rings.length,
          );
          container.dataset[`${body.id}RingInnerRadiusKm`] = String(
            discreteRingExtent.innerRadiusKm,
          );
          container.dataset[`${body.id}RingOuterRadiusKm`] = String(
            discreteRingExtent.outerRadiusKm,
          );
        }
      }
    }

    const apolloSiteGroups = new Map<string, Group>();
    const moonSurfaceMesh = bodyMeshes.get("moon");
    if (moonSurfaceMesh === undefined) {
      throw new Error("Apollo surface assets require the Moon mesh");
    }
    for (const site of apolloLandingSites) {
      const siteGroup = createApolloSurfaceSiteModel(site);
      const [localX, localY, localZ] = moonFixedSurfaceUnitVector(
        site.latitudeDeg,
        site.longitudeDeg,
      );
      const surfaceNormal = new Vector3(localX, localY, localZ).normalize();
      const longitudeRad = (site.longitudeDeg * Math.PI) / 180;
      const latitudeRad = (site.latitudeDeg * Math.PI) / 180;
      const east = new Vector3(
        -Math.sin(longitudeRad),
        0,
        -Math.cos(longitudeRad),
      ).normalize();
      const north = new Vector3(
        -Math.sin(latitudeRad) * Math.cos(longitudeRad),
        Math.cos(latitudeRad),
        Math.sin(latitudeRad) * Math.sin(longitudeRad),
      ).normalize();
      siteGroup.position.copy(
        surfaceNormal.clone().multiplyScalar(1 + 0.04 / MOON_SURFACE_RADIUS_M),
      );
      siteGroup.quaternion.setFromRotationMatrix(
        new Matrix4().makeBasis(east, surfaceNormal, north.multiplyScalar(-1)),
      );
      siteGroup.visible = false;
      moonSurfaceMesh.add(siteGroup);
      apolloSiteGroups.set(site.id, siteGroup);
      siteGroup.traverse((object) => {
        if (object.type === "Mesh") {
          const modelMesh = object as Mesh;
          additionalSelectableMeshes.push(modelMesh);
          geometries.push(modelMesh.geometry);
          const objectMaterials = Array.isArray(modelMesh.material)
            ? modelMesh.material
            : [modelMesh.material];
          materials.push(...objectMaterials);
        } else if (object.type === "Line" || object.type === "LineSegments") {
          const line = object as Line;
          geometries.push(line.geometry);
          const lineMaterials = Array.isArray(line.material)
            ? line.material
            : [line.material];
          materials.push(...lineMaterials);
        }
      });
    }
    container.dataset["apolloSurfaceAssets"] =
      "physical-lm-flags-alsep-retroreflectors-lrv";
    container.dataset["apolloTraverseAuthority"] = "NASA-LROC-PDS";

    const sourcedModelGroups = new Map<string, Group>();
    const sourcedModelSelectableMeshes: Mesh[] = [];
    const sourcedModelStatus = document.createElement("span");
    sourcedModelStatus.className = "scene-error";
    sourcedModelStatus.setAttribute("role", "alert");
    sourcedModelStatus.hidden = true;
    container.append(sourcedModelStatus);
    const gltfLoader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("/draco/");
    dracoLoader.setWorkerLimit(2);
    gltfLoader.setDRACOLoader(dracoLoader);
    let modelLoadingActive = true;
    for (const asset of sourcedModelAssets) {
      const existingGroup =
        asset.bodyId === DISCOVERY_ONE_BODY_ID
          ? discoveryOneGroup
          : isFictionalOrbiterId(asset.bodyId)
            ? fictionalOrbiterGroups.get(asset.bodyId)
            : isDeepSpaceNineObjectId(asset.bodyId)
              ? deepSpaceNineGroups.get(asset.bodyId)
              : undefined;
      const group = existingGroup ?? new Group();
      group.name = `${asset.bodyId} sourced 3D model`;
      group.visible = false;
      sourcedModelGroups.set(asset.bodyId, group);
      if (existingGroup === undefined) {
        scene.add(group);
      }
    }
    const modelLoadPromises = new Map<string, Promise<void>>();
    let sourcedModelsLoadedCount = 0;
    const loadSourcedModel = (asset: (typeof sourcedModelAssets)[number]) => {
      const activePromise = modelLoadPromises.get(asset.bodyId);
      if (activePromise !== undefined) {
        return activePromise;
      }
      const group = sourcedModelGroups.get(asset.bodyId);
      if (group === undefined) {
        throw new Error(`${asset.bodyId} sourced model group is unavailable`);
      }
      const loadPromise = (async (): Promise<void> => {
        try {
          const gltf = await gltfLoader.loadAsync(asset.modelUrl);
          const model = gltf.scene;
          if (!modelLoadingActive) {
            model.traverse((object) => {
              if (object.type === "Mesh") {
                const mesh = object as Mesh;
                mesh.geometry.dispose();
                const loadedMaterials = Array.isArray(mesh.material)
                  ? mesh.material
                  : [mesh.material];
                for (const material of loadedMaterials) material.dispose();
              }
            });
            return;
          }
          model.updateMatrixWorld(true);
          const exteriorMaterialReport =
            asset.bodyId === ROADSTER_BODY_ID
              ? enforceOpaqueTwoSidedExterior(model)
              : undefined;
          const sourceBounds = new Box3().setFromObject(model);
          const sourceSize = new Vector3();
          const sourceCenter = new Vector3();
          sourceBounds.getSize(sourceSize);
          sourceBounds.getCenter(sourceCenter);
          const sourceMaximumDimension = Math.max(
            sourceSize.x,
            sourceSize.y,
            sourceSize.z,
          );
          if (
            !Number.isFinite(sourceMaximumDimension) ||
            sourceMaximumDimension <= 0
          ) {
            throw new Error(
              `${asset.bodyId} model has invalid source dimensions`,
            );
          }
          const physicalScale =
            asset.maximumDimensionM /
            ASTRONOMICAL_UNIT_M /
            sourceMaximumDimension;
          model.scale.setScalar(physicalScale);
          model.position.copy(sourceCenter).multiplyScalar(-physicalScale);
          const modelTextures: Texture[] = [];
          const litDefiantMaterials = new Set<string>();
          // Materials lit at the calibrated window level: the Defiant's, set
          // below, and the "windows" materials of the repaired Deep Space
          // Nine file (scripts/repair-model-assets.mjs).
          let litWindowMaterialCount = 0;
          model.traverse((object) => {
            object.userData["bodyId"] = asset.bodyId;
            if (object.type === "Mesh") {
              const mesh = object as Mesh;
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              sourcedModelSelectableMeshes.push(mesh);
              geometries.push(mesh.geometry);
              const loadedMaterials = Array.isArray(mesh.material)
                ? mesh.material
                : [mesh.material];
              for (const material of loadedMaterials) {
                if (
                  asset.bodyId === "death-star-2" &&
                  material instanceof MeshStandardMaterial
                ) {
                  material.emissive.set(0x000000);
                  material.emissiveIntensity = 0;
                  material.emissiveMap = null;
                  material.needsUpdate = true;
                }
                if (
                  asset.bodyId === USS_DEFIANT_BODY_ID &&
                  material instanceof MeshStandardMaterial
                ) {
                  // The Defiant's licence keeps its file unmodified, so its
                  // windows are lit here at the calibrated window level.
                  if (material.name === DEFIANT_PORTHOLE_MATERIAL) {
                    lightPaintedPortholes(material);
                    litDefiantMaterials.add(material.name);
                  } else if (material.name === DEFIANT_WINDOW_MATERIAL) {
                    setLitWindowEmissive(material);
                    litDefiantMaterials.add(material.name);
                  }
                }
                if (
                  litDefiantMaterials.has(material.name) ||
                  material.name.endsWith(" windows")
                ) {
                  litWindowMaterialCount += 1;
                }
                materials.push(material);
                for (const propertyName of Object.keys(material)) {
                  const value: unknown = Reflect.get(material, propertyName);
                  if (value instanceof Texture) {
                    const modelTexture = value as Texture;
                    // A GLB texture arrives decoded, so a later quality
                    // change may re-upload it.
                    loadedTextures.add(modelTexture);
                    trackTexture(modelTexture);
                    modelTextures.push(modelTexture);
                  }
                }
              }
            }
          });
          const datasetKey = asset.bodyId.replaceAll("-", "");
          if (asset.bodyId === USS_DEFIANT_BODY_ID) {
            for (const name of [
              DEFIANT_PORTHOLE_MATERIAL,
              DEFIANT_WINDOW_MATERIAL,
            ]) {
              if (!litDefiantMaterials.has(name)) {
                throw new Error(
                  `USS Defiant window material ${name} is missing`,
                );
              }
            }
          }
          if (litWindowMaterialCount > 0) {
            container.dataset[`${datasetKey}LitWindowMaterials`] = String(
              litWindowMaterialCount,
            );
            container.dataset[`${datasetKey}WindowLuminanceCdM2`] = String(
              LIT_WINDOW_LUMINANCE_CD_M2,
            );
          }
          if (modelTextures.length > 0) {
            modelTexturesByBodyId.set(asset.bodyId, modelTextures);
            reportModelTextureAnisotropy(asset.bodyId);
          }
          group.add(model);
          loadedModelBodyIds.add(asset.bodyId);
          container.dataset[`${asset.bodyId.replaceAll("-", "")}ModelLoaded`] =
            "true";
          if (asset.bodyId === ROADSTER_BODY_ID) {
            container.dataset["roadsterModelProvenance"] =
              "mit-spacedock-community-model";
            container.dataset["roadsterExteriorMaterials"] =
              "opaque-two-sided-depth-writing";
            container.dataset["roadsterExteriorMaterialCount"] = String(
              exteriorMaterialReport?.materialCount ?? 0,
            );
          }
          if (
            fictionalModelAssets.some((entry) => entry.bodyId === asset.bodyId)
          ) {
            container.dataset[
              `${asset.bodyId.replaceAll("-", "")}ModelProvenance`
            ] = "licensed-free-source-model";
          }
          sourcedModelsLoadedCount += 1;
          container.dataset["sourcedModelsLoaded"] = String(
            sourcedModelsLoadedCount,
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          sourcedModelStatus.hidden = false;
          sourcedModelStatus.textContent = `Sourced 3D model failed to load: ${message}`;
          container.dataset["sourcedModelError"] = message;
          throw error;
        }
      })();
      modelLoadPromises.set(asset.bodyId, loadPromise);
      return loadPromise;
    };
    // A model is requested only once its body is focused, selected, or large
    // enough on screen to draw, so the first load carries no model bytes.
    const ensureSourcedModel = (bodyId: string): void => {
      if (bodyId === "death-star-1") {
        ensureDeathStarModel();
        return;
      }
      if (modelLoadPromises.has(bodyId)) {
        return;
      }
      const asset = sourcedModelAssetByBodyId.get(bodyId);
      if (asset !== undefined) {
        void loadSourcedModel(asset).catch(() => undefined);
      }
    };
    if (!sourcedModelGroups.has(ROADSTER_BODY_ID)) {
      throw new Error("Roadster sourced model group is unavailable");
    }
    const issGroup = sourcedModelGroups.get(ISS_BODY_ID);
    if (issGroup === undefined) {
      throw new Error("ISS official model group is unavailable");
    }
    const voyagerGroups = new Map(
      voyagerSnapshot.probes.map((probe) => {
        const group = sourcedModelGroups.get(probe.id);
        if (group === undefined) {
          throw new Error(`${probe.name} official model group is unavailable`);
        }
        return [probe.id, group] as const;
      }),
    );

    const bodyHoverTooltip = document.createElement("div");
    bodyHoverTooltip.className = "body-hover-tooltip";
    bodyHoverTooltip.setAttribute("role", "tooltip");
    bodyHoverTooltip.hidden = true;
    container.append(bodyHoverTooltip);

    const deepSpaceLabels = [
      { id: "heliopause", text: "Heliopause · about 120 AU" },
      { id: "oort-cloud", text: "Oort Cloud · estimated 2,000-100,000 AU" },
      { id: "alpha-centauri", text: "Alpha Centauri · 4.3 light-years" },
    ].map(({ id, text: labelText }) => {
      const label = document.createElement("span");
      label.className = "deep-space-label";
      label.dataset["regionId"] = id;
      label.textContent = labelText;
      label.hidden = true;
      container.append(label);
      return label;
    });
    const deepSunLabel = document.createElement("span");
    deepSunLabel.className = "deep-space-label deep-space-sun-label";
    deepSunLabel.textContent = "Sun · Solar System origin";
    deepSunLabel.hidden = true;
    container.append(deepSunLabel);
    // A disclosure: open on larger screens, a "Mini map" chip on a phone. A
    // resize or a turn into or out of the phone layout sets it again.
    const navigationMap = document.createElement("details");
    navigationMap.className = "reality-navigation-map";
    navigationMap.setAttribute("aria-label", "Solar System navigation map");
    const phoneLayoutQuery = window.matchMedia(PHONE_LAYOUT_QUERY);
    const syncNavigationMapOpen = (): void => {
      navigationMap.open = !phoneLayoutQuery.matches;
    };
    syncNavigationMapOpen();
    phoneLayoutQuery.addEventListener("change", syncNavigationMapOpen);
    const navigationMapSummary = document.createElement("summary");
    navigationMapSummary.textContent = "Mini map";
    const navigationMapHeader = document.createElement("div");
    navigationMapHeader.className = "reality-navigation-map__header";
    const navigationMapTitle = document.createElement("strong");
    navigationMapTitle.textContent = "NAVIGATION";
    const navigationRangeLabel = document.createElement("label");
    navigationRangeLabel.textContent = "Range";
    const navigationRangeSelect = document.createElement("select");
    navigationRangeSelect.setAttribute("aria-label", "Navigation map range");
    for (const range of NAVIGATION_MAP_RANGES) {
      const option = document.createElement("option");
      option.value = range.value;
      option.textContent = range.label;
      if (range.value === "50") option.selected = true;
      navigationRangeSelect.append(option);
    }
    navigationRangeLabel.append(navigationRangeSelect);
    navigationMapHeader.append(navigationMapTitle, navigationRangeLabel);
    const navigationMapCanvas = document.createElement("canvas");
    navigationMapCanvas.width = 320;
    navigationMapCanvas.height = 240;
    navigationMapCanvas.tabIndex = 0;
    navigationMapCanvas.setAttribute("role", "application");
    navigationMapCanvas.setAttribute(
      "aria-label",
      "Top-down map. Select an object; select it again or press Travel to fly there.",
    );
    const navigationTooltip = document.createElement("span");
    navigationTooltip.className = "reality-navigation-map__tooltip";
    navigationTooltip.setAttribute("role", "tooltip");
    navigationTooltip.hidden = true;
    const navigationDestinationRow = document.createElement("div");
    navigationDestinationRow.className = "reality-navigation-map__destination";
    const navigationDestinationSelect = document.createElement("select");
    navigationDestinationSelect.setAttribute(
      "aria-label",
      "Navigation destination",
    );
    const navigationTravelButton = document.createElement("button");
    navigationTravelButton.type = "button";
    navigationTravelButton.textContent = "Travel";
    const navigationDestinationGroups = new Map<string, HTMLOptGroupElement>();
    const navigationDestinations = [
      ...majorBodySnapshot.bodies.map((body) => ({
        id: body.id,
        name: body.name,
        group:
          body.type === "moon"
            ? "Moons"
            : body.type === "planet" || body.type === "dwarf-planet"
              ? "Planets"
              : "Star",
      })),
      ...operationalSpacecraftSnapshot.spacecraft.map((spacecraft) => ({
        id: spacecraft.id,
        name: spacecraft.name,
        // The Roadster is a real craft: a spacecraft dot once found.
        group: "Spacecraft",
      })),
      ...voyagerSnapshot.probes.map((probe) => ({
        id: probe.id,
        name: probe.name,
        group: "Spacecraft",
      })),
      {
        id: ISS_BODY_ID,
        name: "International Space Station",
        group: "Spacecraft",
      },
      {
        id: JOVIAN_MONOLITH_BODY_ID,
        name: JOVIAN_MONOLITH_NAME,
        group: HIDDEN_SURPRISES_GROUP,
      },
      {
        id: DISCOVERY_ONE_BODY_ID,
        name: DISCOVERY_ONE_NAME,
        group: HIDDEN_SURPRISES_GROUP,
      },
      ...FICTIONAL_ORBITERS.map((orbiter) => ({
        id: orbiter.id,
        name: orbiter.name,
        group: HIDDEN_SURPRISES_GROUP,
      })),
      ...DEEP_SPACE_NINE_OBJECTS.map((object) => ({
        id: object.id,
        name: object.name,
        group: HIDDEN_SURPRISES_GROUP,
      })),
    ];
    const navigationDestinationById = new Map(
      navigationDestinations.map((destination) => [
        destination.id,
        destination,
      ]),
    );
    // An unfound easter egg is neither listed nor plotted on the map.
    const isNavigationDestinationShown = (bodyId: string): boolean =>
      !isEasterEggId(bodyId) || foundEasterEggIdsRef.current.has(bodyId);
    let listedFoundEasterEggIds: ReadonlySet<EasterEggId> | undefined;
    const listNavigationDestinations = (): void => {
      if (listedFoundEasterEggIds === foundEasterEggIdsRef.current) return;
      listedFoundEasterEggIds = foundEasterEggIdsRef.current;
      const selectedValue = navigationDestinationSelect.value;
      navigationDestinationSelect.replaceChildren();
      navigationDestinationGroups.clear();
      for (const destination of navigationDestinations) {
        if (!isNavigationDestinationShown(destination.id)) continue;
        let group = navigationDestinationGroups.get(destination.group);
        if (group === undefined) {
          group = document.createElement("optgroup");
          group.label = destination.group;
          navigationDestinationGroups.set(destination.group, group);
          navigationDestinationSelect.append(group);
        }
        const option = document.createElement("option");
        option.value = destination.id;
        option.textContent = destination.name;
        group.append(option);
      }
      navigationDestinationSelect.value = selectedValue;
    };
    listNavigationDestinations();
    navigationDestinationSelect.value = focusBodyIdRef.current ?? "sun";
    navigationDestinationRow.append(
      navigationDestinationSelect,
      navigationTravelButton,
    );
    const navigationMapScale = document.createElement("small");
    const navigationMapHelp = document.createElement("small");
    navigationMapHelp.textContent =
      "Select an object; select it again or press Travel to fly there.";
    navigationMap.append(
      navigationMapSummary,
      navigationMapHeader,
      navigationMapCanvas,
      navigationTooltip,
      navigationMapScale,
      navigationDestinationRow,
      navigationMapHelp,
    );
    container.append(navigationMap);
    const navigationContext = navigationMapCanvas.getContext("2d");
    if (navigationContext === null) {
      throw new Error("Reality navigation map 2D context is unavailable");
    }
    let navigationMapHits: readonly Readonly<{
      bodyId: string;
      x: number;
      y: number;
      radius: number;
      distanceFromSunAu: number;
    }>[] = [];
    let lastNavigationFocusBodyId = focusBodyIdRef.current;
    const navigationHitAtPointer = (
      event: PointerEvent | MouseEvent,
    ): (typeof navigationMapHits)[number] | undefined => {
      const bounds = navigationMapCanvas.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return undefined;
      const x =
        ((event.clientX - bounds.left) / bounds.width) *
        navigationMapCanvas.width;
      const y =
        ((event.clientY - bounds.top) / bounds.height) *
        navigationMapCanvas.height;
      return [...navigationMapHits]
        .reverse()
        .find((hit) => Math.hypot(x - hit.x, y - hit.y) <= hit.radius);
    };
    const hideNavigationTooltip = (): void => {
      navigationTooltip.hidden = true;
    };
    const handleNavigationPointerMove = (event: PointerEvent): void => {
      const hit = navigationHitAtPointer(event);
      if (hit === undefined) {
        hideNavigationTooltip();
        navigationMapCanvas.style.cursor = "crosshair";
        return;
      }
      const destination = navigationDestinationById.get(hit.bodyId);
      if (destination === undefined) {
        throw new Error(`Navigation destination ${hit.bodyId} is unavailable`);
      }
      const mapBounds = navigationMap.getBoundingClientRect();
      navigationTooltip.textContent = `${destination.name} · ${formatTacticalDistance(hit.distanceFromSunAu)} from Sun`;
      navigationTooltip.style.left = `${String(event.clientX - mapBounds.left + 10)}px`;
      navigationTooltip.style.top = `${String(event.clientY - mapBounds.top - 10)}px`;
      navigationTooltip.hidden = false;
      navigationMapCanvas.style.cursor = "pointer";
    };
    const handleNavigationClick = (event: MouseEvent): void => {
      const hit = navigationHitAtPointer(event);
      if (hit === undefined) return;
      navigationDestinationSelect.value = hit.bodyId;
      pickBody(hit.bodyId);
    };
    const travelToNavigationDestination = (): void => {
      const bodyId = navigationDestinationSelect.value;
      if (!navigationDestinationById.has(bodyId)) {
        throw new Error(`Navigation destination ${bodyId} is unavailable`);
      }
      onFocusBody(bodyId);
    };
    const handleNavigationDestinationChange = (): void => {
      const bodyId = navigationDestinationSelect.value;
      if (!navigationDestinationById.has(bodyId)) {
        throw new Error(`Navigation destination ${bodyId} is unavailable`);
      }
      onSelectBody(bodyId);
    };
    navigationMapCanvas.addEventListener(
      "pointermove",
      handleNavigationPointerMove,
    );
    navigationMapCanvas.addEventListener("pointerleave", hideNavigationTooltip);
    navigationMapCanvas.addEventListener("click", handleNavigationClick);
    navigationDestinationSelect.addEventListener(
      "change",
      handleNavigationDestinationChange,
    );
    navigationTravelButton.addEventListener(
      "click",
      travelToNavigationDestination,
    );

    const raycaster = new Raycaster();
    const pointer = new Vector2();
    let surfacePointerId: number | undefined;
    let selectionPointerId: number | undefined;
    let selectionPointerStartX = 0;
    let selectionPointerStartY = 0;
    let selectionPointerMoved = false;
    let surfacePointerX = 0;
    let surfacePointerY = 0;
    let surfaceFreeLook = false;
    let surfaceLookAzimuthDeg = 0;
    let surfaceLookAltitudeDeg = 0;
    let latestSurfaceObservation: SurfaceObserverFrame | undefined;
    let lastSurfaceConfigurationKey = "";
    let lastSurfaceLookResetToken = surfaceObserverLookResetTokenRef.current;

    const bodyIdFromIntersection = (
      intersection: ReturnType<Raycaster["intersectObjects"]>[number],
    ): string | undefined => {
      let object: Object3D | null = intersection.object;
      while (object !== null) {
        const bodyId: unknown = object.userData["bodyId"];
        if (typeof bodyId === "string") {
          return bodyId;
        }
        object = object.parent;
      }
      return undefined;
    };

    const bodyTooltipText = (bodyId: string): string => {
      const body = majorBodyById.get(bodyId);
      if (body !== undefined) {
        const parentName = majorBodyById.get(
          PARENT_BODY_ID[bodyId] ?? "",
        )?.name;
        const typeLabel = body.type.replace("-", " ");
        return parentName === undefined
          ? `${body.name} · ${typeLabel}`
          : `${body.name} · ${typeLabel} of ${parentName}`;
      }
      const knownMoon = knownSatelliteById.get(bodyId);
      if (knownMoon !== undefined) {
        const parentName = majorBodyById.get(knownMoon.parentId)?.name;
        return `${knownMoon.name} · moon${parentName === undefined ? "" : ` of ${parentName}`}`;
      }
      if (bodyId === ISS_BODY_ID) {
        return "International Space Station · spacecraft orbiting Earth";
      }
      if (bodyId === JOVIAN_MONOLITH_BODY_ID) {
        return "Jovian Monolith · fictional 2001 / 2010 object near Jupiter-Io L1";
      }
      if (bodyId === DISCOVERY_ONE_BODY_ID) {
        return "Discovery One · fictional 2001 / 2010 spacecraft in orbit around Io";
      }
      if (isDeepSpaceNineObjectId(bodyId)) {
        return bodyId === DEEP_SPACE_NINE_BODY_ID
          ? "Deep Space Nine · fictional station in a hypothetical Callisto exhibit orbit"
          : "USS Defiant · fictional spacecraft on a scripted defensive patrol around Deep Space Nine";
      }
      const voyager = isVoyagerBodyId(bodyId)
        ? voyagerById.get(bodyId)
        : undefined;
      if (voyager !== undefined) {
        return `${voyager.name} · interstellar spacecraft`;
      }
      const operational = operationalSpacecraftSnapshot.spacecraft.find(
        (spacecraft) => spacecraft.id === bodyId,
      );
      if (operational !== undefined) {
        return `${operational.name} · spacecraft`;
      }
      const fictionalOrbiter = isFictionalOrbiterId(bodyId)
        ? fictionalOrbiterById.get(bodyId)
        : undefined;
      if (fictionalOrbiter !== undefined) {
        return `${fictionalOrbiter.name} · fictional massless visualization`;
      }
      const apolloSite = apolloLandingSites.find((site) => site.id === bodyId);
      if (apolloSite !== undefined) {
        return `${apolloSite.mission} · ${apolloSite.siteName} · NASA/LROC surface artefacts`;
      }
      throw new Error(`Hover target ${bodyId} has no display definition`);
    };

    const updatePointer = (event: MouseEvent | PointerEvent): void => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
    };

    const bodyIdAtPointer = (
      event: MouseEvent | PointerEvent,
    ): string | undefined => {
      updatePointer(event);
      raycaster.setFromCamera(pointer, camera);
      const intersection = raycaster
        .intersectObjects(
          [
            ...bodyMeshes.values(),
            ...sourcedModelSelectableMeshes,
            ...additionalSelectableMeshes,
          ],
          true,
        )
        .find((candidate) => candidate.object.visible);
      return intersection === undefined
        ? undefined
        : bodyIdFromIntersection(intersection);
    };

    const starIndexAtPointer = (
      event: MouseEvent | PointerEvent,
    ): number | undefined => {
      if (!stars.visible) {
        return undefined;
      }
      updatePointer(event);
      raycaster.setFromCamera(pointer, camera);
      const worldHeight =
        (2 * STAR_SPHERE_RADIUS_AU * Math.tan((camera.fov * Math.PI) / 360)) /
        camera.zoom;
      raycaster.params.Points = {
        threshold:
          (worldHeight / Math.max(1, renderer.domElement.clientHeight)) *
          STAR_TOOLTIP_PICK_RADIUS_CSS_PIXELS,
      };
      return raycaster.intersectObject(stars, false)[0]?.index;
    };

    let hoveredStarIndex: number | undefined;
    let starTooltipTimer: number | undefined;
    let latestTooltipClientX = 0;
    let latestTooltipClientY = 0;

    const positionHoverTooltip = (clientX: number, clientY: number): void => {
      const bounds = renderer.domElement.getBoundingClientRect();
      const margin = 10;
      const pointerGap = 14;
      const pointerX = clientX - bounds.left;
      const pointerY = clientY - bounds.top;
      const tooltipWidth = bodyHoverTooltip.offsetWidth;
      const tooltipHeight = bodyHoverTooltip.offsetHeight;
      const fitsRight =
        pointerX + pointerGap + tooltipWidth <= container.clientWidth - margin;
      const fitsAbove = pointerY - pointerGap - tooltipHeight >= margin;
      const preferredLeft = fitsRight
        ? pointerX + pointerGap
        : pointerX - pointerGap - tooltipWidth;
      const preferredTop = fitsAbove
        ? pointerY - pointerGap - tooltipHeight
        : pointerY + pointerGap;
      const left = Math.min(
        container.clientWidth - tooltipWidth - margin,
        Math.max(margin, preferredLeft),
      );
      const top = Math.min(
        container.clientHeight - tooltipHeight - margin,
        Math.max(margin, preferredTop),
      );
      bodyHoverTooltip.dataset["placement"] =
        `${fitsAbove ? "above" : "below"}-${fitsRight ? "right" : "left"}`;
      bodyHoverTooltip.style.transform = `translate(${String(left)}px, ${String(top)}px)`;
    };

    const cancelStarTooltip = (): void => {
      if (starTooltipTimer !== undefined) {
        window.clearTimeout(starTooltipTimer);
        starTooltipTimer = undefined;
      }
      hoveredStarIndex = undefined;
    };

    const hideBodyHoverTooltip = (): void => {
      bodyHoverTooltip.hidden = true;
      delete bodyHoverTooltip.dataset["bodyId"];
      delete bodyHoverTooltip.dataset["starHipId"];
    };

    const updateBodyHoverTooltip = (event: PointerEvent): void => {
      if (surfacePointerId !== undefined) {
        hideBodyHoverTooltip();
        return;
      }
      const bodyId = bodyIdAtPointer(event);
      if (bodyId !== undefined) {
        cancelStarTooltip();
        bodyHoverTooltip.textContent = bodyTooltipText(bodyId);
        bodyHoverTooltip.dataset["bodyId"] = bodyId;
        delete bodyHoverTooltip.dataset["starHipId"];
        bodyHoverTooltip.hidden = false;
        positionHoverTooltip(event.clientX, event.clientY);
        return;
      }
      const starIndex = starIndexAtPointer(event);
      if (starIndex === undefined) {
        cancelStarTooltip();
        hideBodyHoverTooltip();
        return;
      }
      latestTooltipClientX = event.clientX;
      latestTooltipClientY = event.clientY;
      const star = hipparcosStarSnapshot.stars[starIndex];
      if (star === undefined) {
        throw new Error(
          `Hipparcos hover index ${String(starIndex)} is invalid`,
        );
      }
      if (hoveredStarIndex === starIndex) {
        if (!bodyHoverTooltip.hidden) {
          positionHoverTooltip(event.clientX, event.clientY);
        }
        return;
      }
      cancelStarTooltip();
      hideBodyHoverTooltip();
      hoveredStarIndex = starIndex;
      starTooltipTimer = window.setTimeout(() => {
        starTooltipTimer = undefined;
        if (!active || hoveredStarIndex !== starIndex || !stars.visible) {
          return;
        }
        bodyHoverTooltip.textContent = starTooltipText(star);
        bodyHoverTooltip.dataset["starHipId"] = String(star.hipId);
        delete bodyHoverTooltip.dataset["bodyId"];
        bodyHoverTooltip.hidden = false;
        positionHoverTooltip(latestTooltipClientX, latestTooltipClientY);
      }, STAR_TOOLTIP_DELAY_MS);
    };

    const handleSurfacePointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) {
        return;
      }
      if (surfaceObserverRef.current === null) {
        selectionPointerId = event.pointerId;
        selectionPointerStartX = event.clientX;
        selectionPointerStartY = event.clientY;
        selectionPointerMoved = false;
        return;
      }
      surfacePointerId = event.pointerId;
      surfacePointerX = event.clientX;
      surfacePointerY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
      renderer.domElement.dataset["surfaceLookDragging"] = "true";
      cancelStarTooltip();
      hideBodyHoverTooltip();
      event.preventDefault();
    };

    const handleSurfacePointerMove = (event: PointerEvent): void => {
      if (selectionPointerId === event.pointerId) {
        selectionPointerMoved =
          selectionPointerMoved ||
          Math.hypot(
            event.clientX - selectionPointerStartX,
            event.clientY - selectionPointerStartY,
          ) > TAP_SLOP_PX;
        if (selectionPointerMoved) {
          cancelStarTooltip();
          hideBodyHoverTooltip();
          return;
        }
      }
      if (surfacePointerId !== event.pointerId) {
        updateBodyHoverTooltip(event);
        return;
      }
      const observation = latestSurfaceObservation;
      if (observation === undefined) {
        throw new Error("Surface free-look has no current observer frame");
      }
      if (!surfaceFreeLook) {
        surfaceLookAzimuthDeg = observation.targetAzimuthDeg;
        surfaceLookAltitudeDeg = observation.targetAltitudeDeg;
        surfaceFreeLook = true;
      }
      const deltaX = event.clientX - surfacePointerX;
      const deltaY = event.clientY - surfacePointerY;
      surfacePointerX = event.clientX;
      surfacePointerY = event.clientY;
      surfaceLookAzimuthDeg =
        (surfaceLookAzimuthDeg - deltaX * 0.16 + 360) % 360;
      surfaceLookAltitudeDeg = Math.max(
        -89.5,
        Math.min(89.5, surfaceLookAltitudeDeg - deltaY * 0.16),
      );
      container.dataset["surfaceFreeLook"] = "true";
      event.preventDefault();
    };

    const handleSurfacePointerUp = (event: PointerEvent): void => {
      if (selectionPointerId === event.pointerId) {
        if (!selectionPointerMoved) {
          const bodyId = bodyIdAtPointer(event);
          if (bodyId !== undefined) {
            pickBody(bodyId);
          }
        }
        selectionPointerId = undefined;
        selectionPointerMoved = false;
        return;
      }
      if (surfacePointerId !== event.pointerId) {
        return;
      }
      renderer.domElement.releasePointerCapture(event.pointerId);
      surfacePointerId = undefined;
      delete renderer.domElement.dataset["surfaceLookDragging"];
    };

    const handlePointerCancel = (event: PointerEvent): void => {
      cancelStarTooltip();
      hideBodyHoverTooltip();
      if (selectionPointerId === event.pointerId) {
        selectionPointerId = undefined;
        selectionPointerMoved = false;
      }
      if (surfacePointerId === event.pointerId) {
        if (renderer.domElement.hasPointerCapture(event.pointerId)) {
          renderer.domElement.releasePointerCapture(event.pointerId);
        }
        surfacePointerId = undefined;
        delete renderer.domElement.dataset["surfaceLookDragging"];
      }
    };

    // A double-click on a body is two picks. In surface view a double-click
    // returns the look to the target.
    const handleDoubleClick = (): void => {
      if (surfaceObserverRef.current !== null) {
        surfaceFreeLook = false;
        container.dataset["surfaceFreeLook"] = "false";
      }
    };
    const handlePointerLeave = (): void => {
      cancelStarTooltip();
      hideBodyHoverTooltip();
    };
    renderer.domElement.addEventListener(
      "pointerdown",
      handleSurfacePointerDown,
    );
    renderer.domElement.addEventListener(
      "pointermove",
      handleSurfacePointerMove,
    );
    renderer.domElement.addEventListener("pointerup", handleSurfacePointerUp);
    renderer.domElement.addEventListener("pointercancel", handlePointerCancel);
    renderer.domElement.addEventListener("pointerleave", handlePointerLeave);
    renderer.domElement.addEventListener("dblclick", handleDoubleClick);

    const knownMoonPointMaterial = new PointsMaterial({
      color: 0xc8d2e2,
      size: 0.000_02,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    materials.push(knownMoonPointMaterial);
    const knownMoonSystems = new Map<
      string,
      Readonly<{
        definitions: typeof additionalAvailableKnownSatellites;
        geometry: BufferGeometry;
        positions: Float32Array;
        points: Points;
      }>
    >();
    for (const parentId of [
      "earth",
      "mars",
      "jupiter",
      "saturn",
      "uranus",
      "neptune",
      "pluto",
    ]) {
      const definitions = additionalAvailableKnownSatellites.filter(
        (body) => body.parentId === parentId,
      );
      if (definitions.length === 0) {
        continue;
      }
      const geometry = new BufferGeometry();
      const positions = new Float32Array(definitions.length * 3);
      const attribute = new BufferAttribute(positions, 3);
      attribute.setUsage(DynamicDrawUsage);
      geometry.setAttribute("position", attribute);
      geometries.push(geometry);
      const points = new Points(geometry, knownMoonPointMaterial);
      points.name = `${parentId} Horizons massless two-body moon points`;
      points.visible = false;
      scene.add(points);
      knownMoonSystems.set(parentId, {
        definitions,
        geometry,
        positions,
        points,
      });
    }

    const ensureSurfaceAsset = (bodyId: string): void => {
      if (textureRequestedBodyIds.has(bodyId)) {
        return;
      }
      const asset = nasaTextureByBodyId.get(bodyId);
      const surfaceMaterial = surfaceMaterials.get(bodyId);
      if (asset === undefined || surfaceMaterial === undefined) {
        return;
      }
      textureRequestedBodyIds.add(bodyId);
      const label = bodyLabels.get(bodyId);
      if (label !== undefined) {
        label.dataset["surfaceAssetState"] = "loading";
      }
      surfaceMaterial.map = loadTexture(
        asset.file,
        true,
        () => {
          loadedSurfaceAssetBodyIds.add(bodyId);
          if (label !== undefined) {
            label.dataset["surfaceAssetState"] = "loaded";
          }
          container.dataset["surfaceAssetLoadedCount"] = String(
            loadedSurfaceAssetBodyIds.size,
          );
        },
        () => {
          if (label !== undefined) {
            label.dataset["surfaceAssetState"] = "failed";
          }
          onGpuError(
            `Authority surface asset ${asset.file} failed to load for ${bodyId}`,
          );
        },
      );
      const normalAsset = nasaSurfaceNormalByBodyId.get(bodyId);
      if (normalAsset !== undefined) {
        surfaceMaterial.normalMap = loadTexture(normalAsset.file, false);
        surfaceMaterial.normalScale.set(0.75, 0.75);
      }
      const roughnessAsset = nasaSurfaceRoughnessByBodyId.get(bodyId);
      if (roughnessAsset !== undefined) {
        surfaceMaterial.roughnessMap = loadTexture(roughnessAsset.file, false);
        surfaceMaterial.roughness = 1;
      }
      if (bodyId === "moon" && nasaMoonHeightAsset !== undefined) {
        surfaceMaterial.bumpMap = loadTexture(nasaMoonHeightAsset.file, false);
        surfaceMaterial.bumpScale = 0.018;
      }
      if (bodyId === "earth" && nasaEarthNightLightAsset !== undefined) {
        surfaceMaterial.emissive.setHex(0xffd59a);
        surfaceMaterial.emissiveMap = loadTexture(
          nasaEarthNightLightAsset.file,
          true,
        );
        surfaceMaterial.emissiveIntensity = 0.32;
        container.dataset["earthNightLightAsset"] = "NASA-Black-Marble-2016";
      }
      if (bodyId === "earth" && nasaEarthCloudAsset !== undefined) {
        const cloudMaterial = new MeshStandardMaterial({
          color: 0xffffff,
          alphaMap: loadTexture(nasaEarthCloudAsset.file, false),
          transparent: true,
          opacity: 0.72,
          roughness: 1,
          metalness: 0,
          depthWrite: false,
          alphaTest: 0.018,
        });
        const earthDefinition = majorBodyById.get("earth");
        if (earthDefinition === undefined) {
          throw new Error("Earth clouds require the Earth definition");
        }
        configureSolarOcclusion(
          cloudMaterial,
          "earth",
          earthDefinition.meanRadiusM / ASTRONOMICAL_UNIT_M,
        );
        earthCloudMaterial = cloudMaterial;
        materials.push(cloudMaterial);
        const clouds = new Mesh(unitSphere, cloudMaterial);
        clouds.name = "NASA Blue Marble static Earth cloud composite";
        clouds.scale.setScalar(1.018);
        bodyMeshes.get("earth")?.add(clouds);
        container.dataset["earthCloudPresentation"] =
          "static-authority-composite-not-live-weather";
      }
      surfaceMaterial.needsUpdate = true;
    };

    const eclipticGrid = new GridHelper(80, 40, 0x426b96, 0x1a3048);
    eclipticGrid.name = "J2000 ecliptic reference plane";
    eclipticGrid.quaternion.setFromUnitVectors(
      new Vector3(0, 1, 0),
      j2000EclipticToScene({ x: 0, y: 0, z: 1 }).normalize(),
    );
    const gridMaterials: Material[] = Array.isArray(eclipticGrid.material)
      ? (eclipticGrid.material as Material[])
      : [eclipticGrid.material];
    for (const material of gridMaterials) {
      material.transparent = true;
      material.opacity = 0.16;
      material.depthWrite = false;
      materials.push(material);
    }
    scene.add(eclipticGrid);

    const orbitGuides = new Map<string, OrbitGuide>();
    for (const body of majorBodySnapshot.bodies) {
      if (PARENT_BODY_ID[body.id] === undefined) {
        continue;
      }
      const geometry = new BufferGeometry();
      const positions = new Float32Array(192 * 3);
      const positionAttribute = new BufferAttribute(positions, 3);
      positionAttribute.setUsage(DynamicDrawUsage);
      geometry.setAttribute("position", positionAttribute);
      geometry.setDrawRange(0, 0);
      const material = new LineBasicMaterial({
        color: 0x6f91ad,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
      });
      const line = new LineLoop(geometry, material);
      line.name = `Instantaneous osculating orbit for ${body.name}`;
      line.visible = false;
      line.renderOrder = 1;
      // No bounding sphere to recompute for every new orbit: a guide is
      // drawn whenever it is shown.
      line.frustumCulled = false;
      geometries.push(geometry);
      materials.push(material);
      scene.add(line);
      orbitGuides.set(body.id, {
        geometry,
        positions,
        positionAttribute,
        material,
        line,
      });
    }

    // Each newest solver state waits here; a guide computes its orbit from it
    // only while it is shown.
    let orbitGuideSourceState: SimulationState | undefined;
    const orbitGuideComputedStates = new Map<string, SimulationState>();
    const updateOrbitGuide = (
      bodyId: string,
      guide: OrbitGuide,
      exactState: SimulationState,
    ): void => {
      orbitGuideComputedStates.set(bodyId, exactState);
      const parentId = PARENT_BODY_ID[bodyId];
      const bodyState = bodyStateById(exactState, bodyId);
      const parentState =
        parentId === undefined
          ? undefined
          : bodyStateById(exactState, parentId);
      if (bodyState === undefined || parentState === undefined) {
        guide.geometry.setDrawRange(0, 0);
        return;
      }
      const positionsM = osculatingOrbitPositionsM(bodyState, parentState, 192);
      for (const [index, positionM] of positionsM.entries()) {
        const position = scenePosition(positionM);
        guide.positions[index * 3] = position.x;
        guide.positions[index * 3 + 1] = position.y;
        guide.positions[index * 3 + 2] = position.z;
      }
      guide.positionAttribute.needsUpdate = true;
      guide.geometry.setDrawRange(0, positionsM.length);
    };

    const moonTrailGeometry = new BufferGeometry();
    geometries.push(moonTrailGeometry);
    const moonTrailPositions = new Float32Array(MAX_MOON_TRAIL_POINTS * 3);
    const moonTrailColors = new Float32Array(MAX_MOON_TRAIL_POINTS * 3);
    const moonTrailPositionAttribute = new BufferAttribute(
      moonTrailPositions,
      3,
    );
    moonTrailPositionAttribute.setUsage(DynamicDrawUsage);
    moonTrailGeometry.setAttribute("position", moonTrailPositionAttribute);
    const moonTrailColorAttribute = new BufferAttribute(moonTrailColors, 3);
    moonTrailColorAttribute.setUsage(DynamicDrawUsage);
    moonTrailGeometry.setAttribute("color", moonTrailColorAttribute);
    moonTrailGeometry.setDrawRange(0, 0);
    const moonTrailMaterial = new LineBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
      depthTest: false,
    });
    materials.push(moonTrailMaterial);
    const moonTrail = new Line(moonTrailGeometry, moonTrailMaterial);
    moonTrail.name = "Physics-sampled Moon trail";
    moonTrail.renderOrder = 2;
    // Trails are drawn whenever shown, so no bounding sphere is recomputed
    // over every point for each new state.
    moonTrail.frustumCulled = false;
    scene.add(moonTrail);
    const moonTrailPoints: TimedTrailPoint[] = [];
    const planetTrailMaterial = new LineBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 0.62,
      depthTest: false,
    });
    materials.push(planetTrailMaterial);
    const planetTrails = new Map<
      (typeof PLANET_TRAIL_BODY_IDS)[number],
      Readonly<{
        geometry: BufferGeometry;
        line: Line;
        positionAttribute: BufferAttribute;
        positions: Float32Array;
        colors: Float32Array;
        colorAttribute: BufferAttribute;
        points: TimedTrailPoint[];
      }>
    >();
    for (const bodyId of PLANET_TRAIL_BODY_IDS) {
      const geometry = new BufferGeometry();
      geometries.push(geometry);
      const positions = new Float32Array(MAX_PLANET_TRAIL_POINTS * 3);
      const colors = new Float32Array(MAX_PLANET_TRAIL_POINTS * 3);
      const positionAttribute = new BufferAttribute(positions, 3);
      positionAttribute.setUsage(DynamicDrawUsage);
      geometry.setAttribute("position", positionAttribute);
      const colorAttribute = new BufferAttribute(colors, 3);
      colorAttribute.setUsage(DynamicDrawUsage);
      geometry.setAttribute("color", colorAttribute);
      geometry.setDrawRange(0, 0);
      const line = new Line(geometry, planetTrailMaterial);
      line.name = `Physics-sampled ${bodyId} trail`;
      line.renderOrder = 2;
      line.frustumCulled = false;
      scene.add(line);
      planetTrails.set(bodyId, {
        geometry,
        line,
        positionAttribute,
        positions,
        colors,
        colorAttribute,
        points: [],
      });
    }
    let lastMoonTrailTime: number | undefined;
    // New trail points reach the GPU only when a trail is shown.
    let moonTrailGeometryStale = false;
    let planetTrailGeometryStale = false;
    let lastTrailDirection = 0;
    let activeReferenceFrame = referenceFrameRef.current;
    let lastFocusBodyId: string | null | undefined;
    let lastResetViewToken = resetViewTokenRef.current;
    let lastClearTrailsToken = clearTrailsTokenRef.current;
    let lastOrientationPresetToken = orientationPresetTokenRef.current;
    let lastCameraNavigationSequence =
      cameraNavigationCommandRef.current.sequence;
    let lastCameraTransitionSequence = cameraTransitionSequenceRef.current;
    // The scene mounts with no flight for the current sequence to wait for.
    onCameraTransitionSettledRef.current(lastCameraTransitionSequence);
    let activeCameraTransition:
      | {
          sequence: number;
          startedAtMs: number;
          durationMs: number;
          startPosition: Vector3;
          startTarget: Vector3;
          startUp: Vector3;
          orientationTarget: Vector3;
          endPosition: Vector3;
          endTarget: Vector3;
          endOffset: Vector3;
          // The centre of the body the flight closes in on, which the camera
          // turns round and never passes through, and the side it turns
          // through, chosen once when the flight begins.
          destinationCentre: Vector3;
          turnSide: Vector3;
          destinationFocusBodyId: string | null;
          destinationTargetBodyId: string | undefined;
          destinationName: string;
          endUp: Vector3;
          endNear: number;
          endFar: number;
          endMinimumDistance: number;
          endMaximumDistance: number;
          lastSpeedSampleAtMs: number;
          smoothedSpeedMps: number;
        }
      | undefined;
    let activeOrientationTransition:
      | {
          startedAtMs: number;
          startOffset: Vector3;
          endOffset: Vector3;
          turnSide: Vector3;
          startUp: Vector3;
          endUp: Vector3;
        }
      | undefined;
    let lastCameraZoom = Number.NaN;
    let viewZoomReferenceDistanceAu = SOLAR_SYSTEM_CAMERA_POSITION.length();
    let lastReportedViewZoom = Number.NaN;
    let activeFrameEndTime: number | undefined;
    let lastSemanticZoomLevel: SemanticZoomLevel | undefined;
    let lastSmallBodyGpuUpdateAt = Number.NEGATIVE_INFINITY;
    let lastSunGuideUpdateAt = Number.NEGATIVE_INFINITY;
    // Body labels keep clear of the Sun and planet guide labels.
    let wayfinderLabelRectangles: LabelRectangle[] = [];
    let lastNavigationMapUpdateAt = Number.NEGATIVE_INFINITY;
    let lastSmallBodiesVisible: boolean | undefined;
    let lastSceneMutationKey = "";
    // Moons that the Orrery layout does not draw because they would crowd an
    // enlarged body, for example the Moon inside an enlarged Earth.
    let orreryHiddenBodyIds: ReadonlySet<string> = new Set();
    let lastVisualQuality: VisualQuality | undefined;
    let currentExposure = renderer.toneMappingExposure;
    let lastReportedExposureEv = Number.NaN;
    let lastReportedExposureMode: ExposureMode | undefined;
    let lastRenderedAtMs = performance.now();
    let frameIntervalEmaMs = 1000 / 60;

    let labelFontPx = Number.NaN;
    const resize = (width: number, height: number): void => {
      // The render loop fails when this is not a positive size.
      labelFontPx = Number.parseFloat(getComputedStyle(issLabel).fontSize);
      if (width <= 0 || height <= 0) {
        return;
      }
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      lastSunGuideUpdateAt = Number.NEGATIVE_INFINITY;
    };
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry !== undefined) {
        resize(entry.contentRect.width, entry.contentRect.height);
      }
    });
    resizeObserver.observe(container);
    resize(container.clientWidth, container.clientHeight);
    // The facts card stacks below the navigation map, so the map reports its
    // bottom edge whenever its size, the scene size or its visibility changes.
    const navigationMapObserver = new ResizeObserver(() => {
      const height = navigationMap.offsetHeight;
      onNavigationMapBottomChange(
        height === 0 ? null : navigationMap.offsetTop + height,
      );
    });
    navigationMapObserver.observe(navigationMap);
    navigationMapObserver.observe(container);

    const applyVisualQuality = (quality: VisualQuality): void => {
      const profile = VISUAL_QUALITY_PROFILES[quality];
      renderer.setPixelRatio(
        Math.min(window.devicePixelRatio, profile.maximumPixelRatio),
      );
      for (const texture of textures) {
        texture.anisotropy = Math.min(
          renderer.capabilities.getMaxAnisotropy(),
          profile.textureAnisotropyLimit,
        );
        if (loadedTextures.has(texture)) {
          texture.needsUpdate = true;
        }
      }
      for (const bodyId of modelTexturesByBodyId.keys()) {
        reportModelTextureAnisotropy(bodyId);
      }
      for (const material of atmosphereMaterials.values()) {
        setRequiredNumberUniform(
          material,
          "qualityStrength",
          profile.atmosphereStrength,
        );
      }
      if (solarCoronaMaterial !== undefined) {
        setRequiredNumberUniform(
          solarCoronaMaterial,
          "opacity",
          profile.coronaOpacity,
        );
      }
      if (earthCloudMaterial !== undefined) {
        earthCloudMaterial.opacity =
          quality === "battery" ? 0.5 : quality === "balanced" ? 0.62 : 0.72;
      }
      resize(container.clientWidth, container.clientHeight);
      container.dataset["visualQuality"] = quality;
      container.dataset["renderPixelRatio"] = renderer
        .getPixelRatio()
        .toFixed(2);
      container.dataset["textureAnisotropy"] = String(
        Math.min(
          renderer.capabilities.getMaxAnisotropy(),
          profile.textureAnisotropyLimit,
        ),
      );
      lastVisualQuality = quality;
    };
    applyVisualQuality(visualQualityRef.current);

    const snapshotAbortController = new AbortController();
    let gpuLayer: SmallBodyGpuLayer | undefined;
    let gpuInitializationStarted = false;
    let active = true;
    const initializeGpuLayer = async (): Promise<void> => {
      try {
        const snapshot = await loadSbdbSnapshot(snapshotAbortController.signal);
        const created = await SmallBodyGpuLayer.create(
          gpuCanvas,
          snapshot,
          (message) => {
            if (active) {
              onGpuError(message);
            }
          },
        );
        const validatedRenderPixels =
          await created.layer.validateRenderedFrame(camera);
        if (!active) {
          created.layer.dispose();
          return;
        }
        gpuLayer = created.layer;
        container.dataset["gpuAuthorityPositions"] = String(
          created.status.validatedAuthorityPositions,
        );
        container.dataset["gpuPresentation"] = "direct-webgpu";
        onGpuStatus({ ...created.status, validatedRenderPixels });
      } catch (cause: unknown) {
        if (active && !snapshotAbortController.signal.aborted) {
          onGpuError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    };
    const ensureGpuLayer = (): void => {
      if (gpuInitializationStarted) {
        return;
      }
      gpuInitializationStarted = true;
      void initializeGpuLayer();
    };

    // Times the trails started again because states went undrawn.
    let trailGapCount = 0;
    const clearTrails = (): void => {
      moonTrailPoints.length = 0;
      moonTrailGeometry.setDrawRange(0, 0);
      for (const trail of planetTrails.values()) {
        trail.points.length = 0;
        trail.geometry.setDrawRange(0, 0);
      }
      lastMoonTrailTime = undefined;
      lastTrailDirection = 0;
    };

    const referenceOrigin = (
      exactState: SimulationState,
      bodyId: string,
      requestedReferenceFrame: ReferenceFrame,
    ): BodyState | undefined => {
      if (requestedReferenceFrame === "barycentric") {
        return undefined;
      }
      const originId =
        requestedReferenceFrame === "heliocentric"
          ? "sun"
          : PARENT_BODY_ID[bodyId];
      if (originId === undefined) {
        return undefined;
      }
      const origin = bodyStateById(exactState, originId);
      if (origin === undefined) {
        throw new Error(`Reference frame origin ${originId} is unavailable`);
      }
      return origin;
    };

    const relativeScenePosition = (
      bodyState: BodyState,
      originState: BodyState | undefined,
    ): Vector3 => {
      const position = scenePosition(bodyState.positionM);
      return originState === undefined
        ? position
        : position.sub(scenePosition(originState.positionM));
    };

    const updateTrail = (
      exactState: SimulationState,
      jumped: boolean,
    ): void => {
      const requestedReferenceFrame = referenceFrameRef.current;
      if (requestedReferenceFrame !== activeReferenceFrame) {
        activeReferenceFrame = requestedReferenceFrame;
        clearTrails();
      }
      if (exactState.timeSeconds === lastMoonTrailTime) {
        return;
      }
      if (
        !Number.isFinite(trailDurationSecondsRef.current) ||
        trailDurationSecondsRef.current <= 0
      ) {
        throw new Error("Trail duration must be a positive finite value");
      }
      if (
        !Number.isFinite(trailFadeRef.current) ||
        trailFadeRef.current < 0 ||
        trailFadeRef.current > 1
      ) {
        throw new Error("Trail fade must be between zero and one");
      }
      const trailDirection =
        lastMoonTrailTime === undefined
          ? 0
          : Math.sign(exactState.timeSeconds - lastMoonTrailTime);
      const reversed =
        trailDirection !== 0 &&
        lastTrailDirection !== 0 &&
        trailDirection !== lastTrailDirection;
      if (reversed && jumped) {
        // A jump back along the trail, such as Pause holding the clock at
        // the state on screen behind the frame the trail reached, keeps the
        // trail up to the new time.
        const dropPointsBeyond = (points: { timeSeconds: number }[]): void => {
          while (
            Math.sign(
              (points.at(-1)?.timeSeconds ?? exactState.timeSeconds) -
                exactState.timeSeconds,
            ) === lastTrailDirection
          ) {
            points.pop();
          }
        };
        dropPointsBeyond(moonTrailPoints);
        for (const trail of planetTrails.values()) {
          dropPointsBeyond(trail.points);
        }
      } else {
        if (reversed) {
          clearTrails();
        }
        if (trailDirection !== 0) {
          lastTrailDirection = trailDirection;
        }
      }
      const moonState = bodyStateById(exactState, "moon");
      if (moonState === undefined) {
        return;
      }
      const moonOriginState = referenceOrigin(
        exactState,
        "moon",
        requestedReferenceFrame,
      );
      moonTrailPoints.push({
        position: relativeScenePosition(moonState, moonOriginState),
        timeSeconds: exactState.timeSeconds,
      });
      while (
        moonTrailPoints.length > MAX_MOON_TRAIL_POINTS ||
        Math.abs(
          exactState.timeSeconds -
            (moonTrailPoints[0]?.timeSeconds ?? exactState.timeSeconds),
        ) > trailDurationSecondsRef.current
      ) {
        moonTrailPoints.shift();
      }
      for (const bodyId of PLANET_TRAIL_BODY_IDS) {
        const bodyState = bodyStateById(exactState, bodyId);
        const trail = planetTrails.get(bodyId);
        if (bodyState === undefined || trail === undefined) {
          throw new Error(`Planet trail state is missing body ${bodyId}`);
        }
        const planetOriginState = referenceOrigin(
          exactState,
          bodyId,
          requestedReferenceFrame,
        );
        trail.points.push({
          position: relativeScenePosition(bodyState, planetOriginState),
          timeSeconds: exactState.timeSeconds,
        });
        while (
          trail.points.length > MAX_PLANET_TRAIL_POINTS ||
          Math.abs(
            exactState.timeSeconds -
              (trail.points[0]?.timeSeconds ?? exactState.timeSeconds),
          ) > trailDurationSecondsRef.current
        ) {
          trail.points.shift();
        }
      }
      lastMoonTrailTime = exactState.timeSeconds;
      moonTrailGeometryStale = true;
      planetTrailGeometryStale = true;
    };

    const observerCameraPose = (
      observerBodyId: string,
      observerState: BodyState,
      targetPosition: Vector3,
      current: SimulationState,
    ): Readonly<{ position: Vector3; up: Vector3 }> => {
      const observerDefinition = majorBodyById.get(observerBodyId);
      if (observerDefinition === undefined) {
        throw new Error(
          `Camera observer body ${observerBodyId} has no physical definition`,
        );
      }
      const observerCenter = scenePosition(observerState.positionM);
      if (observerCameraStyleRef.current === "shadow-axis") {
        const earthState = bodyStateById(current, "earth");
        if (earthState === undefined) {
          throw new Error("Eclipse camera requires the Earth state");
        }
        const earthPosition = scenePosition(earthState.positionM);
        const footprintNormal = targetPosition
          .clone()
          .sub(earthPosition)
          .normalize();
        const cameraDistanceAu =
          (eclipseEarthDefinition.meanRadiusM * 8) / ASTRONOMICAL_UNIT_M;
        const position = targetPosition
          .clone()
          .add(footprintNormal.multiplyScalar(cameraDistanceAu));
        container.dataset["cameraObserverAltitudeKm"] = (
          (cameraDistanceAu * ASTRONOMICAL_UNIT_M) /
          1_000
        ).toFixed(3);
        container.dataset["cameraObserverStyle"] =
          observerCameraStyleRef.current;
        return {
          position,
          up: ECLIPTIC_NORTH,
        };
      }
      const viewpoint =
        observerCameraStyleRef.current === "limb"
          ? limbObserverViewpoint(
              observerCenter,
              targetPosition,
              observerDefinition.meanRadiusM,
              ECLIPTIC_NORTH,
              350_000,
              -30,
            )
          : surfaceObserverViewpoint(
              observerCenter,
              targetPosition,
              observerDefinition.meanRadiusM,
            );
      container.dataset["cameraObserverAltitudeKm"] =
        viewpoint.altitudeKm.toFixed(3);
      container.dataset["cameraObserverStyle"] = observerCameraStyleRef.current;
      return {
        position: viewpoint.position,
        up:
          observerCameraStyleRef.current === "limb"
            ? viewpoint.up
            : ECLIPTIC_NORTH,
      };
    };

    // The last footprint relative to Earth, where the shadow camera holds
    // while the shadow axis misses Earth.
    let heldShadowFootprintOffsetAu: Vector3 | undefined;
    const eclipseShadowFootprintPosition = (
      current: SimulationState,
    ): Vector3 => {
      const earthState = bodyStateById(current, "earth");
      const moonState = bodyStateById(current, "moon");
      const sunState = bodyStateById(current, "sun");
      if (
        earthState === undefined ||
        moonState === undefined ||
        sunState === undefined
      ) {
        throw new Error(
          "Eclipse camera requires the Sun, Earth, and Moon state",
        );
      }
      const earthPosition = scenePosition(earthState.positionM);
      const moonPosition = scenePosition(moonState.positionM);
      const sunPosition = scenePosition(sunState.positionM);
      const shadowDirection = moonPosition.clone().sub(sunPosition).normalize();
      const moonToEarth = earthPosition.clone().sub(moonPosition);
      const alongAxisAu = moonToEarth.dot(shadowDirection);
      const closestAxisPoint = moonPosition
        .clone()
        .addScaledVector(shadowDirection, alongAxisAu);
      const axisOffsetAu = closestAxisPoint.distanceTo(earthPosition);
      const earthRadiusAu =
        eclipseEarthDefinition.meanRadiusM / ASTRONOMICAL_UNIT_M;
      if (alongAxisAu <= 0 || axisOffsetAu >= earthRadiusAu) {
        // Before and after the eclipse the axis misses Earth: a true state,
        // not a fault. The camera holds over the spot where the shadow left;
        // with no such spot yet, over the point nearest the axis.
        return earthPosition
          .clone()
          .add(
            heldShadowFootprintOffsetAu ??
              closestAxisPoint
                .clone()
                .sub(earthPosition)
                .setLength(earthRadiusAu),
          );
      }
      const surfaceOffsetAu = Math.sqrt(
        earthRadiusAu * earthRadiusAu - axisOffsetAu * axisOffsetAu,
      );
      const footprint = closestAxisPoint.sub(
        shadowDirection.clone().multiplyScalar(surfaceOffsetAu),
      );
      heldShadowFootprintOffsetAu = footprint.clone().sub(earthPosition);
      return footprint;
    };

    const observerTargetPosition = (
      current: SimulationState,
      targetState: BodyState,
    ): Vector3 =>
      observerCameraStyleRef.current === "shadow-axis"
        ? eclipseShadowFootprintPosition(current)
        : scenePosition(targetState.positionM);

    const parentFacingCameraDirection = (
      bodyId: string,
      bodyPosition: Vector3,
      parentPosition: Vector3 | undefined,
      elapsedSeconds: number,
    ): Vector3 => {
      if (parentPosition === undefined) {
        return PERSPECTIVE_CAMERA_DIRECTION.clone();
      }
      const parentDirection = parentPosition
        .clone()
        .sub(bodyPosition)
        .normalize();
      if (bodyId !== "saturn" && bodyId !== "uranus") {
        return parentDirection
          .add(ECLIPTIC_NORTH.clone().multiplyScalar(0.2))
          .normalize();
      }
      const spinPole = new Vector3(0, 1, 0).applyQuaternion(
        bodyOrientationQuaternion(bodyId, elapsedSeconds),
      );
      const polePerpendicularToParent = spinPole.addScaledVector(
        parentDirection,
        -spinPole.dot(parentDirection),
      );
      if (polePerpendicularToParent.lengthSq() < 1e-12) {
        return parentDirection;
      }
      return parentDirection
        .add(polePerpendicularToParent.normalize().multiplyScalar(0.38))
        .normalize();
    };

    // Spacecraft and fictional models turn off the Sun line so their shadows
    // show the shape; planets and moons keep the near-full sunlit view.
    const sunFacingCameraDirection = (
      bodyId: string,
      bodyPosition: Vector3,
      sunPosition: Vector3,
      elapsedSeconds: number,
    ): Vector3 =>
      spacecraftBoundingRadiusM(bodyId) === undefined
        ? parentFacingCameraDirection(
            bodyId,
            bodyPosition,
            sunPosition,
            elapsedSeconds,
          )
        : sunlitModelViewDirection(
            sunPosition.clone().sub(bodyPosition),
            ECLIPTIC_NORTH,
          );

    const apolloInspectionPose = (): Readonly<{
      siteId: string;
      position: Vector3;
      target: Vector3;
      up: Vector3;
    }> | null => {
      const siteId = apolloInspectionSiteIdRef.current;
      if (siteId === null || focusBodyIdRef.current !== "moon") {
        return null;
      }
      const siteGroup = apolloSiteGroups.get(siteId);
      if (siteGroup === undefined) {
        throw new Error(`Apollo inspection site ${siteId} is unavailable`);
      }
      siteGroup.updateWorldMatrix(true, false);
      const origin = siteGroup.localToWorld(new Vector3(0, 0, 0));
      const target = siteGroup.localToWorld(new Vector3(0, 1.1, 0));
      const position = siteGroup.localToWorld(new Vector3(24, 11, 22));
      const up = siteGroup
        .localToWorld(new Vector3(0, 1, 0))
        .sub(origin)
        .normalize();
      return { siteId, position, target, up };
    };

    const applyApolloInspectionCamera = (): boolean => {
      const pose = apolloInspectionPose();
      if (pose === null) {
        delete container.dataset["apolloInspectionSite"];
        return false;
      }
      camera.near = 0.01 / ASTRONOMICAL_UNIT_M;
      camera.far = DEFAULT_CAMERA_FAR_AU;
      camera.updateProjectionMatrix();
      camera.position.copy(pose.position);
      camera.up.copy(pose.up);
      controls.target.copy(pose.target);
      controls.minDistance = 0.25 / ASTRONOMICAL_UNIT_M;
      controls.maxDistance = 500 / ASTRONOMICAL_UNIT_M;
      camera.lookAt(pose.target);
      viewZoomReferenceDistanceAu = camera.position.distanceTo(pose.target);
      container.dataset["focusDistanceAu"] =
        viewZoomReferenceDistanceAu.toFixed(12);
      container.dataset["apolloInspectionSite"] = pose.siteId;
      container.dataset["cameraOrientation"] = "apollo-site-inspection";
      return true;
    };

    const resetCamera = (
      requestedFocusBodyId: string | null,
      current: SimulationState | undefined,
    ): void => {
      if (requestedFocusBodyId === null || current === undefined) {
        camera.near = DEFAULT_CAMERA_NEAR_AU;
        camera.far = DEFAULT_CAMERA_FAR_AU;
        camera.updateProjectionMatrix();
        camera.position.copy(SOLAR_SYSTEM_CAMERA_POSITION);
        controls.target.set(0, 0, 0);
        viewZoomReferenceDistanceAu = SOLAR_SYSTEM_CAMERA_POSITION.length();
        controls.minDistance = 0;
        controls.maxDistance = Number.POSITIVE_INFINITY;
        delete container.dataset["focusDistanceAu"];
        delete container.dataset["cameraObserverBody"];
        delete container.dataset["cameraTargetBody"];
        delete container.dataset["cameraObserverAltitudeKm"];
        delete container.dataset["cameraObserverStyle"];
        return;
      }
      if (applyApolloInspectionCamera()) {
        return;
      }
      const focusDefinition = majorBodySnapshot.bodies.find(
        (body) => body.id === requestedFocusBodyId,
      );
      const knownFocusDefinition = knownSatelliteById.get(requestedFocusBodyId);
      const isIssFocus = requestedFocusBodyId === ISS_BODY_ID;
      const isVoyagerFocus = isVoyagerBodyId(requestedFocusBodyId);
      const isOperationalSpacecraftFocus =
        isOperationalSpacecraftBodyId(requestedFocusBodyId);
      const isJovianMonolithFocus =
        requestedFocusBodyId === JOVIAN_MONOLITH_BODY_ID;
      const isDiscoveryOneFocus =
        requestedFocusBodyId === DISCOVERY_ONE_BODY_ID;
      const isFictionalOrbiterFocus =
        isFictionalOrbiterId(requestedFocusBodyId);
      const isDeepSpaceNineObjectFocus =
        isDeepSpaceNineObjectId(requestedFocusBodyId);
      const isSpacecraftFocus =
        isIssFocus ||
        isVoyagerFocus ||
        isOperationalSpacecraftFocus ||
        isJovianMonolithFocus ||
        isDiscoveryOneFocus ||
        isFictionalOrbiterFocus ||
        isDeepSpaceNineObjectFocus;
      const focusState = bodyStateById(current, requestedFocusBodyId);
      if (
        (focusDefinition === undefined &&
          knownFocusDefinition === undefined &&
          !isIssFocus &&
          !isVoyagerFocus &&
          !isOperationalSpacecraftFocus &&
          !isJovianMonolithFocus &&
          !isDiscoveryOneFocus &&
          !isFictionalOrbiterFocus &&
          !isDeepSpaceNineObjectFocus) ||
        focusState === undefined
      ) {
        throw new Error(`Focus body ${requestedFocusBodyId} is unavailable`);
      }
      const focusPosition = scenePosition(focusState.positionM);
      const requestedTargetBodyId = cameraTargetBodyIdRef.current;
      const targetState =
        requestedTargetBodyId === undefined
          ? undefined
          : bodyStateById(current, requestedTargetBodyId);
      if (requestedTargetBodyId !== undefined && targetState === undefined) {
        throw new Error(
          `Camera target body ${requestedTargetBodyId} is unavailable`,
        );
      }
      camera.near = isSpacecraftFocus
        ? 0.05 / ASTRONOMICAL_UNIT_M
        : requestedTargetBodyId !== undefined &&
            observerCameraStyleRef.current === "limb"
          ? 100 / ASTRONOMICAL_UNIT_M
          : DEFAULT_CAMERA_NEAR_AU;
      camera.far = DEFAULT_CAMERA_FAR_AU;
      camera.updateProjectionMatrix();
      if (targetState !== undefined && requestedTargetBodyId !== undefined) {
        const targetPosition = observerTargetPosition(current, targetState);
        const observerPose = observerCameraPose(
          requestedFocusBodyId,
          focusState,
          targetPosition,
          current,
        );
        const observerPosition = observerPose.position;
        const observerDistance = observerPosition.distanceTo(targetPosition);
        if (!Number.isFinite(observerDistance) || observerDistance <= 0) {
          throw new Error(
            "Camera observer distance must be positive and finite",
          );
        }
        camera.position.copy(observerPosition);
        camera.up.copy(observerPose.up);
        controls.target.copy(targetPosition);
        controls.minDistance = camera.near * 2;
        controls.maxDistance = DEFAULT_CAMERA_FAR_AU * 0.9;
        viewZoomReferenceDistanceAu = observerDistance;
        camera.lookAt(targetPosition);
        container.dataset["cameraObserverBody"] = requestedFocusBodyId;
        container.dataset["cameraTargetBody"] = requestedTargetBodyId;
        container.dataset["focusDistanceAu"] = observerDistance.toFixed(8);
        return;
      }
      delete container.dataset["cameraObserverBody"];
      delete container.dataset["cameraTargetBody"];
      delete container.dataset["cameraObserverAltitudeKm"];
      delete container.dataset["cameraObserverStyle"];
      const overrideDistance = cameraDistanceOverrideAuRef.current;
      const focusDistance =
        (overrideDistance !== undefined &&
        fitCameraDistanceToPortraitRef.current
          ? portraitFitDistanceAu(overrideDistance, camera.aspect)
          : overrideDistance) ??
        (requestedFocusBodyId === "sun"
          ? SOLAR_SYSTEM_CAMERA_POSITION.length()
          : isSpacecraftFocus
            ? spacecraftFocusDistanceAu(requestedFocusBodyId)
            : focusDefinition === undefined
              ? 0.003
              : focusDistanceAu(focusDefinition, bodyVisibilityRef.current));
      if (!Number.isFinite(focusDistance) || focusDistance <= 0) {
        throw new Error("Camera focus distance must be positive and finite");
      }
      if (!isSpacecraftFocus) {
        camera.near = focusNearPlaneAu(focusDistance, DEFAULT_CAMERA_NEAR_AU);
        camera.updateProjectionMatrix();
      }
      const sunState = bodyStateById(current, "sun");
      const cameraDirection =
        requestedFocusBodyId === "sun" || sunState === undefined
          ? PERSPECTIVE_CAMERA_DIRECTION.clone()
          : sunFacingCameraDirection(
              requestedFocusBodyId,
              focusPosition,
              scenePosition(sunState.positionM),
              current.timeSeconds,
            );
      camera.position
        .copy(focusPosition)
        .add(cameraDirection.multiplyScalar(focusDistance));
      if (
        requestedFocusBodyId === "sun" &&
        deepSpacePresentationRef.current === "interstellar-scale"
      ) {
        const midpoint = focusPosition
          .clone()
          .add(alphaCentauriOffset.clone().multiplyScalar(0.5));
        const viewingDirection = alphaCentauriOffset
          .clone()
          .normalize()
          .cross(ECLIPTIC_NORTH)
          .normalize()
          .add(ECLIPTIC_NORTH.clone().multiplyScalar(0.22))
          .normalize();
        camera.position
          .copy(midpoint)
          .add(viewingDirection.multiplyScalar(focusDistance));
        controls.target.copy(midpoint);
      } else {
        controls.target.copy(focusPosition);
      }
      controls.minDistance = Math.max(
        isSpacecraftFocus
          ? (spacecraftBoundingRadiusM(requestedFocusBodyId) ?? 1) /
              ASTRONOMICAL_UNIT_M /
              8
          : focusDefinition === undefined
            ? camera.near * 2
            : focusDefinition.meanRadiusM / ASTRONOMICAL_UNIT_M / 2,
        camera.near * 2,
      );
      controls.maxDistance = DEFAULT_CAMERA_FAR_AU * 0.9;
      viewZoomReferenceDistanceAu = camera.position.distanceTo(controls.target);
      container.dataset["focusDistanceAu"] = focusDistance.toFixed(
        isSpacecraftFocus ? 12 : 8,
      );
    };

    const applyOrientationPreset = (
      preset: Exclude<CameraOrientationPreset, "custom">,
      requestedFocusBodyId: string | null,
      current: SimulationState | undefined,
    ): void => {
      if (applyApolloInspectionCamera()) {
        controls.update();
        return;
      }
      const requestedTargetBodyId = cameraTargetBodyIdRef.current;
      if (
        requestedTargetBodyId !== undefined &&
        current !== undefined &&
        requestedFocusBodyId !== null
      ) {
        const observerState = bodyStateById(current, requestedFocusBodyId);
        const targetState = bodyStateById(current, requestedTargetBodyId);
        if (observerState === undefined || targetState === undefined) {
          throw new Error(
            `Observer view ${requestedFocusBodyId} to ${requestedTargetBodyId} is unavailable`,
          );
        }
        const targetPosition = observerTargetPosition(current, targetState);
        const observerPose = observerCameraPose(
          requestedFocusBodyId,
          observerState,
          targetPosition,
          current,
        );
        camera.position.copy(observerPose.position);
        controls.target.copy(targetPosition);
        camera.up.copy(observerPose.up);
        camera.lookAt(controls.target);
        controls.update();
        container.dataset["cameraOrientation"] = "observer-facing";
        container.dataset["cameraObserverBody"] = requestedFocusBodyId;
        container.dataset["cameraTargetBody"] = requestedTargetBodyId;
        return;
      }
      if (
        requestedFocusBodyId === "sun" &&
        deepSpacePresentationRef.current === "interstellar-scale"
      ) {
        camera.up.copy(ECLIPTIC_NORTH);
        camera.lookAt(controls.target);
        controls.update();
        container.dataset["cameraOrientation"] = "interstellar-scale";
        return;
      }
      const currentDistance = camera.position.distanceTo(controls.target);
      const distance =
        Number.isFinite(currentDistance) && currentDistance > camera.near * 2
          ? currentDistance
          : SOLAR_SYSTEM_CAMERA_POSITION.length();
      const focusState =
        current === undefined || requestedFocusBodyId === null
          ? undefined
          : bodyStateById(current, requestedFocusBodyId);
      const target =
        focusState === undefined
          ? requestedFocusBodyId === null
            ? new Vector3(0, 0, 0)
            : controls.target.clone()
          : scenePosition(focusState.positionM);
      const parentId =
        requestedFocusBodyId === null
          ? undefined
          : parentBodyId(requestedFocusBodyId);
      const parentState =
        current === undefined || parentId === undefined
          ? undefined
          : bodyStateById(current, parentId);
      const sunState =
        current === undefined ? undefined : bodyStateById(current, "sun");
      let direction: Vector3;
      if (preset === "overhead") {
        direction = ECLIPTIC_NORTH.clone();
        camera.up.copy(ECLIPTIC_FORWARD);
      } else if (preset === "edge-on") {
        direction = ECLIPTIC_FORWARD.clone();
        camera.up.copy(ECLIPTIC_NORTH);
      } else if (
        preset === "sun-facing" &&
        focusState !== undefined &&
        sunState !== undefined
      ) {
        direction = sunFacingCameraDirection(
          requestedFocusBodyId ?? "sun",
          target,
          scenePosition(sunState.positionM),
          current?.timeSeconds ?? 0,
        );
        camera.up.copy(ECLIPTIC_NORTH);
      } else if (
        preset === "terminator" &&
        focusState !== undefined &&
        sunState !== undefined
      ) {
        const sunwardDirection = scenePosition(sunState.positionM)
          .sub(target)
          .normalize();
        direction = sunwardDirection.cross(ECLIPTIC_NORTH).normalize();
        if (direction.lengthSq() < 1e-12) {
          direction.copy(ECLIPTIC_FORWARD);
        }
        camera.up.copy(ECLIPTIC_NORTH);
      } else if (preset === "parent-facing" && focusState !== undefined) {
        direction = parentFacingCameraDirection(
          requestedFocusBodyId ?? "sun",
          target,
          parentState === undefined
            ? undefined
            : scenePosition(parentState.positionM),
          current?.timeSeconds ?? 0,
        );
        camera.up.copy(ECLIPTIC_NORTH);
      } else if (
        preset === "velocity" &&
        focusState !== undefined &&
        parentState !== undefined
      ) {
        direction = icrfToScene({
          x: parentState.velocityMps[0] - focusState.velocityMps[0],
          y: parentState.velocityMps[1] - focusState.velocityMps[1],
          z: parentState.velocityMps[2] - focusState.velocityMps[2],
        })
          .normalize()
          .add(ECLIPTIC_NORTH.clone().multiplyScalar(0.12))
          .normalize();
        camera.up.copy(ECLIPTIC_NORTH);
      } else if (
        preset === "orbital-plane" &&
        focusState !== undefined &&
        parentState !== undefined
      ) {
        const relativePosition = scenePosition(focusState.positionM).sub(
          scenePosition(parentState.positionM),
        );
        const relativeVelocity = icrfToScene({
          x: focusState.velocityMps[0] - parentState.velocityMps[0],
          y: focusState.velocityMps[1] - parentState.velocityMps[1],
          z: focusState.velocityMps[2] - parentState.velocityMps[2],
        });
        direction = relativePosition.cross(relativeVelocity).normalize();
        camera.up.copy(ECLIPTIC_FORWARD);
      } else {
        direction = PERSPECTIVE_CAMERA_DIRECTION.clone();
        camera.up.copy(ECLIPTIC_NORTH);
      }
      camera.position.copy(target).add(direction.multiplyScalar(distance));
      controls.target.copy(target);
      camera.lookAt(target);
      controls.update();
      container.dataset["cameraOrientation"] = preset;
    };

    const beginOrientationTransition = (
      preset: Exclude<CameraOrientationPreset, "custom">,
      requestedFocusBodyId: string | null,
      current: SimulationState | undefined,
    ): void => {
      const startTarget = controls.target.clone();
      const startOffset = camera.position.clone().sub(startTarget);
      const startUp = camera.up.clone();
      applyOrientationPreset(preset, requestedFocusBodyId, current);
      const endOffset = camera.position.clone().sub(controls.target);
      const endUp = camera.up.clone();
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        activeOrientationTransition = undefined;
        container.dataset["orientationTransitionPhase"] = "settled";
        return;
      }
      camera.position.copy(startTarget).add(startOffset);
      controls.target.copy(startTarget);
      camera.up.copy(startUp);
      camera.lookAt(startTarget);
      activeOrientationTransition = {
        startedAtMs: performance.now(),
        startOffset,
        endOffset,
        turnSide: chooseTurnSide(startOffset, endOffset, ECLIPTIC_NORTH),
        startUp,
        endUp,
      };
      container.dataset["orientationTransitionPhase"] = "rotating";
      container.dataset["orientationTransitionDurationMs"] = String(
        ORIENTATION_PRESET_TRANSITION_DURATION_MS,
      );
    };

    const updateOrientationTransition = (nowMs: number): void => {
      const transition = activeOrientationTransition;
      if (transition === undefined) {
        return;
      }
      const sample = sampleOrientationTransition(
        Math.max(0, nowMs - transition.startedAtMs),
        ORIENTATION_PRESET_TRANSITION_DURATION_MS,
      );
      const target = scratchOrientationTarget.copy(controls.target);
      const startPosition = scratchOrientationStart
        .copy(target)
        .add(transition.startOffset);
      applyAnchoredCameraMove(
        camera.position,
        startPosition,
        anchoredCameraMove(
          scratchCameraMove,
          startPosition,
          scratchOrientationEnd.copy(target).add(transition.endOffset),
          target,
          sample.progress,
          transition.turnSide,
        ),
      );
      camera.up
        .lerpVectors(transition.startUp, transition.endUp, sample.progress)
        .normalize();
      camera.lookAt(target);
      if (sample.settled) {
        activeOrientationTransition = undefined;
        container.dataset["orientationTransitionPhase"] = "settled";
      }
    };

    const completeCameraTransition = (): void => {
      if (activeCameraTransition === undefined) {
        return;
      }
      const transition = activeCameraTransition;
      camera.position.copy(transition.endPosition);
      controls.target.copy(transition.endTarget);
      camera.up.copy(transition.endUp);
      camera.near = transition.endNear;
      camera.far = transition.endFar;
      camera.updateProjectionMatrix();
      container.dataset["cameraNearAu"] = camera.near.toPrecision(9);
      delete container.dataset["cameraTransitionDestinationDistanceAu"];
      controls.minDistance = transition.endMinimumDistance;
      controls.maxDistance = transition.endMaximumDistance;
      controls.enabled = true;
      camera.lookAt(transition.endTarget);
      viewZoomReferenceDistanceAu = camera.position.distanceTo(controls.target);
      lastReportedViewZoom = camera.zoom;
      container.dataset["viewMagnification"] = camera.zoom.toFixed(4);
      onViewZoomChangeRef.current(camera.zoom);
      const settledPreset = orientationPresetRef.current;
      container.dataset["cameraTracking"] =
        transition.destinationTargetBodyId !== undefined
          ? "observer-and-target"
          : settledPreset === "sun-facing" ||
              settledPreset === "terminator" ||
              settledPreset === "parent-facing" ||
              settledPreset === "velocity" ||
              settledPreset === "orbital-plane"
            ? "continuous"
            : "position-only";
      activeCameraTransition = undefined;
      cameraJourney.hidden = true;
      if (announceFlightsRef.current) {
        cameraJourneyAnnouncer.textContent = `Arrived at ${transition.destinationName}`;
      }
      container.dataset["cameraTransitionPhase"] = "settled";
      container.dataset["cameraTransitionSpeedMps"] = "0.000";
      container.dataset["cameraTransitionRemainingDistanceAu"] = "0.000000";
      container.dataset["cameraTransitionSequence"] = String(
        transition.sequence,
      );
      onCameraTransitionSettledRef.current(transition.sequence);
    };

    interruptCameraTransition = (): void => {
      if (activeOrientationTransition !== undefined) {
        activeOrientationTransition = undefined;
        container.dataset["orientationTransitionPhase"] = "interrupted";
      }
      if (activeCameraTransition === undefined) return;
      const sequence = activeCameraTransition.sequence;
      activeCameraTransition = undefined;
      controls.enabled = true;
      cameraJourney.hidden = true;
      cameraJourneyAnnouncer.textContent = "";
      container.dataset["cameraTransitionPhase"] = "settled";
      container.dataset["cameraTransitionSpeedMps"] = "0.000";
      container.dataset["cameraTransitionInterrupted"] = String(sequence);
      onCameraTransitionSettledRef.current(sequence);
    };

    const beginCameraTransition = (
      requestedFocusBodyId: string | null,
      current: SimulationState,
    ): boolean => {
      const sequence = cameraTransitionSequenceRef.current;
      const durationMs = cameraTransitionDurationMsRef.current;
      if (
        sequence === lastCameraTransitionSequence ||
        !Number.isFinite(durationMs) ||
        durationMs <= 0
      ) {
        return false;
      }
      if (activeCameraTransition !== undefined) {
        completeCameraTransition();
      }
      activeOrientationTransition = undefined;
      const startPosition = camera.position.clone();
      const startTarget = controls.target.clone();
      const startUp = camera.up.clone();
      resetCamera(requestedFocusBodyId, current);
      const requestedPreset = orientationPresetRef.current;
      applyOrientationPreset(
        requestedPreset === "custom"
          ? requestedFocusBodyId === null
            ? "perspective"
            : "sun-facing"
          : requestedPreset,
        requestedFocusBodyId,
        current,
      );
      const endPosition = camera.position.clone();
      const endTarget = controls.target.clone();
      // The overview flight closes in on its look target.
      const destinationCentre = endTarget.clone();
      if (requestedFocusBodyId === "moon" && apolloInspectionPose() !== null) {
        moonSurfaceMesh.getWorldPosition(destinationCentre);
      } else if (requestedFocusBodyId !== null) {
        const destinationState = bodyStateById(current, requestedFocusBodyId);
        if (destinationState === undefined) {
          throw new Error(
            `Flight destination ${requestedFocusBodyId} is unavailable`,
          );
        }
        destinationCentre.copy(scenePosition(destinationState.positionM));
      }
      const startLookDistanceAu = Math.max(
        startPosition.distanceTo(startTarget),
        DEFAULT_CAMERA_NEAR_AU * 10,
      );
      const destinationLookDirection = endTarget.clone().sub(startPosition);
      const orientationTarget =
        destinationLookDirection.lengthSq() <= Number.EPSILON
          ? endTarget.clone()
          : startPosition
              .clone()
              .add(
                destinationLookDirection
                  .normalize()
                  .multiplyScalar(startLookDistanceAu),
              );
      const bodyName = (bodyId: string | null | undefined): string => {
        if (bodyId === null || bodyId === undefined || bodyId === "") {
          return "the Solar System";
        }
        // "Turning toward the International Space Station" reads as English.
        if (bodyId === ISS_BODY_ID) return "the International Space Station";
        return bodyDisplayName(bodyId);
      };
      const transitionStartedAtMs = performance.now();
      activeCameraTransition = {
        sequence,
        startedAtMs: transitionStartedAtMs,
        durationMs,
        startPosition,
        startTarget,
        startUp,
        orientationTarget,
        endPosition,
        endTarget,
        endOffset: endPosition.clone().sub(endTarget),
        destinationCentre,
        turnSide: chooseTurnSide(
          startPosition.clone().sub(destinationCentre),
          endPosition.clone().sub(destinationCentre),
          ECLIPTIC_NORTH,
        ),
        destinationFocusBodyId: requestedFocusBodyId,
        destinationTargetBodyId: cameraTargetBodyIdRef.current,
        destinationName: bodyName(requestedFocusBodyId),
        endUp: camera.up.clone(),
        endNear: camera.near,
        endFar: camera.far,
        endMinimumDistance: controls.minDistance,
        endMaximumDistance: controls.maxDistance,
        lastSpeedSampleAtMs: transitionStartedAtMs,
        smoothedSpeedMps: 0,
      };
      lastCameraTransitionSequence = sequence;
      // On a phone the open map covers the facts card; a flight closes it.
      if (phoneLayoutQuery.matches) {
        navigationMap.open = false;
      }
      camera.position.copy(startPosition);
      controls.target.copy(startTarget);
      camera.up.copy(startUp);
      camera.near = DEFAULT_CAMERA_NEAR_AU;
      camera.far = DEFAULT_CAMERA_FAR_AU;
      camera.updateProjectionMatrix();
      controls.minDistance = 0;
      controls.maxDistance = Number.POSITIVE_INFINITY;
      controls.enabled = true;
      container.dataset["cameraTransitionPhase"] = "orienting";
      container.dataset["cameraTransitionSequence"] = String(sequence);
      container.dataset["cameraTransitionOverviewAnchor"] =
        "not-used-direct-flight";
      container.dataset["cameraTransitionDestinationAnchor"] =
        requestedFocusBodyId ?? "camera-target";
      container.dataset["cameraTransitionDurationMs"] = String(durationMs);
      container.dataset["cameraTransitionSpeedDefinition"] =
        "camera-displacement-per-real-second";
      container.dataset["cameraTransitionSpeedMps"] = "0.000";
      container.dataset["cameraTransitionInterpolation"] =
        "orient-then-direct-flight";
      container.dataset["cameraTransitionRoute"] = "current-to-destination";
      container.dataset["cameraTransitionRoutePoints"] = "2";
      container.dataset["cameraTransitionRemainingDistanceAu"] = startPosition
        .distanceTo(endPosition)
        .toFixed(6);
      cameraJourney.hidden = false;
      cameraJourney.title =
        "Viewpoint speed is camera displacement per real second, not a physical spacecraft velocity";
      cameraJourney.textContent = `Turning toward ${activeCameraTransition.destinationName}`;
      if (announceFlightsRef.current) {
        cameraJourneyAnnouncer.textContent = `Flying to ${activeCameraTransition.destinationName}`;
      }
      return true;
    };

    const updateCameraTransition = (
      nowMs: number,
      current: SimulationState | undefined,
    ): void => {
      const transition = activeCameraTransition;
      if (transition === undefined) {
        return;
      }
      const previousCameraPosition = camera.position.clone();
      const updateJourneyStatus = (
        status: string,
        displaySpeed: boolean,
      ): void => {
        const sampleIntervalSeconds = Math.max(
          (nowMs - transition.lastSpeedSampleAtMs) / 1_000,
          1 / 240,
        );
        const instantaneousSpeedMps =
          (camera.position.distanceTo(previousCameraPosition) *
            ASTRONOMICAL_UNIT_M) /
          sampleIntervalSeconds;
        if (!Number.isFinite(instantaneousSpeedMps)) {
          throw new Error("Camera transition speed is not finite");
        }
        if (displaySpeed) {
          const smoothingFactor = 1 - Math.exp(-sampleIntervalSeconds / 0.18);
          transition.smoothedSpeedMps +=
            (instantaneousSpeedMps - transition.smoothedSpeedMps) *
            smoothingFactor;
        } else {
          transition.smoothedSpeedMps = 0;
        }
        transition.lastSpeedSampleAtMs = nowMs;
        container.dataset["cameraTransitionSpeedMps"] =
          transition.smoothedSpeedMps.toFixed(3);
        cameraJourney.textContent = displaySpeed
          ? `${status} · Viewpoint speed ${formatViewpointSpeed(
              transition.smoothedSpeedMps,
            )}`
          : status;
      };
      const elapsedMs = Math.max(0, nowMs - transition.startedAtMs);
      container.dataset["cameraTransitionElapsedMs"] = elapsedMs.toFixed(1);
      const inspectionPose = apolloInspectionPose();
      if (
        inspectionPose !== null &&
        transition.destinationFocusBodyId === "moon"
      ) {
        transition.endPosition.copy(inspectionPose.position);
        transition.endTarget.copy(inspectionPose.target);
        transition.endUp.copy(inspectionPose.up);
        transition.endOffset.copy(
          inspectionPose.position.clone().sub(inspectionPose.target),
        );
        moonSurfaceMesh.getWorldPosition(transition.destinationCentre);
      } else if (
        current !== undefined &&
        transition.destinationFocusBodyId !== null
      ) {
        const focusState = bodyStateById(
          current,
          transition.destinationFocusBodyId,
        );
        const targetState =
          transition.destinationTargetBodyId === undefined
            ? undefined
            : bodyStateById(current, transition.destinationTargetBodyId);
        if (focusState !== undefined) {
          transition.destinationCentre.copy(
            scenePosition(focusState.positionM),
          );
          transition.endTarget.copy(
            targetState === undefined
              ? scenePosition(focusState.positionM)
              : observerTargetPosition(current, targetState),
          );
          if (
            targetState !== undefined &&
            transition.destinationTargetBodyId !== undefined
          ) {
            const observerPose = observerCameraPose(
              transition.destinationFocusBodyId,
              focusState,
              transition.endTarget,
              current,
            );
            transition.endPosition.copy(observerPose.position);
            transition.endUp.copy(observerPose.up);
          } else {
            transition.endPosition
              .copy(transition.endTarget)
              .add(transition.endOffset);
          }
        }
      }
      const directSample = sampleDirectCameraTransition(
        elapsedMs,
        transition.durationMs,
      );
      container.dataset["cameraTransitionPhase"] = directSample.phase;
      if (directSample.phase === "settled") {
        completeCameraTransition();
        return;
      }
      if (directSample.phase === "orienting") {
        camera.position.copy(transition.startPosition);
        controls.target.lerpVectors(
          transition.startTarget,
          transition.orientationTarget,
          directSample.segmentProgress,
        );
        camera.up
          .lerpVectors(
            transition.startUp,
            ECLIPTIC_NORTH,
            directSample.segmentProgress,
          )
          .normalize();
        updateJourneyStatus(
          `Turning toward ${transition.destinationName}`,
          false,
        );
      } else {
        // A straight line keeps the destination under a pixel until the last
        // moment; closing the distance to the destination's centre by a
        // constant factor per step lets the child watch it grow, and keeps
        // the camera outside it. The look target rides the same move, so a
        // flight to a body stays centred on it; an observer's look target
        // then slides to the body it looks at.
        const move = anchoredCameraMove(
          scratchCameraMove,
          transition.startPosition,
          transition.endPosition,
          transition.destinationCentre,
          directSample.segmentProgress,
          transition.turnSide,
        );
        applyAnchoredCameraMove(
          camera.position,
          transition.startPosition,
          move,
        );
        applyAnchoredCameraMove(
          controls.target,
          transition.orientationTarget,
          move,
        ).lerp(transition.endTarget, directSample.segmentProgress);
        // The near plane shrinks with the distance to the destination and
        // reaches the arrival's own near plane on arrival, so the camera never
        // cuts into a small body or a landing site it closes in on. The
        // logarithmic depth buffer keeps the depth order over the range.
        const destinationDistanceAu = camera.position.distanceTo(
          transition.destinationCentre,
        );
        camera.near = Math.min(
          DEFAULT_CAMERA_NEAR_AU,
          (transition.endNear * destinationDistanceAu) /
            transition.endPosition.distanceTo(transition.destinationCentre),
        );
        camera.updateProjectionMatrix();
        container.dataset["cameraNearAu"] = camera.near.toPrecision(9);
        container.dataset["cameraTransitionDestinationDistanceAu"] =
          destinationDistanceAu.toPrecision(9);
        camera.up
          .lerpVectors(
            ECLIPTIC_NORTH,
            transition.endUp,
            directSample.segmentProgress,
          )
          .normalize();
        updateJourneyStatus(
          directSample.phase === "arriving"
            ? `Approaching ${transition.destinationName}`
            : `Travelling to ${transition.destinationName}`,
          true,
        );
      }
      container.dataset["cameraTransitionRemainingDistanceAu"] = camera.position
        .distanceTo(transition.endPosition)
        .toFixed(6);
      camera.lookAt(controls.target);
    };

    const applyCameraNavigationCommand = (
      command: CameraNavigationCommand,
      requestedFocusBodyId: string | null,
      current: SimulationState | undefined,
    ): boolean => {
      completeCameraTransition();
      if (
        command.action === "fit-selection" &&
        requestedFocusBodyId !== null &&
        current === undefined
      ) {
        return false;
      }
      if (command.action === "fit-selection") {
        resetCamera(requestedFocusBodyId, current);
        const requestedPreset = orientationPresetRef.current;
        applyOrientationPreset(
          requestedPreset === "custom"
            ? requestedFocusBodyId === null
              ? "perspective"
              : "sun-facing"
            : requestedPreset,
          requestedFocusBodyId,
          current,
        );
      } else {
        const currentDistance = camera.position.distanceTo(controls.target);
        const distanceMultiplier = command.action === "zoom-in" ? 1 / 1.7 : 1.7;
        const maximumDistance = Number.isFinite(controls.maxDistance)
          ? controls.maxDistance
          : camera.far / 2;
        const nextDistance = Math.min(
          maximumDistance,
          Math.max(controls.minDistance, currentDistance * distanceMultiplier),
        );
        const direction = camera.position
          .clone()
          .sub(controls.target)
          .normalize();
        camera.position
          .copy(controls.target)
          .add(direction.multiplyScalar(nextDistance));
        controls.update();
      }
      container.dataset["cameraNavigationAction"] = command.action;
      container.dataset["cameraNavigationSequence"] = String(command.sequence);
      return true;
    };

    let animationFrame = 0;
    let startupTimer = 0;
    const render = (): void => {
      // One layout read per frame: every later read would follow DOM writes
      // and force another style recalculation.
      const viewportWidth = container.clientWidth;
      const viewportHeight = container.clientHeight;
      // Guides stay out from under the bottom panels, which float over the
      // scene and draw above the guide labels: the time controls and the
      // short facts card. Beside a panel the sky stays open down to the
      // bottom edge. A panel never takes more than the lower half of the
      // scene. Measured here with the size, before this frame writes.
      const sceneBox =
        wayfinderModeRef.current === "off"
          ? undefined
          : container.getBoundingClientRect();
      const guideObstacles =
        sceneBox === undefined
          ? []
          : [
              ...(container.parentElement?.querySelectorAll(
                ".timeline-dock, .selected-body-detail.is-collapsed",
              ) ?? []),
            ]
              .map((panel) => panel.getBoundingClientRect())
              .filter((box) => box.height > 0)
              .map((box) => ({
                left: box.left - sceneBox.left,
                right: box.right - sceneBox.left,
                top: Math.min(
                  viewportHeight,
                  Math.max(viewportHeight / 2, box.top - sceneBox.top),
                ),
              }));
      const frameRenderStartedAtMs = performance.now();
      const frameIntervalMs = Math.max(
        0.001,
        frameRenderStartedAtMs - lastRenderedAtMs,
      );
      lastRenderedAtMs = frameRenderStartedAtMs;
      frameIntervalEmaMs = frameIntervalEmaMs * 0.92 + frameIntervalMs * 0.08;
      const activeVisualQuality = visualQualityRef.current;
      if (activeVisualQuality !== lastVisualQuality) {
        applyVisualQuality(activeVisualQuality);
      }
      const detailedModelBodyIds = new Set([
        focusBodyIdRef.current,
        selectedBodyIdRef.current,
      ]);
      if (
        detailedModelBodyIds.has(DEEP_SPACE_NINE_BODY_ID) ||
        detailedModelBodyIds.has(USS_DEFIANT_BODY_ID)
      ) {
        detailedModelBodyIds.add(DEEP_SPACE_NINE_BODY_ID);
        detailedModelBodyIds.add(USS_DEFIANT_BODY_ID);
      }
      for (const bodyId of detailedModelBodyIds) {
        if (bodyId !== null) {
          ensureSourcedModel(bodyId);
        }
      }
      const requestedFrame = frameRef.current;
      if (clearTrailsTokenRef.current !== lastClearTrailsToken) {
        lastClearTrailsToken = clearTrailsTokenRef.current;
        clearTrails();
        setData(container, "clearTrailsToken", String(lastClearTrailsToken));
      }
      const currentVisibility = objectVisibilityRef.current;
      stars.visible = currentVisibility.stars;
      setData(container, "starsVisible", String(stars.visible));
      zodiacGroup.visible = showZodiacRef.current;
      setHidden(zodiacLegend, !zodiacGroup.visible);
      setData(container, "zodiacVisible", String(zodiacGroup.visible));
      const smallBodiesVisible =
        viewModeRef.current === "orrery" &&
        (currentVisibility.asteroids || currentVisibility.comets);
      setHidden(gpuCanvas, !smallBodiesVisible);
      if (smallBodiesVisible) {
        ensureGpuLayer();
      }
      if (
        requestedFrame !== undefined &&
        requestedFrame.end.timeSeconds !== activeFrameEndTime
      ) {
        activeFrameEndTime = requestedFrame.end.timeSeconds;
        const simulatedSecondsPerSecond =
          requestedFrame.transitionDurationMs <= 0
            ? 0
            : (Math.abs(
                requestedFrame.end.timeSeconds -
                  requestedFrame.start.timeSeconds,
              ) /
                requestedFrame.transitionDurationMs) *
              1_000;
        const motionTreatment =
          simulatedSecondsPerSecond >= 7 * 86_400
            ? "high-speed"
            : simulatedSecondsPerSecond >= 86_400
              ? "accelerated"
              : "precise";
        setData(container, "motionTreatment", motionTreatment);
        planetTrailMaterial.opacity =
          motionTreatment === "high-speed"
            ? 0.82
            : motionTreatment === "accelerated"
              ? 0.7
              : 0.62;
        moonTrailMaterial.opacity =
          motionTreatment === "high-speed"
            ? 0.92
            : motionTreatment === "accelerated"
              ? 0.84
              : 0.78;
        orbitGuideSourceState = requestedFrame.end;
        const trailQueue = trailQueueRef.current;
        if (trailQueue.dropped) {
          trailQueue.dropped = false;
          clearTrails();
          trailGapCount += 1;
          setData(container, "trailGapCount", String(trailGapCount));
        }
        for (const trailStep of trailQueue.steps.splice(0)) {
          updateTrail(trailStep.state, trailStep.jumped);
        }
      }
      const current = displayedStateRef.current;
      if (requestedFrame !== undefined && current !== undefined) {
        const frameDurationSeconds =
          requestedFrame.end.timeSeconds - requestedFrame.start.timeSeconds;
        const transitionFraction =
          frameDurationSeconds === 0
            ? 1
            : (current.timeSeconds - requestedFrame.start.timeSeconds) /
              frameDurationSeconds;
        setData(
          container,
          "interpolationFraction",
          Math.max(0, Math.min(1, transitionFraction)).toFixed(4),
        );
        setData(
          container,
          "renderedTimeSeconds",
          current.timeSeconds.toFixed(3),
        );
      }

      const exposureReferenceBodyId =
        surfaceObserverRef.current?.bodyId ?? focusBodyIdRef.current;
      let exposureDistanceFromSunAu: number | undefined;
      if (
        current !== undefined &&
        exposureReferenceBodyId !== null &&
        exposureReferenceBodyId !== "sun"
      ) {
        const exposureBodyState = bodyStateById(
          current,
          exposureReferenceBodyId,
        );
        const exposureSunState = bodyStateById(current, "sun");
        if (exposureBodyState !== undefined && exposureSunState !== undefined) {
          exposureDistanceFromSunAu = scenePosition(
            exposureBodyState.positionM,
          ).distanceTo(scenePosition(exposureSunState.positionM));
        }
      }
      const activeVisualProfile = VISUAL_QUALITY_PROFILES[activeVisualQuality];
      const targetExposure =
        exposureModeRef.current === "manual"
          ? activeVisualProfile.baseExposure *
            exposureMultiplierFromEv(manualExposureEvRef.current)
          : solarExposureForDistanceAu(
              activeVisualQuality,
              exposureDistanceFromSunAu,
            );
      currentExposure = adaptExposure(
        currentExposure,
        targetExposure,
        Math.min(frameIntervalMs, 250) / 1_000,
        activeVisualProfile.exposureHalfLifeSeconds,
      );
      renderer.toneMappingExposure = currentExposure;
      for (const ringVisual of ringVisuals.values()) {
        for (const material of ringVisual.materials) {
          setRequiredNumberUniform(
            material,
            "displayExposure",
            currentExposure,
          );
        }
      }
      setData(container, "cameraExposure", currentExposure.toFixed(5));
      setData(container, "cameraExposureTarget", targetExposure.toFixed(5));
      setData(container, "cameraExposureMode", exposureModeRef.current);
      setData(
        container,
        "cameraExposureEv",
        Math.log2(currentExposure / activeVisualProfile.baseExposure).toFixed(
          3,
        ),
      );
      const currentExposureEv = Math.log2(
        currentExposure / activeVisualProfile.baseExposure,
      );
      if (
        lastReportedExposureMode !== exposureModeRef.current ||
        !Number.isFinite(lastReportedExposureEv) ||
        Math.abs(currentExposureEv - lastReportedExposureEv) >= 0.01
      ) {
        lastReportedExposureEv = currentExposureEv;
        lastReportedExposureMode = exposureModeRef.current;
        onExposureStatusChangeRef.current({
          ev: currentExposureEv,
          multiplier: currentExposure,
          mode: exposureModeRef.current,
        });
      }
      setData(
        container,
        "exposureReferenceDistanceAu",
        exposureDistanceFromSunAu?.toFixed(6) ?? "system-overview",
      );

      for (const body of majorBodySnapshot.bodies) {
        const mesh = bodyMeshes.get(body.id);
        if (mesh !== undefined) {
          mesh.visible = isMajorBodyVisible(body.type, currentVisibility);
        }
      }
      const asteroidsVisible =
        viewModeRef.current === "orrery" && currentVisibility.asteroids;
      const cometsVisible =
        viewModeRef.current === "orrery" && currentVisibility.comets;
      setData(gpuCanvas, "asteroidsVisible", String(asteroidsVisible));
      setData(gpuCanvas, "cometsVisible", String(cometsVisible));
      setData(
        gpuCanvas,
        "locatorMode",
        viewModeRef.current === "orrery" ? "orrery" : "disabled",
      );
      gpuLayer?.setCategoryVisibility(asteroidsVisible, cometsVisible);
      gpuLayer?.setTrailSettings(
        showMinorBodyTrailsRef.current && activeCameraTransition === undefined,
        trailDurationSecondsRef.current,
        trailFadeRef.current,
        clearTrailsTokenRef.current,
      );
      const sceneMutationKey =
        current === undefined
          ? ""
          : [
              current.timeSeconds,
              currentVisibility.planets,
              currentVisibility.moons,
              currentVisibility.spacecraft,
              focusBodyIdRef.current,
              bodyVisibilityRef.current,
              viewModeRef.current,
              showMoonTrailRef.current,
              showPlanetTrailsRef.current,
              showOrbitGuidesRef.current,
              orbitGuideScopeRef.current,
              showEclipticPlaneRef.current,
              gravityWellModeRef.current,
              gravityWellScaleRef.current,
              referenceFrameRef.current,
              trailDurationSecondsRef.current,
              trailFadeRef.current,
              clearTrailsTokenRef.current,
              resetViewTokenRef.current,
              // An eclipse step's shadow camera and umbra start when its
              // clock lands, which can leave the time unchanged.
              observerCameraStyleRef.current,
              eclipseShadowVisibleRef.current,
              sourcedModelsLoadedCount,
            ].join("|");
      if (current !== undefined && sceneMutationKey !== lastSceneMutationKey) {
        lastSceneMutationKey = sceneMutationKey;
        updateStarPositions(current.timeSeconds);
        const sceneBodyPositions = new Map(
          current.bodies.map((body) => [
            body.id,
            scenePosition(body.positionM),
          ]),
        );
        for (const orbiter of FICTIONAL_ORBITERS) {
          const orbiterState = fictionalOrbiterStateById(current, orbiter.id);
          sceneBodyPositions.set(
            orbiter.id,
            scenePosition(orbiterState.positionM),
          );
        }
        const discoveryState = discoveryOneState(current);
        sceneBodyPositions.set(
          DISCOVERY_ONE_BODY_ID,
          scenePosition(discoveryState.positionM),
        );
        for (const object of DEEP_SPACE_NINE_OBJECTS) {
          const objectState = deepSpaceNineObjectStateById(current, object.id);
          sceneBodyPositions.set(
            object.id,
            scenePosition(objectState.positionM),
          );
        }
        const gravityMode = gravityWellModeRef.current;
        const gravityFocusId = focusBodyIdRef.current;
        const gravityCenterState = bodyStateById(
          current,
          gravityFocusId ?? "sun",
        );
        // A focused body outside its ephemeris window (the ISS, Hubble, JWST)
        // has no state, so the field has no centre and is not drawn.
        let gravityDiagnostics: GravityWellDiagnostics | undefined;
        if (gravityMode === "off" || gravityCenterState === undefined) {
          gravityDiagnostics = gravityWellLayer.update({ mode: "off" });
        } else {
          const gravitySources: GravityPotentialSource[] = current.bodies
            .filter((body) => body.gravitationalParameterM3S2 > 0)
            .map((body) => {
              const definition = majorBodyById.get(body.id);
              if (definition === undefined) {
                throw new Error(
                  `Positive-GM body ${body.id} has no sourced gravity-well radius`,
                );
              }
              const position = scenePosition(body.positionM);
              return {
                id: body.id,
                gravitationalParameterM3S2: body.gravitationalParameterM3S2,
                positionAu: [position.x, position.y, position.z],
                radiusAu: definition.meanRadiusM / ASTRONOMICAL_UNIT_M,
              };
            });
          const gravityCenter = scenePosition(gravityCenterState.positionM);
          gravityDiagnostics = gravityWellLayer.update({
            mode: gravityMode,
            scale: gravityWellScaleRef.current,
            centerAu: [gravityCenter.x, gravityCenter.y, gravityCenter.z],
            extentAu: gravityFieldExtentAu(
              gravityFocusId,
              bodyVisibilityRef.current,
            ),
            sources: gravitySources,
          });
        }
        setData(container, "gravityWellMode", gravityMode);
        setData(container, "gravityWellScale", gravityWellScaleRef.current);
        setData(
          container,
          "gravityWellVisible",
          String(gravityDiagnostics !== undefined),
        );
        setData(
          container,
          "gravityPotentialEquation",
          "negative-sum-gm-over-r",
        );
        setData(
          container,
          "gravityPotentialInterior",
          "mean-radius-surface-cap",
        );
        setData(container, "gravityPotentialDisplay", "log2-only");
        if (gravityDiagnostics === undefined) {
          delete container.dataset["gravityPotentialSourceCount"];
          delete container.dataset["gravityPotentialMinimumJPerKg"];
          delete container.dataset["gravityPotentialMaximumJPerKg"];
          delete container.dataset["gravityWellExtentAu"];
          delete container.dataset["gravityWellDepthAu"];
          delete container.dataset["gravityFieldTimeSeconds"];
        } else {
          setData(
            container,
            "gravityPotentialSourceCount",
            String(gravityDiagnostics.sourceCount),
          );
          setData(
            container,
            "gravityPotentialMinimumJPerKg",
            gravityDiagnostics.minimumMagnitudeJPerKg.toPrecision(10),
          );
          setData(
            container,
            "gravityPotentialMaximumJPerKg",
            gravityDiagnostics.maximumMagnitudeJPerKg.toPrecision(10),
          );
          setData(
            container,
            "gravityWellExtentAu",
            gravityDiagnostics.extentAu.toPrecision(10),
          );
          setData(
            container,
            "gravityWellDepthAu",
            gravityDiagnostics.depthAu.toPrecision(10),
          );
          setData(
            container,
            "gravityFieldTimeSeconds",
            current.timeSeconds.toFixed(3),
          );
          const legendRange = container.querySelector<HTMLElement>(
            "[data-gravity-potential-range]",
          );
          if (legendRange !== null) {
            legendRange.textContent = `−${formatPotentialMagnitude(
              gravityDiagnostics.maximumMagnitudeJPerKg,
            )} to −${formatPotentialMagnitude(
              gravityDiagnostics.minimumMagnitudeJPerKg,
            )} J/kg`;
          }
        }
        const layout = orreryLayout(
          majorBodySnapshot.bodies,
          additionalAvailableKnownSatellites,
          sceneBodyPositions,
          orrerySystemRootId(focusBodyIdRef.current),
          bodyVisibilityRef.current,
        );
        orreryHiddenBodyIds = layout.hiddenIds;
        let visibleKnownMoonPointCount = 0;
        let hiddenKnownMoonPointCount = 0;
        for (const system of knownMoonSystems.values()) {
          const visible =
            currentVisibility.moons && viewModeRef.current === "orrery";
          system.points.visible = visible;
          if (!visible) {
            continue;
          }
          // Drawn points are packed first; the draw range leaves out moons
          // that would crowd an enlarged body.
          let drawnPointCount = 0;
          for (const definition of system.definitions) {
            const position = sceneBodyPositions.get(definition.id);
            if (position === undefined) {
              throw new Error(
                `Integrated state is missing known moon ${definition.name}`,
              );
            }
            if (layout.hiddenIds.has(definition.id)) {
              hiddenKnownMoonPointCount += 1;
              continue;
            }
            system.positions[drawnPointCount * 3] = position.x;
            system.positions[drawnPointCount * 3 + 1] = position.y;
            system.positions[drawnPointCount * 3 + 2] = position.z;
            drawnPointCount += 1;
          }
          const attribute = system.geometry.getAttribute("position");
          if (!(attribute instanceof BufferAttribute)) {
            throw new Error("Known-moon position attribute is unavailable");
          }
          attribute.needsUpdate = true;
          system.geometry.setDrawRange(0, drawnPointCount);
          system.geometry.computeBoundingSphere();
          visibleKnownMoonPointCount += system.definitions.length;
        }
        setData(
          container,
          "knownMoonCatalogueCount",
          String(knownSatelliteSnapshot.bodies.length),
        );
        setData(
          container,
          "knownMoonPointCount",
          String(visibleKnownMoonPointCount),
        );
        setData(
          container,
          "knownMoonPointHiddenCount",
          String(hiddenKnownMoonPointCount),
        );
        setData(
          container,
          "orreryClearanceScale",
          layout.clearanceScale.toPrecision(9),
        );
        for (const body of majorBodySnapshot.bodies) {
          const bodyState = bodyStateById(current, body.id);
          const mesh = bodyMeshes.get(body.id);
          if (bodyState !== undefined && mesh !== undefined) {
            mesh.position.copy(scenePosition(bodyState.positionM));
            const radius = layout.radiusAuById.get(body.id);
            if (radius === undefined) {
              throw new Error(`Orrery layout is missing body ${body.id}`);
            }
            if (body.id === "saturn" || isDiscreteRingBodyId(body.id)) {
              const meanRadiusKm = body.meanRadiusM / 1_000;
              const equatorialRadiusKm =
                body.id === "saturn"
                  ? SATURN_EQUATORIAL_RADIUS_KM
                  : body.id === "jupiter"
                    ? JUPITER_EQUATORIAL_RADIUS_KM
                    : body.id === "uranus"
                      ? URANUS_EQUATORIAL_RADIUS_KM
                      : NEPTUNE_EQUATORIAL_RADIUS_KM;
              const polarRadiusKm =
                body.id === "saturn"
                  ? SATURN_POLAR_RADIUS_KM
                  : body.id === "jupiter"
                    ? JUPITER_POLAR_RADIUS_KM
                    : body.id === "uranus"
                      ? URANUS_POLAR_RADIUS_KM
                      : NEPTUNE_POLAR_RADIUS_KM;
              mesh.scale.set(
                (radius * equatorialRadiusKm) / meanRadiusKm,
                (radius * polarRadiusKm) / meanRadiusKm,
                (radius * equatorialRadiusKm) / meanRadiusKm,
              );
              setData(
                container,
                `${body.id}EquatorialToPolarRatio`,
                (equatorialRadiusKm / polarRadiusKm).toFixed(6),
              );
            } else {
              mesh.scale.setScalar(radius);
            }
            const bodyLabel = bodyLabels.get(body.id);
            if (bodyLabel !== undefined) {
              setData(bodyLabel, "displayedRadiusAu", radius.toPrecision(9));
            }
            mesh.quaternion.copy(
              bodyOrientationQuaternion(body.id, current.timeSeconds),
            );
            if (body.id === focusBodyIdRef.current) {
              const primeMeridian = bodyOrientationAngles(
                body.id,
                current.timeSeconds,
              ).primeMeridianDeg;
              setData(
                container,
                "focusedPrimeMeridianDeg",
                (((primeMeridian % 360) + 360) % 360).toFixed(6),
              );
            }
          }
        }

        const earthStateForEclipse = bodyStateById(current, "earth");
        const moonStateForEclipse = bodyStateById(current, "moon");
        const sunStateForEclipse = bodyStateById(current, "sun");
        const earthDefinitionForEclipse = majorBodyById.get("earth");
        const moonDefinitionForEclipse = majorBodyById.get("moon");
        const sunDefinitionForEclipse = majorBodyById.get("sun");
        if (
          earthStateForEclipse !== undefined &&
          moonStateForEclipse !== undefined &&
          sunStateForEclipse !== undefined
        ) {
          setData(
            container,
            "earthEclipseLighting",
            "all-body-finite-sun-disc-analytic-occlusion",
          );
        }
        if (
          eclipseShadowVisibleRef.current &&
          earthStateForEclipse !== undefined &&
          moonStateForEclipse !== undefined &&
          sunStateForEclipse !== undefined &&
          earthDefinitionForEclipse !== undefined &&
          moonDefinitionForEclipse !== undefined &&
          sunDefinitionForEclipse !== undefined
        ) {
          const earthPosition = scenePosition(earthStateForEclipse.positionM);
          const moonPosition = scenePosition(moonStateForEclipse.positionM);
          const sunPosition = scenePosition(sunStateForEclipse.positionM);
          const shadowDirection = moonPosition
            .clone()
            .sub(sunPosition)
            .normalize();
          const moonToEarth = earthPosition.clone().sub(moonPosition);
          const alongAxisAu = moonToEarth.dot(shadowDirection);
          const closestAxisPoint = moonPosition
            .clone()
            .addScaledVector(shadowDirection, alongAxisAu);
          const axisOffsetAu = closestAxisPoint.distanceTo(earthPosition);
          const earthRadiusAu =
            earthDefinitionForEclipse.meanRadiusM / ASTRONOMICAL_UNIT_M;
          const intersectsEarth =
            alongAxisAu > 0 && axisOffsetAu < earthRadiusAu;
          if (intersectsEarth) {
            const surfaceOffsetAu = Math.sqrt(
              earthRadiusAu * earthRadiusAu - axisOffsetAu * axisOffsetAu,
            );
            const footprintPosition = closestAxisPoint
              .clone()
              .sub(shadowDirection.clone().multiplyScalar(surfaceOffsetAu));
            const outwardNormal = footprintPosition
              .clone()
              .sub(earthPosition)
              .normalize();
            const earthFixedFootprint = outwardNormal.applyQuaternion(
              bodyOrientationQuaternion("earth", current.timeSeconds)
                .clone()
                .invert(),
            );
            const footprintLatitudeDeg =
              (Math.asin(Math.max(-1, Math.min(1, earthFixedFootprint.y))) *
                180) /
              Math.PI;
            const footprintLongitudeDeg =
              (Math.atan2(earthFixedFootprint.z, earthFixedFootprint.x) * 180) /
              Math.PI;
            setData(
              container,
              "eclipseShadowLatitudeDeg",
              footprintLatitudeDeg.toFixed(6),
            );
            setData(
              container,
              "eclipseShadowLongitudeDeg",
              footprintLongitudeDeg.toFixed(6),
            );
            const moonSunDistanceM =
              moonPosition.distanceTo(sunPosition) * ASTRONOMICAL_UNIT_M;
            const moonEarthDistanceM =
              moonPosition.distanceTo(earthPosition) * ASTRONOMICAL_UNIT_M;
            const umbraRadiusM = Math.max(
              0,
              moonDefinitionForEclipse.meanRadiusM -
                ((sunDefinitionForEclipse.meanRadiusM -
                  moonDefinitionForEclipse.meanRadiusM) *
                  moonEarthDistanceM) /
                  moonSunDistanceM,
            );
            const penumbraRadiusM =
              moonDefinitionForEclipse.meanRadiusM +
              ((sunDefinitionForEclipse.meanRadiusM +
                moonDefinitionForEclipse.meanRadiusM) *
                moonEarthDistanceM) /
                moonSunDistanceM;
            eclipseShadowGroup.position.copy(
              footprintPosition.addScaledVector(
                outwardNormal,
                earthRadiusAu * 0.003,
              ),
            );
            eclipseShadowGroup.quaternion.setFromUnitVectors(
              new Vector3(0, 0, 1),
              outwardNormal,
            );
            eclipseShadowGroup.visible = true;
            setHidden(eclipseShadowLeftEarth, true);
            setData(container, "eclipseShadowVisible", "true");
            setData(
              container,
              "eclipseUmbraRadiusKm",
              (umbraRadiusM / 1_000).toFixed(3),
            );
            setData(
              container,
              "eclipsePenumbraRadiusKm",
              (penumbraRadiusM / 1_000).toFixed(3),
            );
            setData(
              container,
              "eclipseShadowAxisOffsetKm",
              ((axisOffsetAu * ASTRONOMICAL_UNIT_M) / 1_000).toFixed(3),
            );
          } else {
            eclipseShadowGroup.visible = false;
            setHidden(eclipseShadowLocator, true);
            setHidden(eclipseShadowLeftEarth, false);
            setData(container, "eclipseShadowVisible", "false");
            delete container.dataset["eclipseShadowLatitudeDeg"];
            delete container.dataset["eclipseShadowLongitudeDeg"];
          }
        } else {
          eclipseShadowGroup.visible = false;
          setHidden(eclipseShadowLocator, true);
          setHidden(eclipseShadowLeftEarth, true);
          setData(container, "eclipseShadowVisible", "false");
          delete container.dataset["eclipseShadowLatitudeDeg"];
          delete container.dataset["eclipseShadowLongitudeDeg"];
        }

        const monolithState = jovianMonolithState(current);
        const jupiterStateForMonolith = bodyStateById(current, "jupiter");
        const ioStateForMonolith = bodyStateById(current, "io");
        if (
          jupiterStateForMonolith === undefined ||
          ioStateForMonolith === undefined
        ) {
          throw new Error("Jovian monolith requires Jupiter and Io state");
        }
        const jupiterPositionForMonolith = scenePosition(
          jupiterStateForMonolith.positionM,
        );
        const ioPositionForMonolith = scenePosition(
          ioStateForMonolith.positionM,
        );
        const radialDirection = ioPositionForMonolith
          .clone()
          .sub(jupiterPositionForMonolith)
          .normalize();
        const relativeVelocityDirection = icrfToScene({
          x:
            ioStateForMonolith.velocityMps[0] -
            jupiterStateForMonolith.velocityMps[0],
          y:
            ioStateForMonolith.velocityMps[1] -
            jupiterStateForMonolith.velocityMps[1],
          z:
            ioStateForMonolith.velocityMps[2] -
            jupiterStateForMonolith.velocityMps[2],
        }).normalize();
        const longAxis = radialDirection
          .clone()
          .cross(relativeVelocityDirection)
          .normalize();
        if (longAxis.lengthSq() < 0.5) {
          throw new Error("Jupiter-Io orbital plane is unavailable");
        }
        const thinAxis = longAxis.clone().cross(radialDirection).normalize();
        monolithMesh.position.copy(scenePosition(monolithState.positionM));
        monolithMesh.quaternion.setFromRotationMatrix(
          new Matrix4().makeBasis(thinAxis, longAxis, radialDirection),
        );
        setData(
          container,
          "jovianMonolithDistanceFromIoKm",
          (
            Math.hypot(
              monolithState.positionM[0] - ioStateForMonolith.positionM[0],
              monolithState.positionM[1] - ioStateForMonolith.positionM[1],
              monolithState.positionM[2] - ioStateForMonolith.positionM[2],
            ) / 1_000
          ).toFixed(3),
        );

        for (const orbiter of FICTIONAL_ORBITERS) {
          const group = fictionalOrbiterGroups.get(orbiter.id);
          const position = sceneBodyPositions.get(orbiter.id);
          const parentPosition = sceneBodyPositions.get(orbiter.parentBodyId);
          if (
            group === undefined ||
            position === undefined ||
            parentPosition === undefined
          ) {
            throw new Error(`${orbiter.name} scene state is unavailable`);
          }
          group.position.copy(position);
          group.lookAt(parentPosition);
          const distanceFromParentKm =
            (position.distanceTo(parentPosition) * ASTRONOMICAL_UNIT_M) / 1_000;
          setData(
            container,
            `${orbiter.id.replaceAll("-", "")}DistanceFromParentKm`,
            distanceFromParentKm.toFixed(3),
          );
        }

        const discoveryPosition = sceneBodyPositions.get(DISCOVERY_ONE_BODY_ID);
        const ioPositionForDiscovery = sceneBodyPositions.get(
          DISCOVERY_ONE_PARENT_BODY_ID,
        );
        if (
          discoveryPosition === undefined ||
          ioPositionForDiscovery === undefined
        ) {
          throw new Error("Discovery One scene state is unavailable");
        }
        discoveryOneGroup.position.copy(discoveryPosition);
        const discoveryRadial = discoveryPosition
          .clone()
          .sub(ioPositionForDiscovery)
          .normalize();
        const discoveryVelocity = icrfToScene({
          x: discoveryState.velocityMps[0] - ioStateForMonolith.velocityMps[0],
          y: discoveryState.velocityMps[1] - ioStateForMonolith.velocityMps[1],
          z: discoveryState.velocityMps[2] - ioStateForMonolith.velocityMps[2],
        }).normalize();
        const discoveryUp = discoveryRadial
          .clone()
          .cross(discoveryVelocity)
          .normalize();
        discoveryOneGroup.quaternion.setFromRotationMatrix(
          new Matrix4().makeBasis(
            discoveryVelocity,
            discoveryUp,
            discoveryRadial,
          ),
        );
        setData(
          container,
          "discoveryOneDistanceFromIoKm",
          (
            (discoveryPosition.distanceTo(ioPositionForDiscovery) *
              ASTRONOMICAL_UNIT_M) /
            1_000
          ).toFixed(3),
        );

        for (const object of DEEP_SPACE_NINE_OBJECTS) {
          const group = deepSpaceNineGroups.get(object.id);
          const objectState = deepSpaceNineObjectStateById(current, object.id);
          const position = sceneBodyPositions.get(object.id);
          const parentId = deepSpaceNineParentBodyId(object.id);
          const parentPosition = sceneBodyPositions.get(parentId);
          const parentState =
            parentId === DEEP_SPACE_NINE_BODY_ID
              ? deepSpaceNineObjectStateById(current, DEEP_SPACE_NINE_BODY_ID)
              : bodyStateById(current, parentId);
          if (
            group === undefined ||
            position === undefined ||
            parentPosition === undefined ||
            parentState === undefined
          ) {
            throw new Error(`${object.name} scene state is unavailable`);
          }
          group.position.copy(position);
          const radial = position.clone().sub(parentPosition).normalize();
          const relativeVelocity = icrfToScene({
            x: objectState.velocityMps[0] - parentState.velocityMps[0],
            y: objectState.velocityMps[1] - parentState.velocityMps[1],
            z: objectState.velocityMps[2] - parentState.velocityMps[2],
          }).normalize();
          const normal = radial.clone().cross(relativeVelocity).normalize();
          if (object.id === USS_DEFIANT_BODY_ID) {
            group.up.copy(normal);
            group.lookAt(position.clone().add(relativeVelocity));
          } else {
            group.quaternion.setFromRotationMatrix(
              new Matrix4().makeBasis(relativeVelocity, normal, radial),
            );
          }
          setData(
            container,
            `${object.id.replaceAll("-", "")}DistanceFromParentKm`,
            (
              (position.distanceTo(parentPosition) * ASTRONOMICAL_UNIT_M) /
              1_000
            ).toFixed(3),
          );
        }

        // The ISS state exists only inside its element window; the label pass
        // hides the station when it is absent.
        const issState = bodyStateById(current, ISS_BODY_ID);
        if (issState !== undefined) {
          const earthStateForIss = bodyStateById(current, ISS_PARENT_BODY_ID);
          if (earthStateForIss === undefined) {
            throw new Error("Earth scene state is unavailable for the ISS");
          }
          const issPosition = scenePosition(issState.positionM);
          const earthPositionForIss = scenePosition(earthStateForIss.positionM);
          issGroup.position.copy(issPosition);
          const zenith = issPosition
            .clone()
            .sub(earthPositionForIss)
            .normalize();
          const relativeVelocity = icrfToScene({
            x: issState.velocityMps[0] - earthStateForIss.velocityMps[0],
            y: issState.velocityMps[1] - earthStateForIss.velocityMps[1],
            z: issState.velocityMps[2] - earthStateForIss.velocityMps[2],
          });
          const alongTrack = relativeVelocity
            .clone()
            .sub(
              zenith
                .clone()
                .multiplyScalar(relativeVelocity.clone().dot(zenith)),
            )
            .normalize();
          const orbitNormal = zenith.clone().cross(alongTrack).normalize();
          issGroup.quaternion.setFromRotationMatrix(
            new Matrix4().makeBasis(orbitNormal, zenith, alongTrack),
          );
        }
        setData(
          container,
          "issEphemerisValid",
          String(isIssEphemerisWithinValidity(current.timeSeconds)),
        );
        setData(
          container,
          "issEpochSimulationSeconds",
          ISS_EPOCH_SIMULATION_SECONDS.toFixed(3),
        );

        const sunPositionForSpacecraft = sceneBodyPositions.get("sun");
        if (sunPositionForSpacecraft === undefined) {
          throw new Error(
            "Sun scene position is unavailable for Voyager attitude",
          );
        }
        const earthPositionForVoyagers = sceneBodyPositions.get("earth");
        if (earthPositionForVoyagers === undefined) {
          throw new Error(
            "Earth scene position is unavailable for Voyager attitude",
          );
        }
        for (const probe of voyagerSnapshot.probes) {
          const probePosition = sceneBodyPositions.get(probe.id);
          const group = voyagerGroups.get(probe.id);
          if (probePosition === undefined || group === undefined) {
            throw new Error(
              `Integrated Voyager state ${probe.id} is unavailable`,
            );
          }
          group.position.copy(probePosition);
          group.quaternion.copy(
            voyagerEarthPointingQuaternion(
              probePosition,
              earthPositionForVoyagers,
            ),
          );
          const earthDirection = earthPositionForVoyagers
            .clone()
            .sub(probePosition)
            .normalize();
          const renderedBoresight = VOYAGER_MODEL_HGA_BORESIGHT.clone()
            .applyQuaternion(group.quaternion)
            .normalize();
          const datasetPrefix =
            probe.id === "voyager-1" ? "voyager1" : "voyager2";
          setData(
            container,
            `${datasetPrefix}AntennaEarthAlignment`,
            renderedBoresight.dot(earthDirection).toFixed(9),
          );
        }
        setData(container, "voyagerAntennaTarget", "earth");
        for (const spacecraft of operationalSpacecraftSnapshot.spacecraft) {
          const spacecraftPosition = sceneBodyPositions.get(spacecraft.id);
          const group = sourcedModelGroups.get(spacecraft.id);
          if (group === undefined) {
            throw new Error(
              `${spacecraft.name} official model group is unavailable`,
            );
          }
          if (spacecraftPosition === undefined) {
            group.visible = false;
            continue;
          }
          group.position.copy(spacecraftPosition);
          if (spacecraft.id === ROADSTER_BODY_ID) {
            group.lookAt(camera.position);
            group.rotateY(Math.PI * 0.62);
            group.rotateX(-0.16);
            setData(
              container,
              "roadsterAttitude",
              "camera-relative-presentation-only-no-physical-attitude-claim",
            );
          } else {
            group.lookAt(sunPositionForSpacecraft);
          }
        }

        let visibleOrbitGuideCount = 0;
        for (const [bodyId, guide] of orbitGuides) {
          const definition = majorBodyById.get(bodyId);
          const parentId = PARENT_BODY_ID[bodyId];
          const focusId = focusBodyIdRef.current;
          const isSelectedOrbit =
            orbitGuideScopeRef.current === "all" && bodyId === focusId;
          const isFocusedSystemMoon =
            definition?.type === "moon" &&
            (parentId === focusId ||
              PARENT_BODY_ID[focusId ?? ""] === parentId);
          const isOrreryPlanetOrbit =
            orbitGuideScopeRef.current === "all" &&
            viewModeRef.current === "orrery" &&
            definition !== undefined &&
            definition.type !== "moon";
          guide.line.visible =
            showOrbitGuidesRef.current &&
            (isSelectedOrbit || isFocusedSystemMoon || isOrreryPlanetOrbit);
          guide.material.opacity = isSelectedOrbit ? 0.8 : 0.22;
          guide.material.color.setHex(isSelectedOrbit ? 0x8fc7f7 : 0x63819b);
          if (guide.line.visible) {
            visibleOrbitGuideCount += 1;
            if (
              orbitGuideSourceState !== undefined &&
              orbitGuideComputedStates.get(bodyId) !== orbitGuideSourceState
            ) {
              updateOrbitGuide(bodyId, guide, orbitGuideSourceState);
              setData(
                container,
                "orbitGuideUpdatedTimeSeconds",
                orbitGuideSourceState.timeSeconds.toFixed(3),
              );
            }
          }
        }
        setData(container, "orbitGuideCount", String(visibleOrbitGuideCount));
        setData(container, "viewMode", viewModeRef.current);

        const earthState = bodyStateById(current, "earth");
        const sunState = bodyStateById(current, "sun");
        if (earthState !== undefined && sunState !== undefined) {
          const sunScenePosition = scenePosition(sunState.positionM);
          sunlight.position.copy(sunScenePosition);
          eclipticGrid.position.copy(sunScenePosition);
          const localShadowBodyId = focusBodyIdRef.current;
          const localShadowGroup =
            localShadowBodyId === null
              ? undefined
              : localShadowBodyId === JOVIAN_MONOLITH_BODY_ID
                ? monolithMesh
                : (sourcedModelGroups.get(localShadowBodyId) ??
                  fictionalOrbiterGroups.get(localShadowBodyId));
          const localShadowState =
            localShadowBodyId === null
              ? undefined
              : bodyStateById(current, localShadowBodyId);
          const localShadowRadiusM =
            localShadowBodyId === null
              ? undefined
              : spacecraftBoundingRadiusM(localShadowBodyId);
          if (
            localShadowGroup !== undefined &&
            localShadowState !== undefined &&
            localShadowRadiusM !== undefined &&
            localShadowGroup.children.length > 0
          ) {
            const localShadowPosition = scenePosition(
              localShadowState.positionM,
            );
            const localShadowRadiusAu =
              localShadowRadiusM / ASTRONOMICAL_UNIT_M;
            const sunDirection = sunScenePosition
              .clone()
              .sub(localShadowPosition)
              .normalize();
            localModelSunlight.position
              .copy(localShadowPosition)
              .addScaledVector(sunDirection, localShadowRadiusAu * 20);
            localModelSunlight.target.position.copy(localShadowPosition);
            localModelSunlight.target.updateMatrixWorld();
            localModelSunlight.shadow.camera.left = -localShadowRadiusAu * 1.4;
            localModelSunlight.shadow.camera.right = localShadowRadiusAu * 1.4;
            localModelSunlight.shadow.camera.top = localShadowRadiusAu * 1.4;
            localModelSunlight.shadow.camera.bottom =
              -localShadowRadiusAu * 1.4;
            localModelSunlight.shadow.camera.near = localShadowRadiusAu;
            localModelSunlight.shadow.camera.far = localShadowRadiusAu * 40;
            localModelSunlight.shadow.camera.updateProjectionMatrix();
            localModelSunlight.shadow.normalBias =
              localShadowRadiusAu * LOCAL_SHADOW_NORMAL_BIAS_RADII;
            const localDistanceAu =
              localShadowPosition.distanceTo(sunScenePosition);
            // The parallel light also reaches every other surface. Near the
            // model it matches the point light: Callisto under Deep Space
            // Nine differs by about 0.003%, and a body 0.05 AU from a model
            // 1 AU from the Sun by about 3 degrees and 10%. Out of range the
            // point light lights everything, the model too.
            const localSunlightInRange =
              camera.position.distanceTo(localShadowPosition) <=
              localShadowRadiusAu * LOCAL_MODEL_SUNLIGHT_RANGE_RADII;
            localModelSunlight.intensity = localSunlightInRange
              ? SOLAR_IRRADIANCE_AT_1_AU /
                Math.max(localDistanceAu * localDistanceAu, 0.0016)
              : 0;
            sunlight.intensity = localSunlightInRange
              ? 0
              : SOLAR_IRRADIANCE_AT_1_AU;
            localModelSunlight.visible = true;
            setData(
              container,
              "localShadowBody",
              localShadowBodyId ?? "unavailable",
            );
            setData(container, "localShadowMap", "pcf-2048");
          } else {
            localModelSunlight.visible = false;
            sunlight.intensity = SOLAR_IRRADIANCE_AT_1_AU;
            delete container.dataset["localShadowBody"];
            setData(container, "localShadowMap", "inactive");
          }
          const solarOccluderCandidates = majorBodySnapshot.bodies
            .filter((body) => body.id !== "sun")
            .map((body) => {
              const state = bodyStateById(current, body.id);
              if (state === undefined) {
                throw new Error(
                  `Solar occluder state ${body.id} is unavailable`,
                );
              }
              return {
                id: body.id,
                positionAu: scenePosition(state.positionM),
                radiusAu: body.meanRadiusM / ASTRONOMICAL_UNIT_M,
              };
            });
          let activeSolarOcclusionReceiverCount = 0;
          for (const uniforms of solarOcclusionUniforms) {
            const receiverState = bodyStateById(
              current,
              uniforms.receiverBodyId,
            );
            const receiverDefinition = majorBodyById.get(
              uniforms.receiverBodyId,
            );
            if (
              receiverState === undefined ||
              receiverDefinition === undefined
            ) {
              throw new Error(
                `Solar receiver ${uniforms.receiverBodyId} is unavailable`,
              );
            }
            const receiverPosition = scenePosition(receiverState.positionM);
            uniforms.sunFromReceiverAu.value.copy(
              sunScenePosition.clone().sub(receiverPosition),
            );
            const selectedOccluders = selectSolarOccluders(
              uniforms.receiverBodyId,
              receiverPosition,
              receiverDefinition.meanRadiusM / ASTRONOMICAL_UNIT_M,
              sunScenePosition,
              eclipseSunDefinition.meanRadiusM / ASTRONOMICAL_UNIT_M,
              solarOccluderCandidates,
            );
            uniforms.occluderCount.value = selectedOccluders.length;
            if (selectedOccluders.length > 0) {
              activeSolarOcclusionReceiverCount += 1;
            }
            for (let index = 0; index < 8; index += 1) {
              const selected = selectedOccluders[index];
              const relativePosition =
                uniforms.occluderFromReceiverAu.value[index];
              if (relativePosition === undefined) {
                throw new Error("Solar occluder uniform array is incomplete");
              }
              relativePosition.copy(
                selected === undefined
                  ? new Vector3()
                  : selected.positionAu.clone().sub(receiverPosition),
              );
              uniforms.occluderRadiusAu.value[index] = selected?.radiusAu ?? 0;
            }
          }
          setData(
            container,
            "solarOcclusionModel",
            "all-major-bodies-finite-disc",
          );
          setData(
            container,
            "solarOcclusionReceiverCount",
            String(solarOcclusionUniforms.length),
          );
          setData(
            container,
            "activeSolarOcclusionReceiverCount",
            String(activeSolarOcclusionReceiverCount),
          );
          for (const [bodyId, atmosphereMaterial] of atmosphereMaterials) {
            const bodyState = bodyStateById(current, bodyId);
            if (bodyState === undefined) {
              throw new Error(`Atmosphere state ${bodyId} is unavailable`);
            }
            const distanceFromSunAu = scenePosition(
              bodyState.positionM,
            ).distanceTo(sunScenePosition);
            const receiverPosition = scenePosition(bodyState.positionM);
            const receiverDefinition = majorBodyById.get(bodyId);
            if (receiverDefinition === undefined) {
              throw new Error(`Atmosphere definition ${bodyId} is unavailable`);
            }
            const selectedAtmosphereOccluders = selectSolarOccluders(
              bodyId,
              receiverPosition,
              receiverDefinition.meanRadiusM / ASTRONOMICAL_UNIT_M,
              sunScenePosition,
              eclipseSunDefinition.meanRadiusM / ASTRONOMICAL_UNIT_M,
              solarOccluderCandidates,
            );
            setRequiredNumberUniform(
              atmosphereMaterial,
              "eclipseTransmission",
              eclipseTransmissionAtPoint(
                receiverPosition,
                sunScenePosition,
                eclipseSunDefinition.meanRadiusM / ASTRONOMICAL_UNIT_M,
                selectedAtmosphereOccluders,
              ),
            );
            setRequiredNumberUniform(
              atmosphereMaterial,
              "solarFlux",
              1 / Math.max(distanceFromSunAu * distanceFromSunAu, 0.0016),
            );
            const atmosphereMesh = atmosphereMeshes.get(bodyId);
            if (atmosphereMesh === undefined) {
              throw new Error(`Atmosphere mesh ${bodyId} is unavailable`);
            }
            atmosphereMesh.updateWorldMatrix(true, false);
            const localSunPosition = atmosphereMesh.worldToLocal(
              sunScenePosition.clone(),
            );
            const localBodyCenter = atmosphereMesh.worldToLocal(
              scenePosition(bodyState.positionM),
            );
            requiredVectorUniform(
              atmosphereMaterial,
              "sunDirectionLocal",
            ).value.copy(localSunPosition.sub(localBodyCenter).normalize());
            requiredVectorUniform(
              atmosphereMaterial,
              "cameraPositionLocal",
            ).value.copy(atmosphereMesh.worldToLocal(camera.position.clone()));
          }
          for (const [bodyId, ringVisual] of ringVisuals) {
            const bodyState = bodyStateById(current, bodyId);
            if (bodyState === undefined) {
              throw new Error(`Ring-system state ${bodyId} is unavailable`);
            }
            const bodyPosition = scenePosition(bodyState.positionM);
            const distanceFromSunAu = bodyPosition.distanceTo(sunScenePosition);
            ringVisual.referenceMesh.updateWorldMatrix(true, false);
            const localSun = ringVisual.referenceMesh.worldToLocal(
              sunScenePosition.clone(),
            );
            const localCenter =
              ringVisual.referenceMesh.worldToLocal(bodyPosition);
            const localSunDirection = localSun.sub(localCenter).normalize();
            const localCameraPosition = ringVisual.referenceMesh.worldToLocal(
              camera.position.clone(),
            );
            for (const material of ringVisual.materials) {
              requiredVectorUniform(material, "sunDirectionLocal").value.copy(
                localSunDirection,
              );
              requiredVectorUniform(material, "cameraPositionLocal").value.copy(
                localCameraPosition,
              );
            }
            ringVisual.surfaceShadowSunDirectionLocal?.value.copy(
              localSunDirection,
            );
            for (const material of ringVisual.materials) {
              setRequiredNumberUniform(
                material,
                "solarFlux",
                1 / Math.max(distanceFromSunAu * distanceFromSunAu, 0.0016),
              );
              const orreryGain =
                bodyId === "jupiter" ? 12_000 : bodyId === "neptune" ? 250 : 1;
              setRequiredNumberUniform(
                material,
                "visibilityGain",
                viewModeRef.current === "orrery" ? orreryGain : 1,
              );
            }
          }
          const moonOrigin = referenceOrigin(
            current,
            "moon",
            referenceFrameRef.current,
          );
          moonTrail.position.copy(
            moonOrigin === undefined
              ? new Vector3()
              : scenePosition(moonOrigin.positionM),
          );
          for (const [bodyId, trail] of planetTrails) {
            const planetOrigin = referenceOrigin(
              current,
              bodyId,
              referenceFrameRef.current,
            );
            trail.line.position.copy(
              planetOrigin === undefined
                ? new Vector3()
                : scenePosition(planetOrigin.positionM),
            );
          }
          if (
            gpuLayer !== undefined &&
            smallBodiesVisible &&
            performance.now() - lastSmallBodyGpuUpdateAt >=
              SMALL_BODY_GPU_UPDATE_INTERVAL_MS
          ) {
            void gpuLayer
              .setTimeSeconds(current.timeSeconds, [
                sunState.positionM[0] / ASTRONOMICAL_UNIT_M,
                sunState.positionM[1] / ASTRONOMICAL_UNIT_M,
                sunState.positionM[2] / ASTRONOMICAL_UNIT_M,
              ])
              .catch((cause: unknown) => {
                if (active) {
                  onGpuError(
                    cause instanceof Error ? cause.message : String(cause),
                  );
                }
              });
            lastSmallBodyGpuUpdateAt = performance.now();
          }
        }
        moonTrail.visible =
          showMoonTrailRef.current &&
          currentVisibility.moons &&
          moonTrailPoints.length > 1;
        let visiblePlanetTrailCount = 0;
        for (const trail of planetTrails.values()) {
          trail.line.visible =
            showPlanetTrailsRef.current &&
            currentVisibility.planets &&
            trail.points.length > 1;
          if (trail.line.visible) {
            visiblePlanetTrailCount += 1;
          }
        }
        if (moonTrailGeometryStale && moonTrail.visible) {
          writeTrailGeometry(
            {
              geometry: moonTrailGeometry,
              positions: moonTrailPositions,
              colors: moonTrailColors,
              positionAttribute: moonTrailPositionAttribute,
              colorAttribute: moonTrailColorAttribute,
            },
            moonTrailPoints,
            trailFadeRef.current,
            [0.87, 0.91, 0.96],
          );
          moonTrailGeometryStale = false;
        }
        if (planetTrailGeometryStale && visiblePlanetTrailCount > 0) {
          for (const trail of planetTrails.values()) {
            writeTrailGeometry(
              trail,
              trail.points,
              trailFadeRef.current,
              [0.47, 0.66, 0.83],
            );
          }
          planetTrailGeometryStale = false;
        }
        eclipticGrid.visible = showEclipticPlaneRef.current;
        setData(container, "moonTrailPoints", String(moonTrailPoints.length));
        setData(container, "moonTrailVisible", String(moonTrail.visible));
        setData(container, "moonTrailFrame", referenceFrameRef.current);
        setData(container, "referenceFrame", referenceFrameRef.current);
        setData(
          container,
          "trailDurationSeconds",
          String(trailDurationSecondsRef.current),
        );
        setData(container, "trailFade", trailFadeRef.current.toFixed(2));
        setData(
          container,
          "planetTrailPoints",
          String(planetTrails.get("earth")?.points.length ?? 0),
        );
        setData(container, "planetTrailCount", String(visiblePlanetTrailCount));
        setData(
          container,
          "planetTrailsVisible",
          String(visiblePlanetTrailCount > 0),
        );

        if (
          activeCameraTransition !== undefined &&
          cameraTransitionDurationMsRef.current <= 0
        ) {
          completeCameraTransition();
        }
        const requestedFocusBodyId = focusBodyIdRef.current;
        // A body with an ephemeris window (the ISS, Hubble, JWST) has no state
        // until the seek into its window lands, so the reset waits for it.
        const resetRequested =
          resetViewTokenRef.current !== lastResetViewToken &&
          (requestedFocusBodyId === null ||
            bodyStateById(current, requestedFocusBodyId) !== undefined);
        if (resetRequested) {
          lastResetViewToken = resetViewTokenRef.current;
          if (!beginCameraTransition(requestedFocusBodyId, current)) {
            resetCamera(requestedFocusBodyId, current);
            const requestedPreset = orientationPresetRef.current;
            applyOrientationPreset(
              requestedPreset === "custom"
                ? requestedFocusBodyId === null
                  ? "perspective"
                  : "sun-facing"
                : requestedPreset,
              requestedFocusBodyId,
              current,
            );
          }
          setData(container, "resetViewToken", String(lastResetViewToken));
        } else if (
          activeCameraTransition === undefined &&
          requestedFocusBodyId !== null
        ) {
          const focusState = bodyStateById(current, requestedFocusBodyId);
          if (focusState !== undefined) {
            const focusPosition = scenePosition(focusState.positionM);
            if (lastFocusBodyId !== requestedFocusBodyId) {
              resetCamera(requestedFocusBodyId, current);
              const requestedPreset = orientationPresetRef.current;
              applyOrientationPreset(
                requestedPreset === "custom" ? "sun-facing" : requestedPreset,
                requestedFocusBodyId,
                current,
              );
              if (requestedPreset === "custom") {
                onOrientationChange("sun-facing");
              }
            } else {
              const requestedPreset = orientationPresetRef.current;
              const requestedTargetBodyId = cameraTargetBodyIdRef.current;
              const targetState =
                requestedTargetBodyId === undefined
                  ? undefined
                  : bodyStateById(current, requestedTargetBodyId);
              const orbitTrackingEnabled =
                orbitViewEnabledRef.current &&
                requestedTargetBodyId === undefined;
              const presetContinuouslyTracked =
                requestedPreset === "sun-facing" ||
                requestedPreset === "terminator" ||
                requestedPreset === "parent-facing" ||
                requestedPreset === "velocity" ||
                requestedPreset === "orbital-plane";
              const orientationChangePending =
                orientationPresetTokenRef.current !==
                lastOrientationPresetToken;
              const continuouslyTracked =
                orbitTrackingEnabled ||
                requestedTargetBodyId !== undefined ||
                presetContinuouslyTracked;
              if (
                requestedTargetBodyId !== undefined &&
                targetState !== undefined
              ) {
                const targetPosition = observerTargetPosition(
                  current,
                  targetState,
                );
                const observerPose = observerCameraPose(
                  requestedFocusBodyId,
                  focusState,
                  targetPosition,
                  current,
                );
                camera.position.copy(observerPose.position);
                controls.target.copy(targetPosition);
                camera.up.copy(observerPose.up);
                camera.lookAt(targetPosition);
                setData(container, "cameraOrientation", "observer-facing");
                setData(container, "cameraObserverBody", requestedFocusBodyId);
                setData(container, "cameraTargetBody", requestedTargetBodyId);
                setData(
                  container,
                  "focusDistanceAu",
                  camera.position.distanceTo(targetPosition).toFixed(8),
                );
              } else if (orbitTrackingEnabled) {
                const trackingDelta = focusPosition
                  .clone()
                  .sub(controls.target);
                camera.position.add(trackingDelta);
                controls.target.copy(focusPosition);
              } else if (
                orientationChangePending ||
                activeOrientationTransition !== undefined
              ) {
                const trackingDelta = focusPosition
                  .clone()
                  .sub(controls.target);
                camera.position.add(trackingDelta);
                controls.target.copy(focusPosition);
              } else if (presetContinuouslyTracked) {
                applyOrientationPreset(
                  requestedPreset,
                  requestedFocusBodyId,
                  current,
                );
              } else {
                const trackingTarget =
                  requestedFocusBodyId === "sun" &&
                  deepSpacePresentationRef.current === "interstellar-scale"
                    ? focusPosition
                        .clone()
                        .add(alphaCentauriOffset.clone().multiplyScalar(0.5))
                    : focusPosition;
                const trackingDelta = trackingTarget
                  .clone()
                  .sub(controls.target);
                camera.position.add(trackingDelta);
                controls.target.copy(trackingTarget);
              }
              setData(
                container,
                "cameraTracking",
                requestedTargetBodyId !== undefined
                  ? "observer-and-target"
                  : continuouslyTracked
                    ? "continuous"
                    : "position-only",
              );
            }
          }
        } else if (
          activeCameraTransition === undefined &&
          lastFocusBodyId !== null &&
          lastFocusBodyId !== undefined
        ) {
          resetCamera(null, current);
          const requestedPreset = orientationPresetRef.current;
          applyOrientationPreset(
            requestedPreset === "custom" ? "perspective" : requestedPreset,
            null,
            current,
          );
          if (requestedPreset === "custom") {
            onOrientationChange("perspective");
          }
        }
        lastFocusBodyId = requestedFocusBodyId;
        setData(container, "focusBody", requestedFocusBodyId ?? "solar-system");
      }
      setData(container, "selectedBody", selectedBodyIdRef.current ?? "none");

      const requestedCameraCommand = cameraNavigationCommandRef.current;
      if (
        requestedCameraCommand.sequence !== lastCameraNavigationSequence &&
        applyCameraNavigationCommand(
          requestedCameraCommand,
          focusBodyIdRef.current,
          current,
        )
      ) {
        lastCameraNavigationSequence = requestedCameraCommand.sequence;
      }

      const earthPosition = bodyMeshes.get("earth")?.position.clone();
      const moonPosition = bodyMeshes.get("moon")?.position.clone();

      if (cameraZoomRef.current !== lastCameraZoom) {
        if (
          !Number.isFinite(cameraZoomRef.current) ||
          cameraZoomRef.current < 2 ** -32 ||
          cameraZoomRef.current > 128
        ) {
          throw new Error("Camera zoom must be between 2^-32x and 128x");
        }
        lastCameraZoom = cameraZoomRef.current;
        camera.zoom = lastCameraZoom;
        camera.updateProjectionMatrix();
        setData(container, "cameraZoom", lastCameraZoom.toFixed(2));
      }

      if (
        orientationPresetTokenRef.current !== lastOrientationPresetToken &&
        orientationPresetRef.current !== "custom"
      ) {
        lastOrientationPresetToken = orientationPresetTokenRef.current;
        if (activeCameraTransition === undefined) {
          beginOrientationTransition(
            orientationPresetRef.current,
            focusBodyIdRef.current,
            current,
          );
        }
      }

      const renderNowMs = frameRenderStartedAtMs;
      const surfaceConfiguration = surfaceObserverRef.current;
      if (surfaceConfiguration === null || current === undefined) {
        controls.enabled = true;
        latestSurfaceObservation = undefined;
        surfaceFreeLook = false;
        lastSurfaceConfigurationKey = "";
        updateCameraTransition(renderNowMs, current);
        if (activeCameraTransition === undefined) {
          updateOrientationTransition(renderNowMs);
        }
        controls.update();
        const requestedOrbitBodyId = focusBodyIdRef.current;
        const requestedOrbitConfiguration = orbitConfigurationRef.current;
        const orbitViewActive =
          orbitViewEnabledRef.current &&
          requestedOrbitConfiguration !== null &&
          activeCameraTransition === undefined &&
          cameraTargetBodyIdRef.current === undefined;
        if (
          orbitViewActive &&
          current !== undefined &&
          requestedOrbitBodyId !== null
        ) {
          const orbitBodyState = bodyStateById(current, requestedOrbitBodyId);
          const orbitBodyDefinition = majorBodyById.get(requestedOrbitBodyId);
          if (
            orbitBodyState === undefined ||
            orbitBodyDefinition === undefined
          ) {
            throw new Error(
              `Physical orbit body ${requestedOrbitBodyId} is unavailable`,
            );
          }
          const orbitTarget = scenePosition(orbitBodyState.positionM);
          const sunStateForOrbit = bodyStateById(current, "sun");
          if (sunStateForOrbit === undefined) {
            throw new Error("Physical camera orbit requires the Sun state");
          }
          const sunlightReference = scenePosition(
            sunStateForOrbit.positionM,
          ).sub(orbitTarget);
          const orientation = bodyOrientationQuaternion(
            requestedOrbitBodyId,
            current.timeSeconds,
          );
          const spinAxis = new Vector3(0, 1, 0)
            .applyQuaternion(orientation)
            .normalize();
          const orbitNormal = orbitNormalForInclination(
            spinAxis,
            sunlightReference,
            requestedOrbitConfiguration.inclinationDeg,
          );
          const circularOrbit = circularOrbitSolution(
            orbitBodyState.gravitationalParameterM3S2,
            orbitBodyDefinition.meanRadiusM,
            requestedOrbitConfiguration.altitudeM,
          );
          let radialDirection: Vector3;
          if (
            requestedOrbitConfiguration.preset === "synchronous" ||
            requestedOrbitConfiguration.preset === "powered-hover"
          ) {
            const longitudeRad =
              (requestedOrbitConfiguration.longitudeDeg * Math.PI) / 180;
            radialDirection = new Vector3(
              Math.cos(longitudeRad),
              0,
              Math.sin(longitudeRad),
            )
              .applyQuaternion(orientation)
              .normalize();
          } else {
            const directionSign =
              requestedOrbitConfiguration.direction === "prograde" ? 1 : -1;
            const phaseRad =
              (requestedOrbitConfiguration.longitudeDeg * Math.PI) / 180 +
              (current.timeSeconds -
                requestedOrbitConfiguration.epochTimeSeconds) *
                circularOrbit.angularRateRadPerSecond *
                directionSign;
            radialDirection = orbitRadialDirection(
              orbitNormal,
              sunlightReference,
              ECLIPTIC_NORTH,
              phaseRad,
            );
          }
          camera.position
            .copy(orbitTarget)
            .addScaledVector(
              radialDirection,
              circularOrbit.orbitalRadiusM / ASTRONOMICAL_UNIT_M,
            );
          controls.target.copy(orbitTarget);
          camera.up.copy(orbitNormal);
          camera.lookAt(orbitTarget);
          setData(container, "orbitView", "active");
          setData(container, "orbitViewBody", requestedOrbitBodyId);
          setData(
            container,
            "cameraTracking",
            requestedOrbitConfiguration.preset === "powered-hover"
              ? "powered-hover"
              : "physical-circular-orbit",
          );
          setData(container, "orbitPreset", requestedOrbitConfiguration.preset);
          setData(
            container,
            "orbitAltitudeM",
            requestedOrbitConfiguration.altitudeM.toFixed(3),
          );
          setData(
            container,
            "orbitSpeedMps",
            requestedOrbitConfiguration.preset === "powered-hover"
              ? "0.000"
              : circularOrbit.speedMps.toFixed(6),
          );
          setData(
            container,
            "orbitPeriodSeconds",
            circularOrbit.periodSeconds.toFixed(6),
          );
        } else {
          setData(
            container,
            "orbitView",
            orbitViewEnabledRef.current ? "waiting-for-arrival" : "off",
          );
          delete container.dataset["orbitViewBody"];
          delete container.dataset["orbitPreset"];
          delete container.dataset["orbitAltitudeM"];
          delete container.dataset["orbitSpeedMps"];
          delete container.dataset["orbitPeriodSeconds"];
        }
        surfaceHorizon.visible = false;
        for (const label of compassLabels.values()) {
          setHidden(label, true);
        }
        for (const atmosphere of atmosphereMeshes.values()) {
          atmosphere.visible = true;
        }
        delete container.dataset["surfaceObserverBody"];
        delete container.dataset["surfaceObserverTarget"];
        delete container.dataset["surfaceObserverLatitudeDeg"];
        delete container.dataset["surfaceObserverLongitudeDeg"];
        delete container.dataset["surfaceHorizonVisible"];
        delete container.dataset["surfaceFreeLook"];
        delete container.dataset["surfaceLookAzimuthDeg"];
        delete container.dataset["surfaceLookAltitudeDeg"];
        delete container.dataset["solarEclipseMoonDiameterDeg"];
        delete container.dataset["solarEclipseSunDiameterDeg"];
        delete container.dataset["solarEclipseSeparationDeg"];
        delete container.dataset["solarEclipseObscuration"];
      } else {
        interruptCameraTransition();
        controls.enabled = false;
        const observation = surfaceObserverFrame(current, surfaceConfiguration);
        latestSurfaceObservation = observation;
        const surfaceConfigurationKey = [
          surfaceConfiguration.bodyId,
          surfaceConfiguration.targetBodyId,
          surfaceConfiguration.latitudeDeg.toFixed(8),
          surfaceConfiguration.longitudeDeg.toFixed(8),
        ].join(":");
        if (
          surfaceConfigurationKey !== lastSurfaceConfigurationKey ||
          surfaceObserverLookResetTokenRef.current !== lastSurfaceLookResetToken
        ) {
          lastSurfaceConfigurationKey = surfaceConfigurationKey;
          lastSurfaceLookResetToken = surfaceObserverLookResetTokenRef.current;
          surfaceFreeLook = false;
        }
        camera.near = 0.05 / ASTRONOMICAL_UNIT_M;
        camera.far = DEFAULT_CAMERA_FAR_AU;
        camera.position.copy(observation.observerPositionAu);
        const lookDirection = surfaceFreeLook
          ? observation.north
              .clone()
              .multiplyScalar(
                Math.cos((surfaceLookAzimuthDeg * Math.PI) / 180) *
                  Math.cos((surfaceLookAltitudeDeg * Math.PI) / 180),
              )
              .add(
                observation.east
                  .clone()
                  .multiplyScalar(
                    Math.sin((surfaceLookAzimuthDeg * Math.PI) / 180) *
                      Math.cos((surfaceLookAltitudeDeg * Math.PI) / 180),
                  ),
              )
              .add(
                observation.zenith
                  .clone()
                  .multiplyScalar(
                    Math.sin((surfaceLookAltitudeDeg * Math.PI) / 180),
                  ),
              )
              .normalize()
          : observation.targetDirection;
        camera.up.copy(
          Math.abs(lookDirection.dot(observation.zenith)) > 0.999
            ? observation.north
            : observation.zenith,
        );
        controls.target.copy(camera.position).add(lookDirection);
        camera.lookAt(controls.target);
        camera.updateProjectionMatrix();
        const observerDefinition = majorBodyById.get(
          surfaceConfiguration.bodyId,
        );
        if (observerDefinition === undefined) {
          throw new Error(
            `Surface observer definition ${surfaceConfiguration.bodyId} is unavailable`,
          );
        }
        for (let index = 0; index < 96; index += 1) {
          const point = surfaceHorizonPoint(
            observation,
            observerDefinition.meanRadiusM,
            (index / 96) * 360,
          ).sub(observation.surfacePositionAu);
          surfaceHorizonPositions[index * 3] = point.x;
          surfaceHorizonPositions[index * 3 + 1] = point.y;
          surfaceHorizonPositions[index * 3 + 2] = point.z;
        }
        surfaceHorizon.position.copy(observation.surfacePositionAu);
        surfaceHorizonPositionAttribute.needsUpdate = true;
        surfaceHorizonGeometry.computeBoundingSphere();
        surfaceHorizon.visible = true;
        for (const [azimuthDeg, label] of compassLabels) {
          const projected = surfaceHorizonPoint(
            observation,
            observerDefinition.meanRadiusM,
            azimuthDeg,
          ).project(camera);
          const visible =
            projected.z >= -1 &&
            projected.z <= 1 &&
            Math.abs(projected.x) <= 1 &&
            Math.abs(projected.y) <= 1;
          setHidden(label, !visible);
          if (visible) {
            setTransform(
              label,
              ((projected.x + 1) * viewportWidth) / 2,
              ((-projected.y + 1) * viewportHeight) / 2,
            );
          }
        }
        for (const [bodyId, atmosphere] of atmosphereMeshes) {
          atmosphere.visible = bodyId !== surfaceConfiguration.bodyId;
        }
        setData(container, "cameraTracking", "surface-observer");
        setData(container, "cameraOrientation", "local-horizontal");
        setData(container, "cameraObserverBody", surfaceConfiguration.bodyId);
        setData(
          container,
          "cameraTargetBody",
          surfaceConfiguration.targetBodyId,
        );
        setData(container, "cameraObserverAltitudeKm", "0.002");
        setData(container, "surfaceObserverBody", surfaceConfiguration.bodyId);
        setData(
          container,
          "surfaceObserverTarget",
          surfaceConfiguration.targetBodyId,
        );
        setData(
          container,
          "surfaceObserverLatitudeDeg",
          surfaceConfiguration.latitudeDeg.toFixed(6),
        );
        setData(
          container,
          "surfaceObserverLongitudeDeg",
          surfaceConfiguration.longitudeDeg.toFixed(6),
        );
        setData(container, "surfaceFreeLook", String(surfaceFreeLook));
        setData(
          container,
          "surfaceLookAzimuthDeg",
          (surfaceFreeLook
            ? surfaceLookAzimuthDeg
            : observation.targetAzimuthDeg
          ).toFixed(4),
        );
        setData(
          container,
          "surfaceLookAltitudeDeg",
          (surfaceFreeLook
            ? surfaceLookAltitudeDeg
            : observation.targetAltitudeDeg
          ).toFixed(4),
        );
        setData(
          container,
          "surfaceObserverPosition",
          [camera.position.x, camera.position.y, camera.position.z]
            .map((value) => value.toFixed(12))
            .join(","),
        );
        setData(
          container,
          "surfaceTargetAltitudeDeg",
          observation.targetAltitudeDeg.toFixed(6),
        );
        setData(
          container,
          "surfaceTargetAzimuthDeg",
          observation.targetAzimuthDeg.toFixed(6),
        );
        setData(
          container,
          "surfaceTargetAngularDiameterDeg",
          observation.targetAngularDiameterDeg.toFixed(9),
        );
        setData(
          container,
          "surfaceLocalSolarTimeHours",
          observation.localSolarTimeHours.toFixed(9),
        );
        if (observation.solarEclipse === undefined) {
          delete container.dataset["solarEclipseMoonDiameterDeg"];
          delete container.dataset["solarEclipseSunDiameterDeg"];
          delete container.dataset["solarEclipseSeparationDeg"];
          delete container.dataset["solarEclipseObscuration"];
        } else {
          setData(
            container,
            "solarEclipseMoonDiameterDeg",
            observation.solarEclipse.moonAngularDiameterDeg.toFixed(9),
          );
          setData(
            container,
            "solarEclipseSunDiameterDeg",
            observation.solarEclipse.sunAngularDiameterDeg.toFixed(9),
          );
          setData(
            container,
            "solarEclipseSeparationDeg",
            observation.solarEclipse.centerSeparationDeg.toFixed(9),
          );
          setData(
            container,
            "solarEclipseObscuration",
            observation.solarEclipse.obscurationFraction.toFixed(9),
          );
        }
        setData(
          container,
          "surfaceHorizonModel",
          "mean-radius-geometric-no-refraction",
        );
        setData(container, "surfaceHorizonVisible", "true");
      }
      setData(
        container,
        "cameraDistanceAu",
        camera.position.distanceTo(controls.target).toFixed(12),
      );
      const currentViewDistanceAu = camera.position.distanceTo(controls.target);
      const effectiveViewZoom =
        currentViewDistanceAu > 0
          ? camera.zoom * (viewZoomReferenceDistanceAu / currentViewDistanceAu)
          : camera.zoom;
      const reportedViewZoom =
        Math.round(effectiveViewZoom * 1_000_000) / 1_000_000;
      if (
        Number.isFinite(reportedViewZoom) &&
        (Number.isNaN(lastReportedViewZoom) ||
          Math.abs(Math.log2(reportedViewZoom / lastReportedViewZoom)) > 0.002)
      ) {
        lastReportedViewZoom = reportedViewZoom;
        setData(container, "viewMagnification", reportedViewZoom.toFixed(4));
        onViewZoomChangeRef.current(reportedViewZoom);
      }
      stars.position.copy(camera.position);
      zodiacGroup.position.copy(camera.position);
      camera.updateMatrixWorld();
      for (const { element, direction } of zodiacLabels) {
        if (!zodiacGroup.visible) {
          setHidden(element, true);
          continue;
        }
        const projected = camera.position
          .clone()
          .add(direction.clone().multiplyScalar(ZODIAC_SPHERE_RADIUS_AU))
          .project(camera);
        const visible =
          projected.z >= -1 &&
          projected.z <= 1 &&
          Math.abs(projected.x) <= 0.94 &&
          Math.abs(projected.y) <= 0.94;
        setHidden(element, !visible);
        if (visible) {
          setTransform(
            element,
            ((projected.x + 1) * viewportWidth) / 2,
            ((-projected.y + 1) * viewportHeight) / 2,
          );
        }
      }
      setData(
        container,
        "zodiacVisibleLabelCount",
        String(zodiacLabels.filter(({ element }) => !element.hidden).length),
      );
      let brightVisibleStarFound = false;
      if (stars.visible) {
        for (const starIndex of brightStarCandidateIndexes) {
          const offset = starIndex * 3;
          const projected = camera.position
            .clone()
            .add(
              new Vector3(
                starPositions[offset],
                starPositions[offset + 1],
                starPositions[offset + 2],
              ),
            )
            .project(camera);
          if (
            projected.z < -1 ||
            projected.z > 1 ||
            Math.abs(projected.x) > 0.8 ||
            Math.abs(projected.y) > 0.8
          ) {
            continue;
          }
          const star = hipparcosStarSnapshot.stars[starIndex];
          if (star === undefined) {
            throw new Error(
              `Bright Hipparcos diagnostic index ${String(starIndex)} is invalid`,
            );
          }
          setData(container, "brightVisibleStarHipId", String(star.hipId));
          setData(
            container,
            "brightVisibleStarScreenX",
            (((projected.x + 1) * viewportWidth) / 2).toFixed(3),
          );
          setData(
            container,
            "brightVisibleStarScreenY",
            (((-projected.y + 1) * viewportHeight) / 2).toFixed(3),
          );
          brightVisibleStarFound = true;
          break;
        }
      }
      if (!brightVisibleStarFound) {
        delete container.dataset["brightVisibleStarHipId"];
        delete container.dataset["brightVisibleStarScreenX"];
        delete container.dataset["brightVisibleStarScreenY"];
      }
      const liveSunPosition =
        bodyMeshes.get("sun")?.position.clone() ?? new Vector3();
      deepSpaceGroup.position.copy(liveSunPosition);
      const distanceFromSunAu = camera.position.distanceTo(liveSunPosition);
      const activeDeepPresentation = deepSpacePresentationRef.current;
      const showHeliosphere =
        distanceFromSunAu >= 150 || activeDeepPresentation !== undefined;
      const showOortCloud =
        distanceFromSunAu >= 500 ||
        activeDeepPresentation === "oort-cloud-scale" ||
        activeDeepPresentation === "interstellar-scale";
      const showAlphaCentauri =
        distanceFromSunAu >= 40_000 ||
        activeDeepPresentation === "interstellar-scale";
      terminationShock.visible = showHeliosphere;
      heliopause.visible = showHeliosphere;
      innerOortBoundary.visible = showOortCloud;
      outerOortBoundary.visible = showOortCloud;
      oortCloud.visible = showOortCloud;
      alphaMarker.visible = showAlphaCentauri;
      setData(container, "deepSpaceLayer", "same-three-scene");
      setData(container, "heliosphereVisible", String(showHeliosphere));
      setData(container, "oortCloudVisible", String(showOortCloud));
      setData(container, "alphaCentauriVisible", String(showAlphaCentauri));
      const sunToCameraDirection = camera.position
        .clone()
        .sub(liveSunPosition)
        .normalize();
      const boundaryLabelPosition = (radiusAu: number): Vector3 =>
        liveSunPosition
          .clone()
          .add(sunToCameraDirection.clone().multiplyScalar(radiusAu * 0.82))
          .add(
            camera.up
              .clone()
              .normalize()
              .multiplyScalar(radiusAu * 0.45),
          );
      const deepLabelPositions = [
        boundaryLabelPosition(120),
        boundaryLabelPosition(OORT_CLOUD_OUTER_MAX_AU),
        liveSunPosition.clone().add(alphaCentauriOffset),
      ];
      for (const [index, label] of deepSpaceLabels.entries()) {
        const visible = [
          showHeliosphere && !showOortCloud,
          showOortCloud,
          showAlphaCentauri,
        ][index];
        const authoredPresentation = [
          "heliosphere-scale",
          "oort-cloud-scale",
          "interstellar-scale",
        ][index];
        const position = deepLabelPositions[index];
        if (!visible || position === undefined) {
          setHidden(label, true);
          continue;
        }
        const projected = position.clone().project(camera);
        const inView =
          projected.z >= -1 &&
          projected.z <= 1 &&
          Math.abs(projected.x) <= 1 &&
          Math.abs(projected.y) <= 1;
        const keepVisibleForAuthoredScene =
          activeDeepPresentation === authoredPresentation;
        setHidden(label, !inView && !keepVisibleForAuthoredScene);
        if (inView) {
          setTransform(
            label,
            ((projected.x + 1) * viewportWidth) / 2,
            ((-projected.y + 1) * viewportHeight) / 2,
          );
        } else if (keepVisibleForAuthoredScene) {
          setTransform(label, viewportWidth * 0.66, viewportHeight * 0.2);
        }
      }
      const projectedDeepSun = liveSunPosition.clone().project(camera);
      const deepSunInView =
        showHeliosphere &&
        projectedDeepSun.z >= -1 &&
        projectedDeepSun.z <= 1 &&
        Math.abs(projectedDeepSun.x) <= 1 &&
        Math.abs(projectedDeepSun.y) <= 1;
      setHidden(deepSunLabel, !deepSunInView);
      if (deepSunInView) {
        setTransform(
          deepSunLabel,
          ((projectedDeepSun.x + 1) * viewportWidth) / 2,
          ((-projectedDeepSun.y + 1) * viewportHeight) / 2,
        );
      }

      setHidden(navigationMap, viewModeRef.current !== "reality");
      if (
        !navigationMap.hidden &&
        frameRenderStartedAtMs - lastNavigationMapUpdateAt >= 100
      ) {
        lastNavigationMapUpdateAt = frameRenderStartedAtMs;
        const width = navigationMapCanvas.width;
        const height = navigationMapCanvas.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const observerBodyId =
          surfaceObserverRef.current?.bodyId ?? focusBodyIdRef.current;
        const observerPosition =
          observerBodyId === null
            ? camera.position
            : (bodyMeshes.get(observerBodyId)?.position ?? camera.position);
        const observerDistanceAu = observerPosition.distanceTo(liveSunPosition);
        const automaticMapScaleAu = Math.max(
          2,
          observerDistanceAu * 1.35,
          distanceFromSunAu * 1.1,
        );
        const selectedMapRange = navigationRangeSelect.value;
        const mapScaleAu =
          selectedMapRange === "auto"
            ? automaticMapScaleAu
            : Number(selectedMapRange);
        if (!Number.isFinite(mapScaleAu) || mapScaleAu <= 0) {
          throw new Error(
            `Navigation map range ${selectedMapRange} is invalid`,
          );
        }
        const pixelsPerAu = (Math.min(width, height) * 0.42) / mapScaleAu;
        const mapPoint = (position: Vector3): readonly [number, number] => {
          const relative = position.clone().sub(liveSunPosition);
          return [
            centerX + relative.dot(ECLIPTIC_RIGHT) * pixelsPerAu,
            centerY - relative.dot(ECLIPTIC_FORWARD) * pixelsPerAu,
          ];
        };
        navigationContext.clearRect(0, 0, width, height);
        navigationContext.fillStyle = "rgba(3, 10, 19, 0.86)";
        navigationContext.fillRect(0, 0, width, height);
        navigationContext.strokeStyle = "rgba(132, 181, 222, 0.14)";
        navigationContext.lineWidth = 1;
        for (const fraction of [0.33, 0.66, 1]) {
          navigationContext.beginPath();
          navigationContext.arc(
            centerX,
            centerY,
            mapScaleAu * fraction * pixelsPerAu,
            0,
            Math.PI * 2,
          );
          navigationContext.stroke();
        }
        navigationContext.fillStyle = "#ffd27a";
        navigationContext.beginPath();
        navigationContext.arc(centerX, centerY, 4, 0, Math.PI * 2);
        navigationContext.fill();
        navigationMapHits = [
          {
            bodyId: "sun",
            x: centerX,
            y: centerY,
            radius: 9,
            distanceFromSunAu: 0,
          },
        ];
        const plottedBodyIds = new Set<string>();
        listNavigationDestinations();
        for (const destination of navigationDestinations) {
          if (
            destination.id === "sun" ||
            plottedBodyIds.has(destination.id) ||
            !isNavigationDestinationShown(destination.id)
          ) {
            continue;
          }
          plottedBodyIds.add(destination.id);
          const destinationState =
            current === undefined
              ? undefined
              : bodyStateById(current, destination.id);
          if (destinationState === undefined) continue;
          const destinationPosition = scenePosition(destinationState.positionM);
          const [x, y] = mapPoint(destinationPosition);
          if (x < 0 || y < 0 || x > width || y > height) continue;
          const isFocused = destination.id === focusBodyIdRef.current;
          const isSelectedDestination =
            destination.id === navigationDestinationSelect.value;
          // At map scale a moon or a nearby craft sits on its planet's dot.
          // The first dot drawn there (the planet) stays the one a press
          // picks, unless the hidden object is the focus or the destination.
          if (
            !isFocused &&
            !isSelectedDestination &&
            navigationMapHits.some(
              (hit) =>
                Math.hypot(hit.x - x, hit.y - y) < NAVIGATION_MAP_SAME_SPOT_PX,
            )
          ) {
            continue;
          }
          navigationContext.fillStyle =
            destination.group === "Spacecraft"
              ? "#a5e3c2"
              : destination.group === HIDDEN_SURPRISES_GROUP
                ? "#d8a8ee"
                : destination.group === "Moons"
                  ? "#b9c4cf"
                  : "#83bde4";
          navigationContext.beginPath();
          navigationContext.arc(
            x,
            y,
            isFocused ? 5.5 : isSelectedDestination ? 4.5 : 2.3,
            0,
            Math.PI * 2,
          );
          navigationContext.fill();
          if (isFocused || isSelectedDestination) {
            navigationContext.strokeStyle = isFocused ? "#ffffff" : "#b8dfff";
            navigationContext.lineWidth = 1.2;
            navigationContext.beginPath();
            navigationContext.arc(x, y, isFocused ? 8 : 7, 0, Math.PI * 2);
            navigationContext.stroke();
          }
          navigationMapHits = [
            ...navigationMapHits,
            {
              bodyId: destination.id,
              x,
              y,
              radius: Math.max(8, isFocused ? 10 : 0),
              distanceFromSunAu:
                destinationPosition.distanceTo(liveSunPosition),
            },
          ];
        }
        if (mapScaleAu >= 250_000) {
          const alphaCentauriPosition = liveSunPosition
            .clone()
            .add(alphaCentauriOffset);
          const [alphaX, alphaY] = mapPoint(alphaCentauriPosition);
          if (
            alphaX >= 0 &&
            alphaY >= 0 &&
            alphaX <= width &&
            alphaY <= height
          ) {
            navigationContext.fillStyle = "#ffe5ae";
            navigationContext.beginPath();
            navigationContext.arc(alphaX, alphaY, 3, 0, Math.PI * 2);
            navigationContext.fill();
            navigationContext.fillStyle = "rgba(255, 229, 174, 0.82)";
            navigationContext.font = "12px system-ui";
            navigationContext.fillText(
              "Alpha Centauri",
              alphaX + 7,
              alphaY - 7,
            );
          }
        }
        const [observerX, observerY] = mapPoint(observerPosition);
        const cameraDirection = camera.getWorldDirection(new Vector3());
        const directionX = cameraDirection.dot(ECLIPTIC_RIGHT);
        const directionY = -cameraDirection.dot(ECLIPTIC_FORWARD);
        const directionLength = Math.hypot(directionX, directionY) || 1;
        navigationContext.strokeStyle = "#f1f7ff";
        navigationContext.lineWidth = 3;
        navigationContext.beginPath();
        navigationContext.moveTo(observerX, observerY);
        navigationContext.lineTo(
          observerX + (directionX / directionLength) * 32,
          observerY + (directionY / directionLength) * 32,
        );
        navigationContext.stroke();
        navigationContext.fillStyle = "#ffffff";
        navigationContext.beginPath();
        navigationContext.arc(observerX, observerY, 3.5, 0, Math.PI * 2);
        navigationContext.fill();
        if (
          focusBodyIdRef.current !== lastNavigationFocusBodyId &&
          focusBodyIdRef.current !== null &&
          navigationDestinationById.has(focusBodyIdRef.current) &&
          isNavigationDestinationShown(focusBodyIdRef.current)
        ) {
          navigationDestinationSelect.value = focusBodyIdRef.current;
          lastNavigationFocusBodyId = focusBodyIdRef.current;
        }
        navigationMapScale.textContent = `Radius ${formatTacticalDistance(mapScaleAu)} · white arrow is your view`;
        setData(navigationMap, "scaleAu", mapScaleAu.toFixed(4));
        setData(navigationMap, "rangeMode", selectedMapRange);
        setData(
          navigationMap,
          "destination",
          navigationDestinationSelect.value,
        );
        setData(
          navigationMap,
          "plottedTargetCount",
          String(navigationMapHits.length),
        );
        setData(
          navigationMap,
          "plottedBodies",
          navigationMapHits.map((hit) => hit.bodyId).join(" "),
        );
        setData(navigationMap, "observerBody", observerBodyId ?? "camera");
        setData(
          navigationMap,
          "viewBearingDeg",
          ((Math.atan2(directionX, -directionY) * 180) / Math.PI + 360).toFixed(
            2,
          ),
        );
      }
      if (activeCameraTransition === undefined) {
        delete container.dataset["cameraTransitionAnchorScreenX"];
        delete container.dataset["cameraTransitionAnchorScreenY"];
      } else {
        const projectedTransitionAnchor = controls.target
          .clone()
          .project(camera);
        setData(
          container,
          "cameraTransitionAnchorScreenX",
          (((projectedTransitionAnchor.x + 1) * viewportWidth) / 2).toFixed(3),
        );
        setData(
          container,
          "cameraTransitionAnchorScreenY",
          (((-projectedTransitionAnchor.y + 1) * viewportHeight) / 2).toFixed(
            3,
          ),
        );
      }
      const activeCameraTargetBodyId =
        surfaceObserverRef.current?.targetBodyId ??
        cameraTargetBodyIdRef.current;
      const activeCameraTargetState =
        current === undefined || activeCameraTargetBodyId === undefined
          ? undefined
          : bodyStateById(current, activeCameraTargetBodyId);
      if (activeCameraTargetState === undefined) {
        delete container.dataset["cameraTargetScreenX"];
        delete container.dataset["cameraTargetScreenY"];
      } else {
        const projectedTarget = scenePosition(
          activeCameraTargetState.positionM,
        ).project(camera);
        setData(
          container,
          "cameraTargetScreenX",
          (((projectedTarget.x + 1) * viewportWidth) / 2).toFixed(3),
        );
        setData(
          container,
          "cameraTargetScreenY",
          (((-projectedTarget.y + 1) * viewportHeight) / 2).toFixed(3),
        );
      }
      setData(
        container,
        "cameraEclipticNorthDot",
        camera.position
          .clone()
          .sub(controls.target)
          .normalize()
          .dot(ECLIPTIC_NORTH)
          .toFixed(6),
      );
      const cameraDirection = camera.position
        .clone()
        .sub(controls.target)
        .normalize();
      setData(
        container,
        "cameraDirection",
        [cameraDirection.x, cameraDirection.y, cameraDirection.z]
          .map((value) => value.toFixed(8))
          .join(","),
      );
      const illuminatedFocusBodyId = focusBodyIdRef.current;
      const illuminatedFocusState =
        current === undefined ||
        illuminatedFocusBodyId === null ||
        illuminatedFocusBodyId === "sun"
          ? undefined
          : bodyStateById(current, illuminatedFocusBodyId);
      const illuminationSunState =
        current === undefined ? undefined : bodyStateById(current, "sun");
      if (
        illuminatedFocusState === undefined ||
        illuminationSunState === undefined
      ) {
        delete container.dataset["focusedSunCameraAlignment"];
      } else {
        const focusPosition = scenePosition(illuminatedFocusState.positionM);
        const focusToSun = scenePosition(illuminationSunState.positionM)
          .sub(focusPosition)
          .normalize();
        const focusToCamera = camera.position
          .clone()
          .sub(focusPosition)
          .normalize();
        setData(
          container,
          "focusedSunCameraAlignment",
          focusToSun.dot(focusToCamera).toFixed(6),
        );
      }

      if (renderNowMs - lastSunGuideUpdateAt >= SUN_GUIDE_UPDATE_INTERVAL_MS) {
        lastSunGuideUpdateAt = renderNowMs;
        wayfinderLabelRectangles = [];
        const activeWayfinderMode = wayfinderModeRef.current;
        setData(container, "wayfinderMode", activeWayfinderMode);
        const wayfinderVisuals = [
          {
            line: sunGuideLine,
            endpoint: sunGuideEndpoint,
            label: sunGuideLabel,
          },
          ...planetWayfinderVisuals,
        ];
        const hideAllWayfinders = (): void => {
          sunGuideOverlay.style.display = "none";
          for (const visual of wayfinderVisuals) {
            visual.line.style.display = "none";
            visual.endpoint.style.display = "none";
            setHidden(visual.label, true);
            delete visual.label.dataset["targetBodyId"];
          }
          setData(container, "sunGuideVisible", "false");
          setData(container, "sunGuideLineVisible", "false");
          setData(container, "wayfinderCount", "0");
          setData(container, "wayfinderPlanetCount", "0");
          setData(container, "wayfinderTargets", "");
        };
        const wayfinderFocusId = focusBodyIdRef.current;
        const wayfinderFocusState =
          current === undefined || wayfinderFocusId === null
            ? undefined
            : bodyStateById(current, wayfinderFocusId);
        const wayfinderSunState =
          current === undefined ? undefined : bodyStateById(current, "sun");
        if (
          current === undefined ||
          wayfinderSunState === undefined ||
          activeWayfinderMode === "off" ||
          container.closest(".app-shell.is-immersive") !== null ||
          (wayfinderFocusId === "sun" && activeDeepPresentation !== undefined)
        ) {
          hideAllWayfinders();
        } else {
          const guideHeight = Math.min(
            viewportHeight,
            ...guideObstacles.map((obstacle) => obstacle.top),
          );
          // The lowest y a guide may use across [left, right] of the scene.
          const guideFloor = (left: number, right: number): number =>
            Math.min(
              viewportHeight,
              ...guideObstacles
                .filter(
                  (obstacle) =>
                    right >= obstacle.left && left <= obstacle.right,
                )
                .map((obstacle) => obstacle.top),
            );
          const viewportMargin = Math.min(
            110,
            viewportWidth / 3,
            guideHeight / 3,
          );
          const sunPosition = scenePosition(wayfinderSunState.positionM);
          const focusPosition =
            wayfinderFocusState === undefined
              ? undefined
              : scenePosition(wayfinderFocusState.positionM);
          const originBodyId =
            wayfinderFocusState === undefined || wayfinderFocusId === null
              ? "sun"
              : wayfinderFocusId;
          const originPosition = focusPosition ?? sunPosition;
          const wayfinderState = current.bodies.some(
            (body) => body.id === originBodyId,
          )
            ? current
            : wayfinderFocusState === undefined
              ? current
              : {
                  ...current,
                  bodies: [...current.bodies, wayfinderFocusState],
                };
          const focusScreen =
            focusPosition === undefined ||
            cameraTargetBodyIdRef.current !== undefined
              ? { x: viewportWidth / 2, y: viewportHeight / 2 }
              : (() => {
                  const projected = focusPosition.clone().project(camera);
                  return {
                    x: ((projected.x + 1) * viewportWidth) / 2,
                    y: ((-projected.y + 1) * viewportHeight) / 2,
                  };
                })();
          if (focusPosition === undefined) {
            delete container.dataset["focusedTargetScreenX"];
            delete container.dataset["focusedTargetScreenY"];
          } else {
            setData(
              container,
              "focusedTargetScreenX",
              focusScreen.x.toFixed(3),
            );
            setData(
              container,
              "focusedTargetScreenY",
              focusScreen.y.toFixed(3),
            );
          }
          const guideOrigin = {
            x: Math.min(
              viewportWidth - viewportMargin,
              Math.max(viewportMargin, focusScreen.x),
            ),
            // Always above the top of every bottom panel, so a ray that ends
            // under one can be cut short at that height.
            y: Math.min(
              guideHeight - viewportMargin,
              Math.max(viewportMargin, focusScreen.y),
            ),
          };
          const planetTargets = nearestPlanetWayfinders(
            wayfinderState,
            originBodyId,
            wayfinderPlanetCount(activeWayfinderMode),
          );
          const wayfinderTargetIds = [
            "sun",
            ...planetTargets.map((target) => target.bodyId),
          ];
          let sunLocation: "behind" | "off-screen" | "on-screen" = "on-screen";
          let sunDistanceAu = 0;
          let sunLineVisible = false;
          for (const [index, visual] of wayfinderVisuals.entries()) {
            const targetBodyId = wayfinderTargetIds[index];
            if (targetBodyId === undefined) {
              visual.line.style.display = "none";
              visual.endpoint.style.display = "none";
              setHidden(visual.label, true);
              delete visual.label.dataset["targetBodyId"];
              continue;
            }
            const targetState = bodyStateById(current, targetBodyId);
            const targetDefinition = majorBodyById.get(targetBodyId);
            if (targetState === undefined || targetDefinition === undefined) {
              throw new Error(
                `Wayfinder target ${targetBodyId} is unavailable`,
              );
            }
            const targetPosition = scenePosition(targetState.positionM);
            const targetProjected = targetPosition.clone().project(camera);
            const rawTargetScreen = {
              x: ((targetProjected.x + 1) * viewportWidth) / 2,
              y: ((-targetProjected.y + 1) * viewportHeight) / 2,
            };
            const targetCameraPosition = targetPosition
              .clone()
              .applyMatrix4(camera.matrixWorldInverse);
            const targetInFront = targetCameraPosition.z < -camera.near;
            const targetOnScreen =
              targetInFront &&
              targetProjected.z >= -1 &&
              targetProjected.z <= 1 &&
              pointInsideViewport(
                rawTargetScreen,
                viewportWidth,
                guideFloor(rawTargetScreen.x, rawTargetScreen.x),
                viewportMargin,
              );
            let location: "behind" | "off-screen" | "on-screen" = "on-screen";
            let endpoint = rawTargetScreen;
            if (!targetOnScreen) {
              location = targetInFront ? "off-screen" : "behind";
              let direction = targetInFront
                ? {
                    x: rawTargetScreen.x - guideOrigin.x,
                    y: rawTargetScreen.y - guideOrigin.y,
                  }
                : {
                    x: targetCameraPosition.x,
                    y: -targetCameraPosition.y,
                  };
              if (Math.hypot(direction.x, direction.y) < 1e-12) {
                direction = { x: 0, y: -1 };
              }
              endpoint = rayToViewportEdge(
                guideOrigin,
                direction,
                viewportWidth,
                viewportHeight,
                viewportMargin,
              );
              if (
                guideFloor(endpoint.x, endpoint.x) - viewportMargin <
                endpoint.y
              ) {
                endpoint = rayToViewportEdge(
                  guideOrigin,
                  direction,
                  viewportWidth,
                  guideHeight,
                  viewportMargin,
                );
              }
            }
            const hasLine = originBodyId !== targetBodyId;
            visual.line.style.display = hasLine ? "" : "none";
            if (hasLine) {
              setAttr(visual.line, "x1", String(guideOrigin.x));
              setAttr(visual.line, "y1", String(guideOrigin.y));
              setAttr(visual.line, "x2", String(endpoint.x));
              setAttr(visual.line, "y2", String(endpoint.y));
            }
            visual.endpoint.style.display = "";
            setAttr(visual.endpoint, "cx", String(endpoint.x));
            setAttr(visual.endpoint, "cy", String(endpoint.y));
            const distanceAu = originPosition.distanceTo(targetPosition);
            const distanceLabel = hasLine
              ? ` · ${formatTacticalDistance(distanceAu)}`
              : "";
            const locationLabel = location === "behind" ? " behind view" : "";
            visual.label.textContent = `${targetDefinition.name}${locationLabel}${distanceLabel}`;
            setAttr(visual.label, "aria-label", targetDefinition.name);
            visual.label.title = LABEL_TITLE;
            const previousTargetBodyId = visual.label.dataset["targetBodyId"];
            const previousLocation = visual.label.dataset["location"];
            setData(visual.label, "targetBodyId", targetBodyId);
            setData(visual.label, "distanceAu", distanceAu.toFixed(8));
            setData(visual.label, "location", location);
            showLabelSelection(visual.label, targetBodyId);
            setHidden(visual.label, false);
            const labelBounds = visual.label.getBoundingClientRect();
            const labelWidth = labelBounds.width;
            if (labelWidth <= 0) {
              throw new Error(
                `Wayfinder label for ${targetDefinition.name} has no measurable width`,
              );
            }
            const labelGap = 8;
            const labelMargin = 8;
            const preferredLabelX =
              endpoint.x + labelGap + labelWidth <= viewportWidth - labelMargin
                ? endpoint.x + labelGap
                : endpoint.x - labelWidth - labelGap;
            const labelX = Math.min(
              viewportWidth - labelWidth - labelMargin,
              Math.max(labelMargin, preferredLabelX),
            );
            const laneOffset = index === 1 ? 28 : index === 2 ? -28 : 0;
            const labelY = Math.min(
              guideFloor(labelX, labelX + labelWidth) - 30,
              Math.max(30, endpoint.y + laneOffset),
            );
            const previousLabelX = Number(visual.label.dataset["positionX"]);
            const previousLabelY = Number(visual.label.dataset["positionY"]);
            const repositionThresholdPx = targetBodyId === "sun" ? 0 : 6;
            const labelTargetChanged =
              previousTargetBodyId !== targetBodyId ||
              previousLocation !== location;
            if (
              labelTargetChanged ||
              !Number.isFinite(previousLabelX) ||
              !Number.isFinite(previousLabelY) ||
              Math.hypot(labelX - previousLabelX, labelY - previousLabelY) >=
                repositionThresholdPx
            ) {
              setTransform(visual.label, labelX, labelY);
              setData(visual.label, "positionX", labelX.toFixed(3));
              setData(visual.label, "positionY", labelY.toFixed(3));
            }
            const placedX = Number(visual.label.dataset["positionX"]);
            const placedY = Number(visual.label.dataset["positionY"]);
            wayfinderLabelRectangles.push({
              left: placedX,
              right: placedX + labelWidth,
              top: placedY - labelBounds.height / 2,
              bottom: placedY + labelBounds.height / 2,
            });
            if (targetBodyId === "sun") {
              sunLocation = location;
              sunDistanceAu = distanceAu;
              sunLineVisible = hasLine;
            }
          }
          sunGuideOverlay.style.display = "";
          setData(container, "sunGuideVisible", "true");
          setData(container, "sunGuideLocation", sunLocation);
          setData(container, "sunGuideDistanceAu", sunDistanceAu.toFixed(8));
          setData(container, "sunGuideLineVisible", String(sunLineVisible));
          setData(
            container,
            "sunGuideEndpointX",
            sunGuideEndpoint.getAttribute("cx") ?? "unavailable",
          );
          setData(
            container,
            "sunGuideEndpointY",
            sunGuideEndpoint.getAttribute("cy") ?? "unavailable",
          );
          setData(
            container,
            "wayfinderCount",
            String(wayfinderTargetIds.length),
          );
          setData(
            container,
            "wayfinderPlanetCount",
            String(planetTargets.length),
          );
          setData(container, "wayfinderTargets", wayfinderTargetIds.join(","));
        }
      }

      const tacticalFocusId = focusBodyIdRef.current;
      const tacticalFocusState =
        current === undefined || tacticalFocusId === null
          ? undefined
          : bodyStateById(current, tacticalFocusId);
      const tacticalVisible =
        showTacticalOverlayRef.current &&
        tacticalFocusState !== undefined &&
        (tacticalFocusId !== ISS_BODY_ID ||
          (current !== undefined &&
            isIssEphemerisWithinValidity(current.timeSeconds)));
      tacticalOverlay.classList.toggle("is-visible", tacticalVisible);
      setHidden(focusBracket, !tacticalVisible);
      setHidden(rangeLegend, !tacticalVisible);
      setData(container, "tacticalOverlayVisible", String(tacticalVisible));
      if (
        tacticalVisible &&
        current !== undefined &&
        tacticalFocusId !== null
      ) {
        const focusPosition = scenePosition(tacticalFocusState.positionM);
        const focusProjected = focusPosition.clone().project(camera);
        const focusScreen = {
          x: ((focusProjected.x + 1) * viewportWidth) / 2,
          y: ((-focusProjected.y + 1) * viewportHeight) / 2,
        };
        setTransform(focusBracket, focusScreen.x, focusScreen.y);
        const cameraDistance = camera.position.distanceTo(focusPosition);
        const worldHeight =
          (2 * cameraDistance * Math.tan((camera.fov * Math.PI) / 360)) /
          camera.zoom;
        const auPerPixel = worldHeight / Math.max(1, viewportHeight);
        const desiredRingAu = Math.max(auPerPixel * 70, 1e-9);
        const magnitude = 10 ** Math.floor(Math.log10(desiredRingAu));
        const normalized = desiredRingAu / magnitude;
        const niceMultiplier =
          normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
        const ringStepAu = niceMultiplier * magnitude;
        for (const [index, ring] of rangeRings.entries()) {
          const radiusPixels = (ringStepAu * (index + 1)) / auPerPixel;
          setAttr(ring, "cx", String(focusScreen.x));
          setAttr(ring, "cy", String(focusScreen.y));
          setAttr(ring, "r", String(radiusPixels));
        }
        const outerRingRadiusPixels =
          (ringStepAu * rangeRings.length) / auPerPixel;
        rangeLegend.textContent = formatTacticalDistance(
          ringStepAu * rangeRings.length,
        );
        setTransform(
          rangeLegend,
          focusScreen.x + outerRingRadiusPixels,
          focusScreen.y,
        );

        const setLine = (
          line: SVGLineElement,
          from: Readonly<{ x: number; y: number }>,
          to: Readonly<{ x: number; y: number }>,
          visible: boolean,
        ): void => {
          line.style.display = visible ? "" : "none";
          if (!visible) {
            return;
          }
          setAttr(line, "x1", String(from.x));
          setAttr(line, "y1", String(from.y));
          setAttr(line, "x2", String(to.x));
          setAttr(line, "y2", String(to.y));
        };
        const tacticalParentId = parentBodyId(tacticalFocusId);
        const tacticalParentState =
          tacticalParentId === undefined
            ? undefined
            : bodyStateById(current, tacticalParentId);
        if (tacticalParentState === undefined) {
          setLine(parentConnection, focusScreen, focusScreen, false);
          setLine(velocityVector, focusScreen, focusScreen, false);
        } else {
          const parentProjected = scenePosition(
            tacticalParentState.positionM,
          ).project(camera);
          const parentScreen = {
            x: ((parentProjected.x + 1) * viewportWidth) / 2,
            y: ((-parentProjected.y + 1) * viewportHeight) / 2,
          };
          setLine(parentConnection, focusScreen, parentScreen, true);
          const relativeVelocity = icrfToScene({
            x:
              tacticalFocusState.velocityMps[0] -
              tacticalParentState.velocityMps[0],
            y:
              tacticalFocusState.velocityMps[1] -
              tacticalParentState.velocityMps[1],
            z:
              tacticalFocusState.velocityMps[2] -
              tacticalParentState.velocityMps[2],
          }).normalize();
          const velocityProjected = focusPosition
            .clone()
            .add(relativeVelocity.multiplyScalar(cameraDistance * 0.14))
            .project(camera);
          setLine(
            velocityVector,
            focusScreen,
            {
              x: ((velocityProjected.x + 1) * viewportWidth) / 2,
              y: ((-velocityProjected.y + 1) * viewportHeight) / 2,
            },
            true,
          );
        }
        const sunState = bodyStateById(current, "sun");
        if (sunState === undefined) {
          setLine(planeDropLine, focusScreen, focusScreen, false);
        } else {
          const sunPosition = scenePosition(sunState.positionM);
          const projectedOnPlane = focusPosition
            .clone()
            .sub(
              ECLIPTIC_NORTH.clone().multiplyScalar(
                focusPosition.clone().sub(sunPosition).dot(ECLIPTIC_NORTH),
              ),
            )
            .project(camera);
          setLine(
            planeDropLine,
            focusScreen,
            {
              x: ((projectedOnPlane.x + 1) * viewportWidth) / 2,
              y: ((-projectedOnPlane.y + 1) * viewportHeight) / 2,
            },
            true,
          );
        }
      }
      const semanticFocusDefinition =
        tacticalFocusId === null
          ? undefined
          : majorBodyById.get(tacticalFocusId);
      const semanticKnownSatellite =
        tacticalFocusId === null
          ? undefined
          : knownSatelliteById.get(tacticalFocusId);
      const semanticFocusMesh =
        tacticalFocusId !== null &&
        (tacticalFocusId === ISS_BODY_ID ||
          isVoyagerBodyId(tacticalFocusId) ||
          isOperationalSpacecraftBodyId(tacticalFocusId))
          ? sourcedModelGroups.get(tacticalFocusId)
          : tacticalFocusId === null
            ? undefined
            : bodyMeshes.get(tacticalFocusId);
      const semanticCameraDistance =
        semanticFocusMesh === undefined
          ? Number.POSITIVE_INFINITY
          : camera.position.distanceTo(semanticFocusMesh.position) /
            camera.zoom;
      const semanticPhysicalRadiusAu =
        tacticalFocusId !== null &&
        spacecraftBoundingRadiusM(tacticalFocusId) !== undefined
          ? (spacecraftBoundingRadiusM(tacticalFocusId) ?? 0) /
            ASTRONOMICAL_UNIT_M
          : semanticFocusDefinition === undefined
            ? 0
            : semanticFocusDefinition.meanRadiusM / ASTRONOMICAL_UNIT_M;
      const semanticZoomLevel: SemanticZoomLevel =
        distanceFromSunAu >= 200_000
          ? "interstellar"
          : distanceFromSunAu >= 1_000
            ? "oort-cloud"
            : distanceFromSunAu >= 150
              ? "heliosphere"
              : tacticalFocusId !== null &&
                  spacecraftBoundingRadiusM(tacticalFocusId) !== undefined
                ? semanticCameraDistance < semanticPhysicalRadiusAu * 80
                  ? "surface"
                  : "moon-system"
                : semanticKnownSatellite !== undefined
                  ? "moon-system"
                  : semanticFocusDefinition === undefined ||
                      semanticFocusMesh === undefined
                    ? "solar-system"
                    : semanticCameraDistance < semanticPhysicalRadiusAu * 80
                      ? "surface"
                      : semanticFocusDefinition.type === "moon"
                        ? "moon-system"
                        : "planetary-system";
      setData(container, "semanticZoomLevel", semanticZoomLevel);
      if (semanticZoomLevel !== lastSemanticZoomLevel) {
        lastSemanticZoomLevel = semanticZoomLevel;
        onSemanticZoomChange(semanticZoomLevel);
      }
      let visibleLabelCount = 0;
      let visibleOrreryMarkerCount = 0;
      // labelFontPx sizes the label boxes: without it every overlap test passes.
      if (!(labelFontPx > 0)) {
        throw new Error("Body label font size is unavailable");
      }
      const bodyLabelRectangles: LabelRectangle[] = [];
      for (const body of majorBodySnapshot.bodies) {
        const mesh = bodyMeshes.get(body.id);
        const label = bodyLabels.get(body.id);
        if (mesh === undefined || label === undefined) {
          continue;
        }
        const marker = bodyMarkers.get(body.id);
        if (current === undefined) {
          // Before the first physics state every mesh still sits at the
          // origin, so draw nothing and request no surface map until the
          // bodies have their real places.
          mesh.visible = false;
          setHidden(label, true);
          setData(label, "bodyRendered", "false");
          if (marker !== undefined) {
            setHidden(marker, true);
          }
          continue;
        }
        const projected = mesh.position.clone().project(camera);
        const cameraDistance = camera.position.distanceTo(mesh.position);
        const radiusPixels =
          (mesh.scale.x / cameraDistance) *
          (viewportHeight / (2 * Math.tan((camera.fov * Math.PI) / 360))) *
          camera.zoom;
        setData(label, "radiusPixels", radiusPixels.toFixed(3));
        const bodyLayerVisible = isMajorBodyVisible(
          body.type,
          currentVisibility,
        );
        const bodyRendered =
          bodyLayerVisible &&
          (viewModeRef.current === "orrery"
            ? !orreryHiddenBodyIds.has(body.id)
            : isPhysicalBodyResolvable(radiusPixels));
        mesh.visible = bodyRendered;
        setData(label, "bodyRendered", String(bodyRendered));
        const isInCameraFrustum =
          projected.z >= -1 &&
          projected.z <= 1 &&
          Math.abs(projected.x) <= 1 &&
          Math.abs(projected.y) <= 1;
        setData(
          label,
          "screenX",
          (((projected.x + 1) * viewportWidth) / 2).toFixed(3),
        );
        setData(
          label,
          "screenY",
          (((-projected.y + 1) * viewportHeight) / 2).toFixed(3),
        );
        setData(label, "inCameraFrustum", String(isInCameraFrustum));
        const isOverviewPlanet =
          (focusBodyIdRef.current === null ||
            focusBodyIdRef.current === "sun") &&
          (body.type === "planet" || body.type === "dwarf-planet");
        const focusedBodyId = focusBodyIdRef.current;
        const isCameraTarget =
          body.id ===
          (surfaceObserverRef.current?.targetBodyId ??
            cameraTargetBodyIdRef.current);
        const focusedParentId =
          focusedBodyId === null ? undefined : parentBodyId(focusedBodyId);
        const bodyParentId = PARENT_BODY_ID[body.id];
        const semanticLabelVisible =
          isCameraTarget ||
          (semanticZoomLevel === "solar-system"
            ? body.type === "star" || isOverviewPlanet
            : semanticZoomLevel === "planetary-system"
              ? body.id === focusedBodyId ||
                bodyParentId === focusedBodyId ||
                body.id === focusedParentId
              : semanticZoomLevel === "moon-system"
                ? body.id === focusedBodyId ||
                  body.id === focusedParentId ||
                  (focusedParentId !== undefined &&
                    bodyParentId === focusedParentId)
                : body.id === focusedBodyId);
        const projectedLabelX = ((projected.x + 1) * viewportWidth) / 2;
        const projectedLabelY = ((-projected.y + 1) * viewportHeight) / 2;
        const placement = placeBodyLabel({
          name: body.name,
          role: isCameraTarget
            ? "camera-target"
            : isOverviewPlanet
              ? "overview-planet"
              : "other",
          projectedX: projectedLabelX,
          projectedY: projectedLabelY,
          fontPx: labelFontPx,
          viewportWidth,
          viewportHeight,
          guideRectangles: wayfinderLabelRectangles,
          bodyRectangles: bodyLabelRectangles,
        });
        const labelX = placement.x;
        const labelY = placement.y;
        let labelVisible =
          showLabelsRef.current &&
          (bodyLayerVisible || isCameraTarget) &&
          isInCameraFrustum &&
          semanticLabelVisible &&
          (semanticZoomLevel !== "surface" ||
            body.id === focusBodyIdRef.current ||
            isCameraTarget ||
            radiusPixels >= LABEL_MINIMUM_RADIUS_PIXELS);
        if (body.id === "sun") {
          labelVisible = false;
        }
        if (
          placement.overlapsBodyLabel &&
          !isOverviewPlanet &&
          body.id !== focusBodyIdRef.current &&
          !isCameraTarget
        ) {
          labelVisible = false;
        }
        if (
          body.id === focusBodyIdRef.current ||
          isCameraTarget ||
          radiusPixels >= LABEL_MINIMUM_RADIUS_PIXELS / 2
        ) {
          ensureSurfaceAsset(body.id);
        }
        setHidden(label, !labelVisible);
        label.classList.toggle("is-bracket", viewModeRef.current === "orrery");
        showLabelSelection(label, body.id);
        label.classList.toggle("is-camera-target", isCameraTarget);
        const leaderX = projectedLabelX - labelX;
        const leaderY = projectedLabelY - labelY;
        const leaderLength = Math.hypot(leaderX, leaderY);
        label.classList.toggle("has-leader", labelVisible && leaderLength > 8);
        label.style.setProperty("--leader-length", `${String(leaderLength)}px`);
        label.style.setProperty(
          "--leader-angle",
          `${String(Math.atan2(leaderY, leaderX))}rad`,
        );
        if (labelVisible) {
          visibleLabelCount += 1;
          bodyLabelRectangles.push(placement.rectangle);
          setTransform(label, labelX, labelY);
          if (body.id === "earth" || body.id === "moon") {
            setData(
              container,
              body.id === "earth" ? "earthScreenX" : "moonScreenX",
              projectedLabelX.toFixed(3),
            );
            setData(
              container,
              body.id === "earth" ? "earthScreenY" : "moonScreenY",
              projectedLabelY.toFixed(3),
            );
          }
        }
        if (marker !== undefined) {
          const markerVisible =
            viewModeRef.current === "orrery" &&
            mesh.visible &&
            isInCameraFrustum &&
            radiusPixels < 3;
          setHidden(marker, !markerVisible);
          if (markerVisible) {
            visibleOrreryMarkerCount += 1;
            marker.classList.toggle(
              "is-selected",
              body.id === selectedBodyIdRef.current,
            );
            setTransform(marker, projectedLabelX, projectedLabelY);
          }
        }
      }
      if (current !== undefined) {
        const monolithPosition = monolithMesh.position;
        const projected = monolithPosition.clone().project(camera);
        const cameraDistance = Math.max(
          camera.position.distanceTo(monolithPosition),
          1e-15,
        );
        const radiusAu =
          JOVIAN_MONOLITH_BOUNDING_RADIUS_M / ASTRONOMICAL_UNIT_M;
        const radiusPixels =
          (radiusAu / cameraDistance) *
          (viewportHeight / (2 * Math.tan((camera.fov * Math.PI) / 360))) *
          camera.zoom;
        const inCameraFrustum =
          projected.z >= -1 &&
          projected.z <= 1 &&
          Math.abs(projected.x) <= 1 &&
          Math.abs(projected.y) <= 1;
        const layerVisible = currentVisibility.spacecraft;
        const geometryVisible =
          layerVisible && isPhysicalBodyResolvable(radiusPixels);
        monolithMesh.visible = geometryVisible;
        const labelVisible =
          showLabelsRef.current &&
          layerVisible &&
          inCameraFrustum &&
          (focusBodyIdRef.current === JOVIAN_MONOLITH_BODY_ID ||
            selectedBodyIdRef.current === JOVIAN_MONOLITH_BODY_ID ||
            easterEggHintVisible(JOVIAN_MONOLITH_BODY_ID, monolithPosition));
        nameEasterEggLabel(
          monolithLabel,
          JOVIAN_MONOLITH_BODY_ID,
          JOVIAN_MONOLITH_NAME,
        );
        setHidden(monolithLabel, !labelVisible);
        showLabelSelection(monolithLabel, JOVIAN_MONOLITH_BODY_ID);
        const screenX = ((projected.x + 1) * viewportWidth) / 2;
        const screenY = ((-projected.y + 1) * viewportHeight) / 2;
        setData(monolithLabel, "screenX", screenX.toFixed(3));
        setData(monolithLabel, "screenY", screenY.toFixed(3));
        setData(monolithLabel, "radiusPixels", radiusPixels.toFixed(3));
        if (labelVisible) {
          setTransform(monolithLabel, screenX, screenY);
          visibleLabelCount += 1;
        }
        const markerVisible =
          viewModeRef.current === "orrery" &&
          layerVisible &&
          inCameraFrustum &&
          !geometryVisible;
        setHidden(monolithMarker, !markerVisible);
        if (markerVisible) {
          setTransform(monolithMarker, screenX, screenY);
          visibleOrreryMarkerCount += 1;
        }
        setData(
          container,
          "jovianMonolithRadiusPixels",
          radiusPixels.toFixed(3),
        );
        setData(
          container,
          "jovianMonolithGeometryVisible",
          String(geometryVisible),
        );
      } else {
        monolithMesh.visible = false;
        setHidden(monolithLabel, true);
        setHidden(monolithMarker, true);
      }
      if (current === undefined) {
        discoveryOneGroup.visible = false;
        setHidden(discoveryOneLabel, true);
        setHidden(discoveryOneMarker, true);
      } else {
        const discoveryState = discoveryOneState(current);
        const position = scenePosition(discoveryState.positionM);
        const projected = position.clone().project(camera);
        const cameraDistance = Math.max(
          camera.position.distanceTo(position),
          1e-15,
        );
        const radiusAu = DISCOVERY_ONE_BOUNDING_RADIUS_M / ASTRONOMICAL_UNIT_M;
        const radiusPixels =
          (radiusAu / cameraDistance) *
          (viewportHeight / (2 * Math.tan((camera.fov * Math.PI) / 360))) *
          camera.zoom;
        const inCameraFrustum =
          projected.z >= -1 &&
          projected.z <= 1 &&
          Math.abs(projected.x) <= 1 &&
          Math.abs(projected.y) <= 1;
        const layerVisible = currentVisibility.spacecraft;
        const geometryVisible =
          layerVisible && isPhysicalBodyResolvable(radiusPixels);
        if (geometryVisible) {
          ensureSourcedModel(DISCOVERY_ONE_BODY_ID);
        }
        discoveryOneGroup.visible = geometryVisible;
        const labelVisible =
          showLabelsRef.current &&
          layerVisible &&
          inCameraFrustum &&
          (focusBodyIdRef.current === DISCOVERY_ONE_BODY_ID ||
            selectedBodyIdRef.current === DISCOVERY_ONE_BODY_ID ||
            easterEggHintVisible(DISCOVERY_ONE_BODY_ID, position));
        nameEasterEggLabel(
          discoveryOneLabel,
          DISCOVERY_ONE_BODY_ID,
          DISCOVERY_ONE_NAME,
        );
        setHidden(discoveryOneLabel, !labelVisible);
        showLabelSelection(discoveryOneLabel, DISCOVERY_ONE_BODY_ID);
        const screenX = ((projected.x + 1) * viewportWidth) / 2;
        const screenY = ((-projected.y + 1) * viewportHeight) / 2;
        if (labelVisible) {
          setTransform(discoveryOneLabel, screenX, screenY);
          visibleLabelCount += 1;
        }
        const markerVisible =
          viewModeRef.current === "orrery" &&
          layerVisible &&
          inCameraFrustum &&
          !(geometryVisible && loadedModelBodyIds.has(DISCOVERY_ONE_BODY_ID));
        setHidden(discoveryOneMarker, !markerVisible);
        if (markerVisible) {
          setTransform(discoveryOneMarker, screenX, screenY);
          visibleOrreryMarkerCount += 1;
        }
        setData(container, "discoveryOneRadiusPixels", radiusPixels.toFixed(3));
        setData(
          container,
          "discoveryOneGeometryVisible",
          String(geometryVisible),
        );
      }
      for (const orbiter of FICTIONAL_ORBITERS) {
        const group = fictionalOrbiterGroups.get(orbiter.id);
        const label = fictionalOrbiterLabels.get(orbiter.id);
        const marker = fictionalOrbiterMarkers.get(orbiter.id);
        if (
          group === undefined ||
          label === undefined ||
          marker === undefined
        ) {
          throw new Error(`${orbiter.name} scene objects are unavailable`);
        }
        const orbiterState =
          current === undefined
            ? undefined
            : fictionalOrbiterStateById(current, orbiter.id);
        if (orbiterState === undefined) {
          group.visible = false;
          setHidden(label, true);
          setHidden(marker, true);
          continue;
        }
        if (
          focusBodyIdRef.current === orbiter.id ||
          selectedBodyIdRef.current === orbiter.id
        ) {
          group.lookAt(camera.position);
          setData(
            container,
            orbiter.constructionState === "incomplete"
              ? "deathstar2Attitude"
              : "deathstar1Attitude",
            "camera-relative-fictional-presentation",
          );
        }
        const position = scenePosition(orbiterState.positionM);
        const projected = position.clone().project(camera);
        const cameraDistance = Math.max(
          camera.position.distanceTo(position),
          1e-15,
        );
        const radiusAu = orbiter.diameterM / 2 / ASTRONOMICAL_UNIT_M;
        const radiusPixels =
          (radiusAu / cameraDistance) *
          (viewportHeight / (2 * Math.tan((camera.fov * Math.PI) / 360))) *
          camera.zoom;
        const inCameraFrustum =
          projected.z >= -1 &&
          projected.z <= 1 &&
          Math.abs(projected.x) <= 1 &&
          Math.abs(projected.y) <= 1;
        const layerVisible = currentVisibility.spacecraft;
        const geometryVisible =
          layerVisible && isPhysicalBodyResolvable(radiusPixels);
        if (geometryVisible) {
          ensureSourcedModel(orbiter.id);
        }
        group.visible = geometryVisible;
        const labelVisible =
          showLabelsRef.current &&
          layerVisible &&
          inCameraFrustum &&
          (focusBodyIdRef.current === orbiter.id ||
            selectedBodyIdRef.current === orbiter.id ||
            easterEggHintVisible(orbiter.id, position));
        nameEasterEggLabel(label, orbiter.id, orbiter.name);
        setHidden(label, !labelVisible);
        showLabelSelection(label, orbiter.id);
        const screenX = ((projected.x + 1) * viewportWidth) / 2;
        const screenY = ((-projected.y + 1) * viewportHeight) / 2;
        const datasetPrefix = orbiter.id.replaceAll("-", "");
        setData(label, "screenX", screenX.toFixed(3));
        setData(label, "screenY", screenY.toFixed(3));
        setData(label, "radiusPixels", radiusPixels.toFixed(3));
        if (labelVisible) {
          setTransform(label, screenX, screenY);
          visibleLabelCount += 1;
        }
        const markerVisible =
          viewModeRef.current === "orrery" &&
          layerVisible &&
          inCameraFrustum &&
          !(geometryVisible && loadedModelBodyIds.has(orbiter.id));
        setHidden(marker, !markerVisible);
        if (markerVisible) {
          setTransform(marker, screenX, screenY);
          visibleOrreryMarkerCount += 1;
        }
        setData(
          container,
          `${datasetPrefix}RadiusPixels`,
          radiusPixels.toFixed(3),
        );
        setData(
          container,
          `${datasetPrefix}GeometryVisible`,
          String(geometryVisible),
        );
      }
      for (const object of DEEP_SPACE_NINE_OBJECTS) {
        const group = deepSpaceNineGroups.get(object.id);
        const label = deepSpaceNineLabels.get(object.id);
        const marker = deepSpaceNineMarkers.get(object.id);
        if (
          group === undefined ||
          label === undefined ||
          marker === undefined
        ) {
          throw new Error(`${object.name} scene objects are unavailable`);
        }
        const objectState =
          current === undefined
            ? undefined
            : deepSpaceNineObjectStateById(current, object.id);
        if (objectState === undefined) {
          group.visible = false;
          setHidden(label, true);
          setHidden(marker, true);
          continue;
        }
        const position = scenePosition(objectState.positionM);
        const projected = position.clone().project(camera);
        const cameraDistance = Math.max(
          camera.position.distanceTo(position),
          1e-15,
        );
        const radiusAu = object.maximumDimensionM / 2 / ASTRONOMICAL_UNIT_M;
        const radiusPixels =
          (radiusAu / cameraDistance) *
          (viewportHeight / (2 * Math.tan((camera.fov * Math.PI) / 360))) *
          camera.zoom;
        const inCameraFrustum =
          projected.z >= -1 &&
          projected.z <= 1 &&
          Math.abs(projected.x) <= 1 &&
          Math.abs(projected.y) <= 1;
        const layerVisible = currentVisibility.spacecraft;
        const geometryVisible =
          layerVisible && isPhysicalBodyResolvable(radiusPixels);
        if (geometryVisible) {
          ensureSourcedModel(object.id);
        }
        group.visible = geometryVisible;
        const labelVisible =
          showLabelsRef.current &&
          layerVisible &&
          inCameraFrustum &&
          (focusBodyIdRef.current === object.id ||
            selectedBodyIdRef.current === object.id ||
            easterEggHintVisible(object.id, position));
        nameEasterEggLabel(label, object.id, object.name);
        setHidden(label, !labelVisible);
        showLabelSelection(label, object.id);
        const screenX = ((projected.x + 1) * viewportWidth) / 2;
        const screenY = ((-projected.y + 1) * viewportHeight) / 2;
        if (labelVisible) {
          setTransform(label, screenX, screenY);
          visibleLabelCount += 1;
        }
        const markerVisible =
          viewModeRef.current === "orrery" &&
          layerVisible &&
          inCameraFrustum &&
          !(geometryVisible && loadedModelBodyIds.has(object.id));
        setHidden(marker, !markerVisible);
        if (markerVisible) {
          setTransform(marker, screenX, screenY);
          visibleOrreryMarkerCount += 1;
        }
        const datasetPrefix = object.id.replaceAll("-", "");
        setData(
          container,
          `${datasetPrefix}RadiusPixels`,
          radiusPixels.toFixed(3),
        );
        setData(
          container,
          `${datasetPrefix}GeometryVisible`,
          String(geometryVisible),
        );
      }
      const issState =
        current === undefined ? undefined : bodyStateById(current, ISS_BODY_ID);
      if (issState !== undefined && current !== undefined) {
        const issPosition = scenePosition(issState.positionM);
        const projected = issPosition.clone().project(camera);
        const cameraDistance = Math.max(
          camera.position.distanceTo(issPosition),
          1e-15,
        );
        const issRadiusAu = ISS_BOUNDING_RADIUS_M / ASTRONOMICAL_UNIT_M;
        const radiusPixels =
          (issRadiusAu / cameraDistance) *
          (viewportHeight / (2 * Math.tan((camera.fov * Math.PI) / 360))) *
          camera.zoom;
        const inCameraFrustum =
          projected.z >= -1 &&
          projected.z <= 1 &&
          Math.abs(projected.x) <= 1 &&
          Math.abs(projected.y) <= 1;
        const ephemerisValid = isIssEphemerisWithinValidity(
          current.timeSeconds,
        );
        const layerVisible = currentVisibility.spacecraft && ephemerisValid;
        const geometryVisible =
          layerVisible && isPhysicalBodyResolvable(radiusPixels);
        if (geometryVisible) {
          ensureSourcedModel(ISS_BODY_ID);
        }
        issGroup.visible = geometryVisible;
        setHidden(
          issLabel,
          !(
            showLabelsRef.current &&
            layerVisible &&
            inCameraFrustum &&
            focusBodyIdRef.current === ISS_BODY_ID
          ),
        );
        const markerVisible =
          viewModeRef.current === "orrery" &&
          layerVisible &&
          inCameraFrustum &&
          (radiusPixels < 3 || !loadedModelBodyIds.has(ISS_BODY_ID));
        setHidden(issMarker, !markerVisible);
        issMarker.classList.toggle(
          "is-selected",
          selectedBodyIdRef.current === ISS_BODY_ID,
        );
        showLabelSelection(issLabel, ISS_BODY_ID);
        const screenX = ((projected.x + 1) * viewportWidth) / 2;
        const screenY = ((-projected.y + 1) * viewportHeight) / 2;
        if (!issLabel.hidden) {
          setTransform(issLabel, screenX, screenY);
          visibleLabelCount += 1;
        }
        if (markerVisible) {
          setTransform(issMarker, screenX, screenY);
          visibleOrreryMarkerCount += 1;
        }
        setData(container, "issRadiusPixels", radiusPixels.toFixed(3));
        setData(container, "issGeometryVisible", String(geometryVisible));
        setData(container, "issMarkerVisible", String(markerVisible));
        setData(
          container,
          "issMaximumDimensionM",
          String(issSnapshot.physicalDimensions.overallEndToEndM),
        );
        setData(container, "issModelScale", "physical");
      } else {
        issGroup.visible = false;
        setHidden(issLabel, true);
        setHidden(issMarker, true);
        setData(container, "issGeometryVisible", "false");
        setData(container, "issMarkerVisible", "false");
      }
      for (const probe of voyagerSnapshot.probes) {
        const probeState =
          current === undefined ? undefined : bodyStateById(current, probe.id);
        const group = voyagerGroups.get(probe.id);
        const label = voyagerLabels.get(probe.id);
        const marker = voyagerMarkers.get(probe.id);
        if (
          group === undefined ||
          label === undefined ||
          marker === undefined
        ) {
          throw new Error(`Voyager scene objects ${probe.id} are unavailable`);
        }
        if (current === undefined) {
          group.visible = false;
          setHidden(label, true);
          setHidden(marker, true);
          continue;
        }
        if (probeState === undefined) {
          throw new Error(
            `Integrated state is missing ${probe.id}; received ${String(
              current.bodies.length,
            )} bodies ending with ${current.bodies
              .slice(-4)
              .map((body) => body.id)
              .join(",")}`,
          );
        }
        const position = scenePosition(probeState.positionM);
        const projected = position.clone().project(camera);
        const cameraDistance = Math.max(
          camera.position.distanceTo(position),
          1e-15,
        );
        const radiusAu = probe.maximumDimensionM / 2 / ASTRONOMICAL_UNIT_M;
        const radiusPixels =
          (radiusAu / cameraDistance) *
          (viewportHeight / (2 * Math.tan((camera.fov * Math.PI) / 360))) *
          camera.zoom;
        const inCameraFrustum =
          projected.z >= -1 &&
          projected.z <= 1 &&
          Math.abs(projected.x) <= 1 &&
          Math.abs(projected.y) <= 1;
        const layerVisible = currentVisibility.spacecraft;
        const geometryVisible =
          layerVisible && isPhysicalBodyResolvable(radiusPixels);
        if (geometryVisible) {
          ensureSourcedModel(probe.id);
        }
        group.visible = geometryVisible;
        const labelVisible =
          showLabelsRef.current &&
          layerVisible &&
          inCameraFrustum &&
          surfaceObserverRef.current === null &&
          (spacecraftLabelBodyIdsRef.current === undefined ||
            spacecraftLabelBodyIdsRef.current.includes(probe.id));
        setHidden(label, !labelVisible);
        showLabelSelection(label, probe.id);
        const markerVisible =
          viewModeRef.current === "orrery" && layerVisible && inCameraFrustum;
        setHidden(marker, !markerVisible);
        const screenX = ((projected.x + 1) * viewportWidth) / 2;
        const screenY = ((-projected.y + 1) * viewportHeight) / 2;
        if (labelVisible) {
          setTransform(label, screenX, screenY);
          visibleLabelCount += 1;
        }
        if (markerVisible) {
          setTransform(marker, screenX, screenY);
          visibleOrreryMarkerCount += 1;
        }
        const datasetPrefix =
          probe.id === "voyager-1" ? "voyager1" : "voyager2";
        setData(
          container,
          `${datasetPrefix}DistanceAu`,
          (Math.hypot(...probeState.positionM) / ASTRONOMICAL_UNIT_M).toFixed(
            6,
          ),
        );
        setData(
          container,
          `${datasetPrefix}RadiusPixels`,
          radiusPixels.toFixed(3),
        );
        setData(
          container,
          `${datasetPrefix}GeometryVisible`,
          String(geometryVisible),
        );
      }
      setData(container, "voyagerCount", String(voyagerSnapshot.probes.length));
      setData(container, "voyagerModelScale", "physical");
      setData(container, "voyagerPhysics", "REBOUND-massless-test-particle");
      for (const spacecraft of operationalSpacecraftSnapshot.spacecraft) {
        const group = sourcedModelGroups.get(spacecraft.id);
        const label = operationalSpacecraftLabels.get(spacecraft.id);
        const marker = operationalSpacecraftMarkers.get(spacecraft.id);
        if (
          group === undefined ||
          label === undefined ||
          marker === undefined
        ) {
          throw new Error(`${spacecraft.name} scene objects are unavailable`);
        }
        const spacecraftState =
          current === undefined
            ? undefined
            : bodyStateById(current, spacecraft.id);
        if (spacecraftState === undefined) {
          group.visible = false;
          setHidden(label, true);
          setHidden(marker, true);
          continue;
        }
        const position = scenePosition(spacecraftState.positionM);
        const projected = position.clone().project(camera);
        const cameraDistance = Math.max(
          camera.position.distanceTo(position),
          1e-15,
        );
        const radiusAu = spacecraft.maximumDimensionM / 2 / ASTRONOMICAL_UNIT_M;
        const radiusPixels =
          (radiusAu / cameraDistance) *
          (viewportHeight / (2 * Math.tan((camera.fov * Math.PI) / 360))) *
          camera.zoom;
        const inCameraFrustum =
          projected.z >= -1 &&
          projected.z <= 1 &&
          Math.abs(projected.x) <= 1 &&
          Math.abs(projected.y) <= 1;
        const layerVisible = currentVisibility.spacecraft;
        const geometryVisible =
          layerVisible && isPhysicalBodyResolvable(radiusPixels);
        if (geometryVisible) {
          ensureSourcedModel(spacecraft.id);
        }
        group.visible = geometryVisible;
        const labelVisible =
          showLabelsRef.current &&
          layerVisible &&
          inCameraFrustum &&
          surfaceObserverRef.current === null &&
          (geometryVisible ||
            selectedBodyIdRef.current === spacecraft.id ||
            focusBodyIdRef.current === spacecraft.id ||
            (spacecraft.id === ROADSTER_BODY_ID &&
              easterEggHintVisible(ROADSTER_BODY_ID, position))) &&
          (spacecraftLabelBodyIdsRef.current === undefined ||
            spacecraftLabelBodyIdsRef.current.includes(spacecraft.id));
        if (spacecraft.id === ROADSTER_BODY_ID) {
          nameEasterEggLabel(label, ROADSTER_BODY_ID, spacecraft.name);
        }
        setHidden(label, !labelVisible);
        showLabelSelection(label, spacecraft.id);
        const markerVisible =
          viewModeRef.current === "orrery" && layerVisible && inCameraFrustum;
        setHidden(marker, !markerVisible);
        const screenX = ((projected.x + 1) * viewportWidth) / 2;
        const screenY = ((-projected.y + 1) * viewportHeight) / 2;
        if (labelVisible) {
          setTransform(label, screenX, screenY);
          visibleLabelCount += 1;
        }
        if (markerVisible) {
          setTransform(marker, screenX, screenY);
          visibleOrreryMarkerCount += 1;
        }
        setData(
          container,
          `${spacecraft.id}RadiusPixels`,
          radiusPixels.toFixed(3),
        );
        setData(
          container,
          `${spacecraft.id}GeometryVisible`,
          String(geometryVisible),
        );
      }
      let visibleApolloSiteCount = 0;
      const moonMesh = bodyMeshes.get("moon");
      const moonState =
        current === undefined ? undefined : bodyStateById(current, "moon");
      const apolloContextVisible =
        focusBodyIdRef.current === "moon" ||
        (selectedBodyIdRef.current !== null &&
          isApolloLandingSiteId(selectedBodyIdRef.current)) ||
        surfaceObserverRef.current?.bodyId === "moon";
      for (const site of apolloLandingSites) {
        const label = apolloSiteLabels.get(site.id);
        const siteGroup = apolloSiteGroups.get(site.id);
        if (label === undefined || siteGroup === undefined) {
          throw new Error(`${site.mission} scene assets are unavailable`);
        }
        siteGroup.visible =
          current !== undefined &&
          showApolloSitesRef.current &&
          currentVisibility.moons &&
          apolloContextVisible;
        if (
          current === undefined ||
          moonMesh === undefined ||
          moonState === undefined ||
          !showApolloSitesRef.current ||
          !showLabelsRef.current ||
          !currentVisibility.moons ||
          !apolloContextVisible ||
          surfaceObserverRef.current !== null
        ) {
          setHidden(label, true);
          continue;
        }
        const [localX, localY, localZ] = moonFixedSurfaceUnitVector(
          site.latitudeDeg,
          site.longitudeDeg,
        );
        const surfaceNormal = new Vector3(localX, localY, localZ)
          .applyQuaternion(
            bodyOrientationQuaternion("moon", current.timeSeconds),
          )
          .normalize();
        const sitePosition = moonMesh.position
          .clone()
          .add(surfaceNormal.clone().multiplyScalar(moonMesh.scale.x * 1.012));
        const projected = sitePosition.clone().project(camera);
        const inCameraFrustum =
          projected.z >= -1 &&
          projected.z <= 1 &&
          Math.abs(projected.x) <= 1 &&
          Math.abs(projected.y) <= 1;
        const facingCamera =
          surfaceNormal.dot(
            camera.position.clone().sub(sitePosition).normalize(),
          ) > 0;
        const visible = inCameraFrustum && facingCamera;
        setHidden(label, !visible);
        showLabelSelection(label, site.id);
        if (visible) {
          setTransform(
            label,
            ((projected.x + 1) * viewportWidth) / 2,
            ((-projected.y + 1) * viewportHeight) / 2,
          );
          visibleLabelCount += 1;
          visibleApolloSiteCount += 1;
        }
      }
      setData(container, "apolloSiteCount", String(apolloLandingSites.length));
      setData(
        container,
        "apolloSiteLabelsVisible",
        String(visibleApolloSiteCount),
      );
      setData(
        container,
        "apolloSiteCoordinates",
        "LRO-derived-ME-planetocentric",
      );
      setData(
        container,
        "operationalSpacecraftPhysics",
        "NASA-JPL-Horizons-cubic-Hermite",
      );
      setData(container, "visibleBodyLabels", String(visibleLabelCount));
      setData(container, "orreryMarkerCount", String(visibleOrreryMarkerCount));

      const focusedKnownSatelliteId = focusBodyIdRef.current;
      const focusedKnownSatellite =
        focusedKnownSatelliteId === null
          ? undefined
          : knownSatelliteById.get(focusedKnownSatelliteId);
      const focusedKnownSatelliteState =
        current === undefined || focusedKnownSatelliteId === null
          ? undefined
          : bodyStateById(current, focusedKnownSatelliteId);
      if (
        showLabelsRef.current &&
        focusedKnownSatellite?.availability === "available" &&
        focusedKnownSatelliteState !== undefined
      ) {
        const projected = scenePosition(
          focusedKnownSatelliteState.positionM,
        ).project(camera);
        const visible =
          projected.z >= -1 &&
          projected.z <= 1 &&
          Math.abs(projected.x) <= 1 &&
          Math.abs(projected.y) <= 1;
        setHidden(focusedKnownMoonLabel, !visible);
        if (visible) {
          focusedKnownMoonLabel.textContent = focusedKnownSatellite.name;
          setData(focusedKnownMoonLabel, "bodyId", focusedKnownSatellite.id);
          focusedKnownMoonLabel.title = LABEL_TITLE;
          showLabelSelection(focusedKnownMoonLabel, focusedKnownSatellite.id);
          setTransform(
            focusedKnownMoonLabel,
            ((projected.x + 1) * viewportWidth) / 2,
            ((-projected.y + 1) * viewportHeight) / 2,
          );
          visibleLabelCount += 1;
        }
      } else {
        setHidden(focusedKnownMoonLabel, true);
        focusedKnownMoonLabel.classList.remove("is-selected");
        focusedKnownMoonLabel.classList.remove("is-focused");
      }
      setData(container, "visibleBodyLabels", String(visibleLabelCount));

      if (earthPosition !== undefined && moonPosition !== undefined) {
        const projectedEarth = earthPosition.clone().project(camera);
        const projectedMoon = moonPosition.clone().project(camera);
        const separationPixels = Math.hypot(
          ((projectedMoon.x - projectedEarth.x) * viewportWidth) / 2,
          ((projectedMoon.y - projectedEarth.y) * viewportHeight) / 2,
        );
        setData(
          container,
          "earthMoonSeparationPixels",
          separationPixels.toFixed(2),
        );
      }
      if (solarCoronaMaterial !== undefined) {
        const profileOpacity =
          VISUAL_QUALITY_PROFILES[visualQualityRef.current].coronaOpacity;
        const obscuration =
          latestSurfaceObservation?.solarEclipse?.obscurationFraction ?? 0;
        const eclipseBoost = Math.max(
          0,
          Math.min(1, (obscuration - 0.985) / 0.014),
        );
        setRequiredNumberUniform(
          solarCoronaMaterial,
          "opacity",
          profileOpacity + (0.32 - profileOpacity) * eclipseBoost,
        );
        if (solarCoronaMesh === undefined) {
          throw new Error("The solar corona mesh is unavailable");
        }
        solarCoronaMesh.updateWorldMatrix(true, false);
        requiredVectorUniform(
          solarCoronaMaterial,
          "cameraPositionLocal",
        ).value.copy(solarCoronaMesh.worldToLocal(camera.position.clone()));
        setData(container, "solarCoronaEclipseBoost", eclipseBoost.toFixed(4));
      }
      if (eclipseShadowGroup.visible) {
        const projectedFootprint = eclipseShadowGroup.position
          .clone()
          .project(camera);
        const footprintOnScreen =
          projectedFootprint.z >= -1 &&
          projectedFootprint.z <= 1 &&
          Math.abs(projectedFootprint.x) <= 1 &&
          Math.abs(projectedFootprint.y) <= 1;
        setHidden(eclipseShadowLocator, !footprintOnScreen);
        if (footprintOnScreen) {
          const screenX = ((projectedFootprint.x + 1) * viewportWidth) / 2;
          const screenY = ((-projectedFootprint.y + 1) * viewportHeight) / 2;
          setTransform(eclipseShadowLocator, screenX, screenY);
          setData(container, "eclipseShadowScreenX", screenX.toFixed(2));
          setData(container, "eclipseShadowScreenY", screenY.toFixed(2));
        }
      }
      // The light this frame really gives the focused body and its parent, as
      // a share of the Sun's inverse-square value there: three lights every
      // surface with every visible light on a camera layer.
      const reportFocusId = focusBodyIdRef.current;
      const reportFocusState =
        current === undefined || reportFocusId === null
          ? undefined
          : bodyStateById(current, reportFocusId);
      const reportSunState =
        current === undefined ? undefined : bodyStateById(current, "sun");
      if (
        current !== undefined &&
        reportFocusId !== null &&
        reportFocusId !== "sun" &&
        reportFocusState !== undefined &&
        reportSunState !== undefined
      ) {
        const reportSunPosition = scenePosition(reportSunState.positionM);
        const reportFocusPosition = scenePosition(reportFocusState.positionM);
        container.dataset["cameraPhaseAngleDeg"] = (
          (camera.position
            .clone()
            .sub(reportFocusPosition)
            .angleTo(reportSunPosition.clone().sub(reportFocusPosition)) *
            180) /
          Math.PI
        ).toFixed(1);
        const sunlightRatioAt = (position: Vector3): string => {
          let irradiance = 0;
          for (const light of [sunlight, localModelSunlight]) {
            if (!light.visible || !light.layers.test(camera.layers)) continue;
            // three clamps the point light falloff below 0.1 AU.
            irradiance +=
              light === sunlight
                ? light.intensity /
                  Math.max(light.position.distanceToSquared(position), 0.01)
                : light.intensity;
          }
          return (
            (irradiance * position.distanceToSquared(reportSunPosition)) /
            SOLAR_IRRADIANCE_AT_1_AU
          ).toFixed(3);
        };
        container.dataset["focusSunlightRatio"] =
          sunlightRatioAt(reportFocusPosition);
        const reportParentId = parentBodyId(reportFocusId);
        const reportParentState =
          reportParentId === undefined
            ? undefined
            : bodyStateById(current, reportParentId);
        if (reportParentState === undefined) {
          delete container.dataset["parentSunlightRatio"];
        } else {
          container.dataset["parentSunlightRatio"] = sunlightRatioAt(
            scenePosition(reportParentState.positionM),
          );
        }
      } else {
        delete container.dataset["cameraPhaseAngleDeg"];
        delete container.dataset["focusSunlightRatio"];
        delete container.dataset["parentSunlightRatio"];
      }
      renderer.render(scene, camera);
      setData(
        container,
        "shaderProgramCount",
        String(renderer.info.programs?.length ?? 0),
      );
      setData(
        container,
        "renderFrameIntervalMs",
        frameIntervalEmaMs.toFixed(2),
      );
      setData(
        container,
        "renderFps",
        (1_000 / Math.max(frameIntervalEmaMs, 0.001)).toFixed(1),
      );
      setData(
        container,
        "renderCpuSubmissionMs",
        (performance.now() - frameRenderStartedAtMs).toFixed(2),
      );
      setData(container, "renderCalls", String(renderer.info.render.calls));
      setData(
        container,
        "renderTriangles",
        String(renderer.info.render.triangles),
      );
      if (gpuLayer !== undefined) {
        const requestedFocusBodyId = focusBodyIdRef.current;
        const focusState =
          current === undefined || requestedFocusBodyId === null
            ? undefined
            : bodyStateById(current, requestedFocusBodyId);
        if (focusState === undefined) {
          gpuLayer.setFocusRegion(null, 0);
          delete gpuCanvas.dataset["focusRegionRadiusAu"];
        } else {
          const focusDefinition = majorBodySnapshot.bodies.find(
            (body) => body.id === requestedFocusBodyId,
          );
          const focusRegionRadiusAu =
            focusDefinition?.type === "moon" ||
            (requestedFocusBodyId !== null &&
              knownSatelliteById.has(requestedFocusBodyId))
              ? 0.01
              : 0.05;
          const focusPosition = scenePosition(focusState.positionM);
          gpuLayer.setFocusRegion(
            [focusPosition.x, focusPosition.y, focusPosition.z],
            focusRegionRadiusAu,
          );
          setData(
            gpuCanvas,
            "focusRegionRadiusAu",
            focusRegionRadiusAu.toFixed(3),
          );
        }
        if (smallBodiesVisible || lastSmallBodiesVisible !== false) {
          gpuLayer.render(camera);
        }
        lastSmallBodiesVisible = smallBodiesVisible;
      }
      animationFrame = requestAnimationFrame(render);
    };
    // React Strict Mode mounts effects once for verification and immediately
    // tears them down. Starting from a cancellable macrotask guarantees that
    // disposable mount cannot allocate a second 1.56-million-body GPU layer.
    startupTimer = window.setTimeout(() => {
      if (active) {
        render();
      }
    }, 0);

    return () => {
      active = false;
      cancelStarTooltip();
      modelLoadingActive = false;
      snapshotAbortController.abort();
      window.clearTimeout(startupTimer);
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      navigationMapObserver.disconnect();
      onNavigationMapBottomChange(null);
      controls.dispose();
      dracoLoader.dispose();
      controls.removeEventListener("start", handleControlStart);
      container.removeEventListener("pointerdown", handleCanvasPressDown, true);
      container.removeEventListener("pointermove", handleCanvasPressMove, true);
      container.removeEventListener("pointerup", handleCanvasPressEnd, true);
      container.removeEventListener(
        "pointercancel",
        handleCanvasPressEnd,
        true,
      );
      renderer.domElement.removeEventListener(
        "pointerdown",
        handleSurfacePointerDown,
      );
      renderer.domElement.removeEventListener(
        "pointermove",
        handleSurfacePointerMove,
      );
      renderer.domElement.removeEventListener(
        "pointerup",
        handleSurfacePointerUp,
      );
      renderer.domElement.removeEventListener(
        "pointercancel",
        handlePointerCancel,
      );
      renderer.domElement.removeEventListener(
        "pointerleave",
        handlePointerLeave,
      );
      renderer.domElement.removeEventListener("dblclick", handleDoubleClick);
      navigationMapCanvas.removeEventListener(
        "pointermove",
        handleNavigationPointerMove,
      );
      navigationMapCanvas.removeEventListener(
        "pointerleave",
        hideNavigationTooltip,
      );
      navigationMapCanvas.removeEventListener("click", handleNavigationClick);
      navigationDestinationSelect.removeEventListener(
        "change",
        handleNavigationDestinationChange,
      );
      phoneLayoutQuery.removeEventListener("change", syncNavigationMapOpen);
      navigationTravelButton.removeEventListener(
        "click",
        travelToNavigationDestination,
      );
      gpuLayer?.dispose();
      gravityWellLayer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      for (const geometry of geometries) {
        geometry.dispose();
      }
      for (const material of materials) {
        material.dispose();
      }
      for (const texture of textures) {
        texture.dispose();
      }
      container.removeChild(rangeLegend);
      container.removeChild(sourcedModelStatus);
      container.removeChild(cameraJourney);
      container.removeChild(cameraJourneyAnnouncer);
      container.removeChild(bodyHoverTooltip);
      for (const { element } of zodiacLabels) {
        container.removeChild(element);
      }
      container.removeChild(zodiacLegend);
      for (const label of deepSpaceLabels) {
        container.removeChild(label);
      }
      container.removeChild(deepSunLabel);
      container.removeChild(navigationMap);
      container.removeChild(focusBracket);
      container.removeChild(sunGuideLabel);
      for (const visual of planetWayfinderVisuals) {
        container.removeChild(visual.label);
      }
      container.removeChild(sunGuideOverlay);
      container.removeChild(tacticalOverlay);
      container.removeChild(markerLayer);
      container.removeChild(labelLayer);
      container.removeChild(gpuCanvas);
      container.removeChild(renderer.domElement);
    };
  }, [
    onFocusBody,
    onGpuError,
    onGpuStatus,
    onNavigationMapBottomChange,
    onOrientationChange,
    onPickBody,
    onSelectBody,
    onSemanticZoomChange,
  ]);

  return (
    <div
      ref={containerRef}
      className="scene"
      role="img"
      aria-label="Physics-driven Solar System with NASA surfaces and GPU-propagated NASA/JPL asteroid and comet catalogue"
      data-view-mode={viewMode}
      data-planets-visible={String(objectVisibility.planets)}
      data-moons-visible={String(objectVisibility.moons)}
      data-spacecraft-visible={String(objectVisibility.spacecraft)}
      data-orbit-view-requested={String(orbitViewEnabled)}
      data-apollo-sites-visible={String(showApolloSites)}
      data-wayfinder-mode={wayfinderMode}
      data-star-field-count={hipparcosStarSnapshot.stars.length}
      data-star-catalogue="ESA Hipparcos I/239"
      data-star-reference-frame="ICRS"
      data-star-tooltip-delay-ms={STAR_TOOLTIP_DELAY_MS}
      data-surface-lighting="inverse-square-solar-point-light-auto-exposure"
      data-atmosphere-rendering="optical-depth-ray-marched-single-scattering"
      data-heliopause-voyager-1-au={VOYAGER_1_HELIOPAUSE_AU}
      data-heliopause-voyager-2-au={VOYAGER_2_HELIOPAUSE_AU}
      data-oort-inner-min-au={OORT_CLOUD_INNER_MIN_AU}
      data-oort-inner-max-au={OORT_CLOUD_INNER_MAX_AU}
      data-oort-outer-min-au={OORT_CLOUD_OUTER_MIN_AU}
      data-oort-outer-max-au={OORT_CLOUD_OUTER_MAX_AU}
      data-alpha-distance-au={ALPHA_CENTAURI_DISTANCE_AU}
      data-solar-system-share-percent={(
        (PREVIOUS_SOLAR_SYSTEM_VIEW_AU / ALPHA_CENTAURI_DISTANCE_AU) *
        100
      ).toFixed(6)}
      data-oort-cloud-share-percent={(
        (OORT_CLOUD_OUTER_MAX_AU / ALPHA_CENTAURI_DISTANCE_AU) *
        100
      ).toFixed(6)}
    >
      {gravityWellMode === "off" ? null : (
        <span className="gravity-field-legend" aria-hidden="true">
          <strong>Newtonian potential</strong>
          <span data-gravity-potential-range>Calculating J/kg range...</span>
          <small>
            Combined field · logarithmic display ·{" "}
            {gravityWellScale === "local"
              ? "locally normalised detail"
              : "fixed absolute comparison"}
          </small>
        </span>
      )}
    </div>
  );
}
