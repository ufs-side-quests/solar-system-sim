import {
  DEEP_SPACE_NINE_BODY_ID,
  DEEP_SPACE_NINE_PARENT_BODY_ID,
  USS_DEFIANT_BODY_ID,
} from "../scene/deep-space-nine";
import {
  DISCOVERY_ONE_BODY_ID,
  DISCOVERY_ONE_PARENT_BODY_ID,
} from "../scene/discovery-one";
import {
  type FictionalOrbiter,
  type FictionalOrbiterId,
  fictionalOrbiterById,
} from "../scene/fictional-orbiters";
import {
  JOVIAN_MONOLITH_BODY_ID,
  JOVIAN_MONOLITH_PRIMARY_BODY_ID,
  JOVIAN_MONOLITH_SECONDARY_BODY_ID,
} from "../scene/jovian-monolith";
import { ROADSTER_BODY_ID } from "../scene/spacecraft-assets";

export const FOUND_EASTER_EGGS_STORAGE_KEY = "solar-explorer.found-eggs.v1";
// Game wording, so a child never reads the hint as a real astronomical
// discovery.
export const HIDDEN_SURPRISE_LABEL = "? Hidden surprise";
export const HIDDEN_SURPRISES_GROUP = "Hidden surprises";

function fictionalOrbiterParentBodyId(
  id: FictionalOrbiterId,
): FictionalOrbiter["parentBodyId"] {
  const orbiter = fictionalOrbiterById.get(id);
  if (orbiter === undefined) {
    throw new Error(`Fictional orbiter ${id} is unavailable`);
  }
  return orbiter.parentBodyId;
}

/**
 * Hidden objects a child can discover. `hintBodyIds` are the major bodies
 * whose focus or selection shows the egg as a hidden surprise; each one also
 * hides the hint while the egg is behind it. `cardHint` marks eggs that stay
 * near their hint body, so the selected-body card can promise one is close.
 * `clue` names `clueBodyId`, the body the Focus list flies to before the egg
 * is found, so the list never names an unfound egg.
 */
export const EASTER_EGGS = [
  {
    id: "death-star-1",
    clue: "Near Callisto",
    clueBodyId: fictionalOrbiterParentBodyId("death-star-1"),
    name: "the Death Star",
    origin: "fictional, from Star Wars",
    hintBodyIds: [fictionalOrbiterParentBodyId("death-star-1")],
    cardHint: true,
  },
  {
    id: "death-star-2",
    clue: "Near Ganymede",
    clueBodyId: fictionalOrbiterParentBodyId("death-star-2"),
    name: "the second Death Star",
    origin: "fictional, from Star Wars",
    hintBodyIds: [fictionalOrbiterParentBodyId("death-star-2")],
    cardHint: true,
  },
  {
    id: DEEP_SPACE_NINE_BODY_ID,
    clue: "Near Callisto",
    clueBodyId: DEEP_SPACE_NINE_PARENT_BODY_ID,
    name: "Deep Space Nine",
    origin: "fictional, from Star Trek",
    hintBodyIds: [DEEP_SPACE_NINE_PARENT_BODY_ID],
    cardHint: true,
  },
  {
    id: USS_DEFIANT_BODY_ID,
    clue: "Near Callisto",
    clueBodyId: DEEP_SPACE_NINE_PARENT_BODY_ID,
    name: "the USS Defiant",
    origin: "fictional, from Star Trek",
    hintBodyIds: [DEEP_SPACE_NINE_PARENT_BODY_ID],
    cardHint: true,
  },
  {
    id: DISCOVERY_ONE_BODY_ID,
    clue: "Near Io",
    clueBodyId: DISCOVERY_ONE_PARENT_BODY_ID,
    name: "Discovery One",
    origin: "fictional, from 2001: A Space Odyssey",
    hintBodyIds: [DISCOVERY_ONE_PARENT_BODY_ID],
    cardHint: true,
  },
  {
    id: JOVIAN_MONOLITH_BODY_ID,
    clue: "Between Jupiter and Io",
    clueBodyId: JOVIAN_MONOLITH_SECONDARY_BODY_ID,
    name: "the Monolith",
    origin: "fictional, from 2010: Odyssey Two",
    hintBodyIds: [
      JOVIAN_MONOLITH_PRIMARY_BODY_ID,
      JOVIAN_MONOLITH_SECONDARY_BODY_ID,
    ],
    cardHint: true,
  },
  {
    id: ROADSTER_BODY_ID,
    clue: "Circles the Sun between Earth and Mars",
    // The Roadster is usually far from both planets, so its hint label is
    // out of view from either. From the Sun it is in view.
    clueBodyId: "sun",
    name: "Starman's Tesla Roadster",
    origin: "real, launched by SpaceX in 2018",
    hintBodyIds: ["earth", "mars", "sun"],
    // The Roadster orbits the Sun and is seldom near Earth or Mars.
    cardHint: false,
  },
] as const satisfies readonly Readonly<{
  id: string;
  name: string;
  origin: string;
  clue: string;
  clueBodyId: string;
  hintBodyIds: readonly string[];
  cardHint: boolean;
}>[];

