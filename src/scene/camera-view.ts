export type CameraOrientationPreset =
  | "perspective"
  | "overhead"
  | "edge-on"
  | "sun-facing"
  | "terminator"
  | "parent-facing"
  | "velocity"
  | "orbital-plane"
  | "custom";

export type CameraNavigationAction = "fit-selection" | "zoom-in" | "zoom-out";

/** True where one more Zoom in or Zoom out press would not move the camera. */
export type ZoomLimits = Readonly<{ atNearest: boolean; atFarthest: boolean }>;

export type CameraNavigationCommand = Readonly<{
  sequence: number;
  action: CameraNavigationAction;
}>;
