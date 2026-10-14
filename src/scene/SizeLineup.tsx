import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";

import { majorBodySnapshot } from "../physics/solar-system-data";
import {
  EARTH_MEAN_RADIUS_M,
  formatBodySize,
  formatDiameterKm,
  PLAIN_SURFACE_BY_BODY_ID,
} from "./body-physical-facts";
import {
  lineupGlobePicture,
  lineupGlobeSnapshot,
  type LineupGlobePicture,
} from "./lineup-globe-assets";
import {
  SIZE_DUEL_PAIRS,
  sizeDuelQuestion,
  sizeDuelResult,
  sizeDuels,
} from "./size-duel";
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
// Each duel carries its two pictures, so a missing one fails at load too.
const DUELS = sizeDuels(LAYOUT.circles, SIZE_DUEL_PAIRS).map((duel) => ({
  duel,
  choices: duel.pair.map((circle) => ({
    circle,
    picture: lineupGlobePicture(lineupGlobeSnapshot.pictures, circle.id),
  })),
}));

function duelAt(index: number): (typeof DUELS)[number] {
  const entry = DUELS[index];
  if (entry === undefined) {
    throw new Error(`Size duel ${String(index)} is not in the duel list`);
  }
  return entry;
}

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
  onGuess,
  onClose,
}: Readonly<{
  selectedBodyId: string;
  onSelectBody(bodyId: string): void;
  /** A size-duel guess: the caller plays the matching interface sound. */
  onGuess(correct: boolean): void;
  onClose(): void;
}>): ReactElement {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [failedPictureNames, setFailedPictureNames] = useState<
    readonly string[]
  >([]);
  // undefined shows the whole lineup; otherwise the guess-first duel.
  const [duelState, setDuelState] = useState<
    Readonly<{ index: number; guessId: string | undefined }> | undefined
  >(undefined);

  useEffect(() => {
    const opener = document.activeElement;
    closeButtonRef.current?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus();
      }
    };
  }, []);

  // The picture spans frameHalfWidthMeanRadii mean radii each side of the
  // globe's centre, so its globe sits on the one scale and Saturn's rings
  // reach past it.
  const globe = (
    circle: SizeLineupCircle,
    picture: LineupGlobePicture,
    radius: number,
  ) => (
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
          "--lineup-radius": radius,
          "--lineup-frame": picture.frameHalfWidthMeanRadii,
        } as CSSProperties
      }
      onError={() =>
        setFailedPictureNames((names) =>
          names.includes(circle.name) ? names : [...names, circle.name],
        )
      }
    />
  );
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

  // One status line stays mounted in both modes, so a screen reader hears
  // each new duel question as well as the lineup comparison.
  let caption: string;
  let beforeStatus: ReactElement | null = null;
  let statusClassName = "size-lineup-comparison";
  let status: ReactNode;
  let afterStatus: ReactElement | null = null;
  if (duelState === undefined) {
    caption = "Sizes to scale. Distances are not.";
    beforeStatus = (
      <>
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
                globe(circle, picture, circle.radius),
              ),
            )}
          </div>
        </div>
        <p className="size-lineup-note">
          The Sun is too big to fit, so you see only its edge on the left.
        </p>
      </>
    );
    status =
      selected === undefined ? null : (
        <>
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
        </>
      );
  } else {
    const { guessId } = duelState;
    const { duel, choices } = duelAt(duelState.index);
    caption =
      guessId === undefined
        ? "Same size for now. Guess first!"
        : "Sizes to scale.";
    statusClassName = "size-lineup-comparison size-duel-status";
    status =
      guessId === undefined
        ? sizeDuelQuestion(duel)
        : sizeDuelResult(duel, guessId);
    afterStatus = (
      <>
        <div className="size-duel-row">
          {choices.map(({ circle, picture }) => {
            const isWider = circle.id === duel.wider.id;
            let guessClass = "";
            if (guessId === circle.id) {
              guessClass = isWider ? " is-right-guess" : " is-wrong-guess";
            }
            return (
              <button
                key={circle.id}
                type="button"
                className={`size-lineup-body size-duel-choice${guessClass}`}
                aria-pressed={guessId === circle.id}
                // After the guess the choices stay in place for focus but do nothing.
                aria-disabled={guessId === undefined ? undefined : "true"}
                data-lineup-body={circle.id}
                onClick={() => {
                  if (guessId !== undefined) {
                    return;
                  }
                  setDuelState({ index: duelState.index, guessId: circle.id });
                  onGuess(isWider);
                }}
              >
                {globe(
                  circle,
                  picture,
                  // While guessing both globes match; the reveal shrinks the
                  // narrower one to its true size beside the wider one.
                  guessId === undefined || isWider ? 1 : 1 / duel.ratio,
                )}
                <span>{circle.name}</span>
                {guessId !== undefined && isWider ? (
                  <span className="size-duel-wider">Wider</span>
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="size-duel-actions">
          <button
            type="button"
            className="size-lineup-action"
            onClick={() =>
              setDuelState({
                index: (duelState.index + 1) % DUELS.length,
                guessId: undefined,
              })
            }
          >
            Next pair
          </button>
        </div>
      </>
    );
  }

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
        {/* One button in one place, so focus stays on it as the mode flips. */}
        <button
          type="button"
          className="size-lineup-mode"
          onClick={() =>
            setDuelState(
              duelState === undefined
                ? { index: 0, guessId: undefined }
                : undefined,
            )
          }
        >
          {duelState === undefined ? "Guess first" : "See all"}
        </button>
        <button ref={closeButtonRef} type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="size-lineup-caption">{caption}</p>
      {failedPictureNames.length === 0 ? null : (
        <p className="size-lineup-error" role="alert">
          {`Picture did not load: ${failedPictureNames.join(", ")}.`}
        </p>
      )}
      {beforeStatus}
      <p className={statusClassName} aria-live="polite">
        {status}
      </p>
      {afterStatus}
    </aside>
  );
}
