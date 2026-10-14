import { describe, expect, it } from "vitest";

import {
  discoveryMessage,
  EASTER_EGGS,
  hintsAtUnfoundEasterEgg,
  parseFoundEasterEggs,
  segmentClearsSphere,
} from "./easter-eggs";

describe("found easter eggs", () => {
  it("reads stored known ids and ignores unknown ids", () => {
    expect([
      ...parseFoundEasterEggs(
        JSON.stringify(["deep-space-nine", "tie-fighter", 7, "roadster"]),
      ),
    ]).toEqual(["deep-space-nine", "roadster"]);
  });

  it.each([null, "", "{", "not json", "{}", '"deep-space-nine"', "null"])(
    "treats malformed content %j as nothing found",
    (serialized) => {
      expect(parseFoundEasterEggs(serialized).size).toBe(0);
    },
  );

  it("writes one honest origin per egg", () => {
    expect(discoveryMessage("deep-space-nine")).toBe(
      "You found Deep Space Nine! (fictional, from Star Trek)",
    );
    for (const egg of EASTER_EGGS) {
      expect(egg.origin).toMatch(
        egg.id === "roadster" ? /^real, / : /^fictional, from /,
      );
    }
  });
});

describe("easter egg hints", () => {
  const camera = { x: 0, y: 0, z: 10 };
  const body = { x: 0, y: 0, z: 0 };

  it.each([
    ["in front of the body", true, { x: 0, y: 0, z: 2 }],
    ["behind the body", false, { x: 0, y: 0, z: -2 }],
    ["beside the body", true, { x: 2, y: 0, z: 0 }],
    ["just behind the body's edge", false, { x: 0.9, y: 0, z: -3 }],
  ])("an egg %s clears the body: %s", (_, clears, egg) => {
    expect(segmentClearsSphere(camera, egg, body, 1)).toBe(clears);
  });

  it("never clears the body from a camera inside it", () => {
    expect(
      segmentClearsSphere(
        { x: 0, y: 0, z: 0.5 },
        { x: 0, y: 0, z: 5 },
        body,
        1,
      ),
    ).toBe(false);
  });

  it("hints only at eggs the child has not found", () => {
    expect(hintsAtUnfoundEasterEgg("callisto", new Set())).toBe(true);
    expect(
      hintsAtUnfoundEasterEgg(
        "callisto",
        new Set(["death-star-1", "deep-space-nine"]),
      ),
    ).toBe(true);
    expect(
      hintsAtUnfoundEasterEgg(
        "callisto",
        new Set(["death-star-1", "deep-space-nine", "uss-defiant"]),
      ),
    ).toBe(false);
    expect(hintsAtUnfoundEasterEgg("saturn", new Set())).toBe(false);
  });

  it("takes each hint body from the egg's real parent", () => {
    expect(
      Object.fromEntries(EASTER_EGGS.map((egg) => [egg.id, egg.hintBodyIds])),
    ).toEqual({
      "death-star-1": ["callisto"],
      "death-star-2": ["ganymede"],
      "deep-space-nine": ["callisto"],
      "uss-defiant": ["callisto"],
      "discovery-one": ["io"],
      "jovian-monolith": ["jupiter", "io"],
      roadster: ["earth", "mars"],
    });
  });
});