export type EasterEgg = (typeof EASTER_EGGS)[number];
export type EasterEggId = EasterEgg["id"];

const easterEggById = new Map<string, EasterEgg>(
  EASTER_EGGS.map((egg) => [egg.id, egg]),
);

export function isEasterEggId(bodyId: string): bodyId is EasterEggId {
  return easterEggById.has(bodyId);
}

/** True when the card of this body should hint at an unfound nearby egg. */
export function hintsAtUnfoundEasterEgg(
  bodyId: string,
  found: ReadonlySet<EasterEggId>,
): boolean {
  return EASTER_EGGS.some(
    (egg) =>
      egg.cardHint &&
      !found.has(egg.id) &&
      egg.hintBodyIds.some((hintBodyId) => hintBodyId === bodyId),
  );
}

type Point = Readonly<{ x: number; y: number; z: number }>;

/**
 * True when the straight segment from `start` to `end` never enters the
 * sphere. A start inside the sphere never clears it.
 */
export function segmentClearsSphere(
  start: Point,
  end: Point,
  centre: Point,
  radius: number,
): boolean {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const cx = centre.x - start.x;
  const cy = centre.y - start.y;
  const cz = centre.z - start.z;
  const lengthSquared = dx * dx + dy * dy + dz * dz;
  const t =
    lengthSquared === 0
      ? 0
      : Math.min(1, Math.max(0, (cx * dx + cy * dy + cz * dz) / lengthSquared));
  return Math.hypot(cx - t * dx, cy - t * dy, cz - t * dz) >= radius;
}

export function easterEgg(id: EasterEggId): EasterEgg {
  const egg = easterEggById.get(id);
  if (egg === undefined) {
    throw new Error(`Easter egg ${id} is unavailable`);
  }
  return egg;
}

export function discoveryMessage(id: EasterEggId): string {
  const egg = easterEgg(id);
  return `You found ${egg.name}! (${egg.origin})`;
}

export function foundCountText(found: ReadonlySet<EasterEggId>): string {
  return `${String(found.size)} of ${String(EASTER_EGGS.length)} found`;
}

/** The toast line under the egg's own line. */
export function discoveryProgress(found: ReadonlySet<EasterEggId>): string {
  return found.size === EASTER_EGGS.length
    ? `You found every hidden surprise! ${foundCountText(found)}`
    : foundCountText(found);
}

export function hiddenSurprisesHeading(
  found: ReadonlySet<EasterEggId>,
): string {
  return `${HIDDEN_SURPRISES_GROUP} · ${foundCountText(found)}`;
}

export type HiddenSurpriseRow = Readonly<
  | { kind: "found"; eggId: EasterEggId }
  | { kind: "clue"; eggId: EasterEggId; bodyId: string; label: string }
>;

/** One row per egg: found eggs by id, unfound eggs as a clue to fly to. */
export function hiddenSurpriseRows(
  found: ReadonlySet<EasterEggId>,
): readonly HiddenSurpriseRow[] {
  return EASTER_EGGS.map((egg) =>
    found.has(egg.id)
      ? { kind: "found", eggId: egg.id }
      : {
          kind: "clue",
          eggId: egg.id,
          bodyId: egg.clueBodyId,
          label: `? ${egg.clue}`,
        },
  );
}

/** Stored content that is not a JSON array of strings counts as nothing found. */
export function parseFoundEasterEggs(
  serialized: string | null,
): ReadonlySet<EasterEggId> {
  if (serialized === null) {
    return new Set();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return new Set();
  }
  if (!Array.isArray(parsed)) {
    return new Set();
  }
  return new Set(
    parsed.filter(
      (value): value is EasterEggId =>
        typeof value === "string" && isEasterEggId(value),
    ),
  );
}

export function loadFoundEasterEggs(): ReadonlySet<EasterEggId> {
  try {
    return parseFoundEasterEggs(
      window.localStorage.getItem(FOUND_EASTER_EGGS_STORAGE_KEY),
    );
  } catch {
    // Storage is unavailable: finds last for this session only.
    return new Set();
  }
}

export function saveFoundEasterEggs(found: ReadonlySet<EasterEggId>): void {
  try {
    window.localStorage.setItem(
      FOUND_EASTER_EGGS_STORAGE_KEY,
      JSON.stringify([...found]),
    );
  } catch {
    // Storage is unavailable: finds last for this session only.
  }
}

export function forgetFoundEasterEggs(): void {
  try {
    window.localStorage.removeItem(FOUND_EASTER_EGGS_STORAGE_KEY);
  } catch {
    // Storage is unavailable: no finds were kept on this computer.
  }
}
