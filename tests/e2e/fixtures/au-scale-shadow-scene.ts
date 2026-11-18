// Served by Vite to tests/e2e/au-scale-precision.spec.ts: renders a 4 m floor
// and a block 1 m above it at 1.27 AU from the origin, with the app's patches,
// and reads the floor brightness in the block's shadow and beside it.
import {
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";

import {
  applyCameraRelativeDirectionalShadows,
  applyMetreLogDepth,
} from "../../../src/scene/au-scale-precision";
import { ASTRONOMICAL_UNIT_M } from "../../../src/physics/solar-system";

const SIZE = 128;
const FAR_AU = 1_000_000;

export function renderAuScaleShadow(): { shadowed: number; lit: number } {
  applyMetreLogDepth(ASTRONOMICAL_UNIT_M, FAR_AU);
  const metre = 1 / ASTRONOMICAL_UNIT_M;
  const origin = new Vector3(0.83, 0.94, 0.21);
  const at = (x: number, y: number, z: number): Vector3 =>
    origin.clone().add(new Vector3(x * metre, y * metre, z * metre));

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const renderer = new WebGLRenderer({
    canvas,
    logarithmicDepthBuffer: true,
    preserveDrawingBuffer: true,
  });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  const scene = new Scene();

  const floor = new Mesh(
    new PlaneGeometry(4 * metre, 4 * metre),
    new MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
  );
  floor.position.copy(origin);
  floor.receiveShadow = true;
  scene.add(floor);
  // A 1 m wide block 1 m above the floor; light from +x +z puts its shadow
  // on the floor between x = -1.5 m and x = -0.5 m.
  const block = new Mesh(
    new BoxGeometry(1 * metre, 4 * metre, 0.1 * metre),
    new MeshStandardMaterial({ color: 0xffffff }),
  );
  block.position.copy(at(0, 0, 1));
  block.castShadow = true;
  scene.add(block);

  const camera = new PerspectiveCamera(60, 1, 0.01 * metre, FAR_AU);
  camera.position.copy(at(0, 0, 6));
  camera.lookAt(origin);
  camera.updateMatrixWorld();

  const light = new DirectionalLight(0xffffff, 3);
  light.position.copy(at(10, 0, 10));
  light.target.position.copy(origin);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  Object.assign(light.shadow.camera, {
    left: -4 * metre,
    right: 4 * metre,
    top: 4 * metre,
    bottom: -4 * metre,
    near: 5 * metre,
    far: 25 * metre,
  });
  light.shadow.camera.updateProjectionMatrix();
  scene.add(light, light.target);
  applyCameraRelativeDirectionalShadows(light, camera);

  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const brightness = (point: Vector3): number => {
    const ndc = point.clone().project(camera);
    const x = Math.round(((ndc.x + 1) / 2) * SIZE);
    const y = Math.round(((ndc.y + 1) / 2) * SIZE);
    const pixel = new Uint8Array(4);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return pixel[0] ?? Number.NaN;
  };
  const result = {
    shadowed: brightness(at(-1, 1.5, 0)),
    lit: brightness(at(1.25, 1.5, 0)),
  };
  renderer.dispose();
  return result;
}
