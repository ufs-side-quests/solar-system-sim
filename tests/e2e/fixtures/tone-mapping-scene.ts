// Served by Vite to tests/e2e/tone-mapping.spec.ts: draws flat linear
// colours through the app's tone mapping and three's ACES Filmic on the GPU
// and reads back the sRGB bytes.
import {
  ACESFilmicToneMapping,
  Color,
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";

import { applyHueKeepingToneMapping } from "../../../src/scene/tone-mapping";
import { SUNLIGHT_COLOR } from "../../../src/scene/visual-assets";
import { SOLAR_IRRADIANCE_AT_1_AU } from "../../../src/scene/window-lighting";

const SIZE = 8;

/**
 * The radiance of an 18% Lambert grey square to the Sun, linear sRGB at
 * exposure 1. The auto exposure cancels the inverse square, so this holds at
 * every focus distance.
 */
export function middleGreyFacingTheSun(): [number, number, number] {
  const sunlight = new Color(SUNLIGHT_COLOR);
  const radiance = (channel: number): number =>
    (0.18 * SOLAR_IRRADIANCE_AT_1_AU * channel) / Math.PI;
  return [radiance(sunlight.r), radiance(sunlight.g), radiance(sunlight.b)];
}

export type ToneMappingName = "app" | "aces";

/** sRGB bytes of each linear colour after tone mapping at the exposure. */
export function renderToneMapped(
  colours: readonly (readonly [number, number, number])[],
  exposure: number,
  toneMapping: ToneMappingName,
): [number, number, number][] {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const renderer = new WebGLRenderer({ canvas, preserveDrawingBuffer: true });
  renderer.outputColorSpace = SRGBColorSpace;
  applyHueKeepingToneMapping(renderer);
  if (toneMapping === "aces") renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  const material = new MeshBasicMaterial();
  const scene = new Scene();
  scene.add(new Mesh(new PlaneGeometry(2, 2), material));
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const gl = renderer.getContext();
  const shown = colours.map(([red, green, blue]): [number, number, number] => {
    material.color = new Color().setRGB(red, green, blue, LinearSRGBColorSpace);
    renderer.render(scene, camera);
    const pixel = new Uint8Array(4);
    gl.readPixels(SIZE / 2, SIZE / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return [
      pixel[0] ?? Number.NaN,
      pixel[1] ?? Number.NaN,
      pixel[2] ?? Number.NaN,
    ];
  });
  renderer.dispose();
  return shown;
}
