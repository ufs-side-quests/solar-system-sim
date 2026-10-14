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
      const [equatorialKm, polarKm] = OBLATE_RADII_KM[picture.id] ?? [
        meanRadiusKm,
        meanRadiusKm,
      ];
      expect(picture.equatorialRadiusKm, picture.id).toBe(equatorialKm);
      expect(picture.polarRadiusKm, picture.id).toBe(polarKm);
      const outerKm = picture.rings?.outerRadiusKm ?? equatorialKm;
      expect(picture.frameHalfWidthMeanRadii, picture.id).toBeCloseTo(
        (outerKm / meanRadiusKm) * 1.02,
        5,
      );
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
