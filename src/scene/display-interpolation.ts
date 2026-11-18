import type { SimulationState } from "../physics/contracts";
import { ISS_BODY_ID, withIssEphemeris } from "../physics/iss-ephemeris";
import {
  isOperationalSpacecraftBodyId,
  withOperationalSpacecraft,
} from "../physics/operational-spacecraft";
import {
  interpolateSimulationFrame,
  type SimulationFrame,
} from "./interpolation";

// Bodies with their own ephemeris are evaluated at the exact display time
// instead of Hermite-interpolated: each has a validity window that can begin
// or end between two solver endpoints, and the ISS completes many orbits
// within one endpoint interval.
function withoutDirectEphemerisBodies(state: SimulationState): SimulationState {
  return {
    ...state,
    bodies: state.bodies.filter(
      (body) =>
        body.id !== ISS_BODY_ID && !isOperationalSpacecraftBodyId(body.id),
    ),
  };
}

export function interpolateDisplayedSimulationFrame(
  frame: SimulationFrame,
  fraction: number,
): SimulationState {
  const interpolatedState = interpolateSimulationFrame(
    {
      ...frame,
      start: withoutDirectEphemerisBodies(frame.start),
      end: withoutDirectEphemerisBodies(frame.end),
    },
    fraction,
  );
  return withOperationalSpacecraft(withIssEphemeris(interpolatedState));
}
