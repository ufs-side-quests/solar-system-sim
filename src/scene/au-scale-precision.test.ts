import {
  DirectionalLight,
  Matrix4,
  PerspectiveCamera,
  ShaderChunk,
  Vector3,
} from "three";
import { describe, expect, it } from "vitest";

import {
  applyCameraRelativeDirectionalShadows,
  metreLogDepthChunks,
  CAMERA_RELATIVE_LOOKUP,
} from "./au-scale-precision";

const f = Math.fround;

/** The shadow coordinate as a float32 GPU computes it. */
function float32ShadowUv(
  matrix: Matrix4,
  point: Readonly<[number, number, number]>,
): [number, number] {
  const m = matrix.elements.map(f);
  const [x, y, z] = point.map(f) as [number, number, number];
  const row = (r: number): number =>
    f(
      f(
        f(f((m[r] ?? Number.NaN) * x) + f((m[r + 4] ?? Number.NaN) * y)) +
          f((m[r + 8] ?? Number.NaN) * z),
      ) + (m[r + 12] ?? Number.NaN),
    );
  return [row(0), row(1)];
}

describe("camera-relative directional shadows", () => {
  // The Roadster about 1.27 AU from the origin: 3.946 m is 2.6e-11 AU.
  const modelPosition = new Vector3(0.83, 0.94, 0.21);
  const radiusAu = 1.97 / 1.495978707e11;
  const light = new DirectionalLight();
  light.position
    .copy(modelPosition)
    .add(
      new Vector3(-0.6, -0.7, -0.4).normalize().multiplyScalar(radiusAu * 20),
    );
  light.target.position.copy(modelPosition);
  light.updateMatrixWorld();
  light.target.updateMatrixWorld();
  Object.assign(light.shadow.camera, {
    left: -radiusAu * 1.4,
    right: radiusAu * 1.4,
    top: radiusAu * 1.4,
    bottom: -radiusAu * 1.4,
    near: radiusAu,
    far: radiusAu * 40,
  });
  light.shadow.camera.updateProjectionMatrix();
  const camera = new PerspectiveCamera();
  camera.position
    .copy(modelPosition)
    .add(new Vector3(0.3, 0.2, 0.9).normalize().multiplyScalar(radiusAu * 6));
  camera.updateMatrixWorld();
  const surfacePoint = modelPosition
    .clone()
    .add(new Vector3(0.4, -0.2, 0.5).multiplyScalar(radiusAu));

  it("places a point on a 4 m model to a fraction of a 2048 texel", () => {
    light.shadow.updateMatrices(light);
    const truth = surfacePoint.clone().applyMatrix4(light.shadow.matrix);
    const worldUv = float32ShadowUv(light.shadow.matrix, [
      surfacePoint.x,
      surfacePoint.y,
      surfacePoint.z,
    ]);
    // three's own world-space lookup misses by far more than the map.
    expect(Math.abs(worldUv[0] - truth.x)).toBeGreaterThan(1);

    applyCameraRelativeDirectionalShadows(light, camera);
    light.shadow.updateMatrices(light);
    const relative = surfacePoint.clone().sub(camera.position);
    const relativeUv = float32ShadowUv(light.shadow.matrix, [
      relative.x,
      relative.y,
      relative.z,
    ]);
    const texel = 1 / 2048;
    expect(Math.abs(relativeUv[0] - truth.x)).toBeLessThan(texel / 10);
    expect(Math.abs(relativeUv[1] - truth.y)).toBeLessThan(texel / 10);
  });

  it("makes the shader look up the camera-relative position", () => {
    applyCameraRelativeDirectionalShadows(light, camera);
    expect(ShaderChunk.shadowmap_vertex).toContain(CAMERA_RELATIVE_LOOKUP);
    expect(ShaderChunk.shadowmap_vertex).not.toContain(
      "shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows",
    );
  });
});

describe("metre log depth", () => {
  const metresPerAu = 1.495978707e11;
  const farAu = 1_000_000;
  const { vertex, fragment } = metreLogDepthChunks(metresPerAu, farAu);
  const scale = Number(/\* ([\d.e+-]+);/u.exec(vertex)?.[1]);
  const inverseRange = Number(/\* ([\d.e+-]+)$/u.exec(fragment)?.[1]);
  const depth = (wAu: number): number =>
    f(f(Math.log2(f(1 + f(f(wAu) * f(scale))))) * f(inverseRange));

  it("separates the near and far side of a 4 m car 12 m away", () => {
    const nearAu = 12 / metresPerAu;
    const farSideAu = 16 / metresPerAu;
    // three's own form, log2(1 + w), cannot: 1 + w is 1 in float32.
    expect(f(1 + f(nearAu))).toBe(f(1 + f(farSideAu)));
    expect(depth(farSideAu) - depth(nearAu)).toBeGreaterThan(2 ** -24 * 1000);
  });

  it("maps the far plane to depth 1", () => {
    expect(scale).toBeCloseTo(metresPerAu, -1);
    expect(depth(farAu)).toBeCloseTo(1, 6);
  });
});
