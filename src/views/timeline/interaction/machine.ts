/**
 * One pointer state machine for the timeline.
 * Pointer Events only: mouse, pen, and touch share this path.
 * Drag is entered on a primary press over an item when editing is allowed.
 * This slice does not write the drag back; C11 will consume the drag effect.
 */

export type InteractionMode = "idle" | "pan" | "pinch" | "drag";

export const CLICK_SLOP_PX = 4;
export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_DISTANCE_PX = 28;

export interface PointerSample {
  id: number;
  x: number;
  y: number;
}

export interface InteractionState {
  mode: InteractionMode;
  pointers: readonly PointerSample[];
  anchorX: number;
  anchorY: number;
  moved: boolean;
  itemId: string | null;
  pinchDistance: number;
  lastTap: { x: number; y: number; time: number } | null;
}

export interface PointerInput {
  phase: "down" | "move" | "up" | "cancel";
  id: number;
  x: number;
  y: number;
  time: number;
  /** Primary button is 0. Other buttons do not start a gesture. */
  button: number;
  pointerType: "mouse" | "touch" | "pen";
  itemId: string | null;
  /** Mobile, and this slice's host, pass true so item presses pan instead of drag. */
  readOnly: boolean;
}

export type InteractionEffect =
  | { type: "pan"; dx: number; dy: number }
  | { type: "pinch"; factor: number; focusX: number; focusY: number; dx: number; dy: number }
  | { type: "drag"; dx: number; dy: number; itemId: string }
  | { type: "click"; itemId: string | null }
  | { type: "double-tap"; x: number; y: number }
  | { type: "gesture-end" };

export interface InteractionStep {
  state: InteractionState;
  effects: InteractionEffect[];
}

export function createInteractionState(): InteractionState {
  return {
    mode: "idle",
    pointers: [],
    anchorX: 0,
    anchorY: 0,
    moved: false,
    itemId: null,
    pinchDistance: 0,
    lastTap: null,
  };
}

export function stepInteraction(state: InteractionState, input: PointerInput): InteractionStep {
  if (input.phase === "down") return onDown(state, input);
  if (input.phase === "move") return onMove(state, input);
  if (input.phase === "up") return onUp(state, input);
  return onCancel(state, input);
}

function onDown(state: InteractionState, input: PointerInput): InteractionStep {
  if (input.button !== 0) return { state, effects: [] };
  if (state.pointers.some((pointer) => pointer.id === input.id)) return { state, effects: [] };

  const pointers = [...state.pointers, { id: input.id, x: input.x, y: input.y }];
  let next: InteractionState = { ...state, pointers };

  if (state.mode === "idle") {
    const drag = input.itemId !== null && !input.readOnly;
    next = {
      ...next,
      mode: drag ? "drag" : "pan",
      anchorX: input.x,
      anchorY: input.y,
      moved: false,
      itemId: input.itemId,
      pinchDistance: 0,
    };
  }

  if (next.pointers.length >= 2 && next.mode !== "pinch") {
    const span = pairDistance(next.pointers);
    next = {
      ...next,
      mode: "pinch",
      pinchDistance: span > 0 ? span : 0,
      moved: true,
    };
  }

  return { state: next, effects: [] };
}

function onMove(state: InteractionState, input: PointerInput): InteractionStep {
  const index = state.pointers.findIndex((pointer) => pointer.id === input.id);
  if (index < 0 || state.mode === "idle") return { state, effects: [] };

  const previous = state.pointers[index];
  const pointers = state.pointers.map((pointer, pointerIndex) =>
    pointerIndex === index ? { id: input.id, x: input.x, y: input.y } : pointer
  );
  const moved = state.moved || pastSlop(state.anchorX, state.anchorY, input.x, input.y);
  const base: InteractionState = { ...state, pointers, moved };

  if (state.mode === "pan" && pointers[0]?.id === input.id) {
    if (!moved) return { state: base, effects: [] };
    const fromX = state.moved ? previous.x : state.anchorX;
    const fromY = state.moved ? previous.y : state.anchorY;
    return {
      state: base,
      effects: [{ type: "pan", dx: input.x - fromX, dy: input.y - fromY }],
    };
  }

  if (state.mode === "drag" && pointers[0]?.id === input.id && state.itemId) {
    if (!moved) return { state: base, effects: [] };
    const fromX = state.moved ? previous.x : state.anchorX;
    const fromY = state.moved ? previous.y : state.anchorY;
    return {
      state: base,
      effects: [{ type: "drag", dx: input.x - fromX, dy: input.y - fromY, itemId: state.itemId }],
    };
  }

  if (state.mode === "pinch" && pointers.length >= 2) {
    const a = pointers[0];
    const b = pointers[1];
    if (input.id !== a.id && input.id !== b.id) return { state: base, effects: [] };
    const span = pairDistance(pointers);
    const focusX = (a.x + b.x) / 2;
    const focusY = (a.y + b.y) / 2;
    const old = midpoint(state.pointers);
    const factor = state.pinchDistance > 0 && span > 0 ? span / state.pinchDistance : 1;
    return {
      state: { ...base, pinchDistance: span > 0 ? span : state.pinchDistance },
      effects: [
        {
          type: "pinch",
          factor,
          focusX,
          focusY,
          dx: focusX - old.x,
          dy: focusY - old.y,
        },
      ],
    };
  }

  return { state: base, effects: [] };
}

