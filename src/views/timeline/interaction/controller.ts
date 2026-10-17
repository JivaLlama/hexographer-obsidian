import { createInteractionState, stepInteraction, type InteractionState, type PointerInput } from "./machine";
import { interpretWheel, type WheelAction } from "./wheel";
import type { TimelineView } from "../scene/render";

export interface InteractionHost {
  surface: "inline" | "full";
  isFocused(): boolean;
  /** True while editing is disabled. This slice always passes true; drag stays in the machine. */
  isReadOnly(): boolean;
  onPan(dx: number, dy: number): void;
  onPinch(effect: { factor: number; focusX: number; focusY: number; dx: number; dy: number }): void;
  onDrag(effect: { dx: number; dy: number; itemId: string }): void;
  onClick(itemId: string | null): void;
  onOpenItem?(itemId: string): void;
  onHover(itemId: string | null): void;
  onDoubleTap(x: number): void;
  onGestureEnd(): void;
  onWheel(action: WheelAction): void;
  onZoomStep(x: number): void;
  onFit(): void;
  onFocusChange(focused: boolean): void;
}

export function bindInteraction(view: TimelineView, host: InteractionHost): () => void {
  let machine: InteractionState = createInteractionState();

  const apply = (next: ReturnType<typeof stepInteraction>): void => {
    machine = next.state;
    view.setPanning(machine.mode === "pan" || machine.mode === "pinch" || machine.mode === "drag");
    for (const effect of next.effects) {
      if (effect.type === "pan") host.onPan(effect.dx, effect.dy);
      else if (effect.type === "pinch") host.onPinch(effect);
      else if (effect.type === "drag") host.onDrag(effect);
      else if (effect.type === "click") host.onClick(effect.itemId);
      else if (effect.type === "double-tap") host.onDoubleTap(effect.x);
      else host.onGestureEnd();
    }
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    view.root.focus({ preventScroll: true });
    view.frame.setPointerCapture(event.pointerId);
    apply(stepInteraction(machine, pointerInput(view, host, event, "down")));
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (machine.mode === "idle") {
      host.onHover(hitItem(event.target));
      return;
    }
    apply(stepInteraction(machine, pointerInput(view, host, event, "move")));
  };

  const onPointerLeave = (): void => {
    if (machine.mode === "idle") host.onHover(null);
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (!machine.pointers.some((pointer) => pointer.id === event.pointerId)) return;
    apply(stepInteraction(machine, pointerInput(view, host, event, "up")));
    if (view.frame.hasPointerCapture(event.pointerId)) view.frame.releasePointerCapture(event.pointerId);
  };

  const onPointerCancel = (event: PointerEvent): void => {
    apply(stepInteraction(machine, pointerInput(view, host, event, "cancel")));
  };

  const onWheel = (event: WheelEvent): void => {
    const point = view.scenePoint(event.clientX, event.clientY);
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? Math.max(view.sceneWidth(), 1) : 1;
    const action = interpretWheel(
      {
        deltaX: event.deltaX * scale,
        deltaY: event.deltaY * scale,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        focusX: point.x,
      },
      { surface: host.surface, focused: host.isFocused() }
    );
    if (action.type === "pass") return;
    event.preventDefault();
    host.onWheel(action);
  };

  const onDblClick = (event: MouseEvent): void => {
    const itemId = hitItem(event.target);
    if (itemId) {
      event.preventDefault();
      host.onOpenItem?.(itemId);
      return;
    }
    event.preventDefault();
    host.onZoomStep(view.scenePoint(event.clientX, event.clientY).x);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "f" && event.key !== "F") return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    event.preventDefault();
    host.onFit();
  };

  const onFocusIn = (): void => host.onFocusChange(true);
  const onFocusOut = (event: FocusEvent): void => {
    const next = event.relatedTarget;
    if (next instanceof Node && view.root.contains(next)) return;
    host.onFocusChange(false);
  };

  view.frame.addEventListener("pointerdown", onPointerDown);
  view.frame.addEventListener("pointermove", onPointerMove);
  view.frame.addEventListener("pointerleave", onPointerLeave);
  view.frame.addEventListener("pointerup", onPointerUp);
  view.frame.addEventListener("pointercancel", onPointerCancel);
  view.frame.addEventListener("dblclick", onDblClick);
  view.root.addEventListener("wheel", onWheel, { passive: false });
  view.root.addEventListener("keydown", onKeyDown);
  view.root.addEventListener("focusin", onFocusIn);
  view.root.addEventListener("focusout", onFocusOut);

  return () => {
    view.frame.removeEventListener("pointerdown", onPointerDown);
    view.frame.removeEventListener("pointermove", onPointerMove);
    view.frame.removeEventListener("pointerleave", onPointerLeave);
    view.frame.removeEventListener("pointerup", onPointerUp);
    view.frame.removeEventListener("pointercancel", onPointerCancel);
    view.frame.removeEventListener("dblclick", onDblClick);
    view.root.removeEventListener("wheel", onWheel);
    view.root.removeEventListener("keydown", onKeyDown);
    view.root.removeEventListener("focusin", onFocusIn);
    view.root.removeEventListener("focusout", onFocusOut);
  };
}

function pointerInput(
  view: TimelineView,
  host: InteractionHost,
  event: PointerEvent,
  phase: PointerInput["phase"]
): PointerInput {
  const point = view.scenePoint(event.clientX, event.clientY);
  const kind = event.pointerType === "touch" || event.pointerType === "pen" ? event.pointerType : "mouse";
  return {
    phase,
    id: event.pointerId,
    x: point.x,
    y: point.y,
    time: event.timeStamp,
    button: event.button,
    pointerType: kind,
    itemId: phase === "down" ? hitItem(event.target) : null,
    readOnly: host.isReadOnly() || (phase === "down" && hitOrdered(event.target)),
  };
}

function hitOrdered(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const owner = target.closest("[data-id]");
  return owner?.getAttribute("data-ordered") === "true";
}

function hitItem(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  const owner = target.closest("[data-id]");
  if (!owner) return null;
  if (owner.classList.contains("wt-era")) return null;
  const id = owner.getAttribute("data-id");
  return id && id.length > 0 ? id : null;
}
