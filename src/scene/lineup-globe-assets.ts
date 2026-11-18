import { z } from "zod";

import lineupGlobeSnapshotJson from "../data/lineup-globes.snapshot.json";

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const sourceMapSchema = z.object({
  file: z.string().startsWith("/textures/nasa/"),
  sha256: sha256Schema,
});

const lineupGlobePictureSchema = z
  .object({
    id: z.string().min(1),
    file: z.string().startsWith("/textures/lineup/").endsWith(".webp"),
    contentType: z.literal("image/webp"),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    byteLength: z.number().int().positive(),
    sha256: sha256Schema,
    /** Half the picture width in units of the body's mean radius. */
    frameHalfWidthMeanRadii: z.number().min(1),
    meanRadiusKm: z.number().positive(),
    equatorialRadiusKm: z.number().positive(),
    polarRadiusKm: z.number().positive(),
    surfaceMap: sourceMapSchema.optional(),
    materialColor: z
      .string()
      .regex(/^#[0-9a-f]{6}$/iu)
      .optional(),
    rings: z
      .object({
        innerRadiusKm: z.number().positive(),
        outerRadiusKm: z.number().positive(),
        profileMap: sourceMapSchema,
      })
      .optional(),
    render: z.object({
      renderer: z.string().startsWith("Blender "),
      engine: z.string().min(1),
      camera: z.string().min(1),
      cameraElevationDeg: z.number(),
      globeTurnDeg: z.number(),
      light: z.string().min(1),
      sunStrength: z.number().positive(),
      sunAngleDeg: z.number().positive(),
      ambientStrength: z.number().nonnegative(),
      samples: z.number().int().positive(),
      seed: z.number().int().nonnegative(),
      adaptiveSampling: z.literal(false),
      denoising: z.literal(false),
      transparentBounces: z.number().int().nonnegative(),
      webpQuality: z.number().int().min(1).max(100),
      platform: z.string().min(1),
    }),
    limitations: z.literal(
      "Rendered globe view from the authority map; lighting is illustrative.",
    ),
  })
  // Each picture comes from exactly one source: a surface map or, for
  // Uranus, its sourced plain material colour.
  .refine(
    (picture) =>
      (picture.surfaceMap === undefined) !==
      (picture.materialColor === undefined),
    "A lineup picture needs exactly one of surfaceMap or materialColor",
  );

export type LineupGlobePicture = z.infer<typeof lineupGlobePictureSchema>;

export const lineupGlobeSnapshot = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    generatedBy: z.string().min(1),
    note: z.string().min(1),
    pictures: z.array(lineupGlobePictureSchema).min(1),
  })
  .parse(lineupGlobeSnapshotJson);

/** The picture for one lineup body; throws naming a body with none. */
export function lineupGlobePicture(
  pictures: readonly LineupGlobePicture[],
  bodyId: string,
): LineupGlobePicture {
  const picture = pictures.find((candidate) => candidate.id === bodyId);
  if (picture === undefined) {
    throw new Error(`Size lineup has no picture for ${bodyId}`);
  }
  return picture;
}
