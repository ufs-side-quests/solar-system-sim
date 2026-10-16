import {
  BufferGeometry,
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Quaternion,
  RingGeometry,
  SRGBColorSpace,
  SphereGeometry,
  TextureLoader,
  TorusGeometry,
  Vector3,
} from "three";
import type { Texture } from "three";

import { ASTRONOMICAL_UNIT_M } from "../physics/solar-system";
import type { FictionalOrbiter } from "./fictional-orbiters";

function selectableMesh(
  geometry: BufferGeometry,
  material: MeshPhysicalMaterial | MeshStandardMaterial,
  bodyId: string,
): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.userData["bodyId"] = bodyId;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function loadFictionalTexture(
  url: string,
  onTextureError: (url: string) => void,
): Texture {
  return new TextureLoader().load(url, undefined, undefined, () => {
    onTextureError(url);
  });
}

function createPanelledHullMaterial(
  onTextureError: (url: string) => void,
): MeshPhysicalMaterial {
  const hullTexture = loadFictionalTexture(
    "/textures/fictional/death-star-hull-v2.webp",
    onTextureError,
  );
  hullTexture.name =
    "Original equirectangular fictional battle-station hull texture";
  hullTexture.colorSpace = SRGBColorSpace;
  return new MeshPhysicalMaterial({
    name: "Fictional battle station integrated PBR panelled hull",
    color: 0xd8dcdd,
    map: hullTexture,
    bumpMap: hullTexture,
    bumpScale: 0.0035,
    emissive: 0x000000,
    emissiveIntensity: 0,
    metalness: 0.34,
    roughness: 0.74,
    clearcoat: 0.025,
    clearcoatRoughness: 0.86,
    dithering: true,
  });
}

function createInteriorMaterial(
  onTextureError: (url: string) => void,
): MeshPhysicalMaterial {
  const interiorTexture = loadFictionalTexture(
    "/textures/fictional/death-star-interior.webp",
    onTextureError,
  );
  interiorTexture.name =
    "Original fictional unfinished battle-station interior texture";
  interiorTexture.colorSpace = SRGBColorSpace;
  return new MeshPhysicalMaterial({
    name: "Fictional battle station dense machinery interior",
    color: 0x798084,
    map: interiorTexture,
    bumpMap: interiorTexture,
    bumpScale: 0.005,
    emissive: 0x000000,
    emissiveIntensity: 0,
    metalness: 0.48,
    roughness: 0.76,
    side: DoubleSide,
  });
}

// The superlaser dish, in the model's frame: the hull is a sphere of radius
// DEATH_STAR_HULL_RADIUS about the origin. The dish frame has its origin on
// the dish axis at SUPERLASER_RIM_DISTANCE from the centre, and its +z along
// the axis, out of the dish.
const SUPERLASER_AXIS = new Vector3(0.36, 0.3, 0.884).normalize();
const SUPERLASER_RIM_DISTANCE = 1.002;
const SUPERLASER_DISH_RADIUS = 0.185;
const SUPERLASER_RIM_TUBE_RADIUS = 0.006;
const SUPERLASER_DISH_DEPTH = 0.068;
const SUPERLASER_NODE_RADIUS = 0.138;
const SUPERLASER_NODE_COUNT = 8;
/** Front (outward) and back radii and the height of each focusing node. */
const SUPERLASER_NODE_SIZE = [0.007, 0.009, 0.014] as const;
/** Front and back radii and the height of the central emitter. */
const SUPERLASER_EMITTER_SIZE = [0.031, 0.039, 0.022] as const;
/** The emitter and the nodes stand this far above the dish surface. */
const SUPERLASER_HUB_LIFT = 0.009;

/** The hull sphere's radius in model units: the group scales it to metres. */
export const DEATH_STAR_HULL_RADIUS = 1;

/**
 * Half the latitude span of the equatorial trench. The hull texture
 * (death-star-hull-v2.webp, 1,024 rows from pole to pole) draws the trench
 * floor in rows 501 to 522 and its lit lips in rows 499, 500 and 523: 12
 * rows either side of the equator, 2.1 degrees.
 */
export const DEATH_STAR_TRENCH_HALF_LATITUDE_RAD = (12 / 1_024) * Math.PI;

function superlaserDishDepthAt(radius: number): number {
  return (
    -SUPERLASER_DISH_DEPTH *
    (1 - Math.min(radius / SUPERLASER_DISH_RADIUS, 1) ** 2)
  );
}

