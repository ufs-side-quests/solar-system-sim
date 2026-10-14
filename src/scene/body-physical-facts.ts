import {
  ASTRONOMICAL_UNIT_M,
  SPEED_OF_LIGHT_MPS,
} from "../physics/solar-system";
import { majorBodySnapshot } from "../physics/solar-system-data";
import { PARENT_BODY_ID } from "./body-facts";
import {
  nasaMaterialPresentationByBodyId,
  nasaTextureByBodyId,
} from "./visual-assets";

export type BodyCompositionFact = {
  readonly summary: string;
  readonly authority: string;
  readonly sourceUrl: string;
};

const NASA_SCIENCE = "NASA Science";

export const BODY_COMPOSITION_BY_ID: Readonly<
  Record<string, BodyCompositionFact>
> = {
  sun: {
    summary: "Hydrogen and helium plasma, with trace heavier elements",
    authority: NASA_SCIENCE,
    sourceUrl: "https://science.nasa.gov/sun/facts/",
  },
  mercury: {
    summary: "Large iron-rich metallic core with a silicate mantle and crust",
    authority: NASA_SCIENCE,
    sourceUrl: "https://science.nasa.gov/mercury/facts/",
  },
  venus: {
    summary: "Iron core, rocky silicate mantle and basaltic crust",
    authority: NASA_SCIENCE,
    sourceUrl: "https://science.nasa.gov/venus/facts/",
  },
  earth: {
    summary: "Iron-nickel core, silicate mantle and crust, with surface water",
    authority: NASA_SCIENCE,
    sourceUrl: "https://science.nasa.gov/earth/facts/",
  },
  mars: {
    summary:
      "Iron, nickel and sulfur core with a rocky silicate mantle and crust",
    authority: NASA_SCIENCE,
    sourceUrl: "https://science.nasa.gov/mars/facts/",
  },
  jupiter: {
    summary: "Mostly hydrogen and helium, with a denser heavy-element interior",
    authority: NASA_SCIENCE,
    sourceUrl: "https://science.nasa.gov/jupiter/jupiter-facts/",
  },
  saturn: {
    summary: "Mostly hydrogen and helium around a dense rock-and-ice core",
    authority: NASA_SCIENCE,
    sourceUrl: "https://science.nasa.gov/saturn/facts/",
  },
  uranus: {
    summary:
      "Water, methane and ammonia-rich fluid above a rocky core, under hydrogen and helium",
    authority: NASA_SCIENCE,
    sourceUrl: "https://science.nasa.gov/uranus/facts/",
  },
  neptune: {
    summary:
      "Water, methane and ammonia-rich fluid above a rocky core, under hydrogen and helium",
    authority: NASA_SCIENCE,
    sourceUrl: "https://science.nasa.gov/neptune/neptune-facts/",
  },
  moon: {
    summary: "Silicate crust and mantle around a small, mostly iron core",
    authority: NASA_SCIENCE,
    sourceUrl: "https://science.nasa.gov/moon/composition/",
  },
  phobos: {
    summary:
      "Dark, carbon-rich rocky material; its internal composition remains uncertain",
    authority: NASA_SCIENCE,
    sourceUrl: "https://science.nasa.gov/mars/moons/facts/",
  },
  deimos: {
    summary:
      "Dark, carbon-rich rocky material; its internal composition remains uncertain",
    authority: NASA_SCIENCE,
    sourceUrl: "https://science.nasa.gov/mars/moons/facts/",
  },
  io: {
    summary:
      "Silicate rock around an iron-rich core, with sulfur-rich volcanic deposits",
    authority: NASA_SCIENCE,
    sourceUrl: "https://science.nasa.gov/jupiter/jupiter-moons/io/facts/",
  },
  europa: {
    summary:
      "Water-ice shell and salty ocean above a rocky mantle and iron core",
    authority: NASA_SCIENCE,
    sourceUrl: "https://science.nasa.gov/jupiter/jupiter-moons/europa/facts/",
  },
  ganymede: {
    summary: "Iron core, rocky mantle, and layered water-ice shells and oceans",
    authority: NASA_SCIENCE,
    sourceUrl: "https://science.nasa.gov/jupiter/jupiter-moons/ganymede/facts/",
  },
  callisto: {
    summary:
      "A mixture of rock and water ice, with a possible subsurface ocean",
    authority: NASA_SCIENCE,
    sourceUrl: "https://science.nasa.gov/jupiter/jupiter-moons/callisto/facts/",
  },
  mimas: {
    summary: "Predominantly water ice with a smaller rocky component",
    authority: NASA_SCIENCE,
    sourceUrl: "https://science.nasa.gov/saturn/moons/facts/",
  },
  enceladus: {
    summary: "Water-ice shell and global salty ocean around a rocky core",
    authority: NASA_SCIENCE,
    sourceUrl: "https://science.nasa.gov/saturn/moons/enceladus/",
  },
  tethys: {
    summary: "Predominantly water ice with a smaller rocky component",
    authority: NASA_SCIENCE,
    sourceUrl: "https://science.nasa.gov/saturn/moons/facts/",
  },
  dione: {
    summary: "Water ice mixed with rock, with evidence for a deep ocean",
    authority: NASA_SCIENCE,
    sourceUrl: "https://science.nasa.gov/saturn/moons/facts/",
  },
  rhea: {
    summary: "Water ice mixed with rock",
    authority: NASA_SCIENCE,
    sourceUrl: "https://science.nasa.gov/saturn/moons/facts/",
  },
  titan: {
    summary:
      "Water ice and rock beneath a nitrogen-rich atmosphere with methane",
    authority: NASA_SCIENCE,
    sourceUrl: "https://science.nasa.gov/saturn/moons/titan/facts/",
  },
  iapetus: {
    summary: "Mostly water ice with rock and dark carbon-rich surface material",
    authority: NASA_SCIENCE,
    sourceUrl: "https://science.nasa.gov/saturn/moons/facts/",
  },
  miranda: {
    summary: "Roughly equal parts water ice and rock",
    authority: NASA_SCIENCE,
    sourceUrl: "https://science.nasa.gov/uranus/moons/facts/",
  },
  ariel: {
    summary: "Roughly equal parts water ice and rock",
    authority: NASA_SCIENCE,
    sourceUrl: "https://science.nasa.gov/uranus/moons/facts/",
  },
  umbriel: {
    summary: "Roughly equal parts water ice and rock",
    authority: NASA_SCIENCE,
    sourceUrl: "https://science.nasa.gov/uranus/moons/facts/",
  },
  titania: {
    summary: "Roughly equal parts water ice and rock",
    authority: NASA_SCIENCE,
    sourceUrl: "https://science.nasa.gov/uranus/moons/facts/",
  },
  oberon: {
    summary: "Roughly equal parts water ice and rock",
    authority: NASA_SCIENCE,
    sourceUrl: "https://science.nasa.gov/uranus/moons/facts/",
  },
  triton: {
    summary:
      "Rock and water ice, with nitrogen, methane and carbon-monoxide surface ices",
    authority: NASA_SCIENCE,
    sourceUrl: "https://science.nasa.gov/neptune/moons/triton/",
  },
  pluto: {
    summary:
      "Rock and water ice, with nitrogen, methane and carbon-monoxide surface ices",
    authority: NASA_SCIENCE,
    sourceUrl: "https://science.nasa.gov/dwarf-planets/pluto/facts/",
  },
  charon: {
    summary: "Rock and water ice, including exposed crystalline water ice",
    authority: NASA_SCIENCE,
    sourceUrl: "https://science.nasa.gov/dwarf-planets/pluto/moons/facts/",
  },
  iss: {
    summary:
      "Engineered pressurised modules, truss structure and photovoltaic arrays",
    authority: "NASA International Space Station Facts and Figures",
    sourceUrl:
      "https://www.nasa.gov/international-space-station/space-station-facts-and-figures/",
  },
  "voyager-1": {
    summary:
      "Engineered aluminium structure, high-gain antenna, radioisotope power systems and scientific instruments",
    authority: "NASA Voyager Frequently Asked Questions",
    sourceUrl:
      "https://science.nasa.gov/mission/voyager/frequently-asked-questions/",
  },
  "voyager-2": {
    summary:
      "Engineered aluminium structure, high-gain antenna, radioisotope power systems and scientific instruments",
    authority: "NASA Voyager Frequently Asked Questions",
    sourceUrl:
      "https://science.nasa.gov/mission/voyager/frequently-asked-questions/",
  },
  hubble: {
    summary:
      "Engineered aluminium structure, optical telescope assembly, solar arrays and scientific instruments",
    authority: "NASA Hubble Observatory Design",
    sourceUrl: "https://science.nasa.gov/mission/hubble/observatory/design/",
  },
  jwst: {
    summary:
      "Beryllium mirror segments, graphite composite structure, multilayer polymer sunshield and scientific instruments",
    authority: "NASA Webb Telescope Overview",
    sourceUrl: "https://science.nasa.gov/mission/webb/spacecraft/",
  },
  roadster: {
    summary:
      "Production electric sports car, spacesuit-wearing mannequin, payload fitting and attached Falcon Heavy upper stage",
    authority: "NASA/JPL Horizons Tesla Roadster solution 11",
    sourceUrl: "https://ssd.jpl.nasa.gov/horizons/news.html",
  },
};

