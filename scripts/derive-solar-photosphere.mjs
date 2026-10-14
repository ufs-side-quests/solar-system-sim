// Derives the Sun's photosphere colour and per-channel limb darkening for the
// renderer from cited inputs, and writes src/data/solar-photosphere.snapshot.json.
// Usage: pnpm data:solar-photosphere        (writes the snapshot)
//        node scripts/derive-solar-photosphere.mjs --stdout   (prints it)
//
// Model: the disc-integrated spectrum is a 5772 K blackbody B(lambda). Each
// wavelength darkens toward the limb by Allen's law
//   I(lambda, mu) / I(lambda, 1) = 1 - u - v + u mu + v mu^2,  mu = cos(theta).
// The flux-weighted disc mean of that law is 1 - u/3 - v/2, so the centre
// spectrum is B(lambda) / (1 - u/3 - v/2). Projecting I(lambda, mu) through the
// CIE 1931 2 degree observer and the sRGB matrix gives each linear channel as an
// exact quadratic in mu, so the per-channel u and v below are exact, not fitted.
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const path = (relative) =>
  fileURLToPath(new URL(`../${relative}`, import.meta.url));

/** IAU 2015 Resolution B3 nominal solar effective temperature. */
const EFFECTIVE_TEMPERATURE_K = 5772;
// CODATA exact SI constants (2019 SI redefinition).
const PLANCK_J_S = 6.62607015e-34;
const LIGHT_SPEED_M_S = 299_792_458;
const BOLTZMANN_J_K = 1.380649e-23;

// SolarSoft darklimb_u.pro and darklimb_v.pro (D. Alexander, 14 Oct 1996):
// 5th-order polynomial fits, wavelength in angstroms, to the limb-darkening
// constants of Allen's Astrophysical Quantities. Valid 4000 to 15000 angstroms.
const U_POLYNOMIAL = [
  -8.9829751, 0.0069093916, -1.8144591e-6, 2.2540875e-10, -1.3389747e-14,
  3.0453572e-19,
];
const V_POLYNOMIAL = [
  9.289118, -0.0062212632, 1.5788029e-6, -1.9359644e-10, 1.1444469e-14,
  -2.599494e-19,
];
const LIMB_FIT_MIN_ANGSTROM = 4000;
const LIMB_FIT_MAX_ANGSTROM = 15000;

/** IEC 61966-2-1:1999 CIE XYZ (D65) to linear sRGB matrix. */
const XYZ_TO_LINEAR_SRGB = [
  [3.2406, -1.5372, -0.4986],
  [-0.9689, 1.8758, 0.0415],
  [0.0557, -0.204, 1.057],
];

const CMF_FILE = "data/cie-1931-2deg-cmf.csv";

function readColourMatchingFunctions() {
  const rows = readFileSync(path(CMF_FILE), "utf8")
    .split("\n")
    .filter((line) => line !== "" && !line.startsWith("#"))
    .slice(1)
    .map((line) => line.split(",").map(Number));
  if (
    rows.length !== 471 ||
    rows[0][0] !== 360 ||
    rows.at(-1)[0] !== 830 ||
    rows.some((row, index) => row.length !== 4 || row[0] !== 360 + index) ||
    rows.flat().some((value) => !Number.isFinite(value) || value < 0)
  ) {
    throw new Error(`${CMF_FILE} is not the 360 to 830 nm, 1 nm CIE table`);
  }
  return rows;
}

function polynomial(coefficients, x) {
  return coefficients.reduce((sum, a, power) => sum + a * x ** power, 0);
}

function planck(wavelengthNm) {
  const metres = wavelengthNm * 1e-9;
  return (
    (2 * PLANCK_J_S * LIGHT_SPEED_M_S ** 2) /
    metres ** 5 /
    Math.expm1(
      (PLANCK_J_S * LIGHT_SPEED_M_S) /
        (metres * BOLTZMANN_J_K * EFFECTIVE_TEMPERATURE_K),
    )
  );
}

function linearSrgb(xyz) {
  return XYZ_TO_LINEAR_SRGB.map((row) =>
    row.reduce((sum, m, index) => sum + m * xyz[index], 0),
  );
}

function encodeSrgb(linear) {
  return linear <= 0.0031308
    ? 12.92 * linear
    : 1.055 * linear ** (1 / 2.4) - 0.055;
}

