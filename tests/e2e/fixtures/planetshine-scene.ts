// Served by Vite to tests/e2e/planetshine.spec.ts: shades a white matte
// plate with the planetshine map through three's PMREM and envMap path, and
// compares the light three gives it with the fill the scene reports.
import {
  DataTexture,
  EquirectangularReflectionMapping,
  FloatType,
  HalfFloatType,
  LinearFilter,
  LinearSRGBColorSpace,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  RGBAFormat,
  Scene,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";

import {
  PLANETSHINE_MAP_HEIGHT,
  PLANETSHINE_MAP_WIDTH,
  planetshineFrame,
  planetshineSourceById,
  writePlanetshineMap,
} from "../../../src/scene/planetshine";

const SIZE = 8;

export function shadePlanetshinePlate(): {
  facingShare: number;
  awayShare: number;
} {
  const source = planetshineSourceById.get("io");
  if (source === undefined) throw new Error("Io albedo is unavailable");
  // Discovery One's geometry: Io's radius 1, the model 1.22 radii from its
  // centre, along a slanted direction, with the Sun 30 degrees off the line.
  const model = new Vector3(0, 0, 0);
  const parent = new Vector3(1, 2, -2).setLength(2_221.6 / 1_821.6);
  const sun = parent.clone().add(
    parent
      .clone()
      .negate()
      .applyAxisAngle(new Vector3(0, 0, 1), Math.PI / 6)
      .setLength(1e6),
  );
  const rotation = new Matrix4();
  const geometry = planetshineFrame(model, parent, sun, 1, rotation);
  const data = new Uint16Array(
    PLANETSHINE_MAP_WIDTH * PLANETSHINE_MAP_HEIGHT * 4,
  );
  const map = new DataTexture(
    data,
    PLANETSHINE_MAP_WIDTH,
    PLANETSHINE_MAP_HEIGHT,
    RGBAFormat,
    HalfFloatType,
  );
  const irradiance = writePlanetshineMap(data, geometry, source, [1, 1, 1]);
  map.mapping = EquirectangularReflectionMapping;
  map.colorSpace = LinearSRGBColorSpace;
  map.magFilter = LinearFilter;
  map.minFilter = LinearFilter;
  map.needsUpdate = true;

  const renderer = new WebGLRenderer();
  const pmrem = new PMREMGenerator(renderer);
  const target = pmrem.fromEquirectangular(map);
  const material = new MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    envMap: target.texture,
    envMapIntensity: 1,
  });
  material.envMapRotation.setFromRotationMatrix(rotation);
  const plate = new Mesh(new PlaneGeometry(0.01, 0.01), material);
  const scene = new Scene();
  scene.add(plate);
  const camera = new PerspectiveCamera(10, 1, 0.001, 10);
  const output = new WebGLRenderTarget(SIZE, SIZE, { type: FloatType });
  const pixels = new Float32Array(SIZE * SIZE * 4);

  // A matte white surface gives out irradiance / pi.
  const shareFacing = (towards: Vector3): number => {
    const normal = towards.clone().normalize();
    plate.lookAt(normal);
    plate.updateMatrixWorld();
    camera.position.copy(normal).multiplyScalar(0.05);
    camera.lookAt(model);
    camera.updateMatrixWorld();
    renderer.setRenderTarget(output);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(output, 0, 0, SIZE, SIZE, pixels);
    renderer.setRenderTarget(null);
    const centre = ((SIZE / 2) * SIZE + SIZE / 2) * 4;
    const luminance =
      0.2126 * (pixels[centre] ?? Number.NaN) +
      0.7152 * (pixels[centre + 1] ?? Number.NaN) +
      0.0722 * (pixels[centre + 2] ?? Number.NaN);
    return (luminance * Math.PI) / irradiance;
  };
  const result = {
    facingShare: shareFacing(parent),
    awayShare: shareFacing(parent.clone().negate()),
  };
  output.dispose();
  target.dispose();
  pmrem.dispose();
  map.dispose();
  material.dispose();
  plate.geometry.dispose();
  renderer.dispose();
  return result;
}