const SUPERSCRIPT_DIGIT: Readonly<Record<string, string>> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "-": "⁻",
};

function superscript(value: number): string {
  return String(value)
    .split("")
    .map((character) => SUPERSCRIPT_DIGIT[character])
    .join("");
}

export function formatMassKg(massKg: number | undefined): string {
  if (massKg === undefined) {
    return "Not provided by source";
  }
  if (massKg < 1_000_000) {
    return `${massKg.toLocaleString("en-GB")} kg`;
  }
  const exponent = Math.floor(Math.log10(massKg));
  const coefficient = massKg / 10 ** exponent;
  return `${coefficient.toLocaleString("en-GB", {
    maximumSignificantDigits: 5,
  })} × 10${superscript(exponent)} kg`;
}

/**
 * Plain words for each installed surface presentation, keyed by body id, so
 * every asset says what it really is (radar map, boosted colour, filled-in
 * gaps). The installed-asset check below fails the load when one is missing.
 */
export const PLAIN_SURFACE_BY_BODY_ID: Readonly<Record<string, string>> = {
  mercury: "Real space pictures in boosted colours",
  venus: "Radar map of the ground under the clouds",
  earth: "Real space pictures of the ground; clouds are a separate layer",
  mars: "Real space pictures joined together",
  jupiter: "Real space pictures of its clouds in 2000",
  saturn: "NASA artwork of its cloud tops",
  uranus: "Plain colour matched to real photos",
  neptune: "NASA artwork of its clouds",
  moon: "Real space pictures, polar gaps filled in",
  phobos: "Real space pictures joined together",
  deimos: "Real space pictures joined together",
  io: "Real space pictures joined together",
  europa: "Real space pictures joined together",
  ganymede: "Real space pictures joined together",
  callisto: "Real space pictures joined together",
  mimas: "Real space pictures joined together",
  enceladus: "Real space pictures in boosted colours",
  tethys: "Real space pictures joined together",
  dione: "Real space pictures joined together",
  rhea: "Real space pictures joined together",
  titan: "NASA artwork of its hazy sky",
  iapetus: "Real space pictures joined together",
  ariel: "Real space pictures, unseen parts filled in",
  umbriel: "Real space pictures, unseen parts filled in",
  titania: "Real space pictures, unseen parts filled in",
  oberon: "Real space pictures, unseen parts filled in",
  miranda: "Real space pictures, unseen parts filled in",
  triton: "Real space pictures, unseen parts filled in",
  pluto: "Real black-and-white pictures, unseen parts left dark",
  charon: "Real black-and-white pictures, unseen parts left dark",
};

