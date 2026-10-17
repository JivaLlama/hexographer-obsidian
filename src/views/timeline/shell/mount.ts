import { commitPan, createScale, filterItems, scaleLimitsForCalendar, type Scale, type ScaleLimits } from "../../../core";
import { bindInteraction } from "../interaction/controller";
import type { WheelAction } from "../interaction/wheel";
import { buildLanes, cameraForDataset, filterOrdered, stubDataset, type TimelineDataset } from "../scene/dataset";
import { beforeBandInset, layoutScene } from "../scene/layout";
import { createTimelineView, type TimelineView } from "../scene/render";
import { createViewStore, type ViewStore } from "../store";

export interface MountOptions {
  container: HTMLElement;
  surface: "inline" | "full";
  mobile: boolean;
  load: () => Promise<TimelineDataset>;
  onOpenFull?: () => void;
  onOpenItem?: (itemId: string) => void;
  subscribeRefresh?: (listener: () => void) => () => void;
}

export interface TimelineMount {
  reload(options?: { fit?: boolean }): Promise<void>;
  destroy(): void;
}

const ZOOM_STEP = 1.6;

const HINT_INLINE = "Click the timeline, then the wheel pans time. Ctrl or Cmd+wheel zooms. Shift+wheel or a horizontal trackpad pans without taking the note scroll. F fits. Double-click empty space zooms in. Double-click an item to open its note.";
const HINT_FULL = "Wheel pans time. Shift+wheel scrolls lanes. Ctrl or Cmd+wheel zooms. Drag empty space pans. F fits. Double-click empty space zooms in.";

/**
 * DOM host shared by the code block and the full-view leaf.
 * Editing stays off: drag-move writeback is a later slice, so the pointer
 * machine is run read-only on desktop and on mobile.
 */
