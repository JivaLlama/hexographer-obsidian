import { describe, expect, it } from "vitest";
import { createInteractionState, stepInteraction, type PointerInput } from "../src/views/timeline/interaction/machine";
import { interpretWheel, wheelZoomFactor } from "../src/views/timeline/interaction/wheel";
import { createViewStore } from "../src/views/timeline/store";

function pointer(overrides: Partial<PointerInput> & { phase: PointerInput["phase"] }): PointerInput {
  return {
    id: 1,
    x: 0,
    y: 0,
    time: 0,
    button: 0,
    pointerType: "mouse",
    itemId: null,
    readOnly: true,
    ...overrides,
  };
}

describe("interaction state machine", () => {
  it("pans from empty space and commits on release", () => {
    let state = createInteractionState();
    state = stepInteraction(state, pointer({ phase: "down", x: 10, y: 4 })).state;
    expect(state.mode).toBe("pan");

    const moved = stepInteraction(state, pointer({ phase: "move", x: 40, y: 8 }));
    expect(moved.state.mode).toBe("pan");
    expect(moved.state.moved).toBe(true);
    expect(moved.effects).toEqual([{ type: "pan", dx: 30, dy: 4 }]);

    const up = stepInteraction(moved.state, pointer({ phase: "up", x: 40, y: 8 }));
    expect(up.state.mode).toBe("idle");
    expect(up.effects).toEqual([{ type: "gesture-end" }]);
  });

  it("treats a small press as a click, including a press on an item while read-only", () => {
    let state = createInteractionState();
    state = stepInteraction(state, pointer({ phase: "down", itemId: "notes/siege.md", x: 5, y: 5 })).state;
    expect(state.mode).toBe("pan");
    const nudged = stepInteraction(state, pointer({ phase: "move", x: 7, y: 6 }));
    expect(nudged.effects).toEqual([]);
    const up = stepInteraction(nudged.state, pointer({ phase: "up", x: 7, y: 6 }));
    expect(up.state.mode).toBe("idle");
    expect(up.effects).toEqual([{ type: "click", itemId: "notes/siege.md" }]);
  });

  it("enters drag only when editing is allowed, and does not click after a move", () => {
    let state = createInteractionState();
    state = stepInteraction(
      state,
      pointer({ phase: "down", readOnly: false, itemId: "notes/siege.md", x: 0, y: 0 })
    ).state;
    expect(state.mode).toBe("drag");

    const moved = stepInteraction(
      state,
      pointer({ phase: "move", readOnly: false, itemId: "notes/siege.md", x: 24, y: 0 })
    );
    expect(moved.effects).toEqual([{ type: "drag", dx: 24, dy: 0, itemId: "notes/siege.md" }]);

    const up = stepInteraction(moved.state, pointer({ phase: "up", x: 24, y: 0 }));
    expect(up.state.mode).toBe("idle");
    expect(up.effects).toEqual([{ type: "gesture-end" }]);
  });

  it("switches a second pointer to pinch and returns to pan when one lifts", () => {
    let state = createInteractionState();
    state = stepInteraction(state, pointer({ phase: "down", id: 1, x: 0, y: 0, pointerType: "touch" })).state;
    state = stepInteraction(state, pointer({ phase: "down", id: 2, x: 100, y: 0, pointerType: "touch" })).state;
    expect(state.mode).toBe("pinch");
    expect(state.pinchDistance).toBeCloseTo(100);

    const spread = stepInteraction(state, pointer({ phase: "move", id: 2, x: 160, y: 0, pointerType: "touch" }));
    expect(spread.state.mode).toBe("pinch");
    const pinch = spread.effects.find((effect) => effect.type === "pinch");
    expect(pinch).toMatchObject({ type: "pinch", factor: 1.6, focusX: 80, focusY: 0 });

    const one = stepInteraction(spread.state, pointer({ phase: "up", id: 2, x: 160, y: 0, pointerType: "touch" }));
    expect(one.state.mode).toBe("pan");
    expect(one.effects).toEqual([]);

    const done = stepInteraction(one.state, pointer({ phase: "up", id: 1, x: 0, y: 0, pointerType: "touch" }));
    expect(done.state.mode).toBe("idle");
    expect(done.effects).toEqual([{ type: "gesture-end" }]);
  });

  it("cancels an active gesture", () => {
    let state = createInteractionState();
    state = stepInteraction(state, pointer({ phase: "down", x: 0, y: 0 })).state;
    const cancelled = stepInteraction(state, pointer({ phase: "cancel", x: 12, y: 0 }));
    expect(cancelled.state.mode).toBe("idle");
    expect(cancelled.state.pointers).toEqual([]);
    expect(cancelled.effects).toEqual([{ type: "gesture-end" }]);
  });

  it("zooms on a second touch tap and ignores a secondary mouse button", () => {
    let state = createInteractionState();
    state = stepInteraction(state, pointer({ phase: "down", pointerType: "touch", x: 20, y: 20, time: 10 })).state;
    const first = stepInteraction(state, pointer({ phase: "up", pointerType: "touch", x: 20, y: 20, time: 40 }));
    expect(first.effects).toEqual([{ type: "click", itemId: null }]);

    state = stepInteraction(first.state, pointer({ phase: "down", pointerType: "touch", x: 24, y: 22, time: 200 })).state;
    const second = stepInteraction(state, pointer({ phase: "up", pointerType: "touch", x: 24, y: 22, time: 240 }));
    expect(second.effects).toEqual([{ type: "double-tap", x: 24, y: 22 }]);

    const ignored = stepInteraction(createInteractionState(), pointer({ phase: "down", button: 2 }));
    expect(ignored.state.mode).toBe("idle");
    expect(ignored.effects).toEqual([]);
  });
});