/** Throws unless every installed surface presentation has exactly one wording. */
export function validatePlainSurfaceWording(
  wordingByBodyId: Readonly<Record<string, string>>,
  installedBodyIds: Iterable<string>,
): void {
  const installed = new Set(installedBodyIds);
  for (const bodyId of installed) {
    if ((wordingByBodyId[bodyId] ?? "").trim() === "") {
      throw new Error(`Surface asset ${bodyId} has no plain wording`);
    }
  }
  for (const bodyId of Object.keys(wordingByBodyId)) {
    if (!installed.has(bodyId)) {
      throw new Error(`Plain surface wording ${bodyId} has no installed asset`);
    }
  }
}

validatePlainSurfaceWording(PLAIN_SURFACE_BY_BODY_ID, [
  ...nasaTextureByBodyId.keys(),
  ...nasaMaterialPresentationByBodyId.keys(),
]);

export type SourcedOrbitalPeriod = Readonly<{
  siderealPeriodDays: number;
  authority: string;
  sourceUrl: string;
}>;

const NSSDC = "NASA NSSDC fact sheet";
const JPL_SATELLITES = "JPL SSD planetary satellite mean elements";
const JPL_SATELLITES_URL = "https://ssd.jpl.nasa.gov/sats/elem/";

function nssdc(
  siderealPeriodDays: number,
  sheet: string,
): SourcedOrbitalPeriod {
  return {
    siderealPeriodDays,
    authority: NSSDC,
    sourceUrl: `https://nssdc.gsfc.nasa.gov/planetary/factsheet/${sheet}fact.html`,
  };
}