function superlaserNodeAngle(index: number): number {
  return (index / SUPERLASER_NODE_COUNT) * Math.PI * 2 + Math.PI / 8;
}

/** The dish frame's rotation from the model frame. */
function superlaserFrameQuaternion(): Quaternion {
  return new Quaternion().setFromUnitVectors(
    new Vector3(0, 0, 1),
    SUPERLASER_AXIS,
  );
}

export type DeathStarSuperlaserAnchors = Readonly<{
  /** Unit vector along the dish axis, out of the dish. */
  axis: Vector3;
  /** Angle between the dish axis and the outer edge of the rim. */
  rimAngleRad: number;
  /** Where the hull sphere covers the central emitter, and its front radius. */
  emitter: Readonly<{ position: Vector3; radius: number }>;
  /** Where the hull sphere covers each focusing node, and its front radius. */
  nodes: readonly Readonly<{ position: Vector3; radius: number }>[];
}>;

/**
 * The superlaser's emitter and focusing nodes, in the model's frame. The
 * dish is drawn over the hull without a depth test, while the hull sphere
 * still writes depth across it. So each anchor is the point of the hull
 * sphere straight above its part along the dish axis: a lamp there covers
 * the part when the dish faces the camera, and the hull's depth does not
 * hide it.
 */
export function deathStarSuperlaserAnchors(): DeathStarSuperlaserAnchors {
  const toModel = superlaserFrameQuaternion();
  const onHull = (x: number, y: number): Vector3 =>
    new Vector3(x, y, 0)
      .applyQuaternion(toModel)
      .addScaledVector(
        SUPERLASER_AXIS,
        Math.sqrt(DEATH_STAR_HULL_RADIUS ** 2 - x * x - y * y),
      );
  return {
    axis: SUPERLASER_AXIS.clone(),
    rimAngleRad: Math.asin(
      (SUPERLASER_DISH_RADIUS + SUPERLASER_RIM_TUBE_RADIUS) /
        SUPERLASER_RIM_DISTANCE,
    ),
    emitter: { position: onHull(0, 0), radius: SUPERLASER_EMITTER_SIZE[0] },
    nodes: Array.from({ length: SUPERLASER_NODE_COUNT }, (_, index) => {
      const angle = superlaserNodeAngle(index);
      return {
        position: onHull(
          Math.cos(angle) * SUPERLASER_NODE_RADIUS,
          Math.sin(angle) * SUPERLASER_NODE_RADIUS,
        ),
        radius: SUPERLASER_NODE_SIZE[0],
      };
    }),
  };
}