const round = (value) => Number(value.toFixed(4));

function deriveSolarPhotosphere() {
  // Linear sRGB of the three terms of the centre spectrum times
  // (1 - u - v), u mu and v mu^2, plus the disc-integrated blackbody.
  const constantXyz = [0, 0, 0];
  const linearXyz = [0, 0, 0];
  const quadraticXyz = [0, 0, 0];
  const blackbodyXyz = [0, 0, 0];
  for (const [wavelengthNm, ...cmf] of readColourMatchingFunctions()) {
    // Below 4000 angstroms the fit is clamped to its 4000 angstrom value.
    const angstrom = Math.min(
      LIMB_FIT_MAX_ANGSTROM,
      Math.max(LIMB_FIT_MIN_ANGSTROM, wavelengthNm * 10),
    );
    const u = polynomial(U_POLYNOMIAL, angstrom);
    const v = polynomial(V_POLYNOMIAL, angstrom);
    const blackbody = planck(wavelengthNm);
    const centre = blackbody / (1 - u / 3 - v / 2);
    for (let axis = 0; axis < 3; axis += 1) {
      constantXyz[axis] += centre * (1 - u - v) * cmf[axis];
      linearXyz[axis] += centre * u * cmf[axis];
      quadraticXyz[axis] += centre * v * cmf[axis];
      blackbodyXyz[axis] += blackbody * cmf[axis];
    }
  }
  const constant = linearSrgb(constantXyz);
  const linear = linearSrgb(linearXyz);
  const quadratic = linearSrgb(quadraticXyz);
  const centre = constant.map((c, i) => c + linear[i] + quadratic[i]);
  const centreScale = Math.max(...centre);
  const blackbody = linearSrgb(blackbodyXyz);
  const blackbodyScale = Math.max(...blackbody);

  // The defining constraint: the limb-darkened disc integrates to the blackbody.
  const discMean = constant.map(
    (c, i) => c + (2 / 3) * linear[i] + 0.5 * quadratic[i],
  );
  const discMeanScale = Math.max(...discMean);
  discMean.forEach((value, i) => {
    if (
      Math.abs(value / discMeanScale - blackbody[i] / blackbodyScale) > 1e-9
    ) {
      throw new Error("The limb-darkened disc does not integrate to B(T)");
    }
  });

  const hex = blackbody
    .map((value) =>
      Math.round(255 * encodeSrgb(value / blackbodyScale))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
  return {
    schemaVersion: "1.0.0",
    generatedBy: "scripts/derive-solar-photosphere.mjs",
    note: "Linear sRGB, brightest channel 1. Per channel c, I_c(mu) = centreLinearSrgb_c * (1 - u_c - v_c + u_c mu + v_c mu^2) with mu the cosine of the angle from disc centre. The disc integrates to the effective-temperature blackbody, whose colour is discMeanSrgbHex.",
    effectiveTemperatureK: EFFECTIVE_TEMPERATURE_K,
    centreLinearSrgb: centre.map((value) => round(value / centreScale)),
    limbDarkeningU: centre.map((value, i) => round(linear[i] / value)),
    limbDarkeningV: centre.map((value, i) => round(quadratic[i] / value)),
    discMeanLinearSrgb: blackbody.map((value) => round(value / blackbodyScale)),
    discMeanSrgbHex: `#${hex}`,
    sources: [
      "IAU 2015 Resolution B3: nominal solar effective temperature 5772 K",
      "CIE 1931 2 degree colour matching functions, 360 to 830 nm at 1 nm, CVRL via colour-science v0.4.7 (data/cie-1931-2deg-cmf.csv)",
      "Limb darkening u(lambda), v(lambda): SolarSoft darklimb_u.pro and darklimb_v.pro (D. Alexander, 1996), polynomial fits to Allen's Astrophysical Quantities, valid 400 to 1500 nm; held at the 400 nm value below 400 nm",
      "IEC 61966-2-1:1999 sRGB: XYZ to linear sRGB matrix and transfer function",
    ],
  };
}

const json = `${JSON.stringify(deriveSolarPhotosphere(), null, 2)}\n`;
if (process.argv.includes("--stdout")) {
  process.stdout.write(json);
} else {
  writeFileSync(path("src/data/solar-photosphere.snapshot.json"), json);
}
