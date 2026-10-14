import {
  CanvasTexture,
  LinearSRGBColorSpace,
  type MeshStandardMaterial,
  type Texture,
} from "three";

// Lit windows calibrated to the scene's sunlight.
//
// The Sun is a light of intensity SOLAR_IRRADIANCE_AT_1_AU with inverse-square
// decay and distances in AU, so a surface square to the Sun at 1 AU gets 7
// scene irradiance units. That stands for the luminous solar constant, about
// 133,000 lx (Darula, Kittler and Gueymard 2005, "Reference luminous solar
// constant and solar luminance for illuminance calculations", Solar Energy
// 79(5): 559-565).
//   1 scene irradiance unit = 133,000 lx / 7 = about 19,000 lx.
// A white matte surface lit by E lx has luminance E / pi cd/m2, and three.js
// shades it as E / pi scene radiance units, so
//   1 scene radiance unit = about 19,000 cd/m2.
// A lit room seen through a window is taken as 300 cd/m2 (an assumed typical
// interior luminance, not a measurement of any station), so
//   window radiance = 300 / 19,000 = about 0.016 scene radiance units.
// After the auto exposure at Jupiter (about 27 times, the inverse square of
// 5.2 AU) that is about as bright as a sunlit grey hull; at 1 AU it is faint.

export const SOLAR_IRRADIANCE_AT_1_AU = 7;
export const LUMINOUS_SOLAR_CONSTANT_LX = 133_000;
export const LIT_WINDOW_LUMINANCE_CD_M2 = 300;
export const LIT_WINDOW_RADIANCE =
  (LIT_WINDOW_LUMINANCE_CD_M2 * SOLAR_IRRADIANCE_AT_1_AU) /
  LUMINOUS_SOLAR_CONSTANT_LX;

/** Warm white, an authored colour in linear sRGB, not a measured spectrum. */
const WARM_WHITE_LINEAR_RGB = [1, 0.8, 0.6] as const;
/** Rec. 709 luminance of the linear warm white. */
const WARM_WHITE_LUMINANCE =
  0.2126 * WARM_WHITE_LINEAR_RGB[0] +
  0.7152 * WARM_WHITE_LINEAR_RGB[1] +
  0.0722 * WARM_WHITE_LINEAR_RGB[2];

/** Linear sRGB emissive colour whose luminance is the lit window radiance. */
export const LIT_WINDOW_EMISSIVE_LINEAR_RGB = WARM_WHITE_LINEAR_RGB.map(
  (channel) => (channel * LIT_WINDOW_RADIANCE) / WARM_WHITE_LUMINANCE,
) as [number, number, number];

/** Texels darker than this are a whole window; lighter than the upper bound, hull. */
const PORTHOLE_DARK_LUMINANCE = 0.15;
const PORTHOLE_HULL_LUMINANCE = 0.35;

/**
 * A window mask from a hull texture whose portholes are painted black: 255
 * on the dark dots, 0 on the hull, with a short ramp at the edges. Input and
 * output are RGBA bytes; the mask is written to every colour channel.
 */
export function portholeMaskFromHullTexture(
  rgba: Uint8ClampedArray,
): Uint8ClampedArray {
  if (rgba.length === 0 || rgba.length % 4 !== 0) {
    throw new Error("Hull texture must be non-empty RGBA bytes");
  }
  const mask = new Uint8ClampedArray(rgba.length);
  for (let index = 0; index < rgba.length; index += 4) {
    const luminance =
      (0.2126 * (rgba[index] ?? 0) +
        0.7152 * (rgba[index + 1] ?? 0) +
        0.0722 * (rgba[index + 2] ?? 0)) /
      255;
    const lit =
      (PORTHOLE_HULL_LUMINANCE - luminance) /
      (PORTHOLE_HULL_LUMINANCE - PORTHOLE_DARK_LUMINANCE);
    const value = Math.round(255 * Math.min(1, Math.max(0, lit)));
    mask[index] = value;
    mask[index + 1] = value;
    mask[index + 2] = value;
    mask[index + 3] = 255;
  }
  return mask;
}

/** The USS Defiant's hull texture "deback1" carries its porthole row. */
export const DEFIANT_PORTHOLE_MATERIAL = "akmainmat_deback1.jpg";
/** Small window and lamp shapes the Defiant's author set to emissive 1. */
export const DEFIANT_WINDOW_MATERIAL = "material_0";

/** Sets a material's emissive colour to the lit window level. */
export function setLitWindowEmissive(material: MeshStandardMaterial): void {
  material.emissive.setRGB(
    ...LIT_WINDOW_EMISSIVE_LINEAR_RGB,
    LinearSRGBColorSpace,
  );
  material.emissiveIntensity = 1;
  material.needsUpdate = true;
}

/**
 * Lights the portholes painted black in a material's base colour texture:
 * the mask comes from the loaded image, so the model file stays unmodified.
 * Returns the mask texture for the caller to track and dispose.
 */
export function lightPaintedPortholes(material: MeshStandardMaterial): Texture {
  const map = material.map;
  const image: unknown = map?.image;
  if (
    map === null ||
    !(image instanceof ImageBitmap || image instanceof HTMLImageElement)
  ) {
    throw new Error(`${material.name} has no loaded hull texture to mask`);
  }
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) {
    throw new Error("A 2D canvas is unavailable for the porthole mask");
  }
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  pixels.data.set(portholeMaskFromHullTexture(pixels.data));
  context.putImageData(pixels, 0, 0);
  const mask = new CanvasTexture(canvas);
  mask.flipY = map.flipY;
  mask.channel = map.channel;
  mask.wrapS = map.wrapS;
  mask.wrapT = map.wrapT;
  material.emissiveMap = mask;
  setLitWindowEmissive(material);
  return mask;
}
