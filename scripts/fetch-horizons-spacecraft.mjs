import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { URL, URLSearchParams } from "node:url";

const HORIZONS_URL = "https://ssd.jpl.nasa.gov/api/horizons.api";
const EPOCH_JD_TDB = 2_461_041.5;
// Interplanetary spacecraft are sampled about the Solar System Barycenter and
// interpolated with cubic Hermite. Hubble orbits Earth in about 95 minutes, so
// it is sampled about the geocentre and propagated as a two-body orbit around
// the simulation's Earth from the nearest sample (src/physics/operational-spacecraft.ts).
const BARYCENTRIC = {
  center: "500@0",
  stateModel: "cubic Hermite position and velocity",
};
const GEOCENTRIC = {
  center: "500@399",
  stateModel: "two-body propagation around Earth from the nearest sample",
};
const missions = [
  {
    id: "roadster",
    name: "Tesla Roadster and Starman",
    command: "-143205",
    start: "2018-02-07 03:00",
    stop: "2090-01-01",
    step: "5 d",
    maximumDimensionM: 3.946,
    massKg: 1_250,
    ...BARYCENTRIC,
  },
  {
    id: "hubble",
    name: "Hubble Space Telescope",
    command: "-48",
    start: "2026-01-01",
    stop: "2026-10-11",
    // Two-body propagation ignores J2 (about 0.012 m/s² at Hubble's radius),
    // so its error grows as about half that acceleration times the elapsed
    // time squared: at most 15 minutes from a 30 minute sample, about 5 km
    // measured against the one-minute fixture below, inside a 10 km bound.
    step: "30 m",
    maximumDimensionM: 13.2,
    massKg: 11_110,
    ...GEOCENTRIC,
  },
  {
    id: "jwst",
    name: "James Webb Space Telescope",
    command: "-170",
    start: "2026-01-01",
    stop: "2027-01-01",
    step: "6 h",
    maximumDimensionM: 21.197,
    massKg: 6_200,
    ...BARYCENTRIC,
  },
];
// One day of Hubble about the geocentre and of Earth about the Solar System
// Barycenter, both at one-minute steps: the unit tests check the 30 minute
// two-body propagation against them.
const oneMinuteDay = {
  start: "2026-06-01",
  stop: "2026-06-02",
  step: "1 m",
};
const hubbleOneMinuteFixture = {
  name: "Hubble Space Telescope",
  command: "-48",
  ...oneMinuteDay,
  center: GEOCENTRIC.center,
};
const earthOneMinuteFixture = {
  name: "Earth",
  command: "399",
  ...oneMinuteDay,
  center: BARYCENTRIC.center,
};

function quoted(value) {
  return `'${value}'`;
}

function parseVectors(result, mission) {
  const start = result.indexOf("$$SOE");
  const end = result.indexOf("$$EOE");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(
      `Horizons returned no vector block for ${mission.name}: ${result.slice(0, 2_000)}`,
    );
  }
  return result
    .slice(start + "$$SOE".length, end)
    .trim()
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const columns = line.split(",").map((value) => value.trim());
      if (columns.length < 8) {
        throw new Error(`Malformed Horizons row for ${mission.name}: ${line}`);
      }
      const julianDateTdb = Number(columns[0]);
      const state = columns.slice(2, 8).map(Number);
      if (!Number.isFinite(julianDateTdb) || !state.every(Number.isFinite)) {
        throw new Error(`Non-finite Horizons row for ${mission.name}: ${line}`);
      }
      return {
        timeSeconds: (julianDateTdb - EPOCH_JD_TDB) * 86_400,
        positionM: state.slice(0, 3).map((value) => value * 1_000),
        velocityMps: state.slice(3, 6).map((value) => value * 1_000),
      };
    });
}

async function fetchVectors(request) {
  const parameters = new URLSearchParams({
    format: "json",
    COMMAND: quoted(request.command),
    OBJ_DATA: quoted("YES"),
    MAKE_EPHEM: quoted("YES"),
    EPHEM_TYPE: quoted("VECTORS"),
    CENTER: quoted(request.center),
    START_TIME: quoted(request.start),
    STOP_TIME: quoted(request.stop),
    STEP_SIZE: quoted(request.step),
    REF_SYSTEM: quoted("ICRF"),
    REF_PLANE: quoted("FRAME"),
    OUT_UNITS: quoted("KM-S"),
    VEC_TABLE: quoted("2"),
    CSV_FORMAT: quoted("YES"),
  });
  const sourceUrl = `${HORIZONS_URL}?${parameters.toString()}`;
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(
      `Horizons ${request.name} request failed: ${response.status} ${response.statusText}`,
    );
  }
  const body = await response.text();
  const sourceSha256 = createHash("sha256").update(body).digest("hex");
  const json = JSON.parse(body);
  if (typeof json.result !== "string") {
    throw new Error(`Horizons ${request.name} response has no result text`);
  }
  return {
    ...request,
    authority: "NASA/JPL Horizons",
    sourceUrl,
    sourceSha256,
    samples: parseVectors(json.result, request),
  };
}

const spacecraft = [];
for (const mission of missions) {
  spacecraft.push(await fetchVectors(mission));
}

await writeFile(
  new URL("../src/data/operational-spacecraft.snapshot.json", import.meta.url),
  `${JSON.stringify(
    {
      schemaVersion: "2.0.0",
      generatedAt: new Date().toISOString(),
      epoch: {
        julianDateTdb: EPOCH_JD_TDB,
        referenceFrame: "ICRF",
      },
      spacecraft,
    },
    null,
    2,
  )}\n`,
);

await writeFile(
  new URL(
    "../src/physics/fixtures/hubble-and-earth-one-minute.json",
    import.meta.url,
  ),
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      epoch: { julianDateTdb: EPOCH_JD_TDB, referenceFrame: "ICRF" },
      hubble: await fetchVectors(hubbleOneMinuteFixture),
      earth: await fetchVectors(earthOneMinuteFixture),
    },
    null,
    2,
  )}\n`,
);
