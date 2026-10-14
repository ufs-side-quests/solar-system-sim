import { z } from "zod";

import solarPhotosphereJson from "../data/solar-photosphere.snapshot.json";

const triplet = z.tuple([z.number(), z.number(), z.number()]);
const unitColour = triplet.refine(
  (colour) => Math.max(...colour) === 1 && Math.min(...colour) > 0,
  "A linear sRGB colour needs its brightest channel at 1 and none at 0",
);

const CHANNELS = [0, 1, 2] as const;

/** The derived photosphere: see scripts/derive-solar-photosphere.mjs. */
export const solarPhotosphere = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    generatedBy: z.literal("scripts/derive-solar-photosphere.mjs"),
    note: z.string().min(1),
    effectiveTemperatureK: z.number().positive(),
    centreLinearSrgb: unitColour,
    limbDarkeningU: triplet,
    limbDarkeningV: triplet,
    discMeanLinearSrgb: unitColour,
    discMeanSrgbHex: z.string().regex(/^#[0-9a-f]{6}$/u),
    sources: z.array(z.string().min(1)).min(4),
  })
  .refine(
    ({ limbDarkeningU: u, limbDarkeningV: v }) =>
      CHANNELS.every(
        (c) => 1 - u[c] - v[c] > 0 && u[c] > 0 && u[c] + 2 * v[c] > 0,
      ),
    "Limb darkening must stay positive at the limb and fall from centre to limb",
  )
  .parse(solarPhotosphereJson);

/** Plain words for the Sun's computed surface colour. */
export const SUN_SURFACE_WORDING = `Computed colour of a ${solarPhotosphere.effectiveTemperatureK.toLocaleString("en-GB")} K star, darker and redder at the edge`;

/** The technical description behind SUN_SURFACE_WORDING. */
export const SUN_SURFACE_TECHNICAL = `${String(solarPhotosphere.effectiveTemperatureK)} K blackbody (IAU 2015 B3) through the CIE 1931 observer, with Allen limb darkening per colour`;

/** Linear sRGB of the disc at mu, the cosine of the angle from disc centre. */
export function solarDiscLinearSrgb(
  mu: number,
): readonly [number, number, number] {
  const {
    centreLinearSrgb: centre,
    limbDarkeningU: u,
    limbDarkeningV: v,
  } = solarPhotosphere;
  const channel = (c: 0 | 1 | 2) =>
    centre[c] * (1 - u[c] - v[c] + u[c] * mu + v[c] * mu * mu);
  return [channel(0), channel(1), channel(2)];
}
