// The camera centres its subject on the canvas. A left-hand panel (the tour
// card or the selected-body card) that reaches past this share of the scene
// width covers that subject: at 1024 px the tour card reaches 53% and the
// selected-body card 48%, at 1440 px only 38% and 34%.
export const LENS_PANEL_COVER_SHARE = 0.4;

// The shift settles in about 300 ms: three time constants of 75 ms leave 5%.
const LENS_SHIFT_TIME_CONSTANT_MS = 75;
const LENS_SHIFT_SNAP_PX = 0.5;

// How far in CSS px the picture moves right so that the subject sits in the
// middle of the free sky right of the panel; 0 when the panel leaves the
// centre clear.
export function lensShiftTargetPx(
  panelRightPx: number,
  sceneWidthPx: number,
): number {
  return panelRightPx > sceneWidthPx * LENS_PANEL_COVER_SHARE
    ? panelRightPx / 2
    : 0;
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
