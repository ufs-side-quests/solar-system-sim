// OrbitControls damps a drag once per update: each frame turns the camera by
// dampingFactor of the turn still to come. With a fixed factor the glide after
// a drag lasts three times as long at 20 frames per second as at 60. This
// factor takes the same share of the glide per millisecond at any frame rate:
// the three.js default of 0.05 per 60 Hz frame.
const DAMPING_PER_60_HZ_FRAME = 0.05;
const FRAME_60_HZ_MS = 1_000 / 60;

export function controlsDampingFactor(frameIntervalMs: number): number {
  return (
    1 - (1 - DAMPING_PER_60_HZ_FRAME) ** (frameIntervalMs / FRAME_60_HZ_MS)
  );
}
