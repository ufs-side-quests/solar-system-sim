import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, RefObject } from "react";
import { useCombobox } from "downshift";

import { useInterfaceAudio } from "./audio/use-interface-audio";
import {
  discoveryMessage,
  discoveryProgress,
  type EasterEggId,
  hiddenSurpriseRows,
  HIDDEN_SURPRISES_GROUP,
  hiddenSurprisesHeading,
  hintsAtUnfoundEasterEgg,
  isEasterEggId,
  loadFoundEasterEggs,
  saveFoundEasterEggs,
} from "./tour/easter-eggs";
import { createPhysicsClient } from "./physics/client";
import type { BodyState, SimulationState } from "./physics/contracts";
import { withKnownSatellites } from "./physics/known-satellite-ephemeris";
import {
  ISS_BODY_ID,
  ISS_EPOCH_SIMULATION_SECONDS,
  ISS_PARENT_BODY_ID,
  isIssEphemerisWithinValidity,
  issSnapshot,
} from "./physics/iss-ephemeris";
import {
  additionalKnownSatellites,
  knownSatelliteById,
} from "./physics/known-satellites";
import {
  majorBodySnapshot,
  majorBodySystem,
  type MajorBodyDefinition,
} from "./physics/solar-system";
import {
  formatSimulationDateUtc,
  simulationDateUtc,
  VALIDATED_WINDOW_SECONDS,
} from "./physics/simulation-date";
import {
  isVoyagerBodyId,
  voyagerById,
  voyagerSnapshot,
} from "./physics/voyager-ephemeris";
import {
  isOperationalSpacecraftBodyId,
  isOperationalSpacecraftWithinValidity,
  operationalSpacecraftRecommendedTimeSeconds,
  operationalSpacecraftSnapshot,
} from "./physics/operational-spacecraft";
import { PARENT_BODY_ID } from "./scene/body-facts";
import { bodyDisplayName } from "./scene/body-display-name";
import {
  BODY_COMPOSITION_BY_ID,
  EARTH_MEAN_RADIUS_M,
  formatMassKg,
  formatLiveOrbitalPeriod,
  formatSourcedOrbitalPeriod,
  formatSpeedWithJetComparison,
  formatSpinPeriod,
  formatBodySize,
  formatDistanceAu,
  formatExactDistanceKm,
  formatGapInParentWidths,
  formatPlainDistance,
  formatSunDistance,
  formatSunlightTravelTime,
  PLAIN_SURFACE_BY_BODY_ID,
  SIDEREAL_ORBITAL_PERIOD_BY_ID,
} from "./scene/body-physical-facts";
import { osculatingOrbitalPeriodSeconds } from "./scene/osculating-orbit";
import type {
  CameraNavigationAction,
  CameraNavigationCommand,
  CameraOrientationPreset,
} from "./scene/camera-view";
import {
  circularOrbitSolution,
  defaultOrbitConfiguration,
  hillSphereRadiusM,
  orbitConfigurationForPreset,
  poweredHoverAccelerationMps2,
  type CameraOrbitConfiguration,
  type OrbitBodyParameters,
  type OrbitPreset,
} from "./scene/camera-orbit";
import type {
  GravityWellMode,
  GravityWellScale,
} from "./scene/gravity-potential";
import { type SimulationFrame } from "./scene/interpolation";
import { interpolateDisplayedSimulationFrame } from "./scene/display-interpolation";
import type { ExposureMode } from "./scene/physical-lighting";
import {
  JOVIAN_MONOLITH_BODY_ID,
  JOVIAN_MONOLITH_DIMENSIONS_M,
  JOVIAN_MONOLITH_NAME,
  JOVIAN_MONOLITH_PRIMARY_BODY_ID,
  jovianMonolithState,
} from "./scene/jovian-monolith";
import {
  FICTIONAL_ORBITERS,
  fictionalOrbiterById,
  fictionalOrbiterStateById,
  isFictionalOrbiterId,
} from "./scene/fictional-orbiters";
import {
  APOLLO_COORDINATES_SOURCE_URL,
  apolloLandingSiteById,
  isApolloLandingSiteId,
} from "./scene/lunar-landing-sites";
import {
  bodyOrientationAngles,
  planetSpinNote,
  siderealRotationRateRadPerSecond,
  siderealRotationPeriodHours,
} from "./scene/orientation";
import {
  DISCOVERY_ONE_BODY_ID,
  DISCOVERY_ONE_LENGTH_M,
  DISCOVERY_ONE_MAXIMUM_DIAMETER_M,
  DISCOVERY_ONE_NAME,
  DISCOVERY_ONE_ORBITAL_ALTITUDE_M,
  DISCOVERY_ONE_PARENT_BODY_ID,
  discoveryOneState,
} from "./scene/discovery-one";
import {
  DEEP_SPACE_NINE_BODY_ID,
  DEEP_SPACE_NINE_DIAMETER_M,
  DEEP_SPACE_NINE_NAME,
  DEEP_SPACE_NINE_OBJECTS,
  DEEP_SPACE_NINE_ORBITAL_ALTITUDE_M,
  DEEP_SPACE_NINE_SOURCE_URL,
  deepSpaceNineObjectStateById,
  deepSpaceNineParentBodyId,
  isDeepSpaceNineObjectId,
  USS_DEFIANT_LENGTH_M,
  USS_DEFIANT_NAME,
  USS_DEFIANT_PATROL_PERIOD_SECONDS,
  USS_DEFIANT_PATROL_RADIUS_M,
  USS_DEFIANT_SOURCE_URL,
} from "./scene/deep-space-nine";
import { fictionalModelAssetByBodyId } from "./scene/fictional-model-assets";
import type { SmallBodyGpuStatus } from "./scene/SmallBodyGpuLayer";
import { SchematicSystemMap } from "./scene/SchematicSystemMap";
import { isInSizeLineup, SizeLineup } from "./scene/SizeLineup";
import {
  surfaceObserverBodies,
  surfaceObserverFrame,
  type SurfaceObserverConfiguration,
} from "./scene/surface-observer";
import {
  nasaMaterialPresentationByBodyId,
  nasaTextureByBodyId,
} from "./scene/visual-assets";
import {
  SUN_SURFACE_TECHNICAL,
  SUN_SURFACE_WORDING,
} from "./scene/solar-photosphere";
import {
  VISUAL_QUALITY_PROFILES,
  type VisualQuality,
} from "./scene/visual-quality";
import {
  DEFAULT_OBJECT_VISIBILITY,
  type ObjectVisibility,
} from "./scene/visibility";
import type {
  ReferenceFrame,
  SemanticZoomLevel,
  ViewMode,
} from "./scene/view-mode";
import type { WayfinderMode } from "./scene/wayfinder";
import {
  ECLIPSE_PATH_SOURCE_URL,
  ECLIPSE_SOURCE_URL,
  ECLIPSE_STORY_ENDING,
  ECLIPSE_STORY_STEP_DURATION_MS,
  ECLIPSE_STORY_STEPS,
  ECLIPSE_STORY_TRANSITION_DURATION_MS,
  type EclipseStoryStep,
} from "./eclipse/eclipse-story";
import {
  SCALE_TOUR_ENDING,
  SCALE_TOUR_STEP_DURATION_MS,
  SCALE_TOUR_STEPS,
  SCALE_TOUR_TRANSITION_DURATION_MS,
  type ScaleTourStep,
} from "./tour/scale-tour";
import {
  CINEMATIC_SHOTS,
  PLANETS_RACING_SHOT,
  type CinematicShot,
} from "./tour/cinematic-shots";

const SolarSystemScene = lazy(async () => {
  const module = await import("./scene/SolarSystemScene");
  return { default: module.SolarSystemScene };
});

const DAY_SECONDS = 86_400;
const TARGET_SOLVER_FRAMES_PER_SECOND = 30;
const MAXIMUM_SOLVER_KEYFRAME_SECONDS = DAY_SECONDS;
const MINIMUM_TRANSITION_MS = 16;
const PLAYBACK_BATCH_SIZE = TARGET_SOLVER_FRAMES_PER_SECOND;
const DEFAULT_CAMERA_ZOOM = 1;
const MANUAL_CAMERA_TRANSITION_DURATION_MS = 12_000;
const ORIENTATION_CAMERA_TRANSITION_DURATION_MS = 4_000;
type DisplayPanelTab = "view" | "camera" | "guides" | "sound";
type GuidedTourKind = "scale" | "eclipse";
// The settings a tour step overrides, restored when the tour ends.
type DisplaySettingsBeforeTour = Readonly<{
  viewMode: ViewMode;
  bodyVisibilityPercent: number;
  showLabels: boolean;
  showOrbitGuides: boolean;
  showTacticalOverlay: boolean;
  showEclipticPlane: boolean;
  showPlanetTrails: boolean;
  showMoonTrail: boolean;
  showMinorBodyTrails: boolean;
  gravityWellMode: GravityWellMode;
  referenceFrame: ReferenceFrame;
  surfaceObserverBodyId: string;
  surfaceObserverTargetBodyId: string;
  surfaceObserverLatitudeDeg: number;
  surfaceObserverLongitudeDeg: number;
  direction: -1 | 1;
  timeRateIndex: number;
}>;
type GuidedTourStep = ScaleTourStep | EclipseStoryStep;

const CAMERA_ZOOM_PRESETS = [
  { id: "system", label: "System context (0.063x)", zoom: 0.0625 },
  { id: "wide", label: "Wide (0.25x)", zoom: 0.25 },
  { id: "fit", label: "Fit object (1x)", zoom: 1 },
  { id: "close", label: "Close (4x)", zoom: 4 },
  { id: "detail", label: "Surface detail (16x)", zoom: 16 },
  { id: "inspection", label: "Inspection (64x)", zoom: 64 },
] as const;
const CAMERA_ORIENTATION_OPTIONS = [
  {
    id: "perspective",
    label: "3D view",
    description: "A three-quarter view that shows depth.",
  },
  {
    id: "overhead",
    label: "Above",
    description: "Look down from north of the orbital plane.",
  },
  {
    id: "edge-on",
    label: "Side",
    description: "Look along the orbital plane.",
  },
  {
    id: "sun-facing",
    label: "Sunlit side",
    description: "Look toward the side that faces the Sun.",
  },
  {
    id: "terminator",
    label: "Day and night",
    description: "See the physical boundary between sunlight and darkness.",
  },
  {
    id: "parent-facing",
    label: "Face parent",
    description: "Look from the selected body toward its parent.",
  },
  {
    id: "velocity",
    label: "Along path",
    description: "Look in the live direction of travel.",
  },
  {
    id: "orbital-plane",
    label: "Orbit plane",
    description: "Align the view with this body's live orbit.",
  },
] as const satisfies readonly Readonly<{
  id: Exclude<CameraOrientationPreset, "custom">;
  label: string;
  description: string;
}>[];
const SEMANTIC_ZOOM_LABELS: Readonly<Record<SemanticZoomLevel, string>> = {
  interstellar: "Interstellar",
  "oort-cloud": "Oort Cloud",
  heliosphere: "Heliosphere",
  "solar-system": "Solar System",
  "planetary-system": "Planet system",
  "moon-system": "Moon system",
  surface: "Surface detail",
};
// How many times wider the real Sun is than a body, from the sourced radii.
function sunWidthRatio(bodyId: string): number {
  const sun = majorBodySnapshot.bodies.find((body) => body.id === "sun");
  const body = majorBodySnapshot.bodies.find(
    (candidate) => candidate.id === bodyId,
  );
  if (sun === undefined || body === undefined) {
    throw new Error(`Sourced radius is missing for the Sun or ${bodyId}`);
  }
  return Math.round(sun.meanRadiusM / body.meanRadiusM);
}

const VIEW_MODE_OPTIONS = [
  {
    mode: "reality",
    label: "Reality",
    description:
      "True physical sizes and positions. Bodies disappear when they are smaller than one screen pixel.",
  },
  {
    mode: "orrery",
    label: "Orrery",
    description: `Physical positions with enlarged bodies and markers so the system remains readable. Sizes are squeezed so small worlds stay visible. The real Sun is about ${String(sunWidthRatio("jupiter"))} times wider than Jupiter and ${String(sunWidthRatio("earth"))} times wider than Earth.`,
  },
  {
    mode: "schematic",
    label: "Map",
    description:
      "A schematic navigation map for finding objects. It is not drawn to physical scale.",
  },
] as const satisfies readonly Readonly<{
  mode: ViewMode;
  label: string;
  description: string;
}>[];
const TIME_RATES = [
  { label: "1 second / second", secondsPerSecond: 1 },
  { label: "1 minute / second", secondsPerSecond: 60 },
  { label: "2 minutes / second", secondsPerSecond: 120 },
  { label: "10 minutes / second", secondsPerSecond: 600 },
  { label: "1 hour / second", secondsPerSecond: 3_600 },
  { label: "1 day / second", secondsPerSecond: DAY_SECONDS },
  { label: "1 week / second", secondsPerSecond: 7 * DAY_SECONDS },
  { label: "30 days / second", secondsPerSecond: 30 * DAY_SECONDS },
  { label: "1 year / second", secondsPerSecond: 365.25 * DAY_SECONDS },
] as const;
const USER_TIME_RATE_INDEXES = [0, 1, 4, 5, 6, 7, 8] as const;
const PLANET_FOCUS_ORDER = [
  "mercury",
  "venus",
  "earth",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
] as const;

const FOCUS_SYSTEM_KEY = "__solar-system__";
const ADDITIONAL_KNOWN_SATELLITE_IDS = new Set(
  additionalKnownSatellites.map((body) => body.id),
);
type FocusOption = Readonly<{
  id: string;
  key: string;
  label: string;
  group: string;
  searchText: string;
  disabled: boolean;
}>;
// The Focus list shows easter eggs only in the hidden surprises group, whose
// heading carries the live count.
const FOCUS_OPTIONS: readonly FocusOption[] = [
  {
    id: "",
    key: FOCUS_SYSTEM_KEY,
    label: "Solar System",
    group: "Overview",
    searchText: "Solar System overview home all planets",
    disabled: false,
  },
  ...majorBodySnapshot.bodies.map((body) => ({
    id: body.id,
    key: body.id,
    label: body.name,
    group:
      body.id === "sun"
        ? "Star"
        : PLANET_FOCUS_ORDER.some((id) => id === body.id)
          ? "Planets"
          : "Major bodies",
    searchText: `${body.name} ${body.id}`,
    disabled: false,
  })),
  ...additionalKnownSatellites.map((body) => {
    const parentName = majorBodySnapshot.bodies.find(
      (candidate) => candidate.id === body.parentId,
    )?.name;
    return {
      id: body.id,
      key: body.id,
      label: `${body.name} (${parentName ?? body.parentId})${
        body.availability === "unavailable" ? " - unavailable at epoch" : ""
      }`,
      group: `${parentName ?? body.parentId} moons`,
      searchText: `${body.name} ${body.id} ${parentName ?? body.parentId} moon satellite`,
      disabled: body.availability === "unavailable",
    };
  }),
  {
    id: ISS_BODY_ID,
    key: ISS_BODY_ID,
    label: "International Space Station (Earth)",
    group: "Spacecraft",
    searchText: "International Space Station ISS Earth spacecraft satellite",
    disabled: false,
  },
  ...voyagerSnapshot.probes.map((probe) => ({
    id: probe.id,
    key: probe.id,
    label: `${probe.name} (interstellar space)`,
    group: "Spacecraft",
    searchText: `${probe.name} ${probe.id} probe interstellar spacecraft`,
    disabled: false,
  })),
  ...operationalSpacecraftSnapshot.spacecraft.map((spacecraft) => ({
    id: spacecraft.id,
    key: spacecraft.id,
    label: spacecraft.name,
    group: isEasterEggId(spacecraft.id) ? HIDDEN_SURPRISES_GROUP : "Spacecraft",
    searchText: `${spacecraft.name} ${spacecraft.id} ${spacecraft.id === "roadster" ? "Tesla Starman Falcon Heavy car" : "telescope"} spacecraft`,
    disabled: false,
  })),
  {
    id: JOVIAN_MONOLITH_BODY_ID,
    key: JOVIAN_MONOLITH_BODY_ID,
    label: JOVIAN_MONOLITH_NAME,
    group: HIDDEN_SURPRISES_GROUP,
    searchText:
      "Jovian Monolith TMA-2 2001 2010 Space Odyssey Jupiter Io L1 fictional",
    disabled: false,
  },
  {
    id: DISCOVERY_ONE_BODY_ID,
    key: DISCOVERY_ONE_BODY_ID,
    label: DISCOVERY_ONE_NAME,
    group: HIDDEN_SURPRISES_GROUP,
    searchText:
      "Discovery One 2001 2010 Space Odyssey Io Jupiter spacecraft fictional",
    disabled: false,
  },
  ...FICTIONAL_ORBITERS.map((orbiter) => ({
    id: orbiter.id,
    key: orbiter.id,
    label: orbiter.name,
    group: HIDDEN_SURPRISES_GROUP,
    searchText: `${orbiter.name} Star Wars ${orbiter.parentBodyId} fictional battle station`,
    disabled: false,
  })),
  ...DEEP_SPACE_NINE_OBJECTS.map((object) => ({
    id: object.id,
    key: object.id,
    label: object.name,
    group: HIDDEN_SURPRISES_GROUP,
    searchText: `${object.name} Star Trek DS9 Defiant Callisto Jupiter fictional station spacecraft`,
    disabled: false,
  })),
];

const NAVIGABLE_FOCUS_OPTIONS = FOCUS_OPTIONS.filter(
  (option) => option.id !== "" && !option.disabled,
);
const EGG_FOCUS_OPTION_BY_ID = new Map(
  FOCUS_OPTIONS.filter((option) => isEasterEggId(option.id)).map((option) => [
    option.id,
    option,
  ]),
);

const FOCUS_OPTION_BY_ID = new Map(
  FOCUS_OPTIONS.map((option) => [option.id, option]),
);

function focusOption(bodyId: string): FocusOption {
  const option = FOCUS_OPTION_BY_ID.get(bodyId);
  if (option === undefined) {
    throw new Error(`Focus option ${bodyId} is unavailable`);
  }
  return option;
}

/** An unfound egg stays out of browsing, search and Next object. */
function isHiddenUntilFound(
  option: FocusOption,
  found: ReadonlySet<EasterEggId>,
): boolean {
  return isEasterEggId(option.id) && !found.has(option.id);
}

/** Found eggs by name, unfound eggs as clue rows that fly to the clue body. */
function hiddenSurpriseFocusOptions(
  found: ReadonlySet<EasterEggId>,
): FocusOption[] {
  const group = hiddenSurprisesHeading(found);
  return hiddenSurpriseRows(found).map((row) => {
    if (row.kind === "clue") {
      return {
        id: row.bodyId,
        key: `clue:${row.eggId}`,
        label: row.label,
        group,
        searchText: "",
        disabled: false,
      };
    }
    const option = EGG_FOCUS_OPTION_BY_ID.get(row.eggId);
    if (option === undefined) {
      throw new Error(`Easter egg ${row.eggId} has no focus option`);
    }
    return option;
  });
}

function orbitParametersForBody(
  state: SimulationState | undefined,
  bodyId: string,
): OrbitBodyParameters | undefined {
  if (state === undefined) {
    return undefined;
  }
  const definition = majorBodySnapshot.bodies.find(
    (candidate) => candidate.id === bodyId,
  );
  const bodyState = state.bodies.find((candidate) => candidate.id === bodyId);
  if (
    definition === undefined ||
    bodyState === undefined ||
    bodyState.gravitationalParameterM3S2 <= 0
  ) {
    return undefined;
  }
  const parentId = PARENT_BODY_ID[bodyId];
  const parentState = state.bodies.find(
    (candidate) => candidate.id === parentId,
  );
  const hillRadiusM =
    parentState === undefined || parentId === undefined
      ? undefined
      : hillSphereRadiusM(
          Math.hypot(
            bodyState.positionM[0] - parentState.positionM[0],
            bodyState.positionM[1] - parentState.positionM[1],
            bodyState.positionM[2] - parentState.positionM[2],
          ),
          bodyState.gravitationalParameterM3S2,
          parentState.gravitationalParameterM3S2,
        );
  return {
    radiusM: definition.meanRadiusM,
    gravitationalParameterM3S2: bodyState.gravitationalParameterM3S2,
    siderealRotationRateRadPerSecond: siderealRotationRateRadPerSecond(bodyId),
    ...(hillRadiusM === undefined ? {} : { hillSphereRadiusM: hillRadiusM }),
  };
}

