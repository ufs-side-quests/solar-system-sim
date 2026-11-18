import type { MajorBodyDefinition } from "../physics/solar-system-data";

/** Left to right after the Sun's edge: the planets in order, then the Moon and Pluto. */
export const SIZE_LINEUP_BODY_IDS = [
  "mercury",
  "venus",
  "earth",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "moon",
  "pluto",
] as const;

export type SizeLineupCircle = Readonly<{
  id: string;
  name: string;
  meanRadiusM: number;
  /** Radius as a fraction of the largest lineup circle (Jupiter = 1). */
  radius: number;
}>;

export type SizeLineupLayout = Readonly<{
  sun: SizeLineupCircle;
  circles: readonly SizeLineupCircle[];
}>;

/**
 * Every circle, the Sun included, at one scale from the sourced mean radii.
 * The largest lineup body has radius 1, so the Sun's radius is above 1 and
 * the panel shows only its edge.
 */
export function sizeLineupLayout(
  bodies: readonly MajorBodyDefinition[],
): SizeLineupLayout {
  const byId = new Map(bodies.map((body) => [body.id, body] as const));
  const definition = (id: string): MajorBodyDefinition => {
    const body = byId.get(id);
    if (body === undefined) {
      throw new Error(`Size lineup body ${id} is missing from the snapshot`);
    }
    return body;
  };
  const lineup = SIZE_LINEUP_BODY_IDS.map(definition);
  const largestRadiusM = Math.max(...lineup.map((body) => body.meanRadiusM));
  const circle = (body: MajorBodyDefinition): SizeLineupCircle => ({
    id: body.id,
    name: body.name,
    meanRadiusM: body.meanRadiusM,
    radius: body.meanRadiusM / largestRadiusM,
  });
  return { sun: circle(definition("sun")), circles: lineup.map(circle) };
}
