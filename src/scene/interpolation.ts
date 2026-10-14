import type { BodyState, SimulationState } from "../physics/contracts";

function hermite(
  startPosition: number,
  startVelocity: number,
  endPosition: number,
  endVelocity: number,
  elapsedSeconds: number,
  fraction: number,
): number {
  const fractionSquared = fraction * fraction;
  const fractionCubed = fractionSquared * fraction;
  const startPositionWeight = 2 * fractionCubed - 3 * fractionSquared + 1;
  const startVelocityWeight = fractionCubed - 2 * fractionSquared + fraction;
  const endPositionWeight = -2 * fractionCubed + 3 * fractionSquared;
  const endVelocityWeight = fractionCubed - fractionSquared;
  return (
    startPositionWeight * startPosition +
    startVelocityWeight * elapsedSeconds * startVelocity +
    endPositionWeight * endPosition +
    endVelocityWeight * elapsedSeconds * endVelocity
  );
}

export function interpolateBodyState(
  start: BodyState,
  end: BodyState,
  startTimeSeconds: number,
  endTimeSeconds: number,
  untrustedFraction: number,
): BodyState {
  if (start.id !== end.id) {
    throw new Error(`Cannot interpolate ${start.id} to ${end.id}`);
  }
  const fraction = Math.max(0, Math.min(1, untrustedFraction));
  const durationSeconds = endTimeSeconds - startTimeSeconds;
  const positionM = start.positionM.map((startPosition, index) =>
    hermite(
      startPosition,
      start.velocityMps[index] ?? 0,
      end.positionM[index] ?? 0,
      end.velocityMps[index] ?? 0,
      durationSeconds,
      fraction,
    ),
  ) as [number, number, number];
  const velocityMps = start.velocityMps.map(
    (startVelocity, index) =>
      startVelocity +
      ((end.velocityMps[index] ?? 0) - startVelocity) * fraction,
  ) as [number, number, number];
  return {
    id: start.id,
    gravitationalParameterM3S2: start.gravitationalParameterM3S2,
    positionM,
    velocityMps,
  };
}

export type SimulationFrame = Readonly<{
  start: SimulationState;
  end: SimulationState;
  transitionDurationMs: number;
  trailStates?: readonly SimulationState[];
}>;

// A state for the trails to draw, and whether the clock jumped to it (a seek
// or a hold) instead of running to it.
export type TrailStep = Readonly<{
  state: SimulationState;
  jumped: boolean;
}>;

// Trail steps wait here, oldest first, until the scene draws them. A queue
// that had to drop steps nobody drew in time (a background tab, or the
// schematic map) says so, and the trails start again: a line straight across
// the missing time would show a path the planets never took.
export type TrailQueue = { steps: TrailStep[]; dropped: boolean };

export function enqueueTrailSteps(
  queue: TrailQueue,
  steps: readonly TrailStep[],
  capacity: number,
): void {
  queue.steps.push(...steps);
  const excess = queue.steps.length - capacity;
  if (excess > 0) {
    queue.steps.splice(0, excess);
    queue.dropped = true;
  }
}

export function interpolateSimulationFrame(
  frame: SimulationFrame,
  fraction: number,
): SimulationState {
  const endBodies = new Map(frame.end.bodies.map((body) => [body.id, body]));
  return {
    timeSeconds:
      frame.start.timeSeconds +
      (frame.end.timeSeconds - frame.start.timeSeconds) * fraction,
    energy:
      frame.start.energy + (frame.end.energy - frame.start.energy) * fraction,
    bodies: frame.start.bodies.map((startBody) => {
      const endBody = endBodies.get(startBody.id);
      if (endBody === undefined) {
        throw new Error(
          `Interpolation endpoint is missing body ${startBody.id}`,
        );
      }
      return interpolateBodyState(
        startBody,
        endBody,
        frame.start.timeSeconds,
        frame.end.timeSeconds,
        fraction,
      );
    }),
  };
}
