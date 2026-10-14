// The camera centres its subject on the canvas. A left-hand panel (the tour
// card or the selected-body card) that reaches past this share of the scene
// width covers the centre: at 1024 px the tour card reaches 53% and the
// selected-body card 48%, at 1440 px only 38% and 34%.
export const LENS_PANEL_COVER_SHARE = 0.4;

// The shift settles in about 300 ms: three time constants of 75 ms leave 5%.
const LENS_SHIFT_TIME_CONSTANT_MS = 75;
const LENS_SHIFT_SNAP_PX = 0.5;

// A panel's box in scene CSS px, measured from the scene's top left corner.
export type PanelBox = Readonly<{
  left: number;
  right: number;
  top: number;
  bottom: number;
}>;

export type OpenSkyLayout = Readonly<{
  sceneWidthPx: number;
  sceneHeightPx: number;
  // Half the subject's size on screen, around the scene centre where the
  // camera puts it. Infinity when the subject surrounds the camera.
  subjectRadiusPx: number;
  // How far above or below the subject's centre its label reaches. A panel
  // across those rows covers the label of a subject smaller than it.
  subjectLabelReachPx: number;
  // Panels along the left edge: the tour card, the selected-body card.
  leftPanels: readonly PanelBox[];
  // Panels along the right edge: the Display panel.
  rightPanels: readonly PanelBox[];
}>;

// How far in CSS px the picture moves right so that the subject sits in the
// open sky beside a left panel that covers it.
//
// The open sky is the span between the left panel's right edge and the
// canvas's right edge, or the left edge of a right panel, at the rows the
// subject and its label take. A left panel moves the picture only when it
// crosses those rows, reaches past the subject's left edge, and reaches past
// LENS_PANEL_COVER_SHARE of the width, so a card that covers only the rim of
// a large centred subject leaves it alone. The subject goes to the middle of
// the open sky, but never so far that any of it leaves the canvas or goes
// under a right panel: when the open sky is narrower than the subject, the
// subject moves only as far as it still fits, and stays centred when even
// that is not possible.
export function lensShiftTargetPx(layout: OpenSkyLayout): number {
  const {
    sceneWidthPx: width,
    sceneHeightPx: height,
    subjectRadiusPx: radius,
  } = layout;
  const rowsReach = Math.max(radius, layout.subjectLabelReachPx);
  const coversSubjectRows = (panel: PanelBox): boolean =>
    panel.top < height / 2 + rowsReach && panel.bottom > height / 2 - rowsReach;
  const openSkyLeft = Math.max(
    0,
    ...layout.leftPanels
      .filter(
        (panel) =>
          coversSubjectRows(panel) &&
          panel.right >
            Math.max(width * LENS_PANEL_COVER_SHARE, width / 2 - radius),
      )
      .map((panel) => panel.right),
  );
  if (openSkyLeft === 0) {
    return 0;
  }
  const openSkyRight = Math.min(
    width,
    ...layout.rightPanels.filter(coversSubjectRows).map((panel) => panel.left),
  );
  const subjectCentre = Math.min(
    (openSkyLeft + openSkyRight) / 2,
    openSkyRight - radius,
  );
  return Math.max(0, subjectCentre - width / 2);
}

// The on-screen radius in CSS px of a sphere of the given radius seen from
// the given distance, for a camera whose focal length is this many px. The
// sphere's outline is a cone of half angle asin(radius / distance).
export function projectedSphereRadiusPx(
  radius: number,
  distance: number,
  focalLengthPx: number,
): number {
  if (radius >= distance) {
    return Number.POSITIVE_INFINITY;
  }
  return (focalLengthPx * radius) / Math.sqrt(distance ** 2 - radius ** 2);
}

// One frame of the eased shift toward its target, so the subject glides
// instead of jumping when a panel opens, closes or changes width.
export function easeLensShiftPx(
  currentPx: number,
  targetPx: number,
  elapsedMs: number,
): number {
  const next =
    currentPx +
    (targetPx - currentPx) *
      (1 - Math.exp(-elapsedMs / LENS_SHIFT_TIME_CONSTANT_MS));
  return Math.abs(targetPx - next) < LENS_SHIFT_SNAP_PX ? targetPx : next;
}
