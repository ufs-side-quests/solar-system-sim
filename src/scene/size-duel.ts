import { roundedRatio } from "./body-physical-facts";
import type { SizeLineupCircle } from "./size-lineup";

/**
 * The guess-first pairs, in play order. Each holds a surprise in the sourced
 * radii; the wider body sits first in some pairs and second in others.
 */
export const SIZE_DUEL_PAIRS: readonly (readonly [string, string])[] = [
  ["moon", "pluto"],
  ["moon", "mercury"],
  ["venus", "earth"],
  ["uranus", "neptune"],
  ["saturn", "jupiter"],
  ["mars", "mercury"],
];

export type SizeDuel = Readonly<{
  /** The two bodies in the order the question names them. */
  pair: readonly [SizeLineupCircle, SizeLineupCircle];
  wider: SizeLineupCircle;
  narrower: SizeLineupCircle;
  /** The wider body's mean radius over the narrower one's, above 1. */
  ratio: number;
}>;

/** Every pair from the lineup circles, so the winner comes from the sourced radii. */
export function sizeDuels(
  circles: readonly SizeLineupCircle[],
  pairs: readonly (readonly [string, string])[],
): readonly SizeDuel[] {
  const circle = (id: string): SizeLineupCircle => {
    const found = circles.find((candidate) => candidate.id === id);
    if (found === undefined) {
      throw new Error(`Size duel body ${id} is not in the size lineup`);
    }
    return found;
  };
  return pairs.map(([firstId, secondId]) => {
    const first = circle(firstId);
    const second = circle(secondId);
    if (first.meanRadiusM === second.meanRadiusM) {
      throw new Error(
        `Size duel ${firstId} and ${secondId} have equal radii, so neither is wider`,
      );
    }
    const [wider, narrower] =
      first.meanRadiusM > second.meanRadiusM
        ? [first, second]
        : [second, first];
    return {
      pair: [first, second],
      wider,
      narrower,
      ratio: wider.meanRadiusM / narrower.meanRadiusM,
    };
  });
}

/** The name as it reads inside a sentence: "the Moon", but "Pluto". */
function nameInSentence(circle: SizeLineupCircle): string {
  return circle.id === "moon" ? "the Moon" : circle.name;
}

function capitalised(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

export function sizeDuelQuestion(duel: SizeDuel): string {
  const [first, second] = duel.pair;
  return `Guess first! Which is wider: ${nameInSentence(first)} or ${nameInSentence(second)}?`;
}

/** "The Moon is about 1.5 times wider than Pluto.", or "only a little wider" below 1.1. */
export function formatWidthRatio(duel: SizeDuel): string {
  const wider = capitalised(nameInSentence(duel.wider));
  const narrower = nameInSentence(duel.narrower);
  return duel.ratio < 1.1
    ? `${wider} is only a little wider than ${narrower}.`
    : `${wider} is about ${roundedRatio(duel.ratio)} times wider than ${narrower}.`;
}

export function sizeDuelResult(duel: SizeDuel, guessId: string): string {
  const verdict = guessId === duel.wider.id ? "Yes!" : "Not quite!";
  // Saturn's rings reach past Jupiter, but the question is about the ball.
  const rings = duel.pair.some((circle) => circle.id === "saturn")
    ? " We measure the ball, not the rings."
    : "";
  return `${verdict} ${formatWidthRatio(duel)}${rings}`;
}