function jplSatellite(siderealPeriodDays: number): SourcedOrbitalPeriod {
  return {
    siderealPeriodDays,
    authority: JPL_SATELLITES,
    sourceUrl: JPL_SATELLITES_URL,
  };
}

/**
 * Sidereal orbital periods, retrieved 2026-10-14. Planets and Pluto use the
 * NSSDC "Sidereal orbit period", the Moon the NSSDC "Revolution period", and
 * moons the JPL "P (days)" mean-element column. The live osculating period
 * wobbles with barycentre motion and perturbations, so it is not used here.
 */
export const SIDEREAL_ORBITAL_PERIOD_BY_ID: Readonly<
  Record<string, SourcedOrbitalPeriod>
> = {
  mercury: nssdc(87.969, "mercury"),
  venus: nssdc(224.701, "venus"),
  earth: nssdc(365.256, "earth"),
  mars: nssdc(686.98, "mars"),
  jupiter: nssdc(4_332.589, "jupiter"),
  saturn: nssdc(10_755.699, "saturn"),
  uranus: nssdc(30_685.4, "uranus"),
  neptune: nssdc(60_189.018, "neptune"),
  pluto: nssdc(90_560, "pluto"),
  moon: nssdc(27.3217, "moon"),
  phobos: jplSatellite(0.3187),
  deimos: jplSatellite(1.2625),
  io: jplSatellite(1.762732),
  europa: jplSatellite(3.525463),
  ganymede: jplSatellite(7.155588),
  callisto: jplSatellite(16.69044),
  mimas: jplSatellite(0.942422),
  enceladus: jplSatellite(1.370218),
  tethys: jplSatellite(1.887802),
  dione: jplSatellite(2.736916),
  rhea: jplSatellite(4.517503),
  titan: jplSatellite(15.945448),
  iapetus: jplSatellite(79.331002),
  ariel: jplSatellite(2.520379),
  umbriel: jplSatellite(4.144177),
  titania: jplSatellite(8.705869),
  oberon: jplSatellite(13.463237),
  miranda: jplSatellite(1.413479),
  triton: jplSatellite(5.876994),
  charon: jplSatellite(6.387222),
};

/**
 * Throws unless every body that shows the "One trip around" row has a
 * positive, finite sourced period, and the table names no other body.
 */
export function validateSourcedOrbitalPeriods(
  periodById: Readonly<Record<string, SourcedOrbitalPeriod>>,
  orbitingBodyIds: Iterable<string>,
): void {
  const orbiting = new Set(orbitingBodyIds);
  for (const bodyId of orbiting) {
    const period = periodById[bodyId];
    if (period === undefined) {
      throw new Error(`Sourced orbital period is missing body ${bodyId}`);
    }
    if (
      !Number.isFinite(period.siderealPeriodDays) ||
      period.siderealPeriodDays <= 0
    ) {
      throw new Error(`Sourced orbital period of ${bodyId} is not positive`);
    }
  }
  for (const bodyId of Object.keys(periodById)) {
    if (!orbiting.has(bodyId)) {
      throw new Error(
        `Sourced orbital period ${bodyId} is not an orbiting body`,
      );
    }
  }
}

validateSourcedOrbitalPeriods(
  SIDEREAL_ORBITAL_PERIOD_BY_ID,
  majorBodySnapshot.bodies
    .filter((body) => PARENT_BODY_ID[body.id] !== undefined)
    .map((body) => body.id),
);

