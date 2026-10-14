import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { majorBodySnapshot } from "../physics/solar-system-data";
import { lineupGlobePicture, lineupGlobeSnapshot } from "./lineup-globe-assets";
import {
  JUPITER_EQUATORIAL_RADIUS_KM,
  JUPITER_POLAR_RADIUS_KM,
  NEPTUNE_EQUATORIAL_RADIUS_KM,
  NEPTUNE_POLAR_RADIUS_KM,
  SATURN_EQUATORIAL_RADIUS_KM,
  SATURN_MAIN_RING_INNER_RADIUS_KM,
  SATURN_MAIN_RING_OUTER_RADIUS_KM,
  SATURN_POLAR_RADIUS_KM,
  URANUS_EQUATORIAL_RADIUS_KM,
  URANUS_POLAR_RADIUS_KM,
} from "./ring-system";
import { SIZE_LINEUP_BODY_IDS } from "./size-lineup";
import {
  nasaMaterialPresentationByBodyId,
  nasaSaturnRingAsset,
  nasaTextureByBodyId,
} from "./visual-assets";

const OBLATE_RADII_KM: Readonly<Record<string, readonly [number, number]>> = {
  jupiter: [JUPITER_EQUATORIAL_RADIUS_KM, JUPITER_POLAR_RADIUS_KM],
  saturn: [SATURN_EQUATORIAL_RADIUS_KM, SATURN_POLAR_RADIUS_KM],
  uranus: [URANUS_EQUATORIAL_RADIUS_KM, URANUS_POLAR_RADIUS_KM],
  neptune: [NEPTUNE_EQUATORIAL_RADIUS_KM, NEPTUNE_POLAR_RADIUS_KM],
};

/** Equatorial and polar radius in km from the sourced radii. */
function sourcedRadiiKm(id: string): readonly [number, number] {
  const meanRadiusKm =
    (majorBodySnapshot.bodies.find((body) => body.id === id)?.meanRadiusM ??
      Number.NaN) / 1_000;
  return OBLATE_RADII_KM[id] ?? [meanRadiusKm, meanRadiusKm];
}

/** Length of the run from the first to the last pixel with alpha > 127. */
function opaqueSpan(count: number, alphaAt: (index: number) => number): number {
  let first = -1;
  let last = -1;
  for (let index = 0; index < count; index += 1) {
    if (alphaAt(index) > 127) {
      if (first < 0) {
        first = index;
      }
      last = index;
    }
  }
  return first < 0 ? 0 : last - first + 1;
}

/** Chord of an ellipse with these half axes, at an offset from its centre. */
function chord(half: number, otherHalf: number, offset: number): number {
  return 2 * half * Math.sqrt(1 - (offset / otherHalf) ** 2);
}

function publicFile(file: string): Buffer {
  return readFileSync(
    fileURLToPath(new URL(`../../public${file}`, import.meta.url)),
  );
}