// The hidden surprises group is built per render from the found eggs.
const FOCUS_GROUPS = Array.from(
  new Set(FOCUS_OPTIONS.map((option) => option.group)),
)
  .filter((label) => label !== HIDDEN_SURPRISES_GROUP)
  .map((label) => ({
    label,
    options: FOCUS_OPTIONS.filter((option) => option.group === label),
  }));
// Every option except the eggs, in the order the list shows them, so the
// highlighted row and Enter pick the row on screen.
const NON_EGG_OPTIONS = FOCUS_GROUPS.flatMap((group) => group.options);
const FOCUS_BROWSE_OPTIONS = NON_EGG_OPTIONS.filter(
  (option) => !ADDITIONAL_KNOWN_SATELLITE_IDS.has(option.id),
);

const FocusSelect = memo(function FocusSelect({
  value,
  foundEasterEggIds,
  onSelect,
}: Readonly<{
  value: string;
  foundEasterEggIds: ReadonlySet<EasterEggId>;
  onSelect(bodyId: string): void;
}>) {
  const selectedOption = focusOption(value);
  const hiddenSurpriseOptions = useMemo(
    () => hiddenSurpriseFocusOptions(foundEasterEggIds),
    [foundEasterEggIds],
  );
  const browseOptions = useMemo(
    () => [...FOCUS_BROWSE_OPTIONS, ...hiddenSurpriseOptions],
    [hiddenSurpriseOptions],
  );
  // Clue rows have no search text, so search lists found eggs only.
  const searchOptions = useMemo(
    () => [...NON_EGG_OPTIONS, ...hiddenSurpriseOptions],
    [hiddenSurpriseOptions],
  );
  const groups = [
    ...FOCUS_GROUPS,
    {
      label: hiddenSurprisesHeading(foundEasterEggIds),
      options: hiddenSurpriseOptions,
    },
  ];
  const [filteredOptions, setFilteredOptions] =
    useState<FocusOption[]>(browseOptions);
  const [catalogueSearchActive, setCatalogueSearchActive] = useState(false);
  const showBrowseOptions = (): void => {
    setCatalogueSearchActive(false);
    setFilteredOptions(browseOptions);
  };
  // Typing an egg's full name and pressing Enter still selects it (a parent's
  // way in), and counts as finding it. Partial search never lists an unfound
  // egg.
  const selectTypedOption = (candidate: string): boolean => {
    const normalizedCandidate = candidate.trim().toLocaleLowerCase();
    const option = FOCUS_OPTIONS.find(
      (focusOption) =>
        focusOption.label.toLocaleLowerCase() === normalizedCandidate &&
        !focusOption.disabled,
    );
    if (option === undefined) return false;
    onSelect(option.id);
    return true;
  };
  const {
    getInputProps,
    getItemProps,
    getLabelProps,
    getMenuProps,
    getToggleButtonProps,
    closeMenu,
    isOpen,
    openMenu,
  } = useCombobox<FocusOption>({
    items: filteredOptions,
    selectedItem: selectedOption,
    // A clue row names the body it flies to, as that body's own row does.
    itemToString: (item) => (item === null ? "" : focusOption(item.id).label),
    isItemDisabled: (item) => item.disabled,
    defaultHighlightedIndex: 0,
    onInputValueChange: ({ inputValue }) => {
      const normalizedInput = inputValue.trim().toLocaleLowerCase();
      setCatalogueSearchActive(normalizedInput.length > 0);
      setFilteredOptions(
        normalizedInput.length === 0
          ? browseOptions
          : searchOptions.filter((option) =>
              option.searchText.toLocaleLowerCase().includes(normalizedInput),
            ),
      );
    },
    onSelectedItemChange: ({ selectedItem }) => {
      if (selectedItem !== null) {
        onSelect(selectedItem.id);
      }
    },
  });
  return (
    <div className="focus-control">
      <label {...getLabelProps()}>Focus</label>
      <div className="focus-input-group">
        <input
          {...getInputProps({
            "aria-label": "Focus",
            spellCheck: false,
            onFocus: () => {
              showBrowseOptions();
              openMenu();
            },
            onKeyDown: (event) => {
              if (event.key === "ArrowDown" && !isOpen) {
                showBrowseOptions();
              }
              if (
                event.key === "Enter" &&
                selectTypedOption(event.currentTarget.value)
              ) {
                event.preventDefault();
                (
                  event.nativeEvent as KeyboardEvent & {
                    preventDownshiftDefault?: boolean;
                  }
                ).preventDownshiftDefault = true;
                closeMenu();
              }
            },
          })}
        />
        <button
          type="button"
          aria-label="Open focus list"
          {...getToggleButtonProps({
            onClick: showBrowseOptions,
          })}
        >
          ⌄
        </button>
      </div>
      <ul
        {...getMenuProps()}
        className="focus-popover focus-listbox"
        hidden={!isOpen}
      >
        {groups.map((group) => {
          const visibleOptions = group.options.filter((option) =>
            filteredOptions.includes(option),
          );
          return visibleOptions.length === 0 ? null : (
            <li className="focus-list-group" key={group.label} role="group">
              <span className="focus-list-header" role="presentation">
                {group.label}
              </span>
              <ul role="presentation">
                {visibleOptions.map((option) => (
                  <li
                    key={option.key}
                    {...getItemProps({
                      item: option,
                      index: filteredOptions.indexOf(option),
                    })}
                  >
                    {option.label}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
        {!catalogueSearchActive && (
          <li className="focus-search-hint" role="presentation">
            Type a name to search all {additionalKnownSatellites.length} known
            moons
          </li>
        )}
      </ul>
    </div>
  );
});

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function bodyDistanceM(first: BodyState, second: BodyState): number {
  return Math.hypot(
    first.positionM[0] - second.positionM[0],
    first.positionM[1] - second.positionM[1],
    first.positionM[2] - second.positionM[2],
  );
}

function bodyRelativeSpeedMps(first: BodyState, second: BodyState): number {
  return Math.hypot(
    first.velocityMps[0] - second.velocityMps[0],
    first.velocityMps[1] - second.velocityMps[1],
    first.velocityMps[2] - second.velocityMps[2],
  );
}

function formatEffectiveRate(secondsPerSecond: number): string {
  const absolute = Math.abs(secondsPerSecond);
  if (absolute >= DAY_SECONDS) {
    return `${(absolute / DAY_SECONDS).toLocaleString(undefined, { maximumFractionDigits: 1 })} days/s`;
  }
  if (absolute >= 3_600) {
    return `${(absolute / 3_600).toLocaleString(undefined, { maximumFractionDigits: 1 })} hours/s`;
  }
  if (absolute >= 60) {
    return `${(absolute / 60).toLocaleString(undefined, { maximumFractionDigits: 1 })} min/s`;
  }
  return `${absolute.toLocaleString(undefined, { maximumFractionDigits: 1 })} s/s`;
}

function formatDuration(seconds: number): string {
  if (seconds >= DAY_SECONDS) {
    return `${(seconds / DAY_SECONDS).toLocaleString(undefined, { maximumFractionDigits: 2 })} days`;
  }
  if (seconds >= 3_600) {
    return `${(seconds / 3_600).toLocaleString(undefined, { maximumFractionDigits: 2 })} hours`;
  }
  return `${(seconds / 60).toLocaleString(undefined, { maximumFractionDigits: 1 })} minutes`;
}

function formatSimulationOffset(seconds: number): string {
  if (seconds === 0) {
    return "0 days";
  }
  const sign = seconds > 0 ? "+" : "−";
  const absoluteSeconds = Math.abs(seconds);
  if (absoluteSeconds < 60) {
    return `${sign}${absoluteSeconds.toLocaleString(undefined, { maximumFractionDigits: 1 })} s`;
  }
  if (absoluteSeconds < 3_600) {
    return `${sign}${(absoluteSeconds / 60).toLocaleString(undefined, { maximumFractionDigits: 1 })} min`;
  }
  if (absoluteSeconds < DAY_SECONDS) {
    return `${sign}${(absoluteSeconds / 3_600).toLocaleString(undefined, { maximumFractionDigits: 1 })} h`;
  }
  return `${sign}${(absoluteSeconds / DAY_SECONDS).toLocaleString(undefined, { maximumFractionDigits: 2 })} days`;
}

/** "the Sun" reads as a name; every other parent keeps its own name. */
function parentPhrase(parent: MajorBodyDefinition): string {
  return parent.id === "sun" ? "the Sun" : parent.name;
}

/** A card row whose value never shows without its label. */
type LabelledValue = Readonly<{ label: string; value: string }>;

/**
 * The selected-body distance rows. Rounded child-first values sit on the
 * card; the exact live kilometres (and AU for Sun orbiters) go to
 * "More detail". None of them change with camera zoom.
 */
type DistanceRows = Readonly<{
  distance: LabelledValue;
  exactDistance: LabelledValue;
  sunlight?: string;
  distanceAu?: string;
}>;

/** A Sun orbiter compares with Earth's average distance and adds the sunlight time. */
function sunDistanceRows(bodyId: string, distanceM: number): DistanceRows {
  return {
    distance: {
      label: "From the Sun",
      value: formatSunDistance(bodyId, distanceM),
    },
    exactDistance: {
      label: "Distance from the Sun, centre to centre (live)",
      value: formatExactDistanceKm(distanceM),
    },
    sunlight: formatSunlightTravelTime(distanceM),
    distanceAu: formatDistanceAu(distanceM),
  };
}

/** An Earth-centred or fictional object states its centre distance in plain words. */
function plainDistanceRows(label: string, distanceM: number): DistanceRows {
  return {
    distance: { label, value: formatPlainDistance(distanceM) },
    exactDistance: {
      label: `${label} (live)`,
      value: formatExactDistanceKm(distanceM),
    },
  };
}

/** Spacecraft: Sun orbiters get the Sun rows, the rest a plain distance. */
function spacecraftDistanceRows(
  bodyId: string,
  parent: MajorBodyDefinition,
  distanceM: number,
): DistanceRows {
  return parent.id === "sun"
    ? sunDistanceRows(bodyId, distanceM)
    : plainDistanceRows(`Distance from ${parentPhrase(parent)}`, distanceM);
}

/** Planets and Pluto get the Sun rows; moons compare the gap with the parent's width. */
function majorBodyDistanceRows(
  body: MajorBodyDefinition,
  parent: MajorBodyDefinition,
  distanceM: number,
): DistanceRows {
  if (parent.id === "sun") {
    return sunDistanceRows(body.id, distanceM);
  }
  return {
    distance: {
      label: `From ${parent.name}`,
      value: formatGapInParentWidths(
        distanceM,
        parent.name,
        parent.meanRadiusM,
        body.meanRadiusM,
      ),
    },
    exactDistance: {
      label: `Distance from ${parent.name}, centre to centre (live)`,
      value: formatExactDistanceKm(distanceM),
    },
  };
}

function normalizedDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function formatLocalSolarTime(hours: number): string {
  const totalMinutes = Math.round(hours * 60) % (24 * 60);
  const normalizedMinutes = (totalMinutes + 24 * 60) % (24 * 60);
  const hour = Math.floor(normalizedMinutes / 60);
  const minute = normalizedMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatAngularDiameter(degrees: number): string {
  if (degrees >= 1) {
    return `${degrees.toLocaleString(undefined, { maximumFractionDigits: 2 })}°`;
  }
  const arcminutes = degrees * 60;
  if (arcminutes >= 1) {
    return `${arcminutes.toLocaleString(undefined, { maximumFractionDigits: 2 })}′`;
  }
  return `${(arcminutes * 60).toLocaleString(undefined, { maximumFractionDigits: 2 })}″`;
}

function useDisplayedSimulationState(
  frame: SimulationFrame | undefined,
): Readonly<{
  state: SimulationState | undefined;
  stateRef: RefObject<SimulationState | undefined>;
}> {
  const [displayedState, setDisplayedState] = useState<SimulationState>();
  const displayedStateRef = useRef<SimulationState | undefined>(undefined);
  useEffect(() => {
    if (frame === undefined) {
      displayedStateRef.current = undefined;
      setDisplayedState(undefined);
      return;
    }
    if (
      frame.transitionDurationMs <= 0 ||
      frame.start.timeSeconds === frame.end.timeSeconds
    ) {
      displayedStateRef.current = frame.end;
      setDisplayedState(frame.end);
      return;
    }
    const startedAt = performance.now();
    let lastReactPresentationAt = Number.NEGATIVE_INFINITY;
    let animationFrame = 0;
    const present = (now: number): void => {
      const fraction = Math.min(
        1,
        Math.max(0, (now - startedAt) / frame.transitionDurationMs),
      );
      const nextState = interpolateDisplayedSimulationFrame(frame, fraction);
      displayedStateRef.current = nextState;
      if (now - lastReactPresentationAt >= 100 || fraction === 1) {
        lastReactPresentationAt = now;
        setDisplayedState(nextState);
      }
      if (fraction < 1) {
        animationFrame = requestAnimationFrame(present);
      }
    };
    animationFrame = requestAnimationFrame(present);
    return () => cancelAnimationFrame(animationFrame);
  }, [frame]);
  return { state: displayedState, stateRef: displayedStateRef };
}

const DISCOVERY_TOAST_DURATION_MS = 6_000;

export function App() {
  const audio = useInterfaceAudio();
  const [frame, setFrame] = useState<SimulationFrame>();
  const { state, stateRef: displayedStateRef } =
    useDisplayedSimulationState(frame);
  const [error, setError] = useState<string>();
  const [playing, setPlaying] = useState(true);
  const [direction, setDirection] = useState<-1 | 1>(1);
  const [timeRateIndex, setTimeRateIndex] = useState(4);
  const [effectiveRate, setEffectiveRate] = useState(0);
  const [playbackBuffered, setPlaybackBuffered] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const [bodyVisibilityPercent, setBodyVisibilityPercent] = useState(100);
  const [viewMode, setViewMode] = useState<ViewMode>("reality");
  const [controlPanelOpen, setControlPanelOpen] = useState(false);
  const [sizeLineupOpen, setSizeLineupOpen] = useState(false);
  const [displayPanelTab, setDisplayPanelTab] =
    useState<DisplayPanelTab>("view");
  const [focusBodyId, setFocusBodyId] = useState("");
  const [selectedBodyId, setSelectedBodyId] = useState("");
  const [foundEasterEggIds, setFoundEasterEggIds] =
    useState<ReadonlySet<EasterEggId>>(loadFoundEasterEggs);
  const [discoveredEasterEggId, setDiscoveredEasterEggId] =
    useState<EasterEggId | null>(null);
  const [showMoonTrail, setShowMoonTrail] = useState(false);
  const [showPlanetTrails, setShowPlanetTrails] = useState(false);
  const [showMinorBodyTrails, setShowMinorBodyTrails] = useState(false);
  const [referenceFrame, setReferenceFrame] =
    useState<ReferenceFrame>("heliocentric");
  const [trailDurationDays, setTrailDurationDays] = useState(365);
  const [trailFadePercent, setTrailFadePercent] = useState(85);
  const [clearTrailsToken, setClearTrailsToken] = useState(0);
  const [showEclipticPlane, setShowEclipticPlane] = useState(false);
  const [showZodiac, setShowZodiac] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [showApolloSites, setShowApolloSites] = useState(true);
  const [apolloInspectionSiteId, setApolloInspectionSiteId] = useState<
    string | null
  >(null);
  // The body a press on a label, the scene or the map selected; only that
  // selection invites a second press to fly there.
  const [announcedPickId, setAnnouncedPickId] = useState<string | null>(null);
  const [navigationMapBottomPx, setNavigationMapBottomPx] = useState<
    number | null
  >(null);
  const [showTacticalOverlay, setShowTacticalOverlay] = useState(false);
  const [showOrbitGuides, setShowOrbitGuides] = useState(false);
  const [wayfinderMode, setWayfinderMode] = useState<WayfinderMode>("sun");
  const [gravityWellMode, setGravityWellMode] =
    useState<GravityWellMode>("off");
  const [gravityWellScale, setGravityWellScale] =
    useState<GravityWellScale>("local");
  const [semanticZoom, setSemanticZoom] =
    useState<SemanticZoomLevel>("solar-system");
  const [resetViewToken, setResetViewToken] = useState(0);
  const [cameraZoom, setCameraZoom] = useState(DEFAULT_CAMERA_ZOOM);
  const [viewMagnification, setViewMagnification] =
    useState(DEFAULT_CAMERA_ZOOM);
  const [cameraNavigationCommand, setCameraNavigationCommand] =
    useState<CameraNavigationCommand>({
      sequence: 0,
      action: "fit-selection",
    });
  const [cameraOrientation, setCameraOrientation] =
    useState<CameraOrientationPreset>("perspective");
  const [orbitViewEnabled, setOrbitViewEnabled] = useState(false);
  const [orbitConfiguration, setOrbitConfiguration] =
    useState<CameraOrbitConfiguration | null>(null);
  const [orbitConfigurationError, setOrbitConfigurationError] = useState<
    string | undefined
  >();
  const [orientationPresetToken, setOrientationPresetToken] = useState(0);
  const [tourKind, setTourKind] = useState<GuidedTourKind | null>(null);
  const [tourStepIndex, setTourStepIndex] = useState<number | null>(null);
  const [tourPlaying, setTourPlaying] = useState(false);
  // The last step's timer fired: the panel shows the ending, not the step.
  const [tourEnded, setTourEnded] = useState(false);
  const [tourMinimised, setTourMinimised] = useState(false);
  const [tourPresentationToken, setTourPresentationToken] = useState(0);
  const [tourTransitionSequence, setTourTransitionSequence] = useState(0);
  const [tourTransitionDurationMs, setTourTransitionDurationMs] = useState(0);
  const [settledCameraTransitionSequence, setSettledCameraTransitionSequence] =
    useState(0);
  const displaySettingsBeforeTourRef = useRef<DisplaySettingsBeforeTour>(null);
  // The simulated time when the first of a chain of tours began, so a Scale
  // tour started from an ending replays from there, not from where the last
  // story stopped the clock. Undefined when no physics state existed yet, so
  // the clock was still at the epoch.
  const tourChainStartTimeSecondsRef = useRef<number | undefined>(undefined);
  const tourPanelRef = useRef<HTMLElement>(null);
  const tourFlyHomeRef = useRef<HTMLButtonElement>(null);
  // The ending replaces the buttons a child may have focused; it takes focus
  // only from inside the tour panel.
  const tourEndingTakesFocusRef = useRef(false);
  // True once the child moves the camera away from the presented step pose.
  const tourCameraMovedRef = useRef(false);
  const [activeCinematicShotId, setActiveCinematicShotId] = useState<
    string | null
  >(null);
  const [surfaceObserverEnabled, setSurfaceObserverEnabled] = useState(false);
  const [surfaceObserverBodyId, setSurfaceObserverBodyId] = useState("earth");
  const [surfaceObserverTargetBodyId, setSurfaceObserverTargetBodyId] =
    useState("sun");
  const [surfaceObserverLatitudeDeg, setSurfaceObserverLatitudeDeg] =
    useState(51.4779);
  const [surfaceObserverLongitudeDeg, setSurfaceObserverLongitudeDeg] =
    useState(0);
  const [surfaceObserverLookResetToken, setSurfaceObserverLookResetToken] =
    useState(0);
  const [visualQuality, setVisualQuality] =
    useState<VisualQuality>("photographic");
  const [exposureMode, setExposureMode] = useState<ExposureMode>("auto");
  const [manualExposureEv, setManualExposureEv] = useState(0);
  const [exposureStatus, setExposureStatus] = useState({
    ev: 0,
    multiplier: VISUAL_QUALITY_PROFILES.photographic.baseExposure,
    mode: "auto" as ExposureMode,
  });
  const [immersiveMode, setImmersiveMode] = useState(false);
  const [selectedBodyPanelCollapsed, setSelectedBodyPanelCollapsed] =
    useState(false);
  const [fullscreenError, setFullscreenError] = useState<string>();
  const [objectVisibility, setObjectVisibility] = useState<ObjectVisibility>(
    DEFAULT_OBJECT_VISIBILITY,
  );
  const [gpuStatus, setGpuStatus] = useState<SmallBodyGpuStatus>();
  const [gpuError, setGpuError] = useState<string>();
  const [simulationRunToken, setSimulationRunToken] = useState(0);
  const orbitViewEnabledRef = useRef(orbitViewEnabled);
  const playingRef = useRef(playing);
  const directionRef = useRef(direction);
  const timeRateIndexRef = useRef(timeRateIndex);
  const manualDeltaSecondsRef = useRef(0);
  const directSeekTimeSecondsRef = useRef<number | undefined>(undefined);
  // A looping cool shot's end time: continuous forward playback never
  // integrates past it, so the race cannot leave its validated window when
  // rendering falls behind.
  const forwardPlaybackLimitSecondsRef = useRef<number | undefined>(undefined);
  const focusBodyIdRef = useRef(focusBodyId);
  const focusHistoryRef = useRef<string[]>([]);
  const displayButtonRef = useRef<HTMLButtonElement>(null);
  const displayPanelRef = useRef<HTMLElement>(null);
  const displayPanelWasOpenRef = useRef(false);
  const appShellRef = useRef<HTMLElement>(null);
  const fullscreenButtonRef = useRef<HTMLButtonElement>(null);
  const immersiveExitButtonRef = useRef<HTMLButtonElement>(null);
  playingRef.current = playing;
  orbitViewEnabledRef.current = orbitViewEnabled;
  directionRef.current = direction;
  timeRateIndexRef.current = timeRateIndex;
  focusBodyIdRef.current = focusBodyId;

  const surfaceObserverConfiguration =
    useMemo<SurfaceObserverConfiguration | null>(
      () =>
        surfaceObserverEnabled
          ? {
              bodyId: surfaceObserverBodyId,
              latitudeDeg: surfaceObserverLatitudeDeg,
              longitudeDeg: surfaceObserverLongitudeDeg,
              targetBodyId: surfaceObserverTargetBodyId,
            }
          : null,
      [
        surfaceObserverBodyId,
        surfaceObserverEnabled,
        surfaceObserverLatitudeDeg,
        surfaceObserverLongitudeDeg,
        surfaceObserverTargetBodyId,
      ],
    );
  const surfaceObservation = useMemo(
    () =>
      state === undefined || surfaceObserverConfiguration === null
        ? undefined
        : surfaceObserverFrame(state, surfaceObserverConfiguration),
    [state, surfaceObserverConfiguration],
  );

  useEffect(() => {
    if (controlPanelOpen) {
      displayPanelWasOpenRef.current = true;
      requestAnimationFrame(() => {
        displayPanelRef.current
          ?.querySelector<HTMLButtonElement>("button[data-initial-focus]")
          ?.focus();
      });
      return;
    }
    if (displayPanelWasOpenRef.current) {
      displayPanelWasOpenRef.current = false;
      displayButtonRef.current?.focus();
    }
  }, [controlPanelOpen]);

  useEffect(() => {
    const handleFullscreenChange = (): void => {
      const isImmersive = document.fullscreenElement === appShellRef.current;
      setImmersiveMode(isImmersive);
      if (isImmersive) {
        setControlPanelOpen(false);
        requestAnimationFrame(() => immersiveExitButtonRef.current?.focus());
        return;
      }
      if (document.fullscreenElement === null) {
        requestAnimationFrame(() => fullscreenButtonRef.current?.focus());
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const enterImmersiveMode = (): void => {
    const appShell = appShellRef.current;
    if (appShell === null) {
      throw new Error("Application shell is unavailable for fullscreen mode");
    }
    setFullscreenError(undefined);
    void appShell
      .requestFullscreen({ navigationUI: "hide" })
      .catch((fullscreenFailure: unknown) => {
        setFullscreenError(
          fullscreenFailure instanceof Error
            ? `Fullscreen failed: ${fullscreenFailure.message}`
            : "Fullscreen failed for an unknown browser reason",
        );
      });
  };

  const exitImmersiveMode = (): void => {
    setFullscreenError(undefined);
    if (document.fullscreenElement !== appShellRef.current) {
      throw new Error("The Solar System Explorer is not fullscreen");
    }
    void document.exitFullscreen().catch((fullscreenFailure: unknown) => {
      setFullscreenError(
        fullscreenFailure instanceof Error
          ? `Leaving fullscreen failed: ${fullscreenFailure.message}`
          : "Leaving fullscreen failed for an unknown browser reason",
      );
    });
  };

  useEffect(() => {
    const client = createPhysicsClient();
    const controller = new AbortController();
    const isActive = (): boolean => !controller.signal.aborted;
    let solverTime = 0;
    let rateSampleTime = performance.now();
    let rateSampleSimulationTime = 0;

    const resetMeasuredRate = (simulationTime: number): void => {
      rateSampleTime = performance.now();
      rateSampleSimulationTime = simulationTime;
      if (isActive()) {
        setEffectiveRate(0);
      }
    };

    const recordDisplayedState = (simulationTime: number): void => {
      const now = performance.now();
      const elapsedMs = now - rateSampleTime;
      if (elapsedMs < 500) {
        return;
      }
      if (isActive()) {
        setEffectiveRate(
          ((simulationTime - rateSampleSimulationTime) * 1_000) / elapsedMs,
        );
      }
      rateSampleTime = now;
      rateSampleSimulationTime = simulationTime;
    };

    const buildTargetTimes = (
      startTime: number,
      signedKeyframeSeconds: number,
      count: number,
    ): number[] =>
      Array.from(
        { length: count },
        (_, index) => startTime + signedKeyframeSeconds * (index + 1),
      );

    const run = async (): Promise<void> => {
      try {
        const rawInitialState = await client.api.initialize(majorBodySystem);
        let previousState = withKnownSatellites(rawInitialState);
        solverTime = previousState.timeSeconds;
        resetMeasuredRate(previousState.timeSeconds);
        if (isActive()) {
          setFrame({
            start: previousState,
            end: previousState,
            transitionDurationMs: 0,
          });
        }
        while (isActive()) {
          const directSeekTimeSeconds = directSeekTimeSecondsRef.current;
          if (directSeekTimeSeconds !== undefined) {
            directSeekTimeSecondsRef.current = undefined;
            const rawNextState = await client.api.integrateTo(
              directSeekTimeSeconds,
            );
            solverTime = rawNextState.timeSeconds;
            const nextState = withKnownSatellites(rawNextState);
            previousState = nextState;
            resetMeasuredRate(nextState.timeSeconds);
            if (isActive()) {
              setFrame({
                start: nextState,
                end: nextState,
                transitionDurationMs: 0,
              });
              setSeeking(false);
              setPlaybackBuffered(false);
            }
            continue;
          }
          const manualRemaining = manualDeltaSecondsRef.current;
          const selectedRate = TIME_RATES[timeRateIndexRef.current];
          if (selectedRate === undefined) {
            throw new Error("Selected simulation time rate is unavailable");
          }
          if (manualRemaining === 0 && !playingRef.current) {
            if (isActive()) {
              setPlaybackBuffered(false);
            }
            await sleep(50);
            continue;
          }

          const isManual = manualRemaining !== 0;
          const requestedDirection = isManual
            ? Math.sign(manualRemaining)
            : directionRef.current;
          const keyframeSeconds = isManual
            ? Math.min(
                Math.abs(manualRemaining),
                MAXIMUM_SOLVER_KEYFRAME_SECONDS,
              )
            : Math.min(
                MAXIMUM_SOLVER_KEYFRAME_SECONDS,
                Math.max(
                  1,
                  selectedRate.secondsPerSecond /
                    TARGET_SOLVER_FRAMES_PER_SECOND,
                ),
              );
          const signedKeyframeSeconds = requestedDirection * keyframeSeconds;
          const requestedRateIndex = timeRateIndexRef.current;
          const batchSize = isManual ? 1 : PLAYBACK_BATCH_SIZE;
          const transitionDurationMs = isManual
            ? MINIMUM_TRANSITION_MS
            : Math.max(
                MINIMUM_TRANSITION_MS,
                (keyframeSeconds / selectedRate.secondsPerSecond) * 1_000,
              );
          const keyframeIntervalMs = isManual
            ? transitionDurationMs
            : (keyframeSeconds / selectedRate.secondsPerSecond) * 1_000;
          // Continuous forward playback stops at a looping shot's end, for
          // this batch and every prefetched one.
          const limitForwardTargets = (
            times: readonly number[],
            fromSeconds: number,
          ): number[] => {
            const forwardLimitSeconds = forwardPlaybackLimitSecondsRef.current;
            return isManual ||
              requestedDirection < 0 ||
              forwardLimitSeconds === undefined
              ? [...times]
              : times
                  .map((time) => Math.min(time, forwardLimitSeconds))
                  .filter(
                    (time, index, limited) =>
                      time > fromSeconds && time !== limited[index - 1],
                  );
          };
          const targetTimes = limitForwardTargets(
            buildTargetTimes(solverTime, signedKeyframeSeconds, batchSize),
            solverTime,
          );
          if (targetTimes.length === 0) {
            // The solver holds at the loop end until the shot restarts it.
            await sleep(50);
            continue;
          }
          let nextStates = await client.api.integrateSeries(targetTimes);
          solverTime = targetTimes.at(-1) ?? solverTime;

          // A tour step's pending seek ends the current batch too, so it
          // applies whatever the playback rate. ISS and spacecraft focus seeks
          // restart the run and apply at the top of the new loop.
          const playbackRequestChanged = (): boolean =>
            directSeekTimeSecondsRef.current !== undefined ||
            (!isManual &&
              (!playingRef.current ||
                directionRef.current !== requestedDirection ||
                timeRateIndexRef.current !== requestedRateIndex));
          if (playbackRequestChanged()) {
            await client.api.integrateTo(previousState.timeSeconds);
            solverTime = previousState.timeSeconds;
            resetMeasuredRate(previousState.timeSeconds);
            if (isActive()) {
              setPlaybackBuffered(false);
            }
            continue;
          }

          while (isActive()) {
            const limitedNextTargets = isManual
              ? []
              : limitForwardTargets(
                  buildTargetTimes(
                    solverTime,
                    signedKeyframeSeconds,
                    PLAYBACK_BATCH_SIZE,
                  ),
                  solverTime,
                );
            const nextBatchTargets =
              limitedNextTargets.length === 0 ? undefined : limitedNextTargets;
            const prefetchedStates =
              nextBatchTargets === undefined
                ? undefined
                : client.api.integrateSeries(nextBatchTargets);
            if (isActive()) {
              setPlaybackBuffered(!isManual);
            }
            let requestChanged = false;
            const batchPresentationStart = performance.now();
            const pendingTrailStates: SimulationState[] = [];

            for (const [stateIndex, rawNextState] of nextStates.entries()) {
              requestChanged = playbackRequestChanged();
              if (requestChanged) {
                break;
              }
              if (isManual) {
                manualDeltaSecondsRef.current -= signedKeyframeSeconds;
              }
              const scheduledFrameTime =
                batchPresentationStart + stateIndex * keyframeIntervalMs;
              const nextScheduledFrameTime =
                scheduledFrameTime + keyframeIntervalMs;
              const frameIsAlreadyLate =
                !isManual &&
                stateIndex < nextStates.length - 1 &&
                performance.now() >= nextScheduledFrameTime;
              if (frameIsAlreadyLate) {
                pendingTrailStates.push(rawNextState);
                continue;
              }
              const frameStartState = withKnownSatellites(previousState);
              const nextState = withKnownSatellites(rawNextState);
              if (isActive()) {
                setFrame({
                  start: frameStartState,
                  end: nextState,
                  transitionDurationMs,
                  trailStates: [...pendingTrailStates, nextState],
                });
                recordDisplayedState(nextState.timeSeconds);
              }
              pendingTrailStates.length = 0;
              previousState = nextState;
              await sleep(
                Math.max(0, nextScheduledFrameTime - performance.now()),
              );
            }

            if (prefetchedStates !== undefined) {
              const resolvedPrefetch = await prefetchedStates;
              solverTime = nextBatchTargets?.at(-1) ?? solverTime;
              if (requestChanged) {
                await client.api.integrateTo(previousState.timeSeconds);
                solverTime = previousState.timeSeconds;
                resetMeasuredRate(previousState.timeSeconds);
                if (isActive()) {
                  setPlaybackBuffered(false);
                }
                break;
              }
              nextStates = resolvedPrefetch;
              continue;
            }
            break;
          }
          if (isManual && manualDeltaSecondsRef.current === 0 && isActive()) {
            setSeeking(false);
            setPlaybackBuffered(false);
            resetMeasuredRate(previousState.timeSeconds);
          }
        }
      } catch (cause: unknown) {
        if (isActive()) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    };
    void run();

    return () => {
      controller.abort();
      client.close();
    };
  }, [simulationRunToken]);

  const issueCameraNavigation = useCallback(
    (action: CameraNavigationAction): void => {
      setCameraNavigationCommand((current) => ({
        sequence: current.sequence + 1,
        action,
      }));
    },
    [],
  );

  const requestResetView = useCallback((): void => {
    tourCameraMovedRef.current = true;
    setSurfaceObserverEnabled(false);
    setTourPlaying(false);
    setCameraZoom(DEFAULT_CAMERA_ZOOM);
    setCameraOrientation(
      focusBodyIdRef.current === "" ? "perspective" : "sun-facing",
    );
    setTourTransitionDurationMs(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : ORIENTATION_CAMERA_TRANSITION_DURATION_MS,
    );
    setTourTransitionSequence((current) => current + 1);
    setResetViewToken((current) => current + 1);
  }, []);

  // Ends a running tour: restores the settings saved when it started and
  // returns them, or returns null when no tour runs. A caller that ends a tour
  // for its own action applies that action's settings after this call.
  const endTour = useCallback((): DisplaySettingsBeforeTour | null => {
    const before = displaySettingsBeforeTourRef.current;
    if (before === null) {
      return null;
    }
    displaySettingsBeforeTourRef.current = null;
    setTourPlaying(false);
    setTourEnded(false);
    setTourKind(null);
    setTourStepIndex(null);
    setTourMinimised(false);
    setViewMode(before.viewMode);
    setBodyVisibilityPercent(before.bodyVisibilityPercent);
    setShowLabels(before.showLabels);
    setShowOrbitGuides(before.showOrbitGuides);
    setShowTacticalOverlay(before.showTacticalOverlay);
    setShowEclipticPlane(before.showEclipticPlane);
    setShowPlanetTrails(before.showPlanetTrails);
    setShowMoonTrail(before.showMoonTrail);
    setShowMinorBodyTrails(before.showMinorBodyTrails);
    setGravityWellMode(before.gravityWellMode);
    setReferenceFrame(before.referenceFrame);
    setSurfaceObserverBodyId(before.surfaceObserverBodyId);
    setSurfaceObserverTargetBodyId(before.surfaceObserverTargetBodyId);
    setSurfaceObserverLatitudeDeg(before.surfaceObserverLatitudeDeg);
    setSurfaceObserverLongitudeDeg(before.surfaceObserverLongitudeDeg);
    setDirection(before.direction);
    setTimeRateIndex(before.timeRateIndex);
    // The clock runs after a tour even when it was paused before the tour:
    // a frozen screen after the tour would look broken to a child.
    setPlaying(true);
    return before;
  }, []);

  const exitTour = useCallback((): void => {
    if (endTour() === null) {
      throw new Error("The display settings from before the tour are missing");
    }
    requestResetView();
  }, [endTour, requestResetView]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && tourStepIndex !== null) {
        event.preventDefault();
        exitTour();
        return;
      }
      if (event.key.toLowerCase() !== "r") {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      requestResetView();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [exitTour, requestResetView, tourStepIndex]);

  const applyOrientationPreset = (
    preset: Exclude<CameraOrientationPreset, "custom">,
  ): void => {
    tourCameraMovedRef.current = true;
    setCameraOrientation(preset);
    setOrientationPresetToken((current) => current + 1);
  };

  const handleSceneOrientationChange = useCallback(
    (preset: CameraOrientationPreset): void => {
      setCameraOrientation(preset);
      if (preset === "custom") {
        tourCameraMovedRef.current = true;
        setTourPlaying(false);
        setActiveCinematicShotId(null);
      }
    },
    [],
  );

  const handleOrbitViewChange = useCallback((enabled: boolean): void => {
    setOrbitViewEnabled(enabled);
  }, []);

  // Every selection path (label, scene click, focus list, next object) ends
  // here, so the first selection of an easter egg counts as finding it.
  useEffect(() => {
    if (
      !isEasterEggId(selectedBodyId) ||
      foundEasterEggIds.has(selectedBodyId)
    ) {
      return;
    }
    const found = new Set(foundEasterEggIds).add(selectedBodyId);
    setFoundEasterEggIds(found);
    saveFoundEasterEggs(found);
    setDiscoveredEasterEggId(selectedBodyId);
    audio.interact("discovery");
  }, [selectedBodyId, foundEasterEggIds, audio.interact]);

  useEffect(() => {
    if (discoveredEasterEggId === null) {
      return;
    }
    const timer = window.setTimeout(
      () => setDiscoveredEasterEggId(null),
      DISCOVERY_TOAST_DURATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [discoveredEasterEggId]);

  const handleSceneBodySelection = useCallback((bodyId: string): void => {
    setApolloInspectionSiteId(null);
    setSelectedBodyId(bodyId);
  }, []);

  const handleSceneBodyPick = useCallback(
    (bodyId: string): void => {
      handleSceneBodySelection(bodyId);
      setAnnouncedPickId(bodyId);
    },
    [handleSceneBodySelection],
  );

  // Any other control that changes the selection ends the invitation.
  useEffect(() => {
    setAnnouncedPickId((current) =>
      current === selectedBodyId ? current : null,
    );
  }, [selectedBodyId]);

  const navigateToFocus = useCallback(
    (bodyId: string): void => {
      setActiveCinematicShotId(null);
      setApolloInspectionSiteId(null);
      endTour();
      if (tourStepIndex !== null) {
        setPlaying(false);
      }
      const currentBodyId = focusBodyIdRef.current;
      setSelectedBodyId(bodyId);
      if (bodyId === currentBodyId) {
        setCameraZoom(DEFAULT_CAMERA_ZOOM);
        setCameraOrientation(
          bodyId === ""
            ? "perspective"
            : orbitViewEnabledRef.current
              ? "custom"
              : "sun-facing",
        );
        issueCameraNavigation("fit-selection");
        return;
      }
      focusHistoryRef.current.push(currentBodyId);
      focusBodyIdRef.current = bodyId;
      setFocusBodyId(bodyId);
      setTourTransitionDurationMs(
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : MANUAL_CAMERA_TRANSITION_DURATION_MS,
      );
      setResetViewToken((current) => current + 1);
      setTourTransitionSequence((current) => current + 1);
      if (bodyId === ISS_BODY_ID) {
        const currentTime = displayedStateRef.current?.timeSeconds ?? 0;
        if (!isIssEphemerisWithinValidity(currentTime)) {
          playingRef.current = false;
          setPlaying(false);
          manualDeltaSecondsRef.current = 0;
          directSeekTimeSecondsRef.current = ISS_EPOCH_SIMULATION_SECONDS;
          setSeeking(true);
          setSimulationRunToken((current) => current + 1);
        }
      }
      if (isOperationalSpacecraftBodyId(bodyId)) {
        const currentTime = displayedStateRef.current?.timeSeconds ?? 0;
        if (!isOperationalSpacecraftWithinValidity(bodyId, currentTime)) {
          playingRef.current = false;
          setPlaying(false);
          manualDeltaSecondsRef.current = 0;
          directSeekTimeSecondsRef.current =
            operationalSpacecraftRecommendedTimeSeconds(bodyId);
          setSeeking(true);
          setSimulationRunToken((current) => current + 1);
        }
      }
      setFrame((currentFrame) =>
        currentFrame === undefined
          ? currentFrame
          : {
              ...currentFrame,
              start: withKnownSatellites(currentFrame.start),
              end: withKnownSatellites(currentFrame.end),
            },
      );
      if (bodyId !== "" && bodyId !== "sun") {
        setCameraZoom(DEFAULT_CAMERA_ZOOM);
        setCameraOrientation(
          orbitViewEnabledRef.current ? "custom" : "sun-facing",
        );
      }
    },
    [endTour, issueCameraNavigation, tourStepIndex],
  );

  const navigateBack = (): void => {
    setSurfaceObserverEnabled(false);
    setActiveCinematicShotId(null);
    endTour();
    setPlaying(false);
    const previousBodyId = focusHistoryRef.current.pop();
    if (previousBodyId === undefined) {
      return;
    }
    focusBodyIdRef.current = previousBodyId;
    setFocusBodyId(previousBodyId);
    setSelectedBodyId(previousBodyId);
    setCameraZoom(DEFAULT_CAMERA_ZOOM);
    setCameraOrientation(
      previousBodyId === ""
        ? "perspective"
        : orbitViewEnabledRef.current
          ? "custom"
          : "sun-facing",
    );
    setTourTransitionDurationMs(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : MANUAL_CAMERA_TRANSITION_DURATION_MS,
    );
    setResetViewToken((current) => current + 1);
    setTourTransitionSequence((current) => current + 1);
    setFrame((currentFrame) =>
      currentFrame === undefined
        ? currentFrame
        : {
            ...currentFrame,
            start: withKnownSatellites(currentFrame.start),
            end: withKnownSatellites(currentFrame.end),
          },
    );
  };

  const navigateToParent = (): void => {
    if (selectedBodyId === "") {
      return;
    }
    if (isApolloLandingSiteId(selectedBodyId)) {
      setSelectedBodyId("moon");
      return;
    }
    const parentId =
      (selectedBodyId === ISS_BODY_ID ? ISS_PARENT_BODY_ID : undefined) ??
      (selectedBodyId === "hubble" ? "earth" : undefined) ??
      (selectedBodyId === "jwst" || isVoyagerBodyId(selectedBodyId)
        ? "sun"
        : undefined) ??
      (selectedBodyId === JOVIAN_MONOLITH_BODY_ID
        ? JOVIAN_MONOLITH_PRIMARY_BODY_ID
        : undefined) ??
      (selectedBodyId === DISCOVERY_ONE_BODY_ID
        ? DISCOVERY_ONE_PARENT_BODY_ID
        : undefined) ??
      (isFictionalOrbiterId(selectedBodyId)
        ? fictionalOrbiterById.get(selectedBodyId)?.parentBodyId
        : undefined) ??
      (isDeepSpaceNineObjectId(selectedBodyId)
        ? deepSpaceNineParentBodyId(selectedBodyId)
        : undefined) ??
      knownSatelliteById.get(selectedBodyId)?.parentId ??
      PARENT_BODY_ID[selectedBodyId] ??
      "";
    setSelectedBodyId(parentId);
  };

  const navigateToNextObject = (): void => {
    const currentIndex = NAVIGABLE_FOCUS_OPTIONS.findIndex(
      (option) => option.id === selectedBodyId,
    );
    // Walk on from the current object, skipping eggs the child has not found.
    for (let step = 1; step <= NAVIGABLE_FOCUS_OPTIONS.length; step += 1) {
      const option =
        NAVIGABLE_FOCUS_OPTIONS[
          (currentIndex + step) % NAVIGABLE_FOCUS_OPTIONS.length
        ];
      if (
        option !== undefined &&
        !isHiddenUntilFound(option, foundEasterEggIds)
      ) {
        setSelectedBodyId(option.id);
        return;
      }
    }
  };

  const navigateHome = (): void => {
    setSurfaceObserverEnabled(false);
    setOrbitViewEnabled(false);
    setTourPlaying(false);
    if (tourStepIndex !== null) {
      setPlaying(false);
    }
    setCameraZoom(DEFAULT_CAMERA_ZOOM);
    setCameraOrientation("perspective");
    if (focusBodyIdRef.current === "") {
      issueCameraNavigation("fit-selection");
      setSelectedBodyId("");
      return;
    }
    navigateToFocus("");
  };

  const recenterView = (): void => {
    requestResetView();
  };

  const handleCameraNavigation = (action: CameraNavigationAction): void => {
    tourCameraMovedRef.current = true;
    setTourPlaying(false);
    setCameraZoom(DEFAULT_CAMERA_ZOOM);
    issueCameraNavigation(action);
  };

  // A tour started from another tour's ending keeps the settings and the clock
  // time from before the first tour, so "Fly home" returns to those settings.
  const rememberDisplaySettingsBeforeTour = (): void => {
    if (tourStepIndex !== null) {
      return;
    }
    tourChainStartTimeSecondsRef.current =
      displayedStateRef.current?.timeSeconds;
    displaySettingsBeforeTourRef.current = {
      viewMode,
      bodyVisibilityPercent,
      showLabels,
      showOrbitGuides,
      showTacticalOverlay,
      showEclipticPlane,
      showPlanetTrails,
      showMoonTrail,
      showMinorBodyTrails,
      gravityWellMode,
      referenceFrame,
      surfaceObserverBodyId,
      surfaceObserverTargetBodyId,
      surfaceObserverLatitudeDeg,
      surfaceObserverLongitudeDeg,
      direction,
      timeRateIndex,
    };
  };

  const startScaleTour = (): void => {
    // From an ending the clock may stand years past the chain's start (the
    // last Scale steps run at 30 days per second). Replay from that start, or
    // from the epoch when the start lies outside the validated window.
    if (tourStepIndex !== null) {
      const startTimeSeconds = tourChainStartTimeSecondsRef.current;
      restartSimulation();
      if (
        startTimeSeconds !== undefined &&
        Math.abs(startTimeSeconds) <= VALIDATED_WINDOW_SECONDS
      ) {
        directSeekTimeSecondsRef.current = startTimeSeconds;
        setSeeking(true);
      }
    }
    rememberDisplaySettingsBeforeTour();
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    setControlPanelOpen(false);
    setActiveCinematicShotId(null);
    setSurfaceObserverEnabled(false);
    setOrbitViewEnabled(false);
    setTourMinimised(false);
    setTourEnded(false);
    setTourPlaying(!reducedMotion);
    setTourTransitionDurationMs(
      reducedMotion ? 0 : SCALE_TOUR_TRANSITION_DURATION_MS,
    );
    setTourKind("scale");
    setTourStepIndex(0);
    setTourPresentationToken((current) => current + 1);
  };

  const startEclipseStory = (): void => {
    rememberDisplaySettingsBeforeTour();
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    setControlPanelOpen(false);
    setActiveCinematicShotId(null);
    setOrbitViewEnabled(false);
    setTourMinimised(false);
    setTourEnded(false);
    setTourPlaying(!reducedMotion);
    setTourTransitionDurationMs(
      reducedMotion ? 0 : ECLIPSE_STORY_TRANSITION_DURATION_MS,
    );
    setTourKind("eclipse");
    setTourStepIndex(0);
    setTourPresentationToken((current) => current + 1);
  };

  const enterSurfaceObserver = (): void => {
    endTour();
    // The child enters the observer place the panel shows, even a tour's.
    setSurfaceObserverBodyId(surfaceObserverBodyId);
    setSurfaceObserverTargetBodyId(surfaceObserverTargetBodyId);
    setSurfaceObserverLatitudeDeg(surfaceObserverLatitudeDeg);
    setSurfaceObserverLongitudeDeg(surfaceObserverLongitudeDeg);
    setOrbitViewEnabled(false);
    setViewMode("reality");
    setCameraZoom(DEFAULT_CAMERA_ZOOM);
    setCameraOrientation("custom");
    navigateToFocus(surfaceObserverBodyId);
    setSurfaceObserverEnabled(true);
    setControlPanelOpen(false);
  };

  const focusApolloLandingSite = useCallback((siteId: string): void => {
    if (!isApolloLandingSiteId(siteId)) {
      throw new Error(`Apollo landing site ${siteId} is unavailable`);
    }
    setShowApolloSites(true);
    setSurfaceObserverEnabled(false);
    setApolloInspectionSiteId(siteId);
    if (focusBodyIdRef.current !== "moon") {
      focusHistoryRef.current.push(focusBodyIdRef.current);
      focusBodyIdRef.current = "moon";
      setFocusBodyId("moon");
    }
    setSelectedBodyId(siteId);
    setCameraZoom(DEFAULT_CAMERA_ZOOM);
    setCameraOrientation("sun-facing");
    setTourTransitionDurationMs(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : ORIENTATION_CAMERA_TRANSITION_DURATION_MS,
    );
    setResetViewToken((current) => current + 1);
    setTourTransitionSequence((current) => current + 1);
  }, []);

  // A second press on a selected label flies there; for an Apollo site that
  // is the card's "Show on Moon".
  const handleSceneFocusBody = useCallback(
    (bodyId: string): void => {
      if (isApolloLandingSiteId(bodyId)) {
        focusApolloLandingSite(bodyId);
        return;
      }
      setSurfaceObserverEnabled(false);
      navigateToFocus(bodyId);
    },
    [focusApolloLandingSite, navigateToFocus],
  );

  const enterApolloLandingSiteObserver = (siteId: string): void => {
    if (!isApolloLandingSiteId(siteId)) {
      throw new Error(`Apollo landing site ${siteId} is unavailable`);
    }
    const site = apolloLandingSiteById.get(siteId);
    if (site === undefined) {
      throw new Error(`Apollo landing site ${siteId} has no installed data`);
    }
    endTour();
    setOrbitViewEnabled(false);
    setShowApolloSites(true);
    setApolloInspectionSiteId(null);
    setViewMode("reality");
    setSurfaceObserverBodyId("moon");
    setSurfaceObserverTargetBodyId("earth");
    setSurfaceObserverLatitudeDeg(site.latitudeDeg);
    setSurfaceObserverLongitudeDeg(site.longitudeDeg);
    navigateToFocus("moon");
    setSelectedBodyId(site.id);
    setCameraZoom(DEFAULT_CAMERA_ZOOM);
    setCameraOrientation("custom");
    setSurfaceObserverEnabled(true);
    setSurfaceObserverLookResetToken((current) => current + 1);
    setControlPanelOpen(false);
  };

  const exitSurfaceObserver = (): void => {
    setSurfaceObserverEnabled(false);
    setCameraOrientation("sun-facing");
    setResetViewToken((current) => current + 1);
  };

  const activeTourSteps: readonly GuidedTourStep[] =
    tourKind === "eclipse" ? ECLIPSE_STORY_STEPS : SCALE_TOUR_STEPS;
  const activeTourStepDurationMs =
    tourKind === "eclipse"
      ? ECLIPSE_STORY_STEP_DURATION_MS
      : SCALE_TOUR_STEP_DURATION_MS;

  const showTourEnding = useCallback((): void => {
    tourEndingTakesFocusRef.current =
      tourPanelRef.current?.contains(document.activeElement) ?? false;
    setTourPlaying(false);
    setTourEnded(true);
  }, []);

  useEffect(() => {
    if (tourEnded && tourEndingTakesFocusRef.current) {
      tourEndingTakesFocusRef.current = false;
      tourFlyHomeRef.current?.focus();
    }
  }, [tourEnded]);

  const advanceScaleTour = (direction: -1 | 1): void => {
    if (tourStepIndex === null) {
      return;
    }
    const next = tourStepIndex + direction;
    if (next < 0) {
      setTourStepIndex(0);
      return;
    }
    if (next >= activeTourSteps.length) {
      showTourEnding();
      return;
    }
    setTourStepIndex(next);
  };

  useEffect(() => {
    if (tourStepIndex === null) {
      return;
    }
    const step = activeTourSteps[tourStepIndex];
    if (step === undefined) {
      throw new Error(
        `Scale tour step ${String(tourStepIndex)} is unavailable`,
      );
    }
    const requestedTimeRateIndex = TIME_RATES.findIndex(
      (rate) => rate.secondsPerSecond === step.timeRateSecondsPerSecond,
    );
    if (requestedTimeRateIndex < 0) {
      throw new Error(
        `Scale tour step ${step.id} requests an unavailable time rate`,
      );
    }
    setDirection(1);
    setTimeRateIndex(requestedTimeRateIndex);
    setViewMode(step.viewMode);
    setBodyVisibilityPercent(step.bodyVisibilityPercent);
    setShowLabels(step.overlays.labels);
    setShowOrbitGuides(step.overlays.orbitGuides);
    setShowTacticalOverlay(step.overlays.tactical);
    setShowEclipticPlane(step.overlays.eclipticGrid);
    setShowPlanetTrails(step.overlays.planetTrails);
    setShowMoonTrail(step.overlays.moonTrail);
    setShowMinorBodyTrails(false);
    setGravityWellMode("off");
    setReferenceFrame("heliocentric");
    tourCameraMovedRef.current = false;
    setCameraZoom(step.cameraZoom);
    setCameraOrientation(step.orientation);
    setOrientationPresetToken((current) => current + 1);
    setTourTransitionDurationMs(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : tourKind === "eclipse"
          ? ECLIPSE_STORY_TRANSITION_DURATION_MS
          : SCALE_TOUR_TRANSITION_DURATION_MS,
    );
    if (step.surfaceObserver !== undefined) {
      setSurfaceObserverBodyId("earth");
      setSurfaceObserverTargetBodyId(step.surfaceObserver.targetBodyId);
      setSurfaceObserverLatitudeDeg(step.surfaceObserver.latitudeDeg);
      setSurfaceObserverLongitudeDeg(step.surfaceObserver.longitudeDeg);
      setSurfaceObserverEnabled(true);
      setSurfaceObserverLookResetToken((current) => current + 1);
    } else {
      setSurfaceObserverEnabled(false);
    }
    if (step.timeSeconds !== undefined) {
      manualDeltaSecondsRef.current = 0;
      directSeekTimeSecondsRef.current = step.timeSeconds;
      setSeeking(true);
    }
    focusHistoryRef.current = [];
    focusBodyIdRef.current = step.focusBodyId;
    setFocusBodyId(step.focusBodyId);
    setSelectedBodyId(step.focusBodyId);
    setResetViewToken((current) => current + 1);
    setTourTransitionSequence((current) => current + 1);
  }, [tourKind, tourPresentationToken, tourStepIndex]);

  // A step's clock holds while the camera flies there (an Eclipse step at its
  // own time, a Scale step at the time it began, because Scale steps set no
  // time), so the event the step names happens in front of the settled camera.
  // The scene defers a reset flight until the focus body has a state, so a
  // step on a body with an ephemeris window (the ISS, JWST) at a time outside
  // that window would hold the clock forever. No tour step focuses one.
  const tourCameraSettled =
    tourTransitionDurationMs <= 0 ||
    settledCameraTransitionSequence >= tourTransitionSequence;
  useEffect(() => {
    if (tourStepIndex !== null) {
      setPlaying(tourPlaying && tourCameraSettled);
    }
  }, [tourCameraSettled, tourPlaying, tourStepIndex]);

  useEffect(() => {
    if (tourStepIndex === null || !tourPlaying) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (tourStepIndex === activeTourSteps.length - 1) {
        showTourEnding();
        return;
      }
      setTourStepIndex(tourStepIndex + 1);
    }, activeTourStepDurationMs);
    return () => window.clearTimeout(timer);
  }, [
    activeTourStepDurationMs,
    activeTourSteps.length,
    showTourEnding,
    tourPlaying,
    tourStepIndex,
  ]);

  const activeTourStep =
    tourStepIndex === null ? undefined : activeTourSteps[tourStepIndex];
  const tourEnding =
    tourKind === "eclipse" ? ECLIPSE_STORY_ENDING : SCALE_TOUR_ENDING;
  const activeEclipseSurfaceObserver =
    tourKind === "eclipse" && activeTourStep?.surfaceObserver !== undefined;
  const activeCinematicShot =
    activeCinematicShotId === null
      ? undefined
      : CINEMATIC_SHOTS.find((shot) => shot.id === activeCinematicShotId);
  const activeCameraTargetBodyId =
    activeTourStep?.focusBodyId === focusBodyId
      ? activeTourStep.cameraTargetBodyId
      : activeCinematicShot?.focusBodyId === focusBodyId
        ? activeCinematicShot.cameraTargetBodyId
        : undefined;

  // A fresh worker initialised with the epoch state, so the clock returns to
  // the snapshot epoch at once instead of integrating back to it.
  const restartSimulation = useCallback((): void => {
    manualDeltaSecondsRef.current = 0;
    directSeekTimeSecondsRef.current = undefined;
    setSeeking(false);
    setPlaybackBuffered(false);
    setError(undefined);
    setClearTrailsToken((current) => current + 1);
    setSimulationRunToken((current) => current + 1);
  }, []);

  const presentCinematicShot = (shot: CinematicShot): void => {
    const requestedRateIndex = TIME_RATES.findIndex(
      (rate) => rate.secondsPerSecond === shot.timeRateSecondsPerSecond,
    );
    if (requestedRateIndex < 0) {
      throw new Error(`${shot.name} requests an unavailable playback rate`);
    }
    endTour();
    if (shot.loopEndTimeSeconds !== null) {
      restartSimulation();
    }
    setSurfaceObserverEnabled(false);
    setOrbitViewEnabled(false);
    setActiveCinematicShotId(shot.id);
    setDirection(1);
    setTimeRateIndex(requestedRateIndex);
    setPlaying(true);
    setViewMode(shot.viewMode);
    setBodyVisibilityPercent(shot.bodyVisibilityPercent);
    setShowLabels(shot.labels);
    setShowOrbitGuides(shot.orbitGuides);
    setShowPlanetTrails(shot.planetTrails);
    setShowTacticalOverlay(false);
    setShowEclipticPlane(false);
    setSelectedBodyPanelCollapsed(true);
    setCameraZoom(shot.cameraZoom);
    setCameraOrientation(shot.orientation);
    setOrientationPresetToken((current) => current + 1);
    focusHistoryRef.current.push(focusBodyIdRef.current);
    focusBodyIdRef.current = shot.focusBodyId;
    setFocusBodyId(shot.focusBodyId);
    setSelectedBodyId(shot.focusBodyId);
    setTourTransitionDurationMs(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : MANUAL_CAMERA_TRANSITION_DURATION_MS,
    );
    setResetViewToken((current) => current + 1);
    setTourTransitionSequence((current) => current + 1);
    setControlPanelOpen(false);
  };

  // The solver frame, not the displayed state: it changes in the same render
  // that a new run starts from the epoch, so a restart is never repeated on a
  // stale time.
  const activeShotTimeSeconds = frame?.end.timeSeconds;
  const activeShotLoopEndTimeSeconds =
    activeCinematicShot?.loopEndTimeSeconds ?? null;
  useEffect(() => {
    forwardPlaybackLimitSecondsRef.current =
      activeShotLoopEndTimeSeconds ?? undefined;
  }, [activeShotLoopEndTimeSeconds]);
  useEffect(() => {
    if (
      activeShotLoopEndTimeSeconds === null ||
      activeShotTimeSeconds === undefined ||
      // REBOUND finishes on the requested time with a last step of
      // (end - t), which can land a rounding error short of the loop end
      // where playback holds, so the restart allows one simulated second.
      activeShotTimeSeconds < activeShotLoopEndTimeSeconds - 1
    ) {
      return;
    }
    restartSimulation();
  }, [activeShotLoopEndTimeSeconds, activeShotTimeSeconds, restartSimulation]);

  useEffect(() => {
    if (activeTourStep === undefined || !audio.settings.narrationEnabled) {
      audio.clearNarration();
      return;
    }
    audio.loadNarration(activeTourStep.narration.audioSource, tourPlaying);
  }, [
    activeTourStep?.id,
    audio.clearNarration,
    audio.loadNarration,
    audio.settings.narrationEnabled,
  ]);

  useEffect(() => {
    audio.setNarrationPlaying(tourPlaying);
  }, [audio.setNarrationPlaying, tourPlaying]);

  const activeZoomPreset =
    CAMERA_ZOOM_PRESETS.find(
      (preset) => Math.abs(Math.log2(preset.zoom / viewMagnification)) < 0.01,
    )?.id ?? "custom";

  const setRequestedViewMagnification = (requested: number): void => {
    if (
      !Number.isFinite(requested) ||
      requested < 2 ** -32 ||
      requested > 128
    ) {
      throw new Error("View magnification must be between 2^-32x and 128x");
    }
    tourCameraMovedRef.current = true;
    setCameraZoom(requested);
    setViewMagnification(requested);
  };

  const selectedTimeRate = TIME_RATES[timeRateIndex];
  const playbackRateSliderIndex = USER_TIME_RATE_INDEXES.indexOf(
    timeRateIndex as (typeof USER_TIME_RATE_INDEXES)[number],
  );
  if (selectedTimeRate === undefined) {
    throw new Error("Selected simulation time rate is unavailable");
  }

  const focusedOrbitParameters = useMemo(
    () => orbitParametersForBody(state, focusBodyId),
    [focusBodyId, state],
  );
  const activeOrbitConfiguration = orbitViewEnabled ? orbitConfiguration : null;
  const orbitReadout = useMemo(() => {
    if (focusedOrbitParameters === undefined || orbitConfiguration === null) {
      return undefined;
    }
    if (orbitConfiguration.preset === "powered-hover") {
      return {
        kind: "hover" as const,
        accelerationMps2: poweredHoverAccelerationMps2(
          focusedOrbitParameters.gravitationalParameterM3S2,
          focusedOrbitParameters.radiusM,
          orbitConfiguration.altitudeM,
        ),
      };
    }
    const solution = circularOrbitSolution(
      focusedOrbitParameters.gravitationalParameterM3S2,
      focusedOrbitParameters.radiusM,
      orbitConfiguration.altitudeM,
    );
    return { kind: "orbit" as const, ...solution };
  }, [focusedOrbitParameters, orbitConfiguration]);

  const beginPhysicalOrbit = (bodyId = focusBodyId): void => {
    const bodyParameters = orbitParametersForBody(state, bodyId);
    if (bodyParameters === undefined) {
      setOrbitConfigurationError(
        "Physical orbit presets require a body with a known radius and gravitational parameter.",
      );
      return;
    }
    setOrbitConfigurationError(undefined);
    setOrbitConfiguration({
      ...defaultOrbitConfiguration(bodyParameters),
      epochTimeSeconds: state?.timeSeconds ?? 0,
    });
    setOrbitViewEnabled(true);
    setActiveCinematicShotId(null);
    setTourPlaying(false);
    setSurfaceObserverEnabled(false);
    setViewMode("reality");
    setCameraOrientation("custom");
  };

  const applyOrbitPreset = (preset: OrbitPreset): void => {
    if (focusedOrbitParameters === undefined) {
      setOrbitConfigurationError(
        "Physical orbit presets require a body with a known radius and gravitational parameter.",
      );
      return;
    }
    const current =
      orbitConfiguration ?? defaultOrbitConfiguration(focusedOrbitParameters);
    try {
      setOrbitConfiguration(
        orbitConfigurationForPreset(preset, focusedOrbitParameters, current),
      );
      setOrbitConfigurationError(undefined);
    } catch (presetError: unknown) {
      setOrbitConfigurationError(
        presetError instanceof Error
          ? presetError.message
          : "The requested orbit is unavailable.",
      );
    }
  };

  const selectedBodyDetail = useMemo(() => {
    if (selectedBodyId === "") {
      return undefined;
    }
    const bodyId = selectedBodyId;
    if (isApolloLandingSiteId(bodyId)) {
      const apolloSite = apolloLandingSiteById.get(bodyId);
      if (apolloSite === undefined) {
        throw new Error(`Apollo landing site ${bodyId} has no installed data`);
      }
      return {
        name: `${apolloSite.mission} · ${apolloSite.siteName}`,
        surface: `${apolloSite.lunarModule} descent stage and deployed equipment remain at the landing site`,
        parentName: "Moon",
        landingCoordinates: `${Math.abs(apolloSite.latitudeDeg).toFixed(5)}° ${apolloSite.latitudeDeg < 0 ? "S" : "N"} · ${Math.abs(apolloSite.longitudeDeg).toFixed(5)}° ${apolloSite.longitudeDeg < 0 ? "W" : "E"}`,
        mass: "Not represented as a gravitational source",
        composition: {
          summary:
            "Lunar Module descent stage, scientific instruments, tracks and human-made surface artefacts",
          authority: "NASA Apollo by the Numbers and LROC",
          sourceUrl: APOLLO_COORDINATES_SOURCE_URL,
        },
        ephemerisStatus:
          "Moon-fixed planetocentric coordinates derived from Lunar Reconnaissance Orbiter imagery",
      };
    }
    if (state === undefined) {
      return undefined;
    }
    const definition = majorBodySnapshot.bodies.find(
      (body) => body.id === bodyId,
    );
    const isJovianMonolith = bodyId === JOVIAN_MONOLITH_BODY_ID;
    const isDiscoveryOne = bodyId === DISCOVERY_ONE_BODY_ID;
    const isFictionalOrbiter = isFictionalOrbiterId(bodyId);
    const isDeepSpaceNineObject = isDeepSpaceNineObjectId(bodyId);
    const bodyState = isJovianMonolith
      ? jovianMonolithState(state)
      : isDiscoveryOne
        ? discoveryOneState(state)
        : isFictionalOrbiter
          ? fictionalOrbiterStateById(state, bodyId)
          : isDeepSpaceNineObject
            ? deepSpaceNineObjectStateById(state, bodyId)
            : state.bodies.find((body) => body.id === bodyId);
    const knownSatellite = knownSatelliteById.get(bodyId);
    const isIss = bodyId === ISS_BODY_ID;
    const voyager = voyagerById.get(
      isVoyagerBodyId(bodyId) ? bodyId : "voyager-1",
    );
    const isVoyager = isVoyagerBodyId(bodyId);
    const operationalSpacecraft = operationalSpacecraftSnapshot.spacecraft.find(
      (spacecraft) => spacecraft.id === bodyId,
    );
    const isOperationalSpacecraft = isOperationalSpacecraftBodyId(bodyId);
    if (
      bodyState === undefined ||
      (definition === undefined &&
        knownSatellite === undefined &&
        !isIss &&
        !isVoyager &&
        !isOperationalSpacecraft &&
        !isJovianMonolith &&
        !isDiscoveryOne &&
        !isFictionalOrbiter &&
        !isDeepSpaceNineObject)
    ) {
      return undefined;
    }
    const parentId = isJovianMonolith
      ? JOVIAN_MONOLITH_PRIMARY_BODY_ID
      : isDiscoveryOne
        ? DISCOVERY_ONE_PARENT_BODY_ID
        : isFictionalOrbiter
          ? fictionalOrbiterById.get(bodyId)?.parentBodyId
          : isDeepSpaceNineObject
            ? deepSpaceNineParentBodyId(bodyId)
            : definition === undefined
              ? isIss
                ? ISS_PARENT_BODY_ID
                : isVoyager
                  ? "sun"
                  : (PARENT_BODY_ID[bodyId] ?? knownSatellite?.parentId)
              : PARENT_BODY_ID[bodyId];
    const parentState = state.bodies.find((body) => body.id === parentId);
    const parentDefinition = majorBodySnapshot.bodies.find(
      (body) => body.id === parentId,
    );
    const composition = BODY_COMPOSITION_BY_ID[bodyId];
    const speedLabel =
      parentDefinition === undefined
        ? undefined
        : `Speed relative to ${parentPhrase(parentDefinition)}`;
    if (isJovianMonolith) {
      return {
        name: JOVIAN_MONOLITH_NAME,
        surface:
          "Fictional black rectangular object from 2001 / 2010 · physical scale",
        parentName: parentDefinition?.name,
        distanceRows:
          parentState === undefined
            ? undefined
            : plainDistanceRows(
                "Distance from Jupiter",
                bodyDistanceM(bodyState, parentState),
              ),
        speed:
          parentState === undefined
            ? undefined
            : bodyRelativeSpeedMps(bodyState, parentState) / 1_000,
        speedLabel,
        mass: "Unknown · fictional",
        composition: {
          summary:
            "Unknown fictional material; the story does not provide a physical composition",
          authority: "NASA History Office - 2001: A Space Odyssey",
          sourceUrl:
            "https://www.nasa.gov/history/50-years-ago-1968-welcomed-2001/",
        },
        dimensionsM: `${JOVIAN_MONOLITH_DIMENSIONS_M.thickness.toFixed(1)} × ${JOVIAN_MONOLITH_DIMENSIONS_M.width.toFixed(1)} × ${JOVIAN_MONOLITH_DIMENSIONS_M.length.toLocaleString("en-GB")} m · 1:4:9`,
        ephemerisStatus:
          "Display-only at the approximate live Jupiter-Io L1 point · excluded from gravity",
      };
    }
    if (isDiscoveryOne) {
      const asset = fictionalModelAssetByBodyId.get(DISCOVERY_ONE_BODY_ID);
      if (asset === undefined) {
        throw new Error("Discovery One licensed model metadata is unavailable");
      }
      return {
        name: DISCOVERY_ONE_NAME,
        surface: `${asset.credit} · physical scale`,
        parentName: parentDefinition?.name,
        distanceRows:
          parentState === undefined
            ? undefined
            : plainDistanceRows(
                "Distance from Io",
                bodyDistanceM(bodyState, parentState),
              ),
        speed:
          parentState === undefined
            ? undefined
            : bodyRelativeSpeedMps(bodyState, parentState) / 1_000,
        speedLabel: "Speed relative to Io",
        mass: "Fictional · excluded from gravity",
        composition: {
          summary:
            "Fictional crewed spacecraft with command sphere, long truss spine and nuclear propulsion module",
          authority: "AFI Catalog story reference and CC model attribution",
          sourceUrl: asset.pageUrl,
        },
        dimensionsM: `${DISCOVERY_ONE_LENGTH_M.toFixed(1)} m long · ${DISCOVERY_ONE_MAXIMUM_DIAMETER_M.toFixed(1)} m maximum diameter`,
        ephemerisStatus: `Canonical location is orbit around Io; no precise elements were published, so this is an explicit ${String(DISCOVERY_ONE_ORBITAL_ALTITUDE_M / 1_000)} km circular two-body orbit`,
      };
    }
    if (isFictionalOrbiter) {
      const orbiter = fictionalOrbiterById.get(bodyId);
      if (orbiter === undefined) {
        throw new Error(`Fictional orbiter ${bodyId} is unavailable`);
      }
      const licensedAsset = fictionalModelAssetByBodyId.get(bodyId);
      return {
        name: orbiter.name,
        surface:
          licensedAsset !== undefined
            ? `${licensedAsset.credit} · physical scale`
            : orbiter.constructionState === "complete"
              ? "Original high-detail complete battle-station visualization · physical scale"
              : "Original high-detail incomplete battle-station visualization with layered exposed construction · physical scale",
        parentName: parentDefinition?.name,
        distanceRows:
          parentState === undefined
            ? undefined
            : plainDistanceRows(
                `Distance from ${parentDefinition?.name ?? orbiter.parentBodyId}`,
                bodyDistanceM(bodyState, parentState),
              ),
        speed:
          parentState === undefined
            ? undefined
            : bodyRelativeSpeedMps(bodyState, parentState) / 1_000,
        speedLabel,
        mass: "Fictional · treated as a massless visualization",
        composition: {
          summary:
            "Fictional armoured space station; no real mass or material properties are assigned",
          authority:
            licensedAsset === undefined
              ? "Star Wars Databank"
              : "Star Wars Databank and CC model attribution",
          sourceUrl: licensedAsset?.pageUrl ?? orbiter.sourceUrl,
        },
        dimensionsM: `${(orbiter.diameterM / 1_000).toLocaleString("en-GB")} km diameter`,
        ephemerisStatus:
          "Hypothetical live circular two-body orbit using the moon's gravity · excluded from Solar System gravity",
      };
    }
    if (isDeepSpaceNineObject) {
      const asset = fictionalModelAssetByBodyId.get(bodyId);
      if (asset === undefined) {
        throw new Error(`${bodyId} licensed model metadata is unavailable`);
      }
      const isStation = bodyId === DEEP_SPACE_NINE_BODY_ID;
      const displayParentState = isStation
        ? parentState
        : deepSpaceNineObjectStateById(state, DEEP_SPACE_NINE_BODY_ID);
      return {
        name: isStation ? DEEP_SPACE_NINE_NAME : USS_DEFIANT_NAME,
        surface: `${asset.credit} · physical scale`,
        parentName: isStation ? parentDefinition?.name : DEEP_SPACE_NINE_NAME,
        distanceRows:
          displayParentState === undefined
            ? undefined
            : plainDistanceRows(
                isStation
                  ? "Distance from Callisto"
                  : "Distance from Deep Space Nine",
                bodyDistanceM(bodyState, displayParentState),
              ),
        speed:
          displayParentState === undefined
            ? undefined
            : bodyRelativeSpeedMps(bodyState, displayParentState) / 1_000,
        speedLabel: isStation
          ? "Speed relative to Callisto"
          : "Patrol speed relative to Deep Space Nine",
        mass: "Fictional · treated as a massless visualization",
        composition: {
          summary: isStation
            ? "Fictional Cardassian-built orbital station with docking rings and pylons"
            : "Fictional Starfleet escort spacecraft with a compact armoured hull",
          authority: isStation
            ? "Star Trek reference and CC model attribution"
            : "StarTrek.com and free model attribution",
          sourceUrl: isStation
            ? DEEP_SPACE_NINE_SOURCE_URL
            : USS_DEFIANT_SOURCE_URL,
        },
        dimensionsM: isStation
          ? `${DEEP_SPACE_NINE_DIAMETER_M.toLocaleString("en-GB")} m diameter`
          : `${USS_DEFIANT_LENGTH_M.toFixed(2)} m long`,
        ephemerisStatus: isStation
          ? `Hypothetical ${String(DEEP_SPACE_NINE_ORBITAL_ALTITUDE_M / 1_000)} km circular two-body orbit around Callisto · excluded from Solar System gravity`
          : `Explicit fictional ${String(USS_DEFIANT_PATROL_RADIUS_M / 1_000)} km defensive patrol with a ${String(USS_DEFIANT_PATROL_PERIOD_SECONDS / 60)} minute period · no invented station gravity`,
      };
    }
    if (definition === undefined) {
      if (isOperationalSpacecraft) {
        if (operationalSpacecraft === undefined) {
          throw new Error(`Operational spacecraft ${bodyId} is unavailable`);
        }
        return {
          name: operationalSpacecraft.name,
          surface:
            bodyId === "roadster"
              ? "Detailed MIT-licensed Roadster and Starman model · Horizons tracks the complete attached payload stack"
              : "Official NASA 3D model · physical scale",
          parentName: parentDefinition?.name,
          distanceRows:
            parentState === undefined || parentDefinition === undefined
              ? undefined
              : spacecraftDistanceRows(
                  bodyId,
                  parentDefinition,
                  bodyDistanceM(bodyState, parentState),
                ),
          speed:
            parentState === undefined
              ? undefined
              : bodyRelativeSpeedMps(bodyState, parentState) / 1_000,
          speedLabel,
          mass:
            bodyId === "roadster"
              ? `${formatMassKg(operationalSpacecraft.massKg)} Roadster only · complete attached stack mass is not installed`
              : formatMassKg(operationalSpacecraft.massKg),
          composition: BODY_COMPOSITION_BY_ID[bodyId],
          dimensionsM: `${String(operationalSpacecraft.maximumDimensionM)} m maximum dimension`,
          ephemerisStatus:
            bodyId === "roadster"
              ? "NASA/JPL Horizons solution 11 · 374 optical observations · includes measured solar-radiation-pressure acceleration · cubic Hermite interpolation through 2090"
              : "NASA/JPL Horizons trajectory · cubic Hermite interpolation within published coverage",
        };
      }
      if (isVoyager) {
        if (voyager === undefined) {
          throw new Error(`Voyager definition ${bodyId} is unavailable`);
        }
        return {
          name: voyager.name,
          surface: "Official NASA 3D model · physical scale",
          parentName: parentDefinition?.name,
          distanceRows:
            parentState === undefined
              ? undefined
              : sunDistanceRows(bodyId, bodyDistanceM(bodyState, parentState)),
          speed:
            parentState === undefined
              ? undefined
              : bodyRelativeSpeedMps(bodyState, parentState) / 1_000,
          speedLabel: "Speed relative to the Sun",
          mass: formatMassKg(voyager.massKg),
          composition: BODY_COMPOSITION_BY_ID[bodyId],
          dimensionsM: `${String(voyager.maximumDimensionM)} m span · ${String(voyager.highGainAntennaDiameterM)} m antenna`,
          ephemerisStatus:
            "JPL Horizons 2026 barycentric state · REBOUND massless test-particle propagation",
        };
      }
      if (isIss) {
        return {
          name: "International Space Station",
          surface: "Official NASA 3D model · physical scale · SGP4 trajectory",
          parentName: parentDefinition?.name,
          distanceRows:
            parentState === undefined
              ? undefined
              : plainDistanceRows(
                  "Geocentric distance",
                  bodyDistanceM(bodyState, parentState),
                ),
          altitudeKm:
            parentState === undefined || parentDefinition === undefined
              ? undefined
              : (bodyDistanceM(bodyState, parentState) -
                  parentDefinition.meanRadiusM) /
                1_000,
          speed:
            parentState === undefined
              ? undefined
              : bodyRelativeSpeedMps(bodyState, parentState) / 1_000,
          speedLabel,
          mass: formatMassKg(issSnapshot.physicalDimensions.massKg),
          composition,
          dimensionsM: `${String(issSnapshot.physicalDimensions.overallEndToEndM)} × ${String(issSnapshot.physicalDimensions.solarArrayLengthM)} m`,
          ephemerisStatus: isIssEphemerisWithinValidity(state.timeSeconds)
            ? "Within ±7 day OMM window"
            : "Hidden outside ±7 day OMM window",
        };
      }
      return {
        name: bodyDisplayName(bodyId),
        surface: "Neutral point - no installed surface asset",
        parentName: parentDefinition?.name,
        distanceRows:
          parentState === undefined || parentDefinition === undefined
            ? undefined
            : plainDistanceRows(
                `Distance from ${parentPhrase(parentDefinition)}`,
                bodyDistanceM(bodyState, parentState),
              ),
        speed:
          parentState === undefined
            ? undefined
            : bodyRelativeSpeedMps(bodyState, parentState) / 1_000,
        speedLabel,
        mass: formatMassKg(undefined),
        composition,
      };
    }
    const surfaceClassification =
      nasaTextureByBodyId.get(definition.id)?.classification ??
      nasaMaterialPresentationByBodyId.get(definition.id)?.classification;
    const diameterKm = (definition.meanRadiusM * 2) / 1_000;
    const liveOrbitalPeriodSeconds =
      parentState === undefined
        ? undefined
        : osculatingOrbitalPeriodSeconds(bodyState, parentState);
    const sourcedOrbitalPeriod = SIDEREAL_ORBITAL_PERIOD_BY_ID[definition.id];
    const distanceRows =
      parentState === undefined || parentDefinition === undefined
        ? undefined
        : majorBodyDistanceRows(
            definition,
            parentDefinition,
            bodyDistanceM(bodyState, parentState),
          );
    return {
      name: definition.name,
      size: formatBodySize(
        definition.id,
        definition.meanRadiusM,
        EARTH_MEAN_RADIUS_M,
      ),
      orbitLabel:
        parentDefinition === undefined
          ? undefined
          : `One trip around ${parentPhrase(parentDefinition)}`,
      orbitalPeriod: formatSourcedOrbitalPeriod(definition.id),
      orbitalPeriodSource:
        sourcedOrbitalPeriod === undefined
          ? undefined
          : `Sidereal orbital period · ${sourcedOrbitalPeriod.authority}`,
      liveOrbitalPeriod:
        liveOrbitalPeriodSeconds === undefined
          ? undefined
          : formatLiveOrbitalPeriod(liveOrbitalPeriodSeconds),
      spinNote: planetSpinNote(definition),
      surface:
        definition.type === "star"
          ? SUN_SURFACE_WORDING
          : (PLAIN_SURFACE_BY_BODY_ID[definition.id] ?? "Plain colour"),
      surfaceTechnical:
        definition.type === "star"
          ? SUN_SURFACE_TECHNICAL
          : (surfaceClassification ??
            "Neutral - no installed authoritative surface asset"),
      diameterKm,
      parentName: parentDefinition?.name,
      distanceRows,
      speed:
        parentState === undefined
          ? undefined
          : bodyRelativeSpeedMps(bodyState, parentState) / 1_000,
      speedLabel,
      mass: formatMassKg(definition.massKg),
      composition,
      rotationHours: siderealRotationPeriodHours(definition),
      primeMeridianDeg: normalizedDegrees(
        bodyOrientationAngles(definition.id, state.timeSeconds)
          .primeMeridianDeg,
      ),
    };
  }, [selectedBodyId, state]);

  const selectedApolloSite = isApolloLandingSiteId(selectedBodyId)
    ? apolloLandingSiteById.get(selectedBodyId)
    : undefined;

  // A looping shot only runs forward from the epoch: going backward ends it.
  const startPlaying = (nextDirection: -1 | 1): void => {
    if (nextDirection === -1) {
      setActiveCinematicShotId(null);
    }
    setDirection(nextDirection);
    setPlaying(true);
  };

  const queueStep = (stepDirection: -1 | 1): void => {
    if (stepDirection === -1) {
      setActiveCinematicShotId(null);
    }
    setPlaying(false);
    manualDeltaSecondsRef.current +=
      stepDirection * selectedTimeRate.secondsPerSecond;
    setSeeking(true);
  };

  const setCategoryVisibility = (
    category: keyof ObjectVisibility,
    visible: boolean,
  ): void => {
    setObjectVisibility((current) => ({ ...current, [category]: visible }));
  };

  const focusedKnownSatellite = knownSatelliteById.get(focusBodyId);
  const focusedParentId =
    (focusBodyId === ISS_BODY_ID ? ISS_PARENT_BODY_ID : undefined) ??
    (focusBodyId === JOVIAN_MONOLITH_BODY_ID
      ? JOVIAN_MONOLITH_PRIMARY_BODY_ID
      : undefined) ??
    (focusBodyId === DISCOVERY_ONE_BODY_ID
      ? DISCOVERY_ONE_PARENT_BODY_ID
      : undefined) ??
    (isFictionalOrbiterId(focusBodyId)
      ? fictionalOrbiterById.get(focusBodyId)?.parentBodyId
      : undefined) ??
    (isDeepSpaceNineObjectId(focusBodyId)
      ? deepSpaceNineParentBodyId(focusBodyId)
      : undefined) ??
    focusedKnownSatellite?.parentId ??
    PARENT_BODY_ID[focusBodyId];
  const focusedParentName =
    focusedParentId === undefined
      ? undefined
      : bodyDisplayName(focusedParentId);
  const outsideValidatedWindow =
    Math.abs(state?.timeSeconds ?? 0) > VALIDATED_WINDOW_SECONDS;

  return (
    <main
      ref={appShellRef}
      className={`app-shell${immersiveMode ? " is-immersive" : ""}${tourKind === "eclipse" ? " is-eclipse-story" : ""}`}
      data-immersive-mode={String(immersiveMode)}
      data-display-panel-open={String(controlPanelOpen)}
      data-view-mode={viewMode}
      data-audio-state={audio.status}
      data-narration-state={audio.narrationStatus}
      data-tour-presentation={activeTourStep?.presentation}
      onClickCapture={(event) => {
        const target = event.target;
        // A hidden-surprise label is an unfound easter egg: its discovery
        // chime replaces the button sound. A size-duel guess plays its own.
        if (
          target instanceof Element &&
          target.closest("button:not(:disabled), summary") !== null &&
          target.closest(".is-hidden-surprise, .size-duel-choice") === null
        ) {
          audio.interact("button");
        }
      }}
      onChangeCapture={(event) => {
        const target = event.target;
        if (
          target instanceof HTMLSelectElement ||
          (target instanceof HTMLInputElement &&
            (target.type === "checkbox" || target.type === "radio"))
        ) {
          audio.interact("option");
        }
      }}
      onPointerUpCapture={(event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement && target.type === "range") {
          audio.interact("slider");
        }
      }}
      onKeyUpCapture={(event) => {
        const target = event.target;
        if (
          target instanceof HTMLInputElement &&
          target.type === "range" &&
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
            event.key,
          )
        ) {
          audio.interact("slider");
        }
      }}
    >
      <header className="command-bar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true" />
          <h1>Solar System Explorer</h1>
        </div>
        <nav className="view-switcher" aria-label="View mode">
          {VIEW_MODE_OPTIONS.map(({ mode, label, description }) => {
            const tooltipId = `view-mode-${mode}-tooltip`;
            return (
              <div className="view-mode-option" key={mode}>
                <button
                  type="button"
                  aria-pressed={viewMode === mode}
                  aria-describedby={tooltipId}
                  onClick={() => {
                    setActiveCinematicShotId(null);
                    endTour();
                    setSurfaceObserverEnabled(false);
                    if (mode === "schematic") {
                      setOrbitViewEnabled(false);
                    }
                    setViewMode(mode);
                  }}
                >
                  {label}
                </button>
                <span
                  id={tooltipId}
                  className="view-mode-tooltip"
                  role="tooltip"
                >
                  {description}
                </span>
              </div>
            );
          })}
        </nav>
        <FocusSelect
          value={focusBodyId}
          foundEasterEggIds={foundEasterEggIds}
          onSelect={(bodyId) => {
            setSurfaceObserverEnabled(false);
            navigateToFocus(bodyId);
          }}
        />
        <div className="command-actions">
          <button type="button" onClick={requestResetView}>
            Reset
          </button>
          <button
            ref={fullscreenButtonRef}
            type="button"
            className="fullscreen-button"
            aria-pressed={immersiveMode}
            onClick={enterImmersiveMode}
          >
            Full screen
          </button>
          <button
            ref={displayButtonRef}
            type="button"
            className="display-button"
            aria-expanded={controlPanelOpen}
            aria-controls="display-panel"
            onClick={() => setControlPanelOpen((open) => !open)}
          >
            Display
          </button>
        </div>
      </header>

      {immersiveMode ? (
        <button
          ref={immersiveExitButtonRef}
          type="button"
          className="immersive-exit-button"
          onClick={exitImmersiveMode}
        >
          Exit full screen
        </button>
      ) : null}

      <section
        className="workspace"
        style={
          navigationMapBottomPx === null
            ? undefined
            : ({
                "--navigation-map-bottom": `${String(navigationMapBottomPx)}px`,
              } as CSSProperties)
        }
      >
        {fullscreenError === undefined ? null : (
          <p className="fullscreen-error error" role="alert">
            {fullscreenError}
          </p>
        )}
        <nav className="focus-breadcrumb" aria-label="Current focus">
          <button type="button" onClick={navigateHome}>
            Solar System
          </button>
          {focusedParentId === undefined ||
          focusedParentName === undefined ? null : (
            <>
              <span aria-hidden="true">/</span>
              <button
                type="button"
                aria-label={`Go to ${focusedParentName}`}
                onClick={() => navigateToFocus(focusedParentId)}
              >
                {focusedParentName}
              </button>
            </>
          )}
          {focusBodyId === "" ? null : (
            <>
              <span aria-hidden="true">/</span>
              <strong>{bodyDisplayName(focusBodyId)}</strong>
            </>
          )}
        </nav>

        <div className="status-cluster">
          <span className={playing ? "status-dot is-active" : "status-dot"} />
          <span>
            {playing ? (direction > 0 ? "Forward" : "Reverse") : "Paused"}
          </span>
          <span aria-hidden="true">·</span>
          <span
            className={
              gpuError === undefined ? "gpu-status" : "gpu-status error"
            }
          >
            {viewMode === "reality"
              ? "Physical scale"
              : gpuStatus !== undefined
                ? `${gpuStatus.integrableObjects.toLocaleString()} propagated · ${gpuStatus.unavailableObjects.toLocaleString()} unavailable`
                : gpuError !== undefined
                  ? "GPU error"
                  : objectVisibility.asteroids || objectVisibility.comets
                    ? "GPU loading"
                    : "Major bodies"}
          </span>
        </div>

        {/* The discovery toast takes the caption's place while it shows. */}
        {activeCinematicShot === undefined ||
        !playing ||
        discoveredEasterEggId !== null ? null : (
          <p className="cinematic-shot-caption" role="status">
            <strong>{activeCinematicShot.name}</strong>
            <span>{activeCinematicShot.description}</span>
          </p>
        )}

        <time
          className="global-simulation-clock"
          dateTime={simulationDateUtc(state?.timeSeconds ?? 0)
            .toISOString()
            .replace(/\.\d{3}Z$/u, "Z")}
          data-time-seconds={(state?.timeSeconds ?? 0).toFixed(0)}
        >
          {formatSimulationDateUtc(state?.timeSeconds ?? 0)}
        </time>

        {error !== undefined ? (
          <p className="error" role="alert">
            Simulation stopped: {error}{" "}
            <button type="button" onClick={restartSimulation}>
              Restart simulation
            </button>
          </p>
        ) : viewMode === "schematic" ? (
          <SchematicSystemMap
            state={state}
            focusBodyId={focusBodyId}
            objectVisibility={objectVisibility}
            onFocusBody={navigateToFocus}
          />
        ) : (
          <Suspense fallback={<p className="loading">Loading view...</p>}>
            <SolarSystemScene
              frame={frame}
              displayedStateRef={displayedStateRef}
              bodyVisibility={
                viewMode === "reality" ? 0 : bodyVisibilityPercent / 100
              }
              focusBodyId={focusBodyId === "" ? null : focusBodyId}
              selectedBodyId={selectedBodyId === "" ? null : selectedBodyId}
              apolloInspectionSiteId={apolloInspectionSiteId}
              showMoonTrail={showMoonTrail}
              showPlanetTrails={showPlanetTrails}
              showMinorBodyTrails={showMinorBodyTrails}
              referenceFrame={referenceFrame}
              trailDurationSeconds={trailDurationDays * DAY_SECONDS}
              trailFade={trailFadePercent / 100}
              clearTrailsToken={clearTrailsToken}
              showEclipticPlane={showEclipticPlane}
              showZodiac={showZodiac}
              showLabels={showLabels}
              announceFlights={activeTourStep === undefined}
              showApolloSites={showApolloSites}
              spacecraftLabelBodyIds={
                activeTourStep === undefined
                  ? undefined
                  : (activeTourStep.spacecraftLabelBodyIds ?? [])
              }
              showTacticalOverlay={showTacticalOverlay}
              showOrbitGuides={showOrbitGuides}
              wayfinderMode={
                activeEclipseSurfaceObserver ? "off" : wayfinderMode
              }
              orbitGuideScope={
                activeTourStep?.overlays.orbitGuideScope ?? "all"
              }
              gravityWellMode={gravityWellMode}
              gravityWellScale={gravityWellScale}
              resetViewToken={resetViewToken}
              cameraZoom={cameraZoom}
              cameraDistanceOverrideAu={
                typeof activeTourStep?.cameraDistanceAu === "number"
                  ? activeTourStep.cameraDistanceAu
                  : activeCinematicShot?.cameraDistanceAu
              }
              fitCameraDistanceToPortrait={
                typeof activeTourStep?.cameraDistanceAu !== "number" &&
                activeCinematicShot !== undefined
              }
              cameraTargetBodyId={activeCameraTargetBodyId}
              observerCameraStyle={
                tourKind === "eclipse"
                  ? ((activeTourStep as EclipseStoryStep | undefined)
                      ?.observerCameraStyle ?? "surface-facing")
                  : "surface-facing"
              }
              cameraTransitionSequence={tourTransitionSequence}
              cameraTransitionDurationMs={tourTransitionDurationMs}
              cameraNavigationCommand={cameraNavigationCommand}
              orbitViewEnabled={orbitViewEnabled}
              orbitConfiguration={activeOrbitConfiguration}
              orientationPreset={cameraOrientation}
              orientationPresetToken={orientationPresetToken}
              viewMode={viewMode}
              objectVisibility={objectVisibility}
              surfaceObserver={surfaceObserverConfiguration}
              surfaceObserverLookResetToken={surfaceObserverLookResetToken}
              visualQuality={visualQuality}
              exposureMode={exposureMode}
              manualExposureEv={manualExposureEv}
              deepSpacePresentation={activeTourStep?.presentation}
              eclipseShadowVisible={activeTourStep?.id === "shadow-from-moon"}
              foundEasterEggIds={foundEasterEggIds}
              onSelectBody={handleSceneBodySelection}
              onPickBody={handleSceneBodyPick}
              onFocusBody={handleSceneFocusBody}
              onNavigationMapBottomChange={setNavigationMapBottomPx}
              onOrientationChange={handleSceneOrientationChange}
              onOrbitViewChange={handleOrbitViewChange}
              onSemanticZoomChange={setSemanticZoom}
              onViewZoomChange={setViewMagnification}
              onCameraTransitionSettled={setSettledCameraTransitionSequence}
              onGpuStatus={setGpuStatus}
              onGpuError={setGpuError}
              onExposureStatusChange={setExposureStatus}
            />
          </Suspense>
        )}

        <nav className="camera-dock" aria-label="Camera navigation">
          <span className="camera-scale" aria-live="polite">
            <small>View scale</small>
            <strong>{SEMANTIC_ZOOM_LABELS[semanticZoom]}</strong>
          </span>
          <div className="camera-dock-actions">
            <button
              type="button"
              onClick={navigateBack}
              disabled={focusHistoryRef.current.length === 0}
            >
              Back
            </button>
            <button
              type="button"
              aria-label="Zoom out"
              title="Zoom out"
              disabled={viewMode === "schematic" || surfaceObserverEnabled}
              onClick={() => handleCameraNavigation("zoom-out")}
            >
              −
            </button>
            <button
              type="button"
              aria-label="Zoom in"
              title="Zoom in"
              disabled={viewMode === "schematic" || surfaceObserverEnabled}
              onClick={() => handleCameraNavigation("zoom-in")}
            >
              +
            </button>
            <button
              type="button"
              disabled={viewMode === "schematic" || surfaceObserverEnabled}
              title="Restore the selected focus to its default framing"
              onClick={recenterView}
            >
              Re-centre
            </button>
            <button type="button" onClick={navigateHome}>
              Home
            </button>
            <button
              type="button"
              className="tour-launch-button"
              onClick={startScaleTour}
            >
              Scale tour
            </button>
            <button
              type="button"
              className="eclipse-story-launch-button"
              onClick={startEclipseStory}
            >
              Eclipse story
            </button>
            <button
              type="button"
              className="planets-racing-launch-button"
              aria-pressed={activeCinematicShotId === PLANETS_RACING_SHOT.id}
              onClick={() => presentCinematicShot(PLANETS_RACING_SHOT)}
            >
              Planets racing
            </button>
          </div>
        </nav>

        <p className="visually-hidden" aria-live="polite">
          {selectedBodyDetail === undefined ||
          activeTourStep !== undefined ||
          surfaceObserverEnabled ||
          selectedBodyId !== announcedPickId ||
          selectedBodyId === focusBodyId ||
          selectedBodyId === apolloInspectionSiteId
            ? null
            : `${selectedBodyDetail.name} selected. Select again to fly there.`}
        </p>

        <p className="discovery-toast" role="status">
          {discoveredEasterEggId === null ? null : (
            <>
              {discoveryMessage(discoveredEasterEggId)}
              <span className="discovery-toast-progress">
                {discoveryProgress(foundEasterEggIds)}
              </span>
            </>
          )}
        </p>

        {surfaceObservation === undefined || tourKind === "eclipse" ? null : (
          <aside
            className="surface-observer-hud"
            aria-label="Surface observer measurements"
            data-surface-observer-body={surfaceObserverBodyId}
            data-surface-observer-target={surfaceObserverTargetBodyId}
          >
            <div className="surface-observer-heading">
              <div>
                <span>Surface observer</span>
                <strong>
                  {surfaceObservation.observerName} ·{" "}
                  {surfaceObserverLatitudeDeg.toFixed(4)}°,{" "}
                  {surfaceObserverLongitudeDeg.toFixed(4)}° E
                </strong>
              </div>
              <button type="button" onClick={exitSurfaceObserver}>
                Exit
              </button>
            </div>
            <label className="surface-target-control">
              Look at
              <select
                value={surfaceObserverTargetBodyId}
                onChange={(event) =>
                  setSurfaceObserverTargetBodyId(event.currentTarget.value)
                }
              >
                {majorBodySnapshot.bodies
                  .filter((body) => body.id !== surfaceObserverBodyId)
                  .map((body) => (
                    <option key={body.id} value={body.id}>
                      {body.name}
                    </option>
                  ))}
              </select>
            </label>
            <button
              type="button"
              className="surface-centre-target"
              onClick={() =>
                setSurfaceObserverLookResetToken((current) => current + 1)
              }
            >
              Centre target
            </button>
            <div className="surface-compass" aria-label="Local compass">
              <span className="surface-compass-target" aria-hidden="true">
                <i
                  style={{
                    left: `${String(surfaceObservation.targetAzimuthDeg / 3.6)}%`,
                  }}
                />
              </span>
              <span>N</span>
              <span>E</span>
              <span>S</span>
              <span>W</span>
              <span>N</span>
            </div>
            <div className="surface-observer-metrics">
              <span>
                <small>{surfaceObservation.targetName} position</small>
                {surfaceObservation.targetAltitudeDeg.toFixed(2)}° altitude ·{" "}
                {surfaceObservation.targetAzimuthDeg.toFixed(2)}° azimuth
              </span>
              <span>
                <small>Apparent diameter</small>
                {formatAngularDiameter(
                  surfaceObservation.targetAngularDiameterDeg,
                )}
              </span>
              {surfaceObservation.targetIlluminatedFraction ===
              undefined ? null : (
                <span>
                  <small>Illuminated disc</small>
                  {(surfaceObservation.targetIlluminatedFraction * 100).toFixed(
                    1,
                  )}
                  %
                </span>
              )}
              <span>
                <small>North-pole position angle</small>
                {surfaceObservation.targetNorthPolePositionAngleDeg.toFixed(2)}°
              </span>
              {surfaceObservation.brightLimbPositionAngleDeg ===
              undefined ? null : (
                <span>
                  <small>Bright-limb position angle</small>
                  {surfaceObservation.brightLimbPositionAngleDeg.toFixed(2)}°
                </span>
              )}
              <span>
                <small>Local solar time</small>
                {formatLocalSolarTime(surfaceObservation.localSolarTimeHours)}
              </span>
              <span>
                <small>Sun</small>
                {surfaceObservation.sunAltitudeDeg.toFixed(2)}° altitude ·{" "}
                {formatAngularDiameter(
                  surfaceObservation.sunAngularDiameterDeg,
                )}
              </span>
              <span>
                <small>Sunrise and sunset</small>
                {surfaceObservation.solarHorizonEvents.regime === "normal"
                  ? `${formatLocalSolarTime(
                      surfaceObservation.solarHorizonEvents
                        .sunriseLocalSolarHours,
                    )} / ${formatLocalSolarTime(
                      surfaceObservation.solarHorizonEvents
                        .sunsetLocalSolarHours,
                    )} local solar time`
                  : surfaceObservation.solarHorizonEvents.regime === "polar-day"
                    ? "Sun remains above the geometric horizon"
                    : "Sun remains below the geometric horizon"}
              </span>
              <span>
                <small>Geometric horizon</small>
                {surfaceObservation.targetAltitudeDeg >= 0
                  ? `${surfaceObservation.targetName} is above it`
                  : `${surfaceObservation.targetName} is below it`}
                {" · "}
                {(surfaceObservation.geometricHorizonDistanceM / 1_000).toFixed(
                  2,
                )}{" "}
                km away
              </span>
            </div>
            <small className="surface-observer-disclosure">
              Mean-radius reference sphere · 2 m eye height · geometric horizon
              · no terrain, atmosphere or refraction
            </small>
          </aside>
        )}

        {activeTourStep === undefined || tourStepIndex === null ? null : (
          <aside
            ref={tourPanelRef}
            className={tourMinimised ? "scale-tour is-minimised" : "scale-tour"}
            role="dialog"
            aria-modal="false"
            aria-label={
              tourKind === "eclipse"
                ? "12 August 2026 eclipse story"
                : "Scale of the Solar System tour"
            }
            data-tour-kind={tourKind ?? "scale"}
            data-tour-step={activeTourStep.id}
            data-tour-playing={String(tourPlaying)}
            data-tour-ended={String(tourEnded)}
            data-tour-minimised={String(tourMinimised)}
            data-tour-narration-state={audio.narrationStatus}
            data-tour-observer={
              activeTourStep.cameraTargetBodyId === undefined
                ? "none"
                : activeTourStep.focusBodyId
            }
            data-tour-target={
              activeTourStep.cameraTargetBodyId ?? activeTourStep.focusBodyId
            }
            data-tour-time-rate-seconds-per-second={String(
              activeTourStep.timeRateSecondsPerSecond,
            )}
            data-tour-time-seconds={
              activeTourStep.timeSeconds !== undefined
                ? activeTourStep.timeSeconds.toFixed(3)
                : "live"
            }
          >
            <div className="tour-progress-heading">
              <span>
                {tourKind === "eclipse" ? "Eclipse story" : "Scale tour"}{" "}
                {tourStepIndex + 1} of {activeTourSteps.length}
              </span>
              <div className="tour-heading-actions">
                <button
                  type="button"
                  aria-expanded={!tourMinimised}
                  onClick={() => setTourMinimised((current) => !current)}
                >
                  {tourMinimised ? "Restore" : "Minimise"}
                </button>
                <button type="button" onClick={exitTour}>
                  Exit
                </button>
              </div>
            </div>
            <div className="tour-progress" aria-hidden="true">
              <span
                key={`${activeTourStep.id}-${String(tourPlaying)}`}
                className={
                  tourEnded
                    ? "is-complete"
                    : tourPlaying
                      ? "is-playing"
                      : undefined
                }
                style={{
                  animationDuration: `${String(activeTourStepDurationMs)}ms`,
                }}
              />
            </div>
            <div className="tour-copy" aria-live="polite">
              {tourEnded ? (
                <>
                  <span>{tourEnding.eyebrow}</span>
                  <h2>{tourEnding.title}</h2>
                  <p className="tour-kid-line">{tourEnding.kidLine}</p>
                  {"safety" in tourEnding ? (
                    <p className="tour-ending-safety">{tourEnding.safety}</p>
                  ) : null}
                </>
              ) : (
                <>
                  <span>{activeTourStep.eyebrow}</span>
                  <h2>{activeTourStep.title}</h2>
                  <p className="tour-kid-line">{activeTourStep.kidLine}</p>
                  <strong>{activeTourStep.scale}</strong>
                  <p>{activeTourStep.description}</p>
                  {activeTourStep.timeUtc !== undefined ? (
                    <time dateTime={activeTourStep.timeUtc}>
                      12 August 2026 · exact model time
                    </time>
                  ) : null}
                  {tourKind === "eclipse" &&
                  surfaceObservation?.solarEclipse !== undefined ? (
                    <div
                      className="eclipse-live-metrics"
                      aria-label="Live eclipse geometry"
                    >
                      <span>
                        <small>Sun altitude</small>
                        {surfaceObservation.sunAltitudeDeg.toFixed(2)}°
                      </span>
                      <span>
                        <small>Disc separation</small>
                        {surfaceObservation.solarEclipse.centerSeparationDeg.toFixed(
                          3,
                        )}
                        °
                      </span>
                      <span>
                        <small>Sun hidden</small>
                        {(
                          surfaceObservation.solarEclipse.obscurationFraction *
                          100
                        ).toFixed(1)}
                        %
                      </span>
                    </div>
                  ) : null}
                  <small className="tour-motion">
                    Motion · {activeTourStep.timeRateLabel}
                  </small>
                  <small className="tour-visual-key">
                    {activeTourStep.visualKey}
                    {tourKind === "eclipse" ? (
                      <>
                        {" · "}
                        <a
                          href={
                            activeTourStep.id === "spain-totality"
                              ? ECLIPSE_PATH_SOURCE_URL
                              : ECLIPSE_SOURCE_URL
                          }
                          target="_blank"
                          rel="noreferrer"
                        >
                          NASA data
                        </a>
                      </>
                    ) : null}
                  </small>
                </>
              )}
            </div>
            {tourEnded ? (
              <div className="tour-actions">
                <button
                  ref={tourFlyHomeRef}
                  type="button"
                  className="primary-action"
                  onClick={exitTour}
                >
                  Fly home
                </button>
                {tourKind === "eclipse" ? (
                  <>
                    <button type="button" onClick={startScaleTour}>
                      Take the Scale tour
                    </button>
                    <button type="button" onClick={startEclipseStory}>
                      Watch again
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={startEclipseStory}>
                      Watch the eclipse
                    </button>
                    <button type="button" onClick={startScaleTour}>
                      Start again
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="tour-actions">
                <button
                  type="button"
                  disabled={tourStepIndex === 0}
                  onClick={() => advanceScaleTour(-1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (tourPlaying) {
                      setTourPlaying(false);
                      return;
                    }
                    setTourPlaying(true);
                    // A new flight holds the clock for its whole length, so
                    // the step is presented again only after the child moved
                    // the camera away from it.
                    if (tourCameraMovedRef.current) {
                      setTourPresentationToken((current) => current + 1);
                    }
                  }}
                >
                  {tourPlaying
                    ? tourKind === "eclipse"
                      ? "Pause story"
                      : "Pause tour"
                    : tourKind === "eclipse"
                      ? "Resume story"
                      : "Resume tour"}
                </button>
                <button
                  type="button"
                  className="primary-action"
                  onClick={() => advanceScaleTour(1)}
                >
                  {tourStepIndex === activeTourSteps.length - 1
                    ? "Finish"
                    : "Next"}
                </button>
              </div>
            )}
          </aside>
        )}

        {sizeLineupOpen ? (
          <SizeLineup
            selectedBodyId={selectedBodyId}
            onSelectBody={(bodyId) => {
              setSurfaceObserverEnabled(false);
              navigateToFocus(bodyId);
            }}
            onGuess={(correct) =>
              audio.interact(correct ? "discovery" : "button")
            }
            onClose={() => setSizeLineupOpen(false)}
          />
        ) : null}

        {selectedBodyDetail === undefined ||
        activeTourStep !== undefined ||
        surfaceObserverEnabled ? null : (
          <aside
            className={
              selectedBodyPanelCollapsed
                ? "selected-body-detail is-collapsed"
                : "selected-body-detail"
            }
          >
            <div className="selected-body-heading">
              <div>
                <span>
                  {selectedApolloSite === undefined
                    ? "Selected body"
                    : "Apollo landing site"}
                </span>
                <strong>{selectedBodyDetail.name}</strong>
              </div>
              <div className="selected-body-actions">
                {selectedBodyPanelCollapsed ? null : (
                  <button
                    type="button"
                    className="primary-action"
                    onClick={() =>
                      selectedApolloSite === undefined
                        ? navigateToFocus(selectedBodyId)
                        : focusApolloLandingSite(selectedApolloSite.id)
                    }
                  >
                    {selectedApolloSite === undefined
                      ? "Focus"
                      : "Show on Moon"}
                  </button>
                )}
                {selectedBodyPanelCollapsed ? null : selectedApolloSite ===
                  undefined ? (
                  <>
                    <button
                      type="button"
                      disabled={
                        orbitParametersForBody(state, selectedBodyId) ===
                        undefined
                      }
                      aria-pressed={
                        orbitViewEnabled && focusBodyId === selectedBodyId
                      }
                      title="Enter a physics-derived circular orbit around this body"
                      onClick={() => {
                        if (
                          orbitViewEnabled &&
                          focusBodyId === selectedBodyId
                        ) {
                          setOrbitViewEnabled(false);
                          return;
                        }
                        navigateToFocus(selectedBodyId);
                        beginPhysicalOrbit(selectedBodyId);
                      }}
                    >
                      {orbitViewEnabled && focusBodyId === selectedBodyId
                        ? "Leave orbit"
                        : "Enter orbit"}
                    </button>
                    <button type="button" onClick={navigateToParent}>
                      Parent
                    </button>
                    <button type="button" onClick={navigateToNextObject}>
                      Next object
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      enterApolloLandingSiteObserver(selectedApolloSite.id)
                    }
                  >
                    Stand at site
                  </button>
                )}
                <button
                  type="button"
                  className="selected-body-collapse"
                  aria-expanded={!selectedBodyPanelCollapsed}
                  aria-label={
                    selectedBodyPanelCollapsed
                      ? "Expand selected body details"
                      : "Collapse selected body details"
                  }
                  title={
                    selectedBodyPanelCollapsed
                      ? "Expand details"
                      : "Collapse details"
                  }
                  onClick={() =>
                    setSelectedBodyPanelCollapsed((current) => !current)
                  }
                >
                  {selectedBodyPanelCollapsed ? "Expand" : "Collapse"}
                </button>
              </div>
            </div>
            {selectedBodyPanelCollapsed ||
            !showLabels ||
            !objectVisibility.spacecraft ||
            !hintsAtUnfoundEasterEgg(
              selectedBodyId,
              foundEasterEggIds,
            ) ? null : (
              <p className="selected-body-egg-hint">
                Something hidden is out there. Look closely!
              </p>
            )}
            {selectedBodyPanelCollapsed ? null : (
              <div className="selected-body-metrics">
                {selectedBodyDetail.size === undefined ? null : (
                  <span>
                    <small>Size</small>
                    {selectedBodyDetail.size}
                    {isInSizeLineup(selectedBodyId) ? (
                      <button
                        type="button"
                        className="compare-sizes-button"
                        aria-haspopup="dialog"
                        onClick={() => setSizeLineupOpen(true)}
                      >
                        Compare sizes
                      </button>
                    ) : null}
                  </span>
                )}
                {selectedBodyDetail.orbitLabel === undefined ||
                selectedBodyDetail.orbitalPeriod === undefined ? null : (
                  <span title={selectedBodyDetail.orbitalPeriodSource}>
                    <small>{selectedBodyDetail.orbitLabel}</small>
                    {selectedBodyDetail.orbitalPeriod}
                  </span>
                )}
                {selectedBodyDetail.rotationHours === undefined ? null : (
                  <span title="Sidereal rotation: one full turn measured against the stars">
                    <small>One spin</small>
                    {formatSpinPeriod(selectedBodyDetail.rotationHours)}
                    {selectedBodyDetail.spinNote === undefined
                      ? null
                      : `, ${selectedBodyDetail.spinNote}`}
                  </span>
                )}
                {selectedBodyDetail.landingCoordinates === undefined ? null : (
                  <span>
                    <small>LRO landing coordinates</small>
                    {selectedBodyDetail.landingCoordinates}
                  </span>
                )}
                {selectedBodyDetail.distanceRows === undefined ? null : (
                  <span>
                    <small>
                      {selectedBodyDetail.distanceRows.distance.label}
                    </small>
                    {selectedBodyDetail.distanceRows.distance.value}
                  </span>
                )}
                {selectedBodyDetail.distanceRows?.sunlight ===
                undefined ? null : (
                  <span>
                    <small>Sunlight</small>
                    {selectedBodyDetail.distanceRows.sunlight}
                  </span>
                )}
                {selectedBodyDetail.altitudeKm === undefined ? null : (
                  <span>
                    <small>Altitude</small>
                    {selectedBodyDetail.altitudeKm.toLocaleString("en-GB", {
                      maximumFractionDigits: 1,
                    })}{" "}
                    km
                  </span>
                )}
                {selectedBodyDetail.dimensionsM === undefined ? null : (
                  <span>
                    <small>Maximum footprint</small>
                    {selectedBodyDetail.dimensionsM}
                  </span>
                )}
                {selectedBodyDetail.ephemerisStatus === undefined ? null : (
                  <span>
                    <small>Orbit data</small>
                    {selectedBodyDetail.ephemerisStatus}
                  </span>
                )}
                <span>
                  <small>Mass</small>
                  {selectedBodyDetail.mass}
                </span>
                <span
                  className={
                    selectedBodyDetail.surfaceTechnical === undefined
                      ? "selected-body-surface"
                      : undefined
                  }
                  title={selectedBodyDetail.surfaceTechnical}
                >
                  <small>Surface</small>
                  {selectedBodyDetail.surface}
                </span>
                {selectedBodyDetail.speed === undefined ? null : (
                  <span className="selected-body-speed">
                    <small>
                      {selectedBodyDetail.speedLabel ?? "Relative speed"}
                    </small>
                    {formatSpeedWithJetComparison(selectedBodyDetail.speed)}
                  </span>
                )}
                <span className="selected-body-composition">
                  <small>
                    <span>Composition</span>
                    {selectedBodyDetail.composition === undefined ? null : (
                      <a
                        href={selectedBodyDetail.composition.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        title={`Source: ${selectedBodyDetail.composition.authority}`}
                      >
                        Source
                      </a>
                    )}
                  </small>
                  {selectedBodyDetail.composition?.summary ??
                    "Not provided by the installed authority snapshot"}
                </span>
                {selectedBodyDetail.distanceRows === undefined &&
                selectedBodyDetail.surfaceTechnical === undefined ? null : (
                  <details className="selected-body-more">
                    <summary>More detail</summary>
                    <div className="selected-body-more-grid">
                      {selectedBodyDetail.distanceRows === undefined ? null : (
                        <span>
                          <small>
                            {
                              selectedBodyDetail.distanceRows.exactDistance
                                .label
                            }
                          </small>
                          {selectedBodyDetail.distanceRows.exactDistance.value}
                        </span>
                      )}
                      {selectedBodyDetail.distanceRows?.distanceAu ===
                      undefined ? null : (
                        <span title="1 AU is Earth's average distance from the Sun: 149,597,870.7 km">
                          <small>Distance from the Sun in AU (live)</small>
                          {selectedBodyDetail.distanceRows.distanceAu}
                        </span>
                      )}
                      {selectedBodyDetail.surfaceTechnical ===
                      undefined ? null : (
                        <>
                          <span>
                            <small>Diameter</small>
                            {selectedBodyDetail.diameterKm.toLocaleString(
                              "en-GB",
                              { maximumFractionDigits: 0 },
                            )}{" "}
                            km
                          </span>
                          {selectedBodyDetail.liveOrbitalPeriod ===
                          undefined ? null : (
                            <span title="Two-body period from the simulated position and speed at this moment; it wobbles as other bodies pull">
                              <small>{"This moment's orbit (live)"}</small>
                              {selectedBodyDetail.liveOrbitalPeriod}
                            </span>
                          )}
                          <span>
                            <small>Sidereal rotation</small>
                            {selectedBodyDetail.rotationHours.toLocaleString(
                              "en-GB",
                              { maximumFractionDigits: 2 },
                            )}{" "}
                            h
                          </span>
                          <span>
                            <small>Rotation angle</small>
                            {selectedBodyDetail.primeMeridianDeg.toLocaleString(
                              "en-GB",
                              { maximumFractionDigits: 1 },
                            )}
                            °
                          </span>
                          <span>
                            <small>Surface map</small>
                            {selectedBodyDetail.surfaceTechnical}
                          </span>
                        </>
                      )}
                    </div>
                  </details>
                )}
                {selectedApolloSite === undefined ? null : (
                  <span className="apollo-mission-detail">
                    <small>Mission record</small>
                    <strong>
                      Landed {selectedApolloSite.landingDateUtc} · Lunar Module{" "}
                      {selectedApolloSite.lunarModule}
                    </strong>
                    <span>
                      Moonwalkers:{" "}
                      {selectedApolloSite.moonwalkers.join(" and ")}
                    </span>
                    <span>
                      Command Module Pilot:{" "}
                      {selectedApolloSite.commandModulePilot}
                    </span>
                    <span>
                      {selectedApolloSite.surfaceStayHours.toFixed(1)} hours on
                      the surface · {selectedApolloSite.evaHours.toFixed(1)} EVA
                      hours · {selectedApolloSite.traverseDistanceKm.toFixed(2)}{" "}
                      km traversed
                    </span>
                    <span>
                      Experiments: {selectedApolloSite.experiments.join("; ")}
                    </span>
                    <span className="apollo-source-links">
                      <a
                        href={selectedApolloSite.mappingUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        LROC traverse map
                      </a>
                      <a
                        href={selectedApolloSite.photoArchiveUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Surface photographs
                      </a>
                      <a
                        href={selectedApolloSite.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Mission record
                      </a>
                    </span>
                  </span>
                )}
              </div>
            )}
          </aside>
        )}

        <aside
          ref={displayPanelRef}
          id="display-panel"
          className="display-panel"
          hidden={!controlPanelOpen}
          role="dialog"
          aria-modal="false"
          aria-label="Display controls"
          data-active-tab={displayPanelTab}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setControlPanelOpen(false);
            }
          }}
        >
          <div className="panel-heading">
            <div>
              <span>Display</span>
              <strong>View settings</strong>
            </div>
            <button
              type="button"
              data-initial-focus
              onClick={() => setControlPanelOpen(false)}
            >
              Close
            </button>
          </div>

          {gpuError === undefined ? null : (
            <p className="gpu-error-detail" role="alert">
              {gpuError}
            </p>
          )}

          <div className="display-tabs" role="tablist" aria-label="Settings">
            {(
              [
                ["view", "View"],
                ["camera", "Camera"],
                ["guides", "Guides"],
                ["sound", "Sound"],
              ] as const
            ).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={displayPanelTab === tab}
                aria-controls={`display-${tab}-panel`}
                onClick={() => setDisplayPanelTab(tab)}
              >
                {label}
              </button>
            ))}
          </div>

          <section
            id="display-view-panel"
            className="display-panel-section"
            role="tabpanel"
            hidden={displayPanelTab !== "view"}
          >
            <h3>Image quality</h3>
            <div className="control-section visual-quality-controls">
              <label>
                Rendering
                <select
                  aria-label="Rendering quality"
                  value={visualQuality}
                  onChange={(event) =>
                    setVisualQuality(event.currentTarget.value as VisualQuality)
                  }
                >
                  {(
                    Object.entries(VISUAL_QUALITY_PROFILES) as [
                      VisualQuality,
                      (typeof VISUAL_QUALITY_PROFILES)[VisualQuality],
                    ][]
                  ).map(([quality, profile]) => (
                    <option key={quality} value={quality}>
                      {profile.label}
                    </option>
                  ))}
                </select>
              </label>
              <small className="visual-quality-note">
                Photographic uses full display resolution, high texture
                filtering, inverse-square sunlight and slower exposure
                adaptation. Balanced and Battery reduce GPU work without
                changing positions or physics.
              </small>
              <label>
                Exposure
                <select
                  aria-label="Exposure mode"
                  value={exposureMode}
                  onChange={(event) =>
                    setExposureMode(event.currentTarget.value as ExposureMode)
                  }
                >
                  <option value="auto">Automatic camera</option>
                  <option value="manual">Manual EV</option>
                </select>
              </label>
              {exposureMode === "manual" && (
                <label>
                  Exposure value
                  <input
                    aria-label="Manual exposure EV"
                    type="range"
                    min="-12"
                    max="12"
                    step="0.25"
                    value={manualExposureEv}
                    onChange={(event) =>
                      setManualExposureEv(event.currentTarget.valueAsNumber)
                    }
                  />
                </label>
              )}
              {/* An output is a live status region by default. Readouts that
                  follow the scene every frame (exposure, magnification, orbit,
                  clock) are silent; readouts of the child's own slider speak. */}
              <output className="exposure-readout" aria-live="off">
                {exposureStatus.mode === "auto" ? "Auto" : "Manual"}{" "}
                {exposureStatus.ev >= 0 ? "+" : ""}
                {exposureStatus.ev.toFixed(2)} EV · {"×"}
                {exposureStatus.multiplier.toFixed(3)}
              </output>
            </div>
          </section>

          <section
            id="display-camera-panel"
            className="display-panel-section"
            role="tabpanel"
            hidden={displayPanelTab !== "camera"}
          >
            <details className="advanced-camera-section">
              <summary>Surface observer</summary>
              <div className="control-section surface-observer-controls">
                <label>
                  Observer body
                  <select
                    value={surfaceObserverBodyId}
                    onChange={(event) => {
                      const nextBodyId = event.currentTarget.value;
                      setSurfaceObserverBodyId(nextBodyId);
                      if (surfaceObserverTargetBodyId === nextBodyId) {
                        setSurfaceObserverTargetBodyId("sun");
                      }
                      if (surfaceObserverEnabled) {
                        navigateToFocus(nextBodyId);
                      }
                    }}
                  >
                    {surfaceObserverBodies.map((body) => (
                      <option key={body.id} value={body.id}>
                        {body.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Look at
                  <select
                    value={surfaceObserverTargetBodyId}
                    onChange={(event) =>
                      setSurfaceObserverTargetBodyId(event.currentTarget.value)
                    }
                  >
                    {majorBodySnapshot.bodies
                      .filter((body) => body.id !== surfaceObserverBodyId)
                      .map((body) => (
                        <option key={body.id} value={body.id}>
                          {body.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Latitude
                  <input
                    type="number"
                    min="-90"
                    max="90"
                    step="0.0001"
                    value={surfaceObserverLatitudeDeg}
                    onChange={(event) => {
                      const latitudeDeg = event.currentTarget.valueAsNumber;
                      if (
                        Number.isFinite(latitudeDeg) &&
                        latitudeDeg >= -90 &&
                        latitudeDeg <= 90
                      ) {
                        setSurfaceObserverLatitudeDeg(latitudeDeg);
                      }
                    }}
                  />
                </label>
                <label>
                  Longitude °E
                  <input
                    type="number"
                    min="-180"
                    max="180"
                    step="0.0001"
                    value={surfaceObserverLongitudeDeg}
                    onChange={(event) => {
                      const longitudeDeg = event.currentTarget.valueAsNumber;
                      if (
                        Number.isFinite(longitudeDeg) &&
                        longitudeDeg >= -180 &&
                        longitudeDeg <= 180
                      ) {
                        setSurfaceObserverLongitudeDeg(longitudeDeg);
                      }
                    }}
                  />
                </label>
                <small className="surface-observer-control-note">
                  Planetographic coordinates on the sourced mean-radius
                  reference sphere. Giant planets are excluded because they have
                  no solid surface.
                </small>
                <button
                  type="button"
                  className="primary-action"
                  onClick={
                    surfaceObserverEnabled
                      ? exitSurfaceObserver
                      : enterSurfaceObserver
                  }
                >
                  {surfaceObserverEnabled
                    ? "Exit surface view"
                    : "Enter surface view"}
                </button>
              </div>
            </details>
          </section>

          <section
            id="display-sound-panel"
            className="display-panel-section"
            role="tabpanel"
            hidden={displayPanelTab !== "sound"}
          >
            <h3>Audio</h3>
            <div className="control-section audio-controls">
              <label className="switch-control">
                <input
                  type="checkbox"
                  checked={audio.settings.musicEnabled}
                  onChange={(event) =>
                    audio.updateSetting(
                      "musicEnabled",
                      event.currentTarget.checked,
                    )
                  }
                />
                <span>Ambient music</span>
              </label>
              <label className="switch-control">
                <input
                  type="checkbox"
                  checked={audio.settings.effectsEnabled}
                  onChange={(event) =>
                    audio.updateSetting(
                      "effectsEnabled",
                      event.currentTarget.checked,
                    )
                  }
                />
                <span>Interface sounds</span>
              </label>
              <label className="switch-control">
                <input
                  type="checkbox"
                  checked={audio.settings.narrationEnabled}
                  onChange={(event) =>
                    audio.updateSetting(
                      "narrationEnabled",
                      event.currentTarget.checked,
                    )
                  }
                />
                <span>Tour narration</span>
              </label>
              <label className="range-control">
                <span>Music volume</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={Math.round(audio.settings.musicVolume * 100)}
                  disabled={!audio.settings.musicEnabled}
                  onChange={(event) =>
                    audio.updateSetting(
                      "musicVolume",
                      Number(event.currentTarget.value) / 100,
                    )
                  }
                />
                <output>{Math.round(audio.settings.musicVolume * 100)}%</output>
              </label>
              <label className="range-control">
                <span>Sound volume</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={Math.round(audio.settings.effectsVolume * 100)}
                  disabled={!audio.settings.effectsEnabled}
                  onChange={(event) =>
                    audio.updateSetting(
                      "effectsVolume",
                      Number(event.currentTarget.value) / 100,
                    )
                  }
                />
                <output>
                  {Math.round(audio.settings.effectsVolume * 100)}%
                </output>
              </label>
              <label className="range-control">
                <span>Narration volume</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={Math.round(audio.settings.narrationVolume * 100)}
                  disabled={!audio.settings.narrationEnabled}
                  onChange={(event) =>
                    audio.updateSetting(
                      "narrationVolume",
                      Number(event.currentTarget.value) / 100,
                    )
                  }
                />
                <output>
                  {Math.round(audio.settings.narrationVolume * 100)}%
                </output>
              </label>
              <span className="audio-status" role="status">
                {audio.narrationStatus === "error"
                  ? "Tour narration could not be loaded"
                  : audio.narrationStatus === "playing"
                    ? "Tour narration playing"
                    : audio.status === "running"
                      ? "Audio active"
                      : audio.status === "unavailable"
                        ? "Audio unavailable in this browser"
                        : "Starts after your next interaction"}
              </span>
            </div>
          </section>

          <section
            className="display-panel-section camera-guide-panel"
            role="tabpanel"
            hidden={
              displayPanelTab !== "camera" && displayPanelTab !== "guides"
            }
          >
            <h3>{displayPanelTab === "camera" ? "Camera" : "Guides"}</h3>
            <div className="control-section">
              <fieldset
                className="orientation-picker camera-only"
                disabled={viewMode === "schematic"}
              >
                <legend>View angle</legend>
                <div className="orientation-grid">
                  {CAMERA_ORIENTATION_OPTIONS.map((option) => (
                    <button
                      type="button"
                      key={option.id}
                      aria-label={option.label}
                      aria-pressed={cameraOrientation === option.id}
                      title={option.description}
                      onClick={() => applyOrientationPreset(option.id)}
                    >
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </button>
                  ))}
                </div>
                <small className="orientation-help">
                  Drag to look freely. Re-centre restores the selected angle.
                  {cameraOrientation === "custom" ? " Custom view active." : ""}
                </small>
              </fieldset>
              <div className="cinematic-shot-picker camera-only">
                <span>Cool shots</span>
                <div className="cinematic-shot-grid">
                  {CINEMATIC_SHOTS.map((shot) => (
                    <button
                      type="button"
                      key={shot.id}
                      aria-pressed={activeCinematicShotId === shot.id}
                      title={shot.description}
                      onClick={() => presentCinematicShot(shot)}
                    >
                      {shot.name}
                    </button>
                  ))}
                </div>
              </div>
              <label className="switch-control camera-orbit-control camera-only">
                <input
                  type="checkbox"
                  checked={orbitViewEnabled}
                  disabled={
                    viewMode === "schematic" ||
                    surfaceObserverEnabled ||
                    focusBodyId === "" ||
                    focusedOrbitParameters === undefined
                  }
                  onChange={(event) => {
                    const enabled = event.currentTarget.checked;
                    if (enabled) {
                      beginPhysicalOrbit();
                    } else {
                      setOrbitViewEnabled(false);
                    }
                  }}
                />
                <span>Fly in orbit</span>
              </label>
              <small className="control-note camera-orbit-note camera-only">
                Circular speed and period are derived from the focused body's
                live gravity. Playback rate compresses time without changing the
                trajectory.
              </small>
              {!orbitViewEnabled || orbitConfiguration === null ? null : (
                <div className="orbit-flight-controls camera-only">
                  <label>
                    Flight mode
                    <select
                      value={orbitConfiguration.preset}
                      onChange={(event) =>
                        applyOrbitPreset(
                          event.currentTarget.value as OrbitPreset,
                        )
                      }
                    >
                      <option value="low-circular">Low circular</option>
                      <option value="equatorial">Equatorial circular</option>
                      <option value="polar">Polar circular</option>
                      <option value="synchronous">
                        {focusBodyId === "earth"
                          ? "Geostationary"
                          : "Synchronous"}
                      </option>
                      <option value="high-observation">High observation</option>
                      <option value="powered-hover">Powered hover</option>
                      <option value="custom">Custom circular</option>
                    </select>
                  </label>
                  <label>
                    Altitude
                    <span className="number-with-unit">
                      <input
                        type="number"
                        min="0"
                        step="10"
                        value={Number(
                          (orbitConfiguration.altitudeM / 1_000).toFixed(3),
                        )}
                        disabled={orbitConfiguration.preset === "synchronous"}
                        onChange={(event) => {
                          const altitudeM =
                            Number(event.currentTarget.value) * 1_000;
                          if (!Number.isFinite(altitudeM) || altitudeM < 0) {
                            return;
                          }
                          setOrbitConfiguration({
                            ...orbitConfiguration,
                            preset: "custom",
                            altitudeM,
                          });
                        }}
                      />
                      <span>km</span>
                    </span>
                  </label>
                  <label>
                    Inclination
                    <span className="number-with-unit">
                      <input
                        type="number"
                        min="0"
                        max="180"
                        step="1"
                        value={orbitConfiguration.inclinationDeg}
                        disabled={
                          orbitConfiguration.preset === "synchronous" ||
                          orbitConfiguration.preset === "powered-hover"
                        }
                        onChange={(event) => {
                          const inclinationDeg = Number(
                            event.currentTarget.value,
                          );
                          if (
                            !Number.isFinite(inclinationDeg) ||
                            inclinationDeg < 0 ||
                            inclinationDeg > 180
                          ) {
                            return;
                          }
                          setOrbitConfiguration({
                            ...orbitConfiguration,
                            preset: "custom",
                            inclinationDeg,
                          });
                        }}
                      />
                      <span>°</span>
                    </span>
                  </label>
                  <label>
                    Direction
                    <select
                      value={orbitConfiguration.direction}
                      disabled={
                        orbitConfiguration.preset === "synchronous" ||
                        orbitConfiguration.preset === "powered-hover"
                      }
                      onChange={(event) =>
                        setOrbitConfiguration({
                          ...orbitConfiguration,
                          preset: "custom",
                          direction: event.currentTarget.value as
                            "prograde" | "retrograde",
                        })
                      }
                    >
                      <option value="prograde">Prograde</option>
                      <option value="retrograde">Retrograde</option>
                    </select>
                  </label>
                  <label>
                    Starting longitude
                    <span className="number-with-unit">
                      <input
                        type="number"
                        min="-180"
                        max="180"
                        step="1"
                        value={orbitConfiguration.longitudeDeg}
                        onChange={(event) =>
                          setOrbitConfiguration({
                            ...orbitConfiguration,
                            longitudeDeg: Number(event.currentTarget.value),
                          })
                        }
                      />
                      <span>°</span>
                    </span>
                  </label>
                  <output className="orbit-flight-readout" aria-live="off">
                    {orbitReadout?.kind === "hover"
                      ? `Station keeping ${orbitReadout.accelerationMps2.toFixed(4)} m/s²`
                      : orbitReadout?.kind === "orbit"
                        ? `${(orbitReadout.speedMps / 1_000).toFixed(3)} km/s · period ${formatDuration(orbitReadout.periodSeconds)}`
                        : "Orbit data unavailable"}
                  </output>
                </div>
              )}
              {orbitConfigurationError === undefined ? null : (
                <p className="control-error camera-only" role="alert">
                  {orbitConfigurationError}
                </p>
              )}
              <label className="camera-only">
                Zoom preset
                <select
                  value={activeZoomPreset}
                  disabled={viewMode === "schematic"}
                  onChange={(event) => {
                    const preset = CAMERA_ZOOM_PRESETS.find(
                      (candidate) => candidate.id === event.currentTarget.value,
                    );
                    if (preset === undefined) {
                      throw new Error(
                        "Selected camera zoom preset is unavailable",
                      );
                    }
                    setRequestedViewMagnification(preset.zoom);
                  }}
                >
                  {CAMERA_ZOOM_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                  <option value="custom" disabled>
                    Custom
                  </option>
                </select>
              </label>
              <label className="range-control camera-only">
                <span>Camera zoom</span>
                <input
                  type="range"
                  min="-32"
                  max="7"
                  step="0.000001"
                  value={Math.max(
                    -32,
                    Math.min(7, Math.log2(viewMagnification)),
                  )}
                  disabled={viewMode === "schematic"}
                  onChange={(event) =>
                    setRequestedViewMagnification(
                      2 ** Number(event.currentTarget.value),
                    )
                  }
                />
                <output aria-live="off">
                  {viewMagnification < 0.001
                    ? viewMagnification.toExponential(2)
                    : viewMagnification < 0.1
                      ? viewMagnification.toFixed(3)
                      : viewMagnification.toFixed(2).replace(/\.00$/u, "")}
                  x
                </output>
              </label>
              <label className="wayfinder-control guide-only">
                Wayfinders
                <select
                  value={wayfinderMode}
                  disabled={viewMode === "schematic"}
                  onChange={(event) =>
                    setWayfinderMode(event.currentTarget.value as WayfinderMode)
                  }
                >
                  <option value="off">Off</option>
                  <option value="sun">Sun</option>
                  <option value="sun-planet">Sun + nearest planet</option>
                  <option value="sun-two-planets">
                    Sun + two nearest planets
                  </option>
                </select>
              </label>
              <label className="guide-only">
                Gravity field
                <select
                  value={gravityWellMode}
                  disabled={viewMode === "schematic"}
                  onChange={(event) =>
                    setGravityWellMode(
                      event.currentTarget.value as GravityWellMode,
                    )
                  }
                >
                  <option value="off">Off</option>
                  <option value="contours">Potential contours</option>
                  <option value="surface">3D potential surface</option>
                </select>
              </label>
              <label className="guide-only">
                Gravity scale
                <select
                  value={gravityWellScale}
                  disabled={
                    viewMode === "schematic" || gravityWellMode === "off"
                  }
                  onChange={(event) =>
                    setGravityWellScale(
                      event.currentTarget.value as GravityWellScale,
                    )
                  }
                >
                  <option value="local">Local detail</option>
                  <option value="absolute">Absolute comparison</option>
                </select>
              </label>
              {(
                [
                  ["Orbit guides", showOrbitGuides, setShowOrbitGuides],
                  [
                    "Tactical overlay",
                    showTacticalOverlay,
                    setShowTacticalOverlay,
                  ],
                  ["Ecliptic grid", showEclipticPlane, setShowEclipticPlane],
                  ["Zodiac signs", showZodiac, setShowZodiac],
                  ["Apollo landing sites", showApolloSites, setShowApolloSites],
                ] as const
              ).map(([label, checked, setter]) => (
                <label className="switch-control guide-only" key={label}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={viewMode === "schematic"}
                    onChange={(event) => setter(event.currentTarget.checked)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </section>

          <section
            className="display-panel-section"
            role="tabpanel"
            hidden={displayPanelTab !== "view"}
          >
            <h3>Objects</h3>
            <div className="control-section object-view-controls">
              <label className="switch-control">
                <input
                  type="checkbox"
                  checked={showLabels}
                  disabled={viewMode === "schematic"}
                  onChange={(event) =>
                    setShowLabels(event.currentTarget.checked)
                  }
                />
                <span>Labels</span>
              </label>
              {viewMode === "orrery" ? (
                <label className="range-control">
                  <span>Body size boost</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={bodyVisibilityPercent}
                    onChange={(event) =>
                      setBodyVisibilityPercent(
                        Number(event.currentTarget.value),
                      )
                    }
                  />
                  <output>
                    {bodyVisibilityPercent === 0
                      ? "Physical"
                      : `${String(bodyVisibilityPercent)}%`}
                  </output>
                </label>
              ) : null}
            </div>
            <div className="category-grid">
              {(
                [
                  "planets",
                  "moons",
                  "spacecraft",
                  "asteroids",
                  "comets",
                  "stars",
                ] as const
              ).map((category) => (
                <label key={category} className="category-chip">
                  <input
                    type="checkbox"
                    checked={objectVisibility[category]}
                    disabled={
                      viewMode === "reality" &&
                      (category === "asteroids" || category === "comets")
                    }
                    onChange={(event) =>
                      setCategoryVisibility(
                        category,
                        event.currentTarget.checked,
                      )
                    }
                  />
                  <span>
                    {category[0]?.toUpperCase()}
                    {category.slice(1)}
                  </span>
                </label>
              ))}
            </div>
            {viewMode === "reality" ? (
              <small className="control-note object-availability-note">
                Asteroids and comets are GPU catalogue points, so they are
                available in Orrery mode. Reality mode will not draw a false
                one-pixel object larger than its physical apparent size.
              </small>
            ) : null}
          </section>

          <section
            id="display-guides-panel"
            className="display-panel-section"
            role="tabpanel"
            hidden={displayPanelTab !== "guides"}
          >
            <h3>Trails and frames</h3>
            <div className="control-section">
              <label className="switch-control">
                <input
                  type="checkbox"
                  checked={showPlanetTrails}
                  onChange={(event) =>
                    setShowPlanetTrails(event.currentTarget.checked)
                  }
                />
                <span>Planet trails</span>
              </label>
              <label className="switch-control">
                <input
                  type="checkbox"
                  checked={showMoonTrail}
                  onChange={(event) =>
                    setShowMoonTrail(event.currentTarget.checked)
                  }
                />
                <span>Moon trail</span>
              </label>
              <label className="switch-control">
                <input
                  type="checkbox"
                  checked={showMinorBodyTrails}
                  onChange={(event) =>
                    setShowMinorBodyTrails(event.currentTarget.checked)
                  }
                />
                <span>Minor-body trails</span>
              </label>
              <label>
                Reference frame
                <select
                  value={referenceFrame}
                  onChange={(event) =>
                    setReferenceFrame(
                      event.currentTarget.value as ReferenceFrame,
                    )
                  }
                >
                  <option value="heliocentric">Heliocentric</option>
                  <option value="barycentric">Solar System barycentric</option>
                  <option value="parent-relative">
                    Each body relative to parent
                  </option>
                </select>
              </label>
              <label>
                Trail length
                <select
                  value={trailDurationDays}
                  onChange={(event) =>
                    setTrailDurationDays(Number(event.currentTarget.value))
                  }
                >
                  <option value="1">1 day</option>
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                  <option value="365">1 year</option>
                  <option value="3650">10 years</option>
                </select>
              </label>
              <label className="range-control">
                <span>Trail fade</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={trailFadePercent}
                  onChange={(event) =>
                    setTrailFadePercent(Number(event.currentTarget.value))
                  }
                />
                <output>{trailFadePercent}%</output>
              </label>
              <button
                type="button"
                onClick={() => setClearTrailsToken((current) => current + 1)}
              >
                Clear trails
              </button>
            </div>
          </section>
        </aside>

        <section className="timeline-dock" aria-label="Time controls">
          <div className="time-readout">
            <output data-time-seconds={state?.timeSeconds ?? 0} aria-live="off">
              TDB {formatSimulationOffset(state?.timeSeconds ?? 0)}
            </output>
            <span
              className="run-status"
              data-achieved-rate-seconds-per-second={effectiveRate}
            >
              {state === undefined
                ? "Starting physics"
                : seeking
                  ? "Seeking"
                  : playing
                    ? `${selectedTimeRate.label.replace(" / second", "/s")} requested · ${formatEffectiveRate(effectiveRate)} achieved${playbackBuffered ? " · buffered" : ""}`
                    : "Paused"}
            </span>
            <span
              className={`model-validity${outsideValidatedWindow ? " is-warning" : ""}`}
              data-model-regime="present-day-propagation"
              data-outside-validated-window={String(outsideValidatedWindow)}
            >
              {outsideValidatedWindow
                ? "Outside ±1 year ephemeris validation"
                : "Present-day model · validated ±1 year"}
            </span>
          </div>
          <div className="time-actions">
            <button type="button" onClick={() => queueStep(-1)}>
              Step backward
            </button>
            {playing ? (
              <button
                type="button"
                className="primary-action"
                onClick={() => setPlaying(false)}
              >
                Pause
              </button>
            ) : (
              <>
                <button type="button" onClick={() => startPlaying(-1)}>
                  Run backward
                </button>
                <button
                  type="button"
                  className="primary-action"
                  onClick={() => startPlaying(1)}
                >
                  Run forward
                </button>
              </>
            )}
            <button type="button" onClick={() => queueStep(1)}>
              Step forward
            </button>
          </div>
          <label className="playback-rate-control">
            <span>Playback rate</span>
            <input
              type="range"
              min="0"
              max={String(USER_TIME_RATE_INDEXES.length - 1)}
              step="1"
              value={Math.max(0, playbackRateSliderIndex)}
              onChange={(event) => {
                const selectedIndex =
                  USER_TIME_RATE_INDEXES[Number(event.currentTarget.value)];
                if (selectedIndex === undefined) {
                  throw new Error("Selected playback rate is unavailable");
                }
                setTimeRateIndex(selectedIndex);
              }}
            />
            <output>{selectedTimeRate.label}</output>
          </label>
        </section>
      </section>
    </main>
  );
}