const SECONDS_PER_HOUR = 3_600;
const HOURS_PER_DAY = 24;
const DAYS_PER_YEAR = 365.25;

/** Typical jet airliner cruise speed, a rounded reference value. */
export const JET_AIRLINER_SPEED_KMH = 900;

function rounded(value: number, fractionDigits: number): string {
  return value.toLocaleString("en-GB", {
    maximumFractionDigits: fractionDigits,
  });
}

function roundedRatio(ratio: number): string {
  return rounded(ratio, ratio >= 10 ? 0 : 1);
}

export function formatWidthComparedToEarth(
  meanRadiusM: number,
  earthMeanRadiusM: number,
): string {
  const ratio = meanRadiusM / earthMeanRadiusM;
  if (ratio >= 1.1) {
    return `As wide as ${roundedRatio(ratio)} Earths`;
  }
  if (ratio > 0.9) {
    return "About as wide as Earth";
  }
  return `Earth is about ${roundedRatio(1 / ratio)} times wider`;
}

/** Earth's sourced mean radius, the yardstick for every "compared with Earth" line. */
export const EARTH_MEAN_RADIUS_M = (() => {
  const earth = majorBodySnapshot.bodies.find((body) => body.id === "earth");
  if (earth === undefined) {
    throw new Error("Major-body snapshot is missing Earth");
  }
  return earth.meanRadiusM;
})();

/** The mean diameter in whole kilometres, for example "12,742 km". */
export function formatDiameterKm(meanRadiusM: number): string {
  return `${rounded((meanRadiusM * 2) / 1_000, 0)} km`;
}

/** The selected-body "Size" line: Earth gives its width, others compare with it. */
export function formatBodySize(
  bodyId: string,
  meanRadiusM: number,
  earthMeanRadiusM: number,
): string {
  return bodyId === "earth"
    ? `Our home: ${formatDiameterKm(meanRadiusM)} wide`
    : formatWidthComparedToEarth(meanRadiusM, earthMeanRadiusM);
}

function counted(value: number, fractionDigits: number, unit: string): string {
  const text = rounded(value, fractionDigits);
  return `${text} ${text === "1" ? unit : `${unit}s`}`;
}

function formatDurationHours(hours: number, longestInHours: number): string {
  if (hours < longestInHours) {
    return `about ${counted(hours, 1, "hour")}`;
  }
  const days = hours / HOURS_PER_DAY;
  if (days < 2 * DAYS_PER_YEAR) {
    const dayText = `about ${counted(days, days < 10 ? 1 : 0, "Earth day")}`;
    return days < 300
      ? dayText
      : `${dayText} (${counted(days / DAYS_PER_YEAR, 1, "year")})`;
  }
  const years = days / DAYS_PER_YEAR;
  return `about ${counted(years, years < 100 ? 1 : 0, "year")}`;
}

/** Orbits shorter than one Earth day read in hours, longer ones in days or years. */
export function formatOrbitalPeriod(periodSeconds: number): string {
  return formatDurationHours(periodSeconds / SECONDS_PER_HOUR, HOURS_PER_DAY);
}

/** The sourced sidereal period in plain words, or undefined when none is sourced. */
export function formatSourcedOrbitalPeriod(bodyId: string): string | undefined {
  const period = SIDEREAL_ORBITAL_PERIOD_BY_ID[bodyId];
  return period === undefined
    ? undefined
    : formatOrbitalPeriod(
        period.siderealPeriodDays * HOURS_PER_DAY * SECONDS_PER_HOUR,
      );
}

/** The live osculating period to four significant figures, in days or years. */
export function formatLiveOrbitalPeriod(periodSeconds: number): string {
  const days = periodSeconds / SECONDS_PER_HOUR / HOURS_PER_DAY;
  const [value, unit] =
    days < 2 * DAYS_PER_YEAR ? [days, "days"] : [days / DAYS_PER_YEAR, "years"];
  return `${value.toLocaleString("en-GB", { maximumSignificantDigits: 4 })} ${unit}`;
}

/** Spins up to 30 hours read in hours, so the Earth and Mars days stay comparable. */
export function formatSpinPeriod(siderealRotationHours: number): string {
  return formatDurationHours(siderealRotationHours, 30);
}

