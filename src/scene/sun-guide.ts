import type { LabelRectangle } from "./label-placement";

export type ScreenPoint = Readonly<{ x: number; y: number }>;
export type ScreenDisc = Readonly<{ x: number; y: number; radius: number }>;

/** Whether a label's box reaches into a body's drawn disc. */
export function rectangleOverlapsDisc(
  rectangle: LabelRectangle,
  disc: ScreenDisc,
): boolean {
  const nearestX = Math.min(Math.max(disc.x, rectangle.left), rectangle.right);
  const nearestY = Math.min(Math.max(disc.y, rectangle.top), rectangle.bottom);
  return Math.hypot(disc.x - nearestX, disc.y - nearestY) < disc.radius;
}

const AROUND_DISC_STEP_RAD = Math.PI / 12;

/**
 * Places just outside a disc where a guide can end, nearest a direction
 * first: straight out along it, then turning away from it both ways in
 * 15 degree steps, to straight back.
 */
export function pointsAroundDisc(
  disc: ScreenDisc,
  direction: ScreenPoint,
  clearancePx: number,
): ScreenPoint[] {
  const start = Math.atan2(direction.y, direction.x);
  const radius = disc.radius + clearancePx;
  const turns = [0];
  for (let step = 1; step < 12; step += 1) {
    turns.push(step, -step);
  }
  turns.push(12);
  return turns.map((turn) => {
    const angle = start + turn * AROUND_DISC_STEP_RAD;
    return {
      x: disc.x + radius * Math.cos(angle),
      y: disc.y + radius * Math.sin(angle),
    };
  });
}

export function rayToViewportEdge(
  origin: ScreenPoint,
  direction: ScreenPoint,
  viewportWidth: number,
  viewportHeight: number,
  margin: number,
): ScreenPoint {
  if (
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(viewportHeight) ||
    viewportWidth <= margin * 2 ||
    viewportHeight <= margin * 2
  ) {
    throw new Error("Sun guide viewport must contain its margin");
  }
  const directionLength = Math.hypot(direction.x, direction.y);
  if (!Number.isFinite(directionLength) || directionLength <= 0) {
    throw new Error("Sun guide direction must be positive and finite");
  }
  const normalized = {
    x: direction.x / directionLength,
    y: direction.y / directionLength,
  };
  const candidates: number[] = [];
  if (normalized.x > 0) {
    candidates.push((viewportWidth - margin - origin.x) / normalized.x);
  } else if (normalized.x < 0) {
    candidates.push((margin - origin.x) / normalized.x);
  }
  if (normalized.y > 0) {
    candidates.push((viewportHeight - margin - origin.y) / normalized.y);
  } else if (normalized.y < 0) {
    candidates.push((margin - origin.y) / normalized.y);
  }
  const forwardIntersections = candidates.filter(
    (distance) => Number.isFinite(distance) && distance >= 0,
  );
  const edgeDistance = Math.min(...forwardIntersections);
  if (!Number.isFinite(edgeDistance)) {
    throw new Error("Sun guide ray does not intersect the viewport");
  }
  return {
    x: origin.x + normalized.x * edgeDistance,
    y: origin.y + normalized.y * edgeDistance,
  };
}

export function pointInsideViewport(
  point: ScreenPoint,
  viewportWidth: number,
  viewportHeight: number,
  margin: number,
): boolean {
  return (
    point.x >= margin &&
    point.x <= viewportWidth - margin &&
    point.y >= margin &&
    point.y <= viewportHeight - margin
  );
}