describe("wheel classification", () => {
  it("lets an unfocused inline block keep plain wheel for the note", () => {
    expect(
      interpretWheel(
        { deltaX: 0, deltaY: 40, ctrlKey: false, metaKey: false, shiftKey: false, focusX: 12 },
        { surface: "inline", focused: false }
      )
    ).toEqual({ type: "pass" });
  });

  it("zooms on ctrl or meta wheel around the cursor, and a negative delta zooms in", () => {
    const action = interpretWheel(
      { deltaX: 0, deltaY: -20, ctrlKey: true, metaKey: false, shiftKey: false, focusX: 80 },
      { surface: "inline", focused: false }
    );
    expect(action.type).toBe("zoom");
    if (action.type === "zoom") {
      expect(action.focusX).toBe(80);
      expect(action.factor).toBeGreaterThan(1);
      expect(action.factor).toBeCloseTo(wheelZoomFactor(-20));
    }

    const meta = interpretWheel(
      { deltaX: 0, deltaY: 10, ctrlKey: false, metaKey: true, shiftKey: false, focusX: 4 },
      { surface: "full", focused: false }
    );
    expect(meta.type).toBe("zoom");
    if (meta.type === "zoom") expect(meta.factor).toBeLessThan(1);
  });

  it("pans inline time on shift+wheel, horizontal trackpad, and focused wheel", () => {
    expect(
      interpretWheel(
        { deltaX: 0, deltaY: 30, ctrlKey: false, metaKey: false, shiftKey: true, focusX: 0 },
        { surface: "inline", focused: false }
      )
    ).toEqual({ type: "pan", dx: 30 });

    expect(
      interpretWheel(
        { deltaX: 18, deltaY: 2, ctrlKey: false, metaKey: false, shiftKey: false, focusX: 0 },
        { surface: "inline", focused: false }
      )
    ).toEqual({ type: "pan", dx: 18 });

    expect(
      interpretWheel(
        { deltaX: 0, deltaY: 22, ctrlKey: false, metaKey: false, shiftKey: false, focusX: 0 },
        { surface: "inline", focused: true }
      )
    ).toEqual({ type: "pan", dx: 22 });
  });

  it("pans the full view on wheel and scrolls lanes on shift+wheel", () => {
    expect(
      interpretWheel(
        { deltaX: 0, deltaY: 15, ctrlKey: false, metaKey: false, shiftKey: false, focusX: 0 },
        { surface: "full", focused: false }
      )
    ).toEqual({ type: "pan", dx: 15 });

    expect(
      interpretWheel(
        { deltaX: 28, deltaY: 0, ctrlKey: false, metaKey: false, shiftKey: true, focusX: 0 },
        { surface: "full", focused: true }
      )
    ).toEqual({ type: "scroll-lanes", dy: 28 });
  });
});

describe("view store", () => {
  it("notifies subscribers and skips identical writes", () => {
    const store = createViewStore();
    const seen: number[] = [];
    const unsubscribe = store.subscribe((snapshot) => seen.push(snapshot.viewState.pxPerDay));
    store.setViewState({ originDays: 10, pxPerDay: 2, laneScroll: 0 });
    store.setViewState({ originDays: 10, pxPerDay: 2, laneScroll: 0 });
    store.setSelection(["a"]);
    store.setHover("a");
    store.setFilters({ text: "siege" });
    expect(store.get()).toMatchObject({
      viewState: { originDays: 10, pxPerDay: 2, laneScroll: 0 },
      selection: ["a"],
      hover: "a",
      filters: { text: "siege" },
    });
    expect(seen).toEqual([2, 2, 2, 2]);
    unsubscribe();
    store.setHover(null);
    expect(seen).toHaveLength(4);
    expect(store.get().hover).toBeNull();
  });
});