export function formatSpeedWithJetComparison(speedKmS: number): string {
  const speed = `${speedKmS.toLocaleString("en-GB", {
    maximumSignificantDigits: 3,
  })} km/s`;
  const jet = `a jet airliner (${String(JET_AIRLINER_SPEED_KMH)} km/h)`;
  const ratio = (speedKmS * SECONDS_PER_HOUR) / JET_AIRLINER_SPEED_KMH;
  if (ratio >= 1.5) {
    return `${speed}, about ${ratio.toLocaleString("en-GB", {
      maximumSignificantDigits: 2,
    })} times faster than ${jet}`;
  }
  if (ratio > 0.67) {
    return `${speed}, about as fast as ${jet}`;
  }
  return `${speed}, slower than ${jet}`;
}

function requirePositiveDistance(valueM: number, name: string): void {
  if (!Number.isFinite(valueM) || valueM <= 0) {
    throw new Error(`${name} must be finite and positive`);
  }
}

/** A distance to two significant figures in plain words, for example "about 780 million km". */
export function formatPlainDistance(distanceM: number): string {
  requirePositiveDistance(distanceM, "Distance");
  const km = Number((distanceM / 1_000).toPrecision(2));
  if (km >= 1e9) {
    return `about ${rounded(km / 1e9, 1)} billion km`;
  }
  if (km >= 1e6) {
    return `about ${rounded(km / 1e6, 0)} million km`;
  }
  return `about ${rounded(km, 0)} km`;
}

/**
 * The selected-body "From the Sun" line. Other bodies compare with 1 AU,
 * Earth's average distance, not Earth's live distance, which wobbles.
 */
export function formatSunDistance(bodyId: string, distanceM: number): string {
  const plain = formatPlainDistance(distanceM);
  if (bodyId === "earth") {
    return plain;
  }
  const ratio = distanceM / ASTRONOMICAL_UNIT_M;
  const comparison =
    ratio >= 1.1
      ? `about ${roundedRatio(ratio)} times as far as Earth`
      : ratio > 0.9
        ? "about as far as Earth"
        : `Earth is about ${roundedRatio(1 / ratio)} times as far`;
  return `${comparison} (${plain})`;
}

/** How long sunlight takes to travel the given distance, in minutes or hours. */
export function formatSunlightTravelTime(distanceM: number): string {
  requirePositiveDistance(distanceM, "Distance");
  const minutes = distanceM / SPEED_OF_LIGHT_MPS / 60;
  const time =
    minutes < 1
      ? "less than a minute"
      : minutes < 120
        ? `about ${counted(minutes, 0, "minute")}`
        : `about ${counted(minutes / 60, 0, "hour")}`;
  return `takes ${time} to get here`;
}

/**
 * How many parent-body widths fit in the surface-to-surface gap between a
 * moon and its parent, for example "about 30 Earths would fit in the gap".
 */
export function formatGapInParentWidths(
  distanceM: number,
  parentName: string,
  parentRadiusM: number,
  moonRadiusM: number,
): string {
  requirePositiveDistance(distanceM, "Distance");
  requirePositiveDistance(parentRadiusM, `${parentName} radius`);
  requirePositiveDistance(moonRadiusM, "Moon radius");
  const gapM = distanceM - parentRadiusM - moonRadiusM;
  if (gapM <= 0) {
    throw new Error(`The moon and ${parentName} overlap`);
  }
  const ratio = gapM / (2 * parentRadiusM);
  if (ratio < 0.95) {
    return `less than one ${parentName} would fit in the gap`;
  }
  const text = roundedRatio(ratio);
  const name =
    text === "1"
      ? parentName
      : parentName.endsWith("s")
        ? `${parentName}es`
        : `${parentName}s`;
  return `about ${text} ${name} would fit in the gap`;
}

/** The exact live distance in whole kilometres, for the "More detail" grid. */
export function formatExactDistanceKm(distanceM: number): string {
  requirePositiveDistance(distanceM, "Distance");
  return `${rounded(distanceM / 1_000, 0)} km`;
}

/** The live distance in astronomical units to three decimal places. */
export function formatDistanceAu(distanceM: number): string {
  requirePositiveDistance(distanceM, "Distance");
  return `${(distanceM / ASTRONOMICAL_UNIT_M).toLocaleString("en-GB", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} AU`;
}
