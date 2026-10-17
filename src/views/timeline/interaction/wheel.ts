/**
 * Wheel and trackpad classification.
 * Browsers report a trackpad pinch as a wheel event with ctrlKey set.
 * Shift+wheel often arrives as deltaX; both axes are accepted.
 */

/** Pixel delta that doubles or halves zoom. Negative deltaY zooms in. */
export const WHEEL_ZOOM_SENSITIVITY = 0.0015;

export interface WheelInput {
  deltaX: number;
  deltaY: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  /** Scene x of the cursor, in pixels from the left of the SVG. */
  focusX: number;
}

export type WheelAction =
  | { type: "pass" }
  | { type: "zoom"; factor: number; focusX: number }
  | { type: "pan"; dx: number }
  | { type: "scroll-lanes"; dy: number };

export function wheelZoomFactor(delta: number): number {
  if (!Number.isFinite(delta) || delta === 0) return 1;
  return Math.exp(-delta * WHEEL_ZOOM_SENSITIVITY);
}

/**
 * Inline: plain wheel scrolls the note until the block is focused.
 * Ctrl/Cmd+wheel always zooms. Shift+wheel and a horizontal trackpad pan time.
 * Once focused, plain wheel pans time.
 * Full view: wheel pans time, Shift+wheel scrolls lanes, Ctrl/Cmd+wheel zooms.
 */
export function interpretWheel(
  input: WheelInput,
  options: { surface: "inline" | "full"; focused: boolean }
): WheelAction {
  if (input.ctrlKey || input.metaKey) {
    const delta = input.deltaY !== 0 ? input.deltaY : input.deltaX;
    const factor = wheelZoomFactor(delta);
    if (factor === 1) return { type: "pass" };
    return { type: "zoom", factor, focusX: input.focusX };
  }

  if (input.deltaX === 0 && input.deltaY === 0) return { type: "pass" };

  const horizontal = Math.abs(input.deltaX) > Math.abs(input.deltaY);

  if (options.surface === "full") {
    if (input.shiftKey) {
      const dy = input.deltaY !== 0 ? input.deltaY : input.deltaX;
      return { type: "scroll-lanes", dy };
    }
    return { type: "pan", dx: horizontal ? input.deltaX : input.deltaY };
  }

  if (input.shiftKey) {
    const dx = input.deltaY !== 0 ? input.deltaY : input.deltaX;
    return { type: "pan", dx };
  }
  if (horizontal && input.deltaX !== 0) return { type: "pan", dx: input.deltaX };
  if (!options.focused) return { type: "pass" };
  return { type: "pan", dx: input.deltaY !== 0 ? input.deltaY : input.deltaX };
}