function createDishSurface(): RingGeometry {
  const geometry = new RingGeometry(0, SUPERLASER_DISH_RADIUS, 96, 12);
  const positions = geometry.attributes["position"];
  if (positions === undefined) {
    throw new Error("Superlaser dish geometry has no positions");
  }
  for (let index = 0; index < positions.count; index += 1) {
    positions.setZ(
      index,
      superlaserDishDepthAt(
        Math.hypot(positions.getX(index), positions.getY(index)),
      ),
    );
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function addSuperlaserAssembly(
  root: Group,
  bodyId: string,
  dishMaterial: MeshPhysicalMaterial,
  structureMaterial: MeshStandardMaterial,
): void {
  const dishRoot = new Group();
  dishRoot.name = "Recessed superlaser assembly";
  dishRoot.userData["bodyId"] = bodyId;
  dishRoot.position
    .copy(SUPERLASER_AXIS)
    .multiplyScalar(SUPERLASER_RIM_DISTANCE);
  dishRoot.quaternion.copy(superlaserFrameQuaternion());
  root.add(dishRoot);

  const dish = selectableMesh(createDishSurface(), dishMaterial, bodyId);
  dish.name = "Concave superlaser reflector";
  dish.renderOrder = 4;
  dishRoot.add(dish);

  for (const radius of [0.047, 0.089, 0.135, SUPERLASER_DISH_RADIUS]) {
    const ring = selectableMesh(
      new TorusGeometry(
        radius,
        radius === SUPERLASER_DISH_RADIUS ? SUPERLASER_RIM_TUBE_RADIUS : 0.0022,
        8,
        96,
      ),
      structureMaterial,
      bodyId,
    );
    ring.name = "Superlaser concentric support";
    ring.position.z = superlaserDishDepthAt(radius) + 0.004;
    ring.renderOrder = 5;
    dishRoot.add(ring);
  }
  const hub = new Vector3(0, 0, superlaserDishDepthAt(0) + SUPERLASER_HUB_LIFT);
  for (let index = 0; index < SUPERLASER_NODE_COUNT; index += 1) {
    const angle = superlaserNodeAngle(index);
    const nodePosition = new Vector3(
      Math.cos(angle) * SUPERLASER_NODE_RADIUS,
      Math.sin(angle) * SUPERLASER_NODE_RADIUS,
      superlaserDishDepthAt(SUPERLASER_NODE_RADIUS) + SUPERLASER_HUB_LIFT,
    );
    const beamVector = nodePosition.clone().sub(hub);
    const spoke = selectableMesh(
      new CylinderGeometry(0.0022, 0.0022, beamVector.length(), 8),
      structureMaterial,
      bodyId,
    );
    spoke.name = "Superlaser focusing beam";
    spoke.position.copy(hub).add(nodePosition).multiplyScalar(0.5);
    spoke.quaternion.setFromUnitVectors(
      new Vector3(0, 1, 0),
      beamVector.normalize(),
    );
    spoke.renderOrder = 5;
    dishRoot.add(spoke);
    const focusingNode = selectableMesh(
      new CylinderGeometry(...SUPERLASER_NODE_SIZE, 12),
      structureMaterial,
      bodyId,
    );
    focusingNode.name = "Superlaser perimeter focusing node";
    focusingNode.rotation.x = Math.PI / 2;
    focusingNode.position.copy(nodePosition);
    focusingNode.renderOrder = 5;
    dishRoot.add(focusingNode);
  }
  const emitter = selectableMesh(
    new CylinderGeometry(...SUPERLASER_EMITTER_SIZE, 32),
    structureMaterial,
    bodyId,
  );
  emitter.name = "Superlaser central emitter";
  emitter.rotation.x = Math.PI / 2;
  emitter.position.copy(hub);
  emitter.renderOrder = 5;
  dishRoot.add(emitter);
}

function addIncompleteSuperstructure(
  root: Group,
  bodyId: string,
  structureMaterial: MeshStandardMaterial,
  darkInteriorMaterial: MeshStandardMaterial,
): void {
  const frame = new Group();
  frame.name = "Death Star II exposed internal construction";
  frame.userData["bodyId"] = bodyId;
  frame.position.z = 0.045;
  frame.scale.setScalar(0.92);
  root.add(frame);

  const voidBacking = selectableMesh(
    new RingGeometry(0, 0.96, 128),
    darkInteriorMaterial,
    bodyId,
  );
  voidBacking.name = "Exposed incomplete hull interior";
  voidBacking.position.z = -0.3;
  frame.add(voidBacking);

  for (const [ringIndex, radius] of [0.2, 0.38, 0.57, 0.76].entries()) {
    const supportRing = selectableMesh(
      new TorusGeometry(
        radius,
        radius < 0.3 ? 0.014 : 0.008,
        7,
        112,
        Math.PI * (1.18 + ringIndex * 0.09),
      ),
      structureMaterial,
      bodyId,
    );
    supportRing.name = "Incomplete station concentric truss";
    supportRing.position.z = -0.12 + radius * 0.09;
    supportRing.rotation.z = -0.72 + ringIndex * 0.31;
    frame.add(supportRing);
  }
  for (let index = 0; index < 9; index += 1) {
    const angle = -1.12 + (index / 8) * Math.PI * 1.45;
    const length = 0.7 + (index % 4) * 0.075;
    const radial = selectableMesh(
      new BoxGeometry(length, 0.013, 0.018),
      structureMaterial,
      bodyId,
    );
    radial.name = "Incomplete station radial truss";
    radial.rotation.z = angle;
    radial.position.set(
      Math.cos(angle) * length * 0.42,
      Math.sin(angle) * length * 0.42,
      -0.08 + (index % 3) * 0.03,
    );
    frame.add(radial);
  }
  for (const [x, y, length, rotation] of [
    [-0.33, 0.28, 0.88, 0.14],
    [0.27, -0.2, 0.72, -0.3],
    [-0.04, -0.5, 0.58, Math.PI / 2],
    [0.48, 0.18, 0.5, Math.PI / 2.8],
  ] as const) {
    const girder = selectableMesh(
      new BoxGeometry(length, 0.018, 0.025),
      structureMaterial,
      bodyId,
    );
    girder.name = "Incomplete station offset construction girder";
    girder.position.set(x, y, 0.055);
    girder.rotation.z = rotation;
    frame.add(girder);
  }
  for (const [x, y, width, height, depth] of [
    [-0.5, 0.5, 0.24, 0.13, -0.005],
    [-0.29, 0.57, 0.17, 0.09, 0.018],
    [0.08, 0.66, 0.21, 0.12, -0.018],
    [0.36, 0.48, 0.18, 0.11, 0.025],
    [0.54, 0.23, 0.16, 0.1, 0.005],
    [-0.58, -0.16, 0.2, 0.11, 0.022],
    [-0.42, -0.42, 0.18, 0.12, -0.014],
    [0.16, -0.57, 0.22, 0.1, 0.018],
    [0.47, -0.36, 0.16, 0.13, -0.006],
  ] as const) {
    const machineryDeck = selectableMesh(
      new BoxGeometry(width, height, 0.036),
      structureMaterial,
      bodyId,
    );
    machineryDeck.name = "Incomplete station machinery deck";
    machineryDeck.position.set(x, y, depth);
    frame.add(machineryDeck);
  }
  for (let index = 0; index < 18; index += 1) {
    const angle = -1.28 + index * 0.151;
    const radius = 0.31 + (index % 5) * 0.105;
    const node = selectableMesh(
      new BoxGeometry(0.035, 0.035, 0.07 + (index % 3) * 0.025),
      structureMaterial,
      bodyId,
    );
    node.name = "Incomplete station truss junction";
    node.position.set(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
      0.04 + (index % 4) * 0.018,
    );
    node.rotation.z = angle;
    frame.add(node);
  }
  const reactor = selectableMesh(
    new CylinderGeometry(0.11, 0.15, 0.72, 36),
    structureMaterial,
    bodyId,
  );
  reactor.name = "Incomplete station reactor spine";
  reactor.rotation.x = Math.PI / 2;
  reactor.position.z = 0.02;
  frame.add(reactor);
}

export const DEATH_STAR_MODEL_VISUAL_SOURCE =
  "original-integrated-pbr-hull-recessed-dish-and-dense-interior-v3";

// onTextureError receives the URL of a texture that failed to load, so the
// caller can show the failure instead of an untextured model.
export function createDeathStarModel(
  orbiter: FictionalOrbiter,
  onTextureError: (url: string) => void,
): Group {
  const group = new Group();
  group.name = `${orbiter.name} detailed physical-scale visualization`;
  group.userData["bodyId"] = orbiter.id;
  group.userData["visualSource"] = DEATH_STAR_MODEL_VISUAL_SOURCE;
  group.scale.setScalar(orbiter.diameterM / 2 / ASTRONOMICAL_UNIT_M);
  const modelRoot = new Group();
  modelRoot.name = `${orbiter.name} presentation geometry`;
  modelRoot.userData["bodyId"] = orbiter.id;
  group.add(modelRoot);

  const hull = createPanelledHullMaterial(onTextureError);
  const structure = new MeshStandardMaterial({
    name: "Fictional exposed construction interior",
    color: 0x303638,
    emissive: 0x000000,
    emissiveIntensity: 0,
    metalness: 0.56,
    roughness: 0.74,
  });
  const interior = createInteriorMaterial(onTextureError);
  const dishStructure = structure.clone();
  dishStructure.name = "Fictional superlaser support structure";
  dishStructure.depthTest = false;
  dishStructure.depthWrite = false;
  const dish = interior.clone();
  dish.name = "Fictional recessed superlaser reflector";
  dish.color.setHex(0x687074);
  dish.emissive.setHex(0x000000);
  dish.emissiveIntensity = 0;
  dish.metalness = 0.42;
  dish.roughness = 0.68;
  dish.depthTest = false;
  dish.depthWrite = false;
  dish.clearcoat = 0.02;
  dish.side = DoubleSide;
  dish.needsUpdate = true;
  dishStructure.needsUpdate = true;

  const spherePhiLength =
    orbiter.constructionState === "complete" ? Math.PI * 2 : Math.PI * 1.5;
  const spherePhiStart =
    orbiter.constructionState === "complete" ? 0 : Math.PI * 0.75;
  const shell = selectableMesh(
    new SphereGeometry(
      DEATH_STAR_HULL_RADIUS,
      192,
      112,
      spherePhiStart,
      spherePhiLength,
    ),
    hull,
    orbiter.id,
  );
  shell.name = `${orbiter.name} main hull`;
  modelRoot.add(shell);

  addSuperlaserAssembly(modelRoot, orbiter.id, dish, dishStructure);

  if (orbiter.constructionState === "incomplete") {
    addIncompleteSuperstructure(modelRoot, orbiter.id, structure, interior);
  }

  return group;
}
