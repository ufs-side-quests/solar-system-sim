import { Quaternion, Vector3 } from "three";

import { SPEED_OF_LIGHT_MPS } from "../physics/solar-system";

export type DirectCameraTransitionPhase =
  "orienting" | "travelling" | "arriving" | "settled";

export type DirectCameraTransitionSample = Readonly<{
  phase: DirectCameraTransitionPhase;
  segmentProgress: number;
}>;

export type OrientationTransitionSample = Readonly<{
  settled: boolean;
  progress: number;
}>;

// The rotation and the scale about an anchor that carry a camera part of the
// way from its start offset to its end offset. A caller keeps one and lets
// anchoredCameraMove overwrite it each frame.
export type AnchoredCameraMove = {
  anchor: Vector3;
  rotation: Quaternion;
  scale: number;
};

const DIRECT_ORIENTATION_END = 0.34;
const DIRECT_ARRIVAL_START = 0.68;
// Start and end directions closer than this to opposite (about 172 degrees)
// have no clear shortest turn, so the camera swings level instead.
const NEARLY_OPPOSITE_COSINE = -0.99;
const scratchStartDirection = new Vector3();
const scratchEndDirection = new Vector3();
const scratchFirstTurn = new Quaternion();
const scratchCompleteTurn = new Quaternion();

function smootherStep(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);
}

export function formatViewpointSpeed(speedMps: number): string {
  if (!Number.isFinite(speedMps) || speedMps < 0) {
    throw new Error("Viewpoint speed must be finite and non-negative");
  }
  if (speedMps < 1_000) {
    return `${speedMps.toFixed(0)} m/s`;
  }
  if (speedMps < SPEED_OF_LIGHT_MPS) {
    return `${(speedMps / 1_000).toLocaleString("en-GB", {
      maximumFractionDigits: speedMps < 100_000 ? 1 : 0,
    })} km/s`;
  }
  const lightSpeedMultiple = speedMps / SPEED_OF_LIGHT_MPS;
  return `${lightSpeedMultiple.toLocaleString("en-GB", {
    maximumFractionDigits: lightSpeedMultiple < 10 ? 2 : 0,
  })}× light speed`;
}

export function interpolateLogarithmicDistance(
  startDistance: number,
  endDistance: number,
  progress: number,
): number {
  if (
    !Number.isFinite(startDistance) ||
    !Number.isFinite(endDistance) ||
    startDistance <= 0 ||
    endDistance <= 0
  ) {
    throw new Error("Camera transition distances must be positive and finite");
  }
  if (!Number.isFinite(progress)) {
    throw new Error("Camera transition progress must be finite");
  }
  const clampedProgress = Math.min(1, Math.max(0, progress));
  return Math.exp(
    Math.log(startDistance) +
      (Math.log(endDistance) - Math.log(startDistance)) * clampedProgress,
  );
}

// The direction, square to the start direction, that a flight turns through
// on its way round the anchor. A flight chooses it once, when it begins: the
// anchor and the end pose move while time runs, and a side chosen again each
// frame could flip and jump the camera. For a clear shortest turn the side
// leans toward the end direction; for nearly opposite ends it is level,
// toward the side the end direction leans to.
export function chooseTurnSide(
  startOffset: Vector3,
  endOffset: Vector3,
  levelUp: Vector3,
): Vector3 {
  const startDirection = startOffset.clone().normalize();
  const endDirection = endOffset.clone().normalize();
  const cosine = startDirection.dot(endDirection);
  const side = new Vector3();
  if (cosine > NEARLY_OPPOSITE_COSINE) {
    side.copy(endDirection).addScaledVector(startDirection, -cosine);
  }
  if (side.lengthSq() <= 1e-12) {
    side.crossVectors(levelUp, startDirection);
    if (side.lengthSq() <= 1e-12) {
      side.set(1, 0, 0).cross(startDirection);
      if (side.lengthSq() <= 1e-12) side.set(0, 1, 0).cross(startDirection);
    }
    if (side.dot(endDirection) < 0) side.negate();
  }
  return side.normalize();
}

