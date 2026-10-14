import { describe, expect, it } from "vitest";

import {
  ECLIPSE_STORY_ENDING,
  ECLIPSE_STORY_STEPS,
} from "../eclipse/eclipse-story";
import { SCALE_TOUR_ENDING, SCALE_TOUR_STEPS } from "./scale-tour";

type GuidedStep =
  (typeof SCALE_TOUR_STEPS)[number] | (typeof ECLIPSE_STORY_STEPS)[number];

const GUIDED_STEPS: readonly GuidedStep[] = [
  ...SCALE_TOUR_STEPS,
  ...ECLIPSE_STORY_STEPS,
];

const NUMBER_WORDS: Readonly<Record<string, string>> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
  thirteen: "13",
  fourteen: "14",
  fifteen: "15",
  sixteen: "16",
  seventeen: "17",
  eighteen: "18",
  nineteen: "19",
  twenty: "20",
  thirty: "30",
  forty: "40",
  fifty: "50",
  sixty: "60",
  seventy: "70",
  eighty: "80",
  ninety: "90",
};

// Names that carry a number, such as "Voyager 1".
const NUMBERED_NAMES = new Set(["voyager"]);

// Each number with what it counts: "49 minute" from "49 minutes", so "lasts
// 49 hours" cannot borrow the 49 of "1 hour 49 minutes". A number in a name
// keys on the name instead ("voyager 1"). A number at the end of a sentence
// keys on nothing and matches only the same.
function numberKeys(text: string): string[] {
  const joined = text.replace(
    /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)-(one|two|three|four|five|six|seven|eight|nine)\b/giu,
    (_match, tens: string, ones: string) =>
      String(
        Number(NUMBER_WORDS[tens.toLowerCase()]) +
          Number(NUMBER_WORDS[ones.toLowerCase()]),
      ),
  );
  const tokens = (
    joined.match(/\d+(?:[.,]\d+)*|[\p{L}']+|[%°.!?;:·]/gu) ?? []
  ).map((token) => token.toLowerCase());
  const keys: string[] = [];
  for (const [index, token] of tokens.entries()) {
    const number = /^\d/u.test(token) ? token : NUMBER_WORDS[token];
    if (number === undefined) {
      continue;
    }
    const previous = tokens[index - 1];
    if (previous !== undefined && NUMBERED_NAMES.has(previous)) {
      keys.push(`${previous} ${number}`);
      continue;
    }
    const word = (tokens[index + 1] ?? "").replace(/'s$/u, "");
    const unit = /^[.!?;:·]$/u.test(word)
      ? ""
      : word === "percent"
        ? "%"
        : word.length > 3
          ? word.replace(/s$/u, "")
          : word;
    keys.push(`${number} ${unit}`.trim());
  }
  return keys;
}

// A rate label names the step's playback rate ("1 hour per second · ...");
// only that rate is a source, never the free text after it.
function rateOnly(timeRateLabel: string): string {
  const rate = timeRateLabel.split(" per second")[0];
  if (rate === undefined || rate === timeRateLabel) {
    return "";
  }
  return rate;
}

function stepSources(step: GuidedStep): string {
  return [
    step.title,
    step.scale,
    step.description,
    step.narration.text,
    rateOnly(step.timeRateLabel),
  ].join(" ");
}

const ENDINGS = [
  {
    id: "scale ending",
    texts: Object.values(SCALE_TOUR_ENDING),
    kidLine: SCALE_TOUR_ENDING.kidLine,
    steps: SCALE_TOUR_STEPS,
  },
  {
    id: "eclipse ending",
    texts: Object.values(ECLIPSE_STORY_ENDING),
    kidLine: ECLIPSE_STORY_ENDING.kidLine,
    steps: ECLIPSE_STORY_STEPS,
  },
] as const;

function wordCount(line: string): number {
  return line
    .trim()
    .split(/\s+/u)
    .filter((word) => word !== "").length;
}

function unsourced(text: string, sources: string): string[] {
  const sourced = new Set(numberKeys(sources));
  return numberKeys(text).filter((key) => !sourced.has(key));
}

describe("number keys", () => {
  it("pair each number, written as digits or as a word, with its unit", () => {
    expect(numberKeys("It lasts one hour and 49 minutes.")).toEqual([
      "1 hour",
      "49 minute",
    ]);
    expect(numberKeys("Voyager 2 takes thirty days")).toEqual([
      "voyager 2",
      "30 day",
    ]);
    expect(
      numberKeys("one minute and forty-nine seconds, 37 percent, thirty"),
    ).toEqual(["1 minute", "49 second", "37 %", "30"]);
  });

  it("reject a borrowed number with another unit, a number word, and a rate's 1", () => {
    const finalContact = ECLIPSE_STORY_STEPS.find(
      (step) => step.id === "london-final-contact",
    );
    const earth = SCALE_TOUR_STEPS.find((step) => step.id === "earth");
    const io = SCALE_TOUR_STEPS.find((step) => step.id === "jupiter-from-io");
    if (finalContact === undefined || earth === undefined || io === undefined) {
      throw new Error("The falsified steps must exist");
    }
    expect(
      unsourced("The eclipse lasts 49 hours.", stepSources(finalContact)),
    ).toEqual(["49 hour"]);
    expect(unsourced("It is thirty km wide.", stepSources(io))).toEqual([
      "30 km",
    ]);
    expect(unsourced("thirty", stepSources(io))).toEqual(["30"]);
    expect(unsourced("Voyager 1 is far.", stepSources(earth))).toEqual([
      "voyager 1",
    ]);
  });
});

describe("child line of every guided step", () => {
  it("is present and short", () => {
    for (const step of GUIDED_STEPS) {
      expect(wordCount(step.kidLine), step.id).toBeGreaterThan(0);
      expect(wordCount(step.kidLine), step.id).toBeLessThanOrEqual(18);
    }
  });

  it("uses only numbers that the step's own sourced text gives", () => {
    for (const step of GUIDED_STEPS) {
      expect(unsourced(step.kidLine, stepSources(step)), step.id).toEqual([]);
    }
  });
});

describe("ending of each guided story", () => {
  it("has a short child line that does not repeat the last step's", () => {
    for (const ending of ENDINGS) {
      expect(wordCount(ending.kidLine), ending.id).toBeGreaterThan(0);
      expect(wordCount(ending.kidLine), ending.id).toBeLessThanOrEqual(18);
      expect(ending.kidLine, ending.id).not.toBe(ending.steps.at(-1)?.kidLine);
    }
  });

  it("uses only numbers that its story's steps give", () => {
    for (const ending of ENDINGS) {
      expect(ending.texts.every((text) => text.trim() !== "")).toBe(true);
      expect(
        unsourced(
          ending.texts.join(" "),
          ending.steps.map((step) => stepSources(step)).join(" "),
        ),
        ending.id,
      ).toEqual([]);
    }
  });
});
