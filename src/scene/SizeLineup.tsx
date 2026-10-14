import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, ReactElement } from "react";

import { majorBodySnapshot } from "../physics/solar-system-data";
import {
  EARTH_MEAN_RADIUS_M,
  formatBodySize,
  formatDiameterKm,
  PLAIN_SURFACE_BY_BODY_ID,
} from "./body-physical-facts";
import { lineupGlobePicture, lineupGlobeSnapshot } from "./lineup-globe-assets";
import { sizeLineupLayout, type SizeLineupCircle } from "./size-lineup";
import { SUNLIGHT_COLOR } from "./visual-assets";

const LAYOUT = sizeLineupLayout(majorBodySnapshot.bodies);
// Built at module load, so a lineup body without a picture or wording fails
// by name before the dialog can open.
const BODY_COLUMNS = LAYOUT.circles.map((circle) => {
  const surface = PLAIN_SURFACE_BY_BODY_ID[circle.id];
  if (surface === undefined) {
    throw new Error(`Size lineup has no surface wording for ${circle.id}`);
  }
  return {
    circle,
    picture: lineupGlobePicture(lineupGlobeSnapshot.pictures, circle.id),
    surface,
  };
});
const SUN_SURFACE = "Plain colour";

/** True when the lineup draws this body, so the card can offer it. */
export function isInSizeLineup(bodyId: string): boolean {
  return (
    bodyId === LAYOUT.sun.id ||
    LAYOUT.circles.some((circle) => circle.id === bodyId)
  );
}

export function SizeLineup({
  selectedBodyId,
  onSelectBody,
  onClose,
}: Readonly<{
  selectedBodyId: string;
  onSelectBody(bodyId: string): void;
  onClose(): void;
}>): ReactElement {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [failedPictureNames, setFailedPictureNames] = useState<
    readonly string[]
  >([]);

  useEffect(() => {
    const opener = document.activeElement;
    closeButtonRef.current?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus();
      }
    };
  }, []);

  const column = (
    circle: SizeLineupCircle,
    className: string,
    art: ReactElement,
  ) => (
    <button
      key={circle.id}
      type="button"
      className={className}
      aria-label={`${circle.name}, ${formatDiameterKm(circle.meanRadiusM)} wide`}
      aria-current={circle.id === selectedBodyId ? "true" : undefined}
      data-lineup-body={circle.id}
      onClick={() => onSelectBody(circle.id)}
    >
      {art}
      <span>{circle.name}</span>
    </button>
  );
  const selected =
    selectedBodyId === LAYOUT.sun.id
      ? { circle: LAYOUT.sun, surface: SUN_SURFACE }
      : BODY_COLUMNS.find(({ circle }) => circle.id === selectedBodyId);

  return (
    <aside
      className="size-lineup"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="panel-heading">
        <strong id={titleId}>Compare sizes</strong>
        <button ref={closeButtonRef} type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="size-lineup-caption">Sizes to scale. Distances are not.</p>
      {failedPictureNames.length === 0 ? null : (
        <p className="size-lineup-error" role="alert">
          {`Picture did not load: ${failedPictureNames.join(", ")}.`}
        </p>
      )}
      <div className="size-lineup-row">
        {column(
          LAYOUT.sun,
          "size-lineup-sun",
          <span
            className="size-lineup-sun-disc"
            aria-hidden="true"
            data-lineup-circle={LAYOUT.sun.id}
            style={
              {
                "--lineup-radius": LAYOUT.sun.radius,
                // The Sun has no picture: a plain disc in the 3D scene's sunlight colour.
                background: SUNLIGHT_COLOR,
              } as CSSProperties
            }
          />,
        )}
        <div className="size-lineup-bodies">
          {BODY_COLUMNS.map(({ circle, picture }) =>
            column(
              circle,
              "size-lineup-body",
              // The picture spans frameHalfWidthMeanRadii mean radii each side
              // of the globe's centre, so its globe sits on the one scale and
              // Saturn's rings reach past it.
              <img
                className="size-lineup-disc"
                src={picture.file}
                width={picture.width}
                height={picture.height}
                alt=""
                data-lineup-circle={circle.id}
                data-frame-half-width={picture.frameHalfWidthMeanRadii}
                style={
                  {
                    "--lineup-radius": circle.radius,
                    "--lineup-frame": picture.frameHalfWidthMeanRadii,
                  } as CSSProperties
                }
                onError={() =>
                  setFailedPictureNames((names) =>
                    names.includes(circle.name)
                      ? names
                      : [...names, circle.name],
                  )
                }
              />,
            ),
          )}
        </div>
      </div>
      <p className="size-lineup-note">
        The Sun is too big to fit, so you see only its edge on the left.
      </p>
      {selected === undefined ? null : (
        <p className="size-lineup-comparison" aria-live="polite">
          <strong>{selected.circle.name}</strong>{" "}
          {formatBodySize(
            selected.circle.id,
            selected.circle.meanRadiusM,
            EARTH_MEAN_RADIUS_M,
          )}
          <small>Surface: {selected.surface}</small>
          {selected.circle.id === "saturn" ? (
            <small>Rings: real Cassini pictures of the main rings</small>
          ) : null}
        </p>
      )}
    </aside>
  );
}
