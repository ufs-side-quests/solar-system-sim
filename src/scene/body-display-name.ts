import { ISS_BODY_ID } from "../physics/iss-ephemeris";
import { additionalKnownSatellites } from "../physics/known-satellites";
import { operationalSpacecraftSnapshot } from "../physics/operational-spacecraft";
import { majorBodySnapshot } from "../physics/solar-system";
import { voyagerSnapshot } from "../physics/voyager-ephemeris";
import { DEEP_SPACE_NINE_OBJECTS } from "./deep-space-nine";
import { DISCOVERY_ONE_BODY_ID, DISCOVERY_ONE_NAME } from "./discovery-one";
import { FICTIONAL_ORBITERS } from "./fictional-orbiters";
import {
  JOVIAN_MONOLITH_BODY_ID,
  JOVIAN_MONOLITH_NAME,
} from "./jovian-monolith";

const displayNameById = new Map<string, string>([
  ...majorBodySnapshot.bodies.map((body) => [body.id, body.name] as const),
  ...additionalKnownSatellites.map((body) => [body.id, body.name] as const),
  ...voyagerSnapshot.probes.map((probe) => [probe.id, probe.name] as const),
  ...operationalSpacecraftSnapshot.spacecraft.map(
    (spacecraft) => [spacecraft.id, spacecraft.name] as const,
  ),
  [ISS_BODY_ID, "International Space Station"],
  [JOVIAN_MONOLITH_BODY_ID, JOVIAN_MONOLITH_NAME],
  [DISCOVERY_ONE_BODY_ID, DISCOVERY_ONE_NAME],
  ...FICTIONAL_ORBITERS.map((orbiter) => [orbiter.id, orbiter.name] as const),
  ...DEEP_SPACE_NINE_OBJECTS.map((object) => [object.id, object.name] as const),
]);

/** The name a child reads for a focusable body; never its internal id. */
export function bodyDisplayName(bodyId: string): string {
  const name = displayNameById.get(bodyId);
  if (name === undefined) {
    throw new Error(`Body ${bodyId} has no display name`);
  }
  return name;
}
