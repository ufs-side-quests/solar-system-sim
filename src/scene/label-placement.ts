// Where a body label sits on screen, clear of the labels already placed.

export type LabelRectangle = Readonly<{
  left: number;
  right: number;
  top: number;
  bottom: number;
}>;

// The boxes scale with the label font size, which comes from the CSS. A name
// is about 0.6 em a letter wide plus the button padding; the box is 2 em tall.
const LABEL_CHARACTER_WIDTH_EM = 0.6;
const LABEL_HORIZONTAL_CHROME_PX = 14;
const LABEL_HALF_HEIGHT_EM = 1;
// The right-side places clear the planet's own label start: 52 px at the
// 0.56rem (8.96 px) font the offset was tuned at.
const LABEL_SIDE_OFFSET_EM = 52 / 8.96;
// The camera target's label sits this far below or above the body's centre.
const CAMERA_TARGET_LABEL_OFFSET_Y_PX = 24;

// How far above or below its body's centre a camera target's label reaches.
export function cameraTargetLabelReachPx(fontPx: number): number {
  return CAMERA_TARGET_LABEL_OFFSET_Y_PX + LABEL_HALF_HEIGHT_EM * fontPx;
}

export type LabelRole = "camera-target" | "overview-planet" | "other";

export type LabelPlacement = Readonly<{
  x: number;
  y: number;
  rectangle: LabelRectangle;
  // Only another body label hides a body label. A guide label (the Sun and
  // planet guides) moves a body label to another place but never hides it.
  overlapsBodyLabel: boolean;
}>;

const overlaps = (a: LabelRectangle, b: LabelRectangle): boolean =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

export function placeBodyLabel(
  input: Readonly<{
    name: string;
    role: LabelRole;
    projectedX: number;
    projectedY: number;
    fontPx: number;
    viewportWidth: number;
    viewportHeight: number;
    guideRectangles: readonly LabelRectangle[];
    bodyRectangles: readonly LabelRectangle[];
  }>,
): LabelPlacement {
  // The caller checks that fontPx is a positive size.
  const { fontPx } = input;
  const width =
    input.name.length * LABEL_CHARACTER_WIDTH_EM * fontPx +
    LABEL_HORIZONTAL_CHROME_PX;
  const halfHeight = LABEL_HALF_HEIGHT_EM * fontPx;
  // A lane is one label box tall plus 1 px, so stacked labels never touch.
  const lane = 2 * halfHeight + 1;
  const side = LABEL_SIDE_OFFSET_EM * fontPx;
  const offsets: readonly (readonly [number, number])[] =
    input.role === "camera-target"
      ? [
          [18, CAMERA_TARGET_LABEL_OFFSET_Y_PX],
          [18, -CAMERA_TARGET_LABEL_OFFSET_Y_PX],
          [-width - 18, CAMERA_TARGET_LABEL_OFFSET_Y_PX],
          [-width - 18, -CAMERA_TARGET_LABEL_OFFSET_Y_PX],
        ]
      : input.role === "overview-planet"
        ? [
            [0, 0],
            [0, -lane],
            [0, lane],
            [side, -lane / 2],
            [side, lane / 2],
            [-width - 22, -lane / 2],
            [-width - 22, lane / 2],
            [side, -lane * 1.5],
            [side, lane * 1.5],
            [-width - 22, -lane * 1.5],
            [-width - 22, lane * 1.5],
          ]
        : [[0, 0]];
  const at = (x: number, y: number): LabelRectangle => ({
    left: x,
    right: x + width,
    top: y - halfHeight,
    bottom: y + halfHeight,
  });
  for (const [offsetX, offsetY] of offsets) {
    const x = Math.min(
      input.viewportWidth - width - 12,
      Math.max(12, input.projectedX + offsetX),
    );
    const y = Math.min(
      input.viewportHeight - 18,
      Math.max(18, input.projectedY + offsetY),
    );
    const rectangle = at(x, y);
    if (
      !input.guideRectangles.some((occupied) =>
        overlaps(rectangle, occupied),
      ) &&
      !input.bodyRectangles.some((occupied) => overlaps(rectangle, occupied))
    ) {
      return { x, y, rectangle, overlapsBodyLabel: false };
    }
  }
  // No clear place: the label stays on its body.
  const rectangle = at(input.projectedX, input.projectedY);
  return {
    x: input.projectedX,
    y: input.projectedY,
    rectangle,
    overlapsBodyLabel: input.bodyRectangles.some((occupied) =>
      overlaps(rectangle, occupied),
    ),
  };
}
