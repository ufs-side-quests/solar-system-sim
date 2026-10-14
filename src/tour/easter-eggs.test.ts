import { describe, expect, it } from "vitest";

import {
  discoveryMessage,
  EASTER_EGGS,
  parseFoundEasterEggs,
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
