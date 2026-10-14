import {
  DEEP_SPACE_NINE_BODY_ID,
  USS_DEFIANT_BODY_ID,
} from "../scene/deep-space-nine";
import { DISCOVERY_ONE_BODY_ID } from "../scene/discovery-one";
import { JOVIAN_MONOLITH_BODY_ID } from "../scene/jovian-monolith";
import { ROADSTER_BODY_ID } from "../scene/spacecraft-assets";

export const FOUND_EASTER_EGGS_STORAGE_KEY = "solar-explorer.found-eggs.v1";
export const UNKNOWN_OBJECT_LABEL = "? Unknown object";

/**
 * Hidden objects a child can discover. `hintBodyIds` are the major bodies
 * whose focus or selection shows the egg as an unknown object; each one also
 * hides the hint while the egg is behind it.
 */
export const EASTER_EGGS = [
  {
    id: "death-star-1",
    name: "the Death Star",
    origin: "fictional, from Star Wars",
    hintBodyIds: ["callisto"],
  },
  {
    id: "death-star-2",
    name: "the second Death Star",
    origin: "fictional, from Star Wars",
    hintBodyIds: ["ganymede"],
  },
  {
    id: DEEP_SPACE_NINE_BODY_ID,
    name: "Deep Space Nine",
    origin: "fictional, from Star Trek",
    hintBodyIds: ["callisto"],
  },
  {
    id: USS_DEFIANT_BODY_ID,
    name: "the USS Defiant",
    origin: "fictional, from Star Trek",
    hintBodyIds: ["callisto"],
  },
  {
    id: DISCOVERY_ONE_BODY_ID,
    name: "Discovery One",
    origin: "fictional, from 2001: A Space Odyssey",
    hintBodyIds: ["io"],
  },
  {
    id: JOVIAN_MONOLITH_BODY_ID,
    name: "the Monolith",
    origin: "fictional, from 2010: Odyssey Two",
    hintBodyIds: ["jupiter", "io"],
  },
  {
    id: ROADSTER_BODY_ID,
    name: "Starman's Tesla Roadster",
    origin: "real, launched by SpaceX in 2018",
    hintBodyIds: ["earth", "mars"],
  },
] as const satisfies readonly Readonly<{
  id: string;
  name: string;
  origin: string;
  hintBodyIds: readonly string[];
}>[];

export type EasterEgg = (typeof EASTER_EGGS)[number];
export type EasterEggId = EasterEgg["id"];

const easterEggById = new Map<string, EasterEgg>(
  EASTER_EGGS.map((egg) => [egg.id, egg]),
);

export function isEasterEggId(bodyId: string | null): bodyId is EasterEggId {
  return bodyId !== null && easterEggById.has(bodyId);
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
