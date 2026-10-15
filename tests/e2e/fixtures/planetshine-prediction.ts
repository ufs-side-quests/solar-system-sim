// The planetshine a model should get, found by integrating over the parent's
// surface instead of over the model's sky (src/scene/planetshine.ts draws
// the sky map). Each visible surface element dA at distance r gives
//   dE = L cos(theta_model) cos(theta_surface) dA / r^2,
// with L from the parent's reflectance law. Returns the irradiance on a
// surface facing the parent's centre as a share of the direct sunlight.
export type PredictionInput = Readonly<{
  law: "lambert" | "lommel-seeliger";
  /** Bond albedo for lambert, visual geometric albedo for lommel-seeliger. */
  albedo: number;
  angularRadiusRad: number;
  phaseAngleRad: number;
}>;

const STEPS = 200;

export function predictedPlanetshineFill(input: PredictionInput): number {
  // Parent: unit sphere at the origin. Model on +z at distance D. Sun, seen
  // from the parent, at the phase angle from +z in the x-z plane.
  const distance = 1 / Math.sin(input.angularRadiusRad);
  const sunX = Math.sin(input.phaseAngleRad);
  const sunZ = Math.cos(input.phaseAngleRad);
  // The model sees the cap within acos(1 / D) of the sub-model point.
  const capRad = Math.acos(1 / distance);
  const dTheta = capRad / STEPS;
  const dPhi = (2 * Math.PI) / STEPS;
  let irradiance = 0;
  for (let i = 0; i < STEPS; i += 1) {
    const theta = (i + 0.5) * dTheta;
    for (let j = 0; j < STEPS; j += 1) {
      const phi = (j + 0.5) * dPhi;
      const nx = Math.sin(theta) * Math.cos(phi);
      const ny = Math.sin(theta) * Math.sin(phi);
      const nz = Math.cos(theta);
      const mu0 = nx * sunX + nz * sunZ;
      if (mu0 <= 0) continue;
      // From the surface point to the model.
      const vx = -nx;
      const vy = -ny;
      const vz = distance - nz;
      const r = Math.hypot(vx, vy, vz);
      const mu = (nx * vx + ny * vy + nz * vz) / r;
      if (mu <= 0) continue;
      const reflectance =
        input.law === "lambert"
          ? input.albedo * mu0
          : (input.albedo * 2 * mu0) / (mu0 + mu);
      const cosModel = vz / r;
      const area = Math.sin(theta) * dTheta * dPhi;
      irradiance += ((reflectance / Math.PI) * cosModel * mu * area) / (r * r);
    }
  }
  return irradiance;
}
