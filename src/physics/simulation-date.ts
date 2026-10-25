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
