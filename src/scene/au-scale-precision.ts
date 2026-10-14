import type { Camera, DirectionalLight } from "three";
import { Matrix4, ShaderChunk, Vector3 } from "three";

// Scene positions are in AU from the Solar System origin. A float32 world
// position there resolves about 9 km, so three's world-space shadow lookup
// cannot place the fragments of a 4 m model: the shadow test returns noise
// (black blocks on the Roadster, speckle on Starman). The camera-relative
// position is exact, because three composes modelViewMatrix in float64 on the
// CPU. So the lookup starts from that position, and the shadow matrix takes
// the camera translation in float64.
const WORLD_SPACE_LOOKUP =
  "shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );";
export const CAMERA_RELATIVE_LOOKUP =
  "shadowWorldPosition = vec4( ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).xyz + shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 1.0 );";

// Every directional shadow in the scene must use cameraRelativeShadowMatrix
// once this runs, because the chunk is shared by all materials.
export function applyCameraRelativeDirectionalShadows(
  light: DirectionalLight,
  camera: Camera,
): void {
  if (!ShaderChunk.shadowmap_vertex.includes(CAMERA_RELATIVE_LOOKUP)) {
    if (!ShaderChunk.shadowmap_vertex.includes(WORLD_SPACE_LOOKUP)) {
      throw new Error(
        "three shadowmap_vertex changed: the camera-relative shadow lookup cannot be applied",
      );
    }
    ShaderChunk.shadowmap_vertex = ShaderChunk.shadowmap_vertex.replace(
      WORLD_SPACE_LOOKUP,
      CAMERA_RELATIVE_LOOKUP,
    );
  }
  const shadow = light.shadow;
  const updateWorldSpaceMatrices = shadow.updateMatrices.bind(shadow);
  shadow.updateMatrices = (shadowLight) => {
    updateWorldSpaceMatrices(shadowLight);
    cameraRelativeShadowMatrix(shadow.matrix, camera.matrixWorld);
  };
}

const cameraTranslation = new Matrix4();
const cameraPosition = new Vector3();

/** Turns a world-space shadow matrix into one that takes world − camera. */
export function cameraRelativeShadowMatrix(
  shadowMatrix: Matrix4,
  cameraMatrixWorld: Matrix4,
): Matrix4 {
  cameraPosition.setFromMatrixPosition(cameraMatrixWorld);
  return shadowMatrix.multiply(
    cameraTranslation.makeTranslation(cameraPosition),
  );
}

// three's logarithmic depth is log2(1 + w), with w the view depth in scene
// units. In AU a model 12 m away has w = 8e-11, and 1 + w is exactly 1 in
// float32: every surface of the model gets the same depth, so far-side and
// shadowed faces draw over the near side in mesh order. The patch measures w
// in metres and maps the fixed far plane to depth 1. With a 24-bit depth
// buffer one step is then about 2.4 parts per million of the distance:
// 0.03 mm at 12 m, 360 km at 1 AU.
const LOG_DEPTH_VERTEX = "vFragDepth = 1.0 + gl_Position.w;";
const LOG_DEPTH_FRAGMENT = "log2( vFragDepth ) * logDepthBufFC * 0.5";

export function metreLogDepthChunks(
  metresPerSceneUnit: number,
  farSceneUnits: number,
): { vertex: string; fragment: string } {
  if (!(metresPerSceneUnit > 0) || !(farSceneUnits > 0)) {
    throw new Error("Log depth scale and far plane must be positive");
  }
  const inverseRange = 1 / Math.log2(1 + farSceneUnits * metresPerSceneUnit);
  return {
    vertex: `vFragDepth = 1.0 + gl_Position.w * ${metresPerSceneUnit.toExponential(12)};`,
    fragment: `log2( vFragDepth ) * ${inverseRange.toExponential(12)}`,
  };
}

/** Call before any material compiles; the camera far plane must stay fixed. */
export function applyMetreLogDepth(
  metresPerSceneUnit: number,
  farSceneUnits: number,
): void {
  const chunks = metreLogDepthChunks(metresPerSceneUnit, farSceneUnits);
  if (
    ShaderChunk.logdepthbuf_vertex.includes(chunks.vertex) &&
    ShaderChunk.logdepthbuf_fragment.includes(chunks.fragment)
  ) {
    return;
  }
  if (
    !ShaderChunk.logdepthbuf_vertex.includes(LOG_DEPTH_VERTEX) ||
    !ShaderChunk.logdepthbuf_fragment.includes(LOG_DEPTH_FRAGMENT)
  ) {
    throw new Error(
      "three logdepthbuf chunks changed: the metre log depth cannot be applied",
    );
  }
  ShaderChunk.logdepthbuf_vertex = ShaderChunk.logdepthbuf_vertex.replace(
    LOG_DEPTH_VERTEX,
    chunks.vertex,
  );
  ShaderChunk.logdepthbuf_fragment = ShaderChunk.logdepthbuf_fragment.replace(
    LOG_DEPTH_FRAGMENT,
    chunks.fragment,
  );
}