// The camera changes its distance from the anchor by a constant factor per
// unit of progress, so the anchor's apparent size grows steadily and the
// camera never comes closer than the nearer of the two end distances. Its
// direction from the anchor turns by part of the rotation that carries the
// start direction to the turn side and on to the end direction, about that
// rotation's one axis. While the start, side and end directions lie in one
// plane, the axis is square to it: the shortest turn, or a level swing for
// nearly opposite ends.
export function anchoredCameraMove(
  output: AnchoredCameraMove,
  startPosition: Vector3,
  endPosition: Vector3,
  anchor: Vector3,
  progress: number,
  turnSide: Vector3,
): AnchoredCameraMove {
  const startDirection = scratchStartDirection.subVectors(
    startPosition,
    anchor,
  );
  const endDirection = scratchEndDirection.subVectors(endPosition, anchor);
  const startDistance = startDirection.length();
  const distance = interpolateLogarithmicDistance(
    startDistance,
    endDirection.length(),
    progress,
  );
  startDirection.normalize();
  endDirection.normalize();
  scratchCompleteTurn
    .setFromUnitVectors(turnSide, endDirection)
    .multiply(scratchFirstTurn.setFromUnitVectors(startDirection, turnSide));
  // Take part of the turn about its axis. A slerp would take the shorter way
  // round once the turn passes 180 degrees and flip the camera to the other
  // side; the turn's own sign keeps the way it chose.
  const halfAngle = Math.acos(Math.min(1, Math.max(-1, scratchCompleteTurn.w)));
  const axisScale = Math.sin(halfAngle);
  const partHalfAngle = halfAngle * Math.min(1, Math.max(0, progress));
  output.anchor.copy(anchor);
  if (axisScale <= 1e-12) {
    output.rotation.identity();
  } else {
    const partScale = Math.sin(partHalfAngle) / axisScale;
    output.rotation.set(
      scratchCompleteTurn.x * partScale,
      scratchCompleteTurn.y * partScale,
      scratchCompleteTurn.z * partScale,
      Math.cos(partHalfAngle),
    );
  }
  output.scale = distance / startDistance;
  return output;
}

export function applyAnchoredCameraMove(
  output: Vector3,
  point: Vector3,
  move: AnchoredCameraMove,
): Vector3 {
  return output
    .copy(point)
    .sub(move.anchor)
    .applyQuaternion(move.rotation)
    .multiplyScalar(move.scale)
    .add(move.anchor);
}

export function sampleDirectCameraTransition(
  elapsedMs: number,
  durationMs: number,
): DirectCameraTransitionSample {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new Error(
      "Direct camera transition elapsed time must be finite and non-negative",
    );
  }
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error(
      "Direct camera transition duration must be positive and finite",
    );
  }
  const progress = Math.min(1, elapsedMs / durationMs);
  if (progress >= 1) {
    return { phase: "settled", segmentProgress: 1 };
  }
  if (progress < DIRECT_ORIENTATION_END) {
    return {
      phase: "orienting",
      segmentProgress: smootherStep(progress / DIRECT_ORIENTATION_END),
    };
  }
  const flightProgress =
    (progress - DIRECT_ORIENTATION_END) / (1 - DIRECT_ORIENTATION_END);
  return {
    phase: flightProgress < DIRECT_ARRIVAL_START ? "travelling" : "arriving",
    segmentProgress: smootherStep(flightProgress),
  };
}

export function sampleOrientationTransition(
  elapsedMs: number,
  durationMs: number,
): OrientationTransitionSample {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new Error(
      "Orientation transition elapsed time must be finite and non-negative",
    );
  }
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error(
      "Orientation transition duration must be positive and finite",
    );
  }
  const progress = Math.min(1, elapsedMs / durationMs);
  return {
    settled: progress >= 1,
    progress: smootherStep(progress),
  };
}
