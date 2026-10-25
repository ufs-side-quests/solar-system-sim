import { describe, expect, it } from "vitest";

import { majorBodySnapshot } from "../physics/solar-system";
import {
  discoveryMessage,
  discoveryProgress,
  EASTER_EGGS,
  type EasterEggId,
  hiddenSurpriseRows,
  hiddenSurprisesHeading,
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
    // The Roadster orbits the Sun, so Earth's card makes no promise.
    expect(hintsAtUnfoundEasterEgg("earth", new Set())).toBe(false);
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
      roadster: ["earth", "mars", "sun"],
    });
  });
});

describe("hidden surprise rows", () => {
  it("shows every unfound egg as a clue that names the body it flies to", () => {
    const rows = hiddenSurpriseRows(new Set());
    expect(
      rows.map((row) =>
        row.kind === "clue" ? [row.eggId, row.label, row.bodyId] : row,
      ),
    ).toEqual([
      ["death-star-1", "? Near Callisto", "callisto"],
      ["death-star-2", "? Near Ganymede", "ganymede"],
      ["deep-space-nine", "? Near Callisto", "callisto"],
      ["uss-defiant", "? Near Callisto", "callisto"],
      ["discovery-one", "? Near Io", "io"],
      ["jovian-monolith", "? Between Jupiter and Io", "io"],
      ["roadster", "? Circles the Sun between Earth and Mars", "sun"],
    ]);
    for (const egg of EASTER_EGGS) {
      const clueBody = majorBodySnapshot.bodies.find(
        (body) => body.id === egg.clueBodyId,
      );
      expect(clueBody, egg.id).toBeDefined();
      expect(egg.clue).toContain(clueBody?.name);
      // A clue never names the egg it hides.
      expect(egg.clue.toLowerCase()).not.toContain(
        egg.name.replace(/^the /u, "").toLowerCase(),
      );
    }
  });

  it("flies a clue that names the Sun to the Solar System overview", () => {
    // Focusing the Sun frames its disc, so the Roadster between Earth and
    // Mars is out of view; the overview with the Sun selected shows its hint.
    const focusBodyIds = hiddenSurpriseRows(new Set()).map((row) =>
      row.kind === "clue" ? [row.eggId, row.focusBodyId] : row,
    );
    expect(focusBodyIds).toEqual([
      ["death-star-1", "callisto"],
      ["death-star-2", "ganymede"],
      ["deep-space-nine", "callisto"],
      ["uss-defiant", "callisto"],
      ["discovery-one", "io"],
      ["jovian-monolith", "io"],
      ["roadster", ""],
    ]);
  });

  it("names found eggs and keeps clues for the rest", () => {
    const found = new Set<EasterEggId>(["death-star-1", "roadster"]);
    const rows = hiddenSurpriseRows(found);
    expect(rows.filter((row) => row.kind === "found")).toEqual([
      { kind: "found", eggId: "death-star-1" },
      { kind: "found", eggId: "roadster" },
    ]);
    expect(rows.filter((row) => row.kind === "clue")).toHaveLength(5);
    expect(hiddenSurprisesHeading(found)).toBe(
      "Hidden surprises · 2 of 7 found",
    );
    expect(hiddenSurprisesHeading(new Set())).toBe(
      "Hidden surprises · 0 of 7 found",
    );
  });

  it("counts each find and celebrates only the last one", () => {
    const allButOne = new Set<EasterEggId>(
      EASTER_EGGS.slice(0, -1).map((egg) => egg.id),
    );
    expect(discoveryProgress(new Set(["deep-space-nine"]))).toBe(
      "1 of 7 found",
    );
    expect(discoveryProgress(allButOne)).toBe("6 of 7 found");
    expect(discoveryProgress(new Set(EASTER_EGGS.map((egg) => egg.id)))).toBe(
      "You found every hidden surprise! 7 of 7 found",
    );
  });
});
