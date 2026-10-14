import { useEffect, useId, useRef } from "react";
import type { CSSProperties, ReactElement } from "react";

import { majorBodySnapshot } from "../physics/solar-system-data";
import { formatBodySize, formatDiameterKm } from "./body-physical-facts";
import { sizeLineupLayout, type SizeLineupCircle } from "./size-lineup";
import {
  nasaMaterialPresentationByBodyId,
  nasaTextureByBodyId,
} from "./visual-assets";

const LAYOUT = sizeLineupLayout(majorBodySnapshot.bodies);
const EARTH_MEAN_RADIUS_M = (() => {
  const earth = LAYOUT.circles.find((circle) => circle.id === "earth");
  if (earth === undefined) {
    throw new Error("Size lineup is missing Earth");
  }
  return earth.meanRadiusM;
})();
/** Bodies with no installed surface map or sourced colour (only the Sun here). */
const NEUTRAL_FILL = "#d9d9d9";

/** True when the lineup draws this body, so the card can offer it. */
export function isInSizeLineup(bodyId: string): boolean {
  return (
    bodyId === LAYOUT.sun.id ||
    LAYOUT.circles.some((circle) => circle.id === bodyId)
  );
}

function CircleArt({
  circle,
  className,
}: {
  circle: SizeLineupCircle;
  className: string;
}): ReactElement {
  const patternId = useId();
  const texture = nasaTextureByBodyId.get(circle.id);
  // The same NASA surface map the 3D globe wears, drawn flat: the middle half
  // of the 2:1 map fills the square, so no part of it is stretched.
  return (
    <svg
      className={className}
      viewBox="0 0 2 2"
      aria-hidden="true"
      data-lineup-circle={circle.id}
      style={{ "--lineup-radius": circle.radius } as CSSProperties}
    >
      {texture === undefined ? null : (
        <defs>
          <pattern
            id={patternId}
            patternContentUnits="objectBoundingBox"
            width="1"
            height="1"
          >
            <image
              href={texture.file}
              x="-0.5"
              width="2"
              height="1"
              preserveAspectRatio="none"
            />
          </pattern>
        </defs>
      )}
      <circle
        cx="1"
        cy="1"
        r="1"
        fill={
          texture !== undefined
            ? `url(#${patternId})`
            : (nasaMaterialPresentationByBodyId.get(circle.id)?.color ??
              NEUTRAL_FILL)
        }
      />
    </svg>
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

  useEffect(() => {
    const opener = document.activeElement;
    closeButtonRef.current?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus();
      }
    };
  }, []);

  const selected = [LAYOUT.sun, ...LAYOUT.circles].find(
    (circle) => circle.id === selectedBodyId,
  );
  const column = (circle: SizeLineupCircle, className: string) => (
    <button
      key={circle.id}
      type="button"
      className={className}
      aria-label={`${circle.name}, ${formatDiameterKm(circle.meanRadiusM)} wide`}
      aria-current={circle.id === selectedBodyId ? "true" : undefined}
      data-lineup-body={circle.id}
      onClick={() => onSelectBody(circle.id)}
    >
      <CircleArt
        circle={circle}
        className={
          circle.id === LAYOUT.sun.id
            ? "size-lineup-sun-disc"
            : "size-lineup-disc"
        }
      />
      <span>{circle.name}</span>
    </button>
  );

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
      <div className="size-lineup-row">
        {column(LAYOUT.sun, "size-lineup-sun")}
        <div className="size-lineup-bodies">
          {LAYOUT.circles.map((circle) => column(circle, "size-lineup-body"))}
        </div>
      </div>
      <p className="size-lineup-note">
        The Sun is too big to fit, so you see only its edge on the left.
      </p>
      {selected === undefined ? null : (
        <p className="size-lineup-comparison" aria-live="polite">
          <strong>{selected.name}</strong>{" "}
          {formatBodySize(
            selected.id,
            selected.meanRadiusM,
            EARTH_MEAN_RADIUS_M,
          )}
        </p>
      )}
    </aside>
  );
}
