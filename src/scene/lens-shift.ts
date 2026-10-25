// The cards the subject keeps clear of: the open tour card and the open
// selected-body card. A minimised or collapsed card leaves the centre clear.
export const OPEN_SKY_CARD_SELECTOR =
  ".scale-tour:not(.is-minimised), .selected-body-detail:not(.is-collapsed)";

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
  // The tour card and the selected-body card: along the left edge, or along
  // the bottom of a portrait screen.
  leftPanels: readonly PanelBox[];
  // Panels along the right edge: the Display panel.
  rightPanels: readonly PanelBox[];
}>;

// How far in CSS px the picture moves right so that the subject sits in the
// open sky beside a left panel that covers it.
//
// The open sky is the span between the left panel's right edge and the
// canvas's right edge, or the left edge of a right panel, at the rows the
// subject and its label take. A left panel moves the picture when it crosses
// those rows and reaches past the subject's left edge, so a card never hides
// even the rim of the subject. The subject goes to the middle of the open
// sky, but never so far that any of it leaves the canvas or goes under a
// right panel: when the open sky is narrower than the subject, the subject
// moves only as far as it still fits, and stays centred when even that is not
// possible.
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
        (panel) => coversSubjectRows(panel) && panel.right > width / 2 - radius,
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

// How far in CSS px the picture moves up so that the subject sits in the
// open sky above a card along the bottom of the screen, as on a portrait
// phone.
//
// A card counts when its top edge is below the centre of the scene and
// above the bottom of the subject or its label, and it spans the centre
// column, as a band along the bottom does. A card beside the centre is the
// sideways shift's. The subject goes to the middle of the open sky above the
// highest such card, but never so far that its top leaves the canvas: a
// subject taller than the open sky moves up only until its top meets the
// canvas edge.
export function lensShiftUpTargetPx(layout: OpenSkyLayout): number {
  const {
    sceneWidthPx: width,
    sceneHeightPx: height,
    subjectRadiusPx: radius,
  } = layout;
  const subjectBottom =
    height / 2 + Math.max(radius, layout.subjectLabelReachPx);
  const openSkyBottom = Math.min(
    height,
    ...layout.leftPanels
      .filter(
        (panel) =>
          panel.top > height / 2 &&
          panel.top < subjectBottom &&
          panel.left < width / 2 &&
          panel.right > width / 2,
      )
      .map((panel) => panel.top),
  );
  const subjectCentre = Math.max(openSkyBottom / 2, radius);
  return Math.max(0, height / 2 - subjectCentre);
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
