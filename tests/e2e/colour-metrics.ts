// Colour measures shared by the e2e specs that check hue and saturation.
import sharp from "sharp";

/** Linear sRGB to OKLab (Ottosson 2020). */
function oklab([r, g, b]: readonly number[]): [number, number, number] {
  const l = Math.cbrt(
    0.4122214708 * (r ?? Number.NaN) +
      0.5363325363 * (g ?? Number.NaN) +
      0.0514459929 * (b ?? Number.NaN),
  );
  const m = Math.cbrt(
    0.2119034982 * (r ?? Number.NaN) +
      0.6806995451 * (g ?? Number.NaN) +
      0.1073969566 * (b ?? Number.NaN),
  );
  const s = Math.cbrt(
    0.0883024619 * (r ?? Number.NaN) +
      0.2817188376 * (g ?? Number.NaN) +
      0.6299787005 * (b ?? Number.NaN),
  );
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab hue in degrees and chroma per unit lightness, which scale keeps. */
export function hueAndSaturation(
  linearRgb: readonly number[],
): Readonly<{ hueDeg: number; saturation: number }> {
  const [lightness, a, b] = oklab(linearRgb);
  return {
    hueDeg: (Math.atan2(b, a) * 180) / Math.PI,
    saturation: Math.hypot(a, b) / lightness,
  };
}

export const srgbDecode = (byte: number): number => {
  const value = byte / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

/**
 * The area-weighted (cosine of latitude) mean of the installed Mars map in
 * linear sRGB, as scripts/fetch-body-albedo.mjs takes it.
 */
export async function marsMapMeanLinear(): Promise<[number, number, number]> {
  const map = await sharp("public/textures/nasa/mars.webp")
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sum = [0, 0, 0];
  let weightSum = 0;
  for (let y = 0; y < map.info.height; y += 1) {
    const weight = Math.cos(((y + 0.5) / map.info.height - 0.5) * Math.PI);
    for (let x = 0; x < map.info.width; x += 1) {
      const offset = (y * map.info.width + x) * map.info.channels;
      for (let channel = 0; channel < 3; channel += 1) {
        sum[channel] =
          (sum[channel] ?? 0) +
          weight * srgbDecode(map.data[offset + channel] ?? Number.NaN);
      }
      weightSum += weight;
    }
  }
  return [
    (sum[0] ?? Number.NaN) / weightSum,
    (sum[1] ?? Number.NaN) / weightSum,
    (sum[2] ?? Number.NaN) / weightSum,
  ];
}