describe("size lineup globe pictures", () => {
  const pictures = lineupGlobeSnapshot.pictures;

  it("has one picture for each lineup body and nothing else", () => {
    expect(pictures.map((picture) => picture.id)).toEqual([
      ...SIZE_LINEUP_BODY_IDS,
    ]);
  });

  it("keeps the whole lineup download under 400 KB", () => {
    const total = pictures.reduce(
      (sum, picture) => sum + picture.byteLength,
      0,
    );
    expect(total).toBeLessThan(400_000);
  });

  it("installs exactly the rendered files the snapshot names", async () => {
    for (const picture of pictures) {
      const file = publicFile(picture.file);
      expect(file.length, picture.id).toBe(picture.byteLength);
      expect(createHash("sha256").update(file).digest("hex"), picture.id).toBe(
        picture.sha256,
      );
      const metadata = await sharp(file).metadata();
      expect(metadata.format, picture.id).toBe("webp");
      expect(metadata.width, picture.id).toBe(picture.width);
      expect(metadata.height, picture.id).toBe(picture.height);
      expect(metadata.hasAlpha, picture.id).toBe(true);
    }
  });

  it("was rendered from the installed authority maps and sourced radii", () => {
    for (const picture of pictures) {
      const surfaceMap = nasaTextureByBodyId.get(picture.id);
      if (surfaceMap === undefined) {
        expect(picture.surfaceMap, picture.id).toBeUndefined();
        expect(picture.materialColor, picture.id).toBe(
          nasaMaterialPresentationByBodyId.get(picture.id)?.color,
        );
      } else {
        expect(picture.surfaceMap, picture.id).toEqual({
          file: surfaceMap.file,
          sha256: surfaceMap.sha256,
        });
      }
      const meanRadiusKm =
        (majorBodySnapshot.bodies.find((body) => body.id === picture.id)
          ?.meanRadiusM ?? Number.NaN) / 1_000;
      expect(picture.meanRadiusKm, picture.id).toBe(meanRadiusKm);
      const [equatorialKm, polarKm] = sourcedRadiiKm(picture.id);
      expect(picture.equatorialRadiusKm, picture.id).toBe(equatorialKm);
      expect(picture.polarRadiusKm, picture.id).toBe(polarKm);
      const outerKm = picture.rings?.outerRadiusKm ?? equatorialKm;
      expect(picture.frameHalfWidthMeanRadii, picture.id).toBeCloseTo(
        (outerKm / meanRadiusKm) * 1.02,
        5,
      );
    }
  });

  // The hashes lock the files, but only this measures the globe inside each
  // picture, so a render with a wrong camera scale fails here.
  it("draws each globe at the size its frame half width says, within 2 px", async () => {
    for (const picture of pictures) {
      const { data, info } = await sharp(publicFile(picture.file))
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(info.channels, picture.id).toBe(4);
      const alpha = (x: number, y: number) =>
        data[(y * info.width + x) * 4 + 3] ?? Number.NaN;
      const elevation = (picture.render.cameraElevationDeg * Math.PI) / 180;
      const pixelsPerMeanRadius =
        info.width / (2 * picture.frameHalfWidthMeanRadii);
      const [equatorialKm, polarKm] = sourcedRadiiKm(picture.id);
      const equatorialRadius = equatorialKm / picture.meanRadiusKm;
      const polarRadius = polarKm / picture.meanRadiusKm;
      // The flattened globe seen from above its equator is an ellipse.
      const halfWidthPx = pixelsPerMeanRadius * equatorialRadius;
      const halfHeightPx =
        pixelsPerMeanRadius *
        Math.hypot(
          polarRadius * Math.cos(elevation),
          equatorialRadius * Math.sin(elevation),
        );
      // Saturn's rings cross its centre row, so its globe is measured on a
      // row 6 px above the far side of the rings.
      const ringTopPx =
        picture.rings === undefined
          ? 0
          : pixelsPerMeanRadius *
            (picture.rings.outerRadiusKm / picture.meanRadiusKm) *
            Math.sin(elevation);
      const row =
        picture.rings === undefined
          ? info.height / 2
          : Math.floor(info.height / 2 - ringTopPx) - 6;
      const column = info.width / 2;

      const across = opaqueSpan(info.width, (x) => alpha(x, row));
      const down = opaqueSpan(info.height, (y) => alpha(column, y));
      expect(
        Math.abs(
          across -
            chord(halfWidthPx, halfHeightPx, info.height / 2 - (row + 0.5)),
        ),
        `${picture.id} width`,
      ).toBeLessThanOrEqual(2);
      expect(
        Math.abs(
          down -
            chord(halfHeightPx, halfWidthPx, info.width / 2 - (column + 0.5)),
        ),
        `${picture.id} height`,
      ).toBeLessThanOrEqual(2);
    }
  });

  it("gives Saturn its Cassini rings at the true main-ring radii", () => {
    const saturn = lineupGlobePicture(pictures, "saturn");
    expect(saturn.rings).toEqual({
      innerRadiusKm: SATURN_MAIN_RING_INNER_RADIUS_KM,
      outerRadiusKm: SATURN_MAIN_RING_OUTER_RADIUS_KM,
      profileMap: {
        file: nasaSaturnRingAsset?.file,
        sha256: nasaSaturnRingAsset?.sha256,
      },
    });
    expect(
      pictures.filter((picture) => picture.rings !== undefined).length,
    ).toBe(1);
  });

  it("fails by name when a lineup body has no picture", () => {
    expect(() =>
      lineupGlobePicture(
        pictures.filter((picture) => picture.id !== "mars"),
        "mars",
      ),
    ).toThrow("Size lineup has no picture for mars");
  });
});