function onUp(state: InteractionState, input: PointerInput): InteractionStep {
  const index = state.pointers.findIndex((pointer) => pointer.id === input.id);
  if (index < 0) return { state, effects: [] };
  const pointers = state.pointers.filter((pointer) => pointer.id !== input.id);

  if (state.mode === "pinch") {
    if (pointers.length >= 2) {
      return { state: { ...state, pointers, pinchDistance: pairDistance(pointers) }, effects: [] };
    }
    if (pointers.length === 1) {
      return {
        state: {
          ...state,
          mode: "pan",
          pointers,
          moved: true,
          anchorX: pointers[0].x,
          anchorY: pointers[0].y,
          pinchDistance: 0,
        },
        effects: [],
      };
    }
    return { state: idleFrom(null), effects: [{ type: "gesture-end" }] };
  }

  if ((state.mode === "pan" || state.mode === "drag") && index === 0) {
    if (pointers.length > 0) {
      return {
        state: {
          ...state,
          mode: "pan",
          pointers,
          moved: true,
          anchorX: pointers[0].x,
          anchorY: pointers[0].y,
        },
        effects: [],
      };
    }
    if (!state.moved) {
      if (isDoubleTap(state, input)) {
        return {
          state: idleFrom(null),
          effects: [{ type: "double-tap", x: input.x, y: input.y }],
        };
      }
      const lastTap = input.pointerType === "touch" ? { x: input.x, y: input.y, time: input.time } : null;
      return {
        state: idleFrom(lastTap),
        effects: [{ type: "click", itemId: state.itemId }],
      };
    }
    return { state: idleFrom(null), effects: [{ type: "gesture-end" }] };
  }

  return { state: { ...state, pointers }, effects: [] };
}

function onCancel(state: InteractionState, input: PointerInput): InteractionStep {
  if (!state.pointers.some((pointer) => pointer.id === input.id)) return { state, effects: [] };
  const pointers = state.pointers.filter((pointer) => pointer.id !== input.id);
  if (pointers.length === 0) {
    const effects: InteractionEffect[] = state.mode === "idle" ? [] : [{ type: "gesture-end" }];
    return { state: idleFrom(null), effects };
  }
  if (state.mode === "pinch" && pointers.length < 2) {
    return {
      state: {
        ...state,
        mode: "pan",
        pointers,
        moved: true,
        anchorX: pointers[0].x,
        anchorY: pointers[0].y,
        pinchDistance: 0,
      },
      effects: [],
    };
  }
  return { state: { ...state, pointers }, effects: [] };
}

function idleFrom(lastTap: InteractionState["lastTap"]): InteractionState {
  return {
    mode: "idle",
    pointers: [],
    anchorX: 0,
    anchorY: 0,
    moved: false,
    itemId: null,
    pinchDistance: 0,
    lastTap,
  };
}

function isDoubleTap(state: InteractionState, input: PointerInput): boolean {
  if (input.pointerType !== "touch" || !state.lastTap) return false;
  if (input.time - state.lastTap.time > DOUBLE_TAP_MS || input.time < state.lastTap.time) return false;
  return !pastSlop(state.lastTap.x, state.lastTap.y, input.x, input.y, DOUBLE_TAP_DISTANCE_PX);
}

function pastSlop(x0: number, y0: number, x1: number, y1: number, slop = CLICK_SLOP_PX): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  return dx * dx + dy * dy > slop * slop;
}

function pairDistance(pointers: readonly PointerSample[]): number {
  if (pointers.length < 2) return 0;
  const dx = pointers[0].x - pointers[1].x;
  const dy = pointers[0].y - pointers[1].y;
  return Math.hypot(dx, dy);
}

function midpoint(pointers: readonly PointerSample[]): { x: number; y: number } {
  if (pointers.length < 2) {
    const only = pointers[0];
    return only ? { x: only.x, y: only.y } : { x: 0, y: 0 };
  }
  return { x: (pointers[0].x + pointers[1].x) / 2, y: (pointers[0].y + pointers[1].y) / 2 };
}
