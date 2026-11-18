import { AstroTime } from "astronomy-engine";

import { majorBodySnapshot } from "./solar-system";

const J2000_JULIAN_DAY = 2_451_545;
const SECONDS_PER_DAY = 86_400;

// The present-day model is validated for one year either side of the snapshot
// epoch (simulation time zero).
export const VALIDATED_WINDOW_SECONDS = 365 * SECONDS_PER_DAY;

export function simulationDateUtc(timeSeconds: number): Date {
  if (!Number.isFinite(timeSeconds)) {
    throw new Error("Simulation time must be finite");
  }
  const epochTerrestrialDays = majorBodySnapshot.epoch.value - J2000_JULIAN_DAY;
  return AstroTime.FromTerrestrialTime(
    epochTerrestrialDays + timeSeconds / SECONDS_PER_DAY,
  ).date;
}

// The simulation time of a UTC instant: seconds of terrestrial time since
// the snapshot epoch.
export function simulationSecondsForUtc(isoUtc: string): number {
  const time = new AstroTime(new Date(isoUtc));
  const epochDaysSinceJ2000 = majorBodySnapshot.epoch.value - J2000_JULIAN_DAY;
  return (time.tt - epochDaysSinceJ2000) * SECONDS_PER_DAY;
}

export function formatSimulationDateUtc(timeSeconds: number): string {
  const date = simulationDateUtc(timeSeconds);
  const day = date.getUTCDate().toString().padStart(2, "0");
  const month = date.toLocaleString("en-GB", {
    month: "short",
    timeZone: "UTC",
  });
  const year = date.getUTCFullYear();
  const hours = date.getUTCHours().toString().padStart(2, "0");
  const minutes = date.getUTCMinutes().toString().padStart(2, "0");
  const seconds = date.getUTCSeconds().toString().padStart(2, "0");
  return `${day} ${month} ${String(year)} · ${hours}:${minutes}:${seconds} UTC`;
}

/** The UTC day in plain words, such as "2 August 2026". */
export function formatPlainSimulationDate(timeSeconds: number): string {
  return simulationDateUtc(timeSeconds).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function counted(value: number, unit: string): string {
  return `${value.toLocaleString("en-GB", { maximumFractionDigits: 2 })} ${unit}${value === 1 ? "" : "s"}`;
}

/**
 * How far the clock is from the start of the simulation (the snapshot
 * epoch), in words a child reads: "4 hours after the start". The exact TDB
 * offset stays available to adults beside it.
 */
export function formatPlainSimulationOffset(timeSeconds: number): string {
  if (timeSeconds === 0) {
    return "At the start";
  }
  const seconds = Math.abs(timeSeconds);
  const amount =
    seconds < 60
      ? counted(Math.round(seconds * 10) / 10, "second")
      : seconds < 3_600
        ? counted(Math.round((seconds / 60) * 10) / 10, "minute")
        : seconds < SECONDS_PER_DAY
          ? counted(Math.round((seconds / 3_600) * 10) / 10, "hour")
          : counted(Math.round((seconds / SECONDS_PER_DAY) * 100) / 100, "day");
  return `${amount} ${timeSeconds > 0 ? "after" : "before"} the start`;
}