export function mountTimeline(options: MountOptions): TimelineMount {
  const store: ViewStore = createViewStore();
  const view: TimelineView = createTimelineView(options.container, {
    surface: options.surface,
    mobile: options.mobile,
    onOpenFull: options.onOpenFull,
  });

  let dataset: TimelineDataset | null = null;
  let limits: ScaleLimits = { minPxPerDay: 1e-6, maxPxPerDay: 200 };
  let translateX = 0;
  let datedInset = 0;
  let hasFit = false;
  let generation = 0;
  let focused = false;

  const currentScale = (): Scale => {
    const camera = store.get().viewState;
    return createScale({
      originDays: camera.originDays,
      pxPerDay: camera.pxPerDay,
      minPxPerDay: limits.minPxPerDay,
      maxPxPerDay: limits.maxPxPerDay,
    });
  };

  const renderScene = (): void => {
    if (!dataset) return;
    const width = view.sceneWidth();
    if (width < 2) return;
    const snapshot = store.get();
    const scale = currentScale();
    const filtered = filterItems(dataset.items, snapshot.filters);
    const ordered = filterOrdered(dataset.ordered, snapshot.filters);
    const model = layoutScene({
      items: filtered,
      ordered,
      calendars: dataset.calendars,
      lanes: buildLanes(filtered, dataset.config.lanes?.order, ordered),
      calendar: dataset.calendar,
      scale,
      viewportWidth: width,
      itemHeight: view.itemHeight(),
      labelWidth: (title) => view.labelWidth(title),
      overscanPx: width,
      minLabelPx: 72,
      selection: snapshot.selection,
    });
    view.render(model);
    datedInset = model.before?.width ?? 0;
    view.setTranslate(translateX);
  };

  const datedWidth = (width: number): number => {
    if (!dataset) return width;
    const snapshot = store.get();
    const items = filterItems(dataset.items, snapshot.filters);
    const inset = beforeBandInset(
      filterOrdered(dataset.ordered, snapshot.filters),
      items.filter((item) => item.kind === "era"),
      dataset.calendars
    );
    return Math.max(width - inset, 1);
  };

  const publishStatus = (): void => {
    if (!dataset) {
      view.setStatus("Loading timeline…");
      return;
    }
    const filters = store.get().filters;
    const count = filterItems(dataset.items, filters).length + filterOrdered(dataset.ordered, filters).length;
    const source = dataset.origin === "stub" ? "Sample dates" : dataset.calendar.def.name;
    const text = dataset.notice ? `${source} · ${dataset.notice}` : `${source} · ${count} items`;
    view.setStatus(text, options.surface === "inline" ? HINT_INLINE : HINT_FULL);
  };

  const rememberCamera = (originDays: number, pxPerDay: number): void => {
    store.setViewState({
      originDays,
      pxPerDay,
      laneScroll: store.get().viewState.laneScroll,
    });
  };

  const commitTranslate = (): void => {
    const next = commitPan(currentScale(), translateX);
    translateX = 0;
    rememberCamera(next.originDays, next.pxPerDay);
    view.setTranslate(0);
    renderScene();
  };

  const zoomAt = (focusX: number, factor: number): void => {
    const next = commitPan(currentScale(), translateX).zoomAt(focusX - datedInset, factor);
    translateX = 0;
    rememberCamera(next.originDays, next.pxPerDay);
    view.setTranslate(0);
    renderScene();
  };

  const fit = (): void => {
    if (!dataset) return;
    const width = view.sceneWidth();
    if (width < 2) return;
    limits = scaleLimitsForCalendar(dataset.calendar, { viewportPx: width });
    const camera = cameraForDataset(dataset, datedWidth(width));
    translateX = 0;
    store.setViewState({ ...camera, laneScroll: view.laneScroll() });
    view.setTranslate(0);
    hasFit = true;
    renderScene();
  };

  const onPanPixels = (dx: number): void => {
    translateX += dx;
    view.setTranslate(translateX);
    if (Math.abs(translateX) > Math.max(view.sceneWidth(), 1) * 0.5) commitTranslate();
  };

  const unbind = bindInteraction(view, {
    surface: options.surface,
    isFocused: () => focused,
    isReadOnly: () => true,
    onPan(dx, dy) {
      onPanPixels(dx);
      if (dy !== 0) view.scrollLanesBy(-dy);
    },
    onPinch(effect) {
      translateX += effect.dx;
      if (effect.dy !== 0) view.scrollLanesBy(-effect.dy);
      zoomAt(effect.focusX, effect.factor);
    },
    onDrag() {
      // Reserved for C11. The machine can enter drag; this host does not write back.
    },
    onHover(itemId) {
      store.setHover(itemId);
    },
    onClick(itemId) {
      store.setSelection(itemId ? [itemId] : []);
      renderScene();
    },
    onOpenItem(itemId) {
      options.onOpenItem?.(itemId);
    },
    onDoubleTap(x) {
      zoomAt(x, ZOOM_STEP);
    },
    onGestureEnd() {
      if (translateX !== 0) commitTranslate();
    },
    onWheel(action: WheelAction) {
      if (action.type === "zoom") zoomAt(action.focusX, action.factor);
      else if (action.type === "pan") onPanPixels(-action.dx);
      else if (action.type === "scroll-lanes") view.scrollLanesBy(action.dy);
    },
    onZoomStep(x) {
      zoomAt(x, ZOOM_STEP);
    },
    onFit: fit,
    onFocusChange(next) {
      focused = next;
      view.setFocused(next);
    },
  });

  const onScroll = (): void => {
    const camera = store.get().viewState;
    if (camera.laneScroll === view.laneScroll()) return;
    store.setViewState({ ...camera, laneScroll: view.laneScroll() });
  };
  view.body.addEventListener("scroll", onScroll, { passive: true });

  const observer = new ResizeObserver(() => {
    if (!dataset) return;
    const width = view.sceneWidth();
    if (!hasFit && width >= 2) {
      fit();
      return;
    }
    renderScene();
  });
  observer.observe(view.frame);

  const unsubscribe = options.subscribeRefresh?.(() => {
    void reload({ fit: false });
  });

  async function reload(reloadOptions?: { fit?: boolean }): Promise<void> {
    const token = ++generation;
    const previousOrigin = dataset?.origin;
    let loaded: TimelineDataset;
    try {
      loaded = await options.load();
    } catch (error) {
      const stub = stubDataset();
      const message = error instanceof Error ? error.message : String(error);
      loaded = { ...stub, notice: message };
    }
    if (token !== generation) return;
    const becameReal = previousOrigin === "stub" && loaded.origin === "vault";
    dataset = loaded;
    const width = view.sceneWidth();
    const limitWidth = width >= 2 ? width : 320;
    limits = scaleLimitsForCalendar(dataset.calendar, { viewportPx: limitWidth });
    store.setFilters(dataset.config.filters ?? {});
    const shouldFit = becameReal || (reloadOptions?.fit !== false && (reloadOptions?.fit === true || !hasFit));
    if (shouldFit && width >= 2) {
      const camera = cameraForDataset(dataset, datedWidth(width));
      store.setViewState(camera);
      hasFit = true;
    } else if (shouldFit) {
      store.setViewState(cameraForDataset(dataset, datedWidth(limitWidth)));
      hasFit = false;
    } else {
      const camera = store.get().viewState;
      const clamped = createScale({
        originDays: camera.originDays,
        pxPerDay: camera.pxPerDay,
        minPxPerDay: limits.minPxPerDay,
        maxPxPerDay: limits.maxPxPerDay,
      });
      store.setViewState({
        originDays: clamped.originDays,
        pxPerDay: clamped.pxPerDay,
        laneScroll: camera.laneScroll,
      });
    }
    translateX = 0;
    view.setTranslate(0);
    publishStatus();
    renderScene();
  }

  void reload({ fit: true });

  return {
    reload,
    destroy() {
      generation += 1;
      observer.disconnect();
      view.body.removeEventListener("scroll", onScroll);
      unbind();
      unsubscribe?.();
      view.destroy();
    },
  };
}
