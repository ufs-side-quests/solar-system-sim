import type { CameraOrientationPreset } from "../scene/camera-view";
import type { ViewMode } from "../scene/view-mode";

export type CinematicShot = Readonly<{
  id: string;
  name: string;
  description: string;
  focusBodyId: string;
  cameraTargetBodyId?: string;
  orientation: Exclude<CameraOrientationPreset, "custom">;
  cameraDistanceAu?: number;
  cameraZoom: number;
  timeRateSecondsPerSecond: number;
  // Simulation time the shot seeks to, or null to keep the current time.
  startTimeSeconds: number | null;
  // When time passes this, the shot seeks back to its start and clears the
  // trails, so it repeats; null for shots that run on. Requires a start time.
  loopEndTimeSeconds: number | null;
  viewMode: Exclude<ViewMode, "schematic">;
  bodyVisibilityPercent: number;
  orbitGuides: boolean;
  planetTrails: boolean;
  labels: boolean;
}>;

export const PLANETS_RACING_SHOT: CinematicShot = {
  id: "planets-racing",
  name: "Planets racing round the Sun",
  description: "Closer planets go round faster. Watch Mercury lap Earth.",
  focusBodyId: "sun",
  orientation: "overhead",
  cameraDistanceAu: 6,
  cameraZoom: 1,
  timeRateSecondsPerSecond: 30 * 86_400,
  // Stay inside the ±1 year validated ephemeris window around the epoch.
  startTimeSeconds: -330 * 86_400,
  loopEndTimeSeconds: 330 * 86_400,
  viewMode: "orrery",
  bodyVisibilityPercent: 100,
  orbitGuides: true,
  planetTrails: true,
  labels: true,
};

export const CINEMATIC_SHOTS: readonly CinematicShot[] = [
  PLANETS_RACING_SHOT,
  {
    id: "earth-daylight",
    name: "Earth in daylight",
    description:
      "A true-scale portrait from the sunward side, with the living world fully illuminated.",
    focusBodyId: "earth",
    orientation: "sun-facing",
    cameraDistanceAu: 0.00018,
    cameraZoom: 1,
    timeRateSecondsPerSecond: 3_600,
    startTimeSeconds: null,
    loopEndTimeSeconds: null,
    viewMode: "reality",
    bodyVisibilityPercent: 100,
    orbitGuides: false,
    planetTrails: false,
    labels: false,
  },
  {
    id: "saturn-ring-skimming",
    name: "Saturn and its rings",
    description:
      "A sunlit, oblique portrait that makes the ring structure and Saturn's shadow readable.",
    focusBodyId: "saturn",
    orientation: "sun-facing",
    cameraDistanceAu: 0.0024,
    cameraZoom: 1,
    timeRateSecondsPerSecond: 3_600,
    startTimeSeconds: null,
    loopEndTimeSeconds: null,
    viewMode: "reality",
    bodyVisibilityPercent: 100,
    orbitGuides: false,
    planetTrails: false,
    labels: false,
  },
  {
    id: "jupiter-daylight",
    name: "Jupiter in daylight",
    description:
      "A true-scale sunward portrait of Jupiter's cloud bands and storms.",
    focusBodyId: "jupiter",
    orientation: "sun-facing",
    cameraDistanceAu: 0.0018,
    cameraZoom: 1,
    timeRateSecondsPerSecond: 3_600,
    startTimeSeconds: null,
    loopEndTimeSeconds: null,
    viewMode: "reality",
    bodyVisibilityPercent: 100,
    orbitGuides: false,
    planetTrails: false,
    labels: false,
  },
  {
    id: "moon-daylight",
    name: "Moon in sunlight",
    description:
      "A true-scale sunward portrait of the Moon's cratered, height-mapped surface.",
    focusBodyId: "moon",
    orientation: "sun-facing",
    cameraDistanceAu: 0.00005,
    cameraZoom: 1,
    timeRateSecondsPerSecond: 600,
    startTimeSeconds: null,
    loopEndTimeSeconds: null,
    viewMode: "reality",
    bodyVisibilityPercent: 100,
    orbitGuides: false,
    planetTrails: false,
    labels: false,
  },
  {
    id: "voyager-looking-home",
    name: "Voyager beyond the planets",
    description:
      "Voyager 1 in interstellar space with its antenna aligned toward Earth.",
    focusBodyId: "voyager-1",
    orientation: "sun-facing",
    cameraZoom: 1.8,
    timeRateSecondsPerSecond: 86_400,
    startTimeSeconds: null,
    loopEndTimeSeconds: null,
    viewMode: "reality",
    bodyVisibilityPercent: 100,
    orbitGuides: false,
    planetTrails: false,
    labels: false,
  },
  {
    id: "sun-from-mercury",
    name: "Sun from Mercury",
    description:
      "The Sun at its live apparent size from a viewpoint just above Mercury's sunward surface.",
    focusBodyId: "mercury",
    cameraTargetBodyId: "sun",
    orientation: "parent-facing",
    cameraZoom: 16,
    timeRateSecondsPerSecond: 3_600,
    startTimeSeconds: null,
    loopEndTimeSeconds: null,
    viewMode: "reality",
    bodyVisibilityPercent: 100,
    orbitGuides: false,
    planetTrails: false,
    labels: false,
  },
];
