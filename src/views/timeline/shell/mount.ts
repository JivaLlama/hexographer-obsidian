import {
  applyCommandToNote,
  calendarForItem,
  commitPan,
  createScale,
  createUndoStack,
  planAccountMove,
  planMove,
  planRelativeMove,
  resolveDates,
  scaleLimitsForCalendar,
  type EditCommand,
  type Scale,
  type ScaleLimits,
  type TimelineItem,
} from "../../../core";
import { bindInteraction } from "../interaction/controller";
import type { WheelAction } from "../interaction/wheel";
import { anchorDaysFor } from "../scene/drag";
import { buildLanes, cameraForDataset, filterOrdered, stubDataset, type TimelineDataset } from "../scene/dataset";
import { beforeBandInset, laneColumnWidth, layoutScene } from "../scene/layout";
import { itemsForView } from "../scene/placed";
import { createTimelineView, type TimelineView } from "../scene/render";
import { createViewStore, type ViewStore } from "../store";

export interface TimelineEditHost {
  read(path: string): Promise<string>;
  write(path: string, markdown: string): Promise<void>;
}

export interface MountOptions {
  container: HTMLElement;
  surface: "inline" | "full";
  mobile: boolean;
  load: () => Promise<TimelineDataset>;
  onOpenFull?: () => void;
  onOpenItem?: (itemId: string) => void;
  subscribeRefresh?: (listener: () => void) => () => void;
  /** Vault read/write. Absent hosts stay read-only, including the preview. */
  edit?: TimelineEditHost;
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
 * Desktop editing writes through `planMove`, `planRelativeMove`, and
 * `planAccountMove`. Mobile, and any host without `edit`, stays read-only.
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
  let drag: { id: string; dx: number } | null = null;
  const undo = options.edit
    ? createUndoStack({
        applyField: async (path, key, value) => {
          const markdown = await options.edit!.read(path);
          const command: EditCommand = {
            label: "Edit timeline",
            patches: [{ path, fields: [{ key, before: null, after: value }] }],
          };
          await options.edit!.write(path, applyCommandToNote(markdown, command));
        },
      })
    : null;

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
    const filtered = itemsForView(dataset.items, snapshot.filters, dataset.settings, dataset.calendars);
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
      settings: dataset.settings,
      ...(snapshot.filters.accounts !== undefined ? { accounts: snapshot.filters.accounts } : {}),
      ...(snapshot.filters.cultures ? { cultures: snapshot.filters.cultures } : {}),
    });
    view.render(model);
    datedInset = model.before?.width ?? 0;
    view.setTranslate(translateX);
  };

  const datedWidth = (width: number): number => {
    if (!dataset) return width;
    const snapshot = store.get();
    const items = itemsForView(dataset.items, snapshot.filters, dataset.settings, dataset.calendars);
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
    const count =
      itemsForView(dataset.items, filters, dataset.settings, dataset.calendars).length +
      filterOrdered(dataset.ordered, filters).length;
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

  const applyLaneColumn = (): void => {
    if (!dataset || options.mobile) return;
    const filters = store.get().filters;
    const filtered = itemsForView(dataset.items, filters, dataset.settings, dataset.calendars);
    const ordered = filterOrdered(dataset.ordered, filters);
    const lanes = buildLanes(filtered, dataset.config.lanes?.order, ordered);
    view.setLaneColumn(laneColumnWidth(lanes.map((lane) => lane.label), (text) => view.labelWidth(text)));
  };

  const fit = (): void => {
    if (!dataset) return;
    applyLaneColumn();
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
    isReadOnly: () => options.mobile || !options.edit,
    onPan(dx, dy) {
      onPanPixels(dx);
      if (dy !== 0) view.scrollLanesBy(-dy);
    },
    onPinch(effect) {
      translateX += effect.dx;
      if (effect.dy !== 0) view.scrollLanesBy(-effect.dy);
      zoomAt(effect.focusX, effect.factor);
    },
    onDrag(effect) {
      if (!dataset || !options.edit) return;
      if (!drag || drag.id !== effect.itemId) drag = { id: effect.itemId, dx: 0 };
      drag.dx += effect.dx;
      const px = currentScale().pxPerDay;
      if (!(px > 0)) return;
      view.setDragTip(dragPreview(dataset, effect.itemId, drag.dx / px));
    },
    onHover(itemId) {
      store.setHover(itemId);
    },
    onClick(itemId) {
      store.setSelection(itemId ? [itemId] : []);
      renderScene();
    },
    onOpenItem(itemId) {
      options.onOpenItem?.(noteIdFromHit(itemId));
    },
    onDoubleTap(x) {
      zoomAt(x, ZOOM_STEP);
    },
    onGestureEnd() {
      const pending = drag;
      drag = null;
      view.setDragTip(null);
      if (translateX !== 0) commitTranslate();
      if (pending && pending.dx !== 0) void commitDrag(pending.id, pending.dx);
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
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!undo || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    event.preventDefault();
    void (event.shiftKey ? undo.redo() : undo.undo()).then(() => reload({ fit: false }));
  };
  view.root.addEventListener("keydown", onKeyDown);

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
    const previousAccounts = store.get().filters.accounts;
    const configFilters = dataset.config.filters ?? {};
    const keepAccounts = reloadOptions?.fit === false && previousAccounts !== undefined;
    store.setFilters(keepAccounts ? { ...configFilters, accounts: previousAccounts } : configFilters);
    view.setAccounts(accountCultures(dataset.items), store.get().filters.accounts, (next) => {
      store.setFilters({ ...store.get().filters, accounts: next });
      renderScene();
      publishStatus();
    });
    applyLaneColumn();
    const width = view.sceneWidth();
    const limitWidth = width >= 2 ? width : 320;
    limits = scaleLimitsForCalendar(dataset.calendar, { viewportPx: limitWidth });
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

  async function commitDrag(id: string, dx: number): Promise<void> {
    if (!dataset || !options.edit || !undo) return;
    const px = currentScale().pxPerDay;
    if (!(px > 0) || dx === 0) return;
    const deltaDays = dx / px;
    const parts = hitParts(id);
    const item = dataset.items.find((entry) => entry.id === parts.noteId);
    if (!item || item.parseError) return;
    let command: EditCommand | null = null;
    try {
      command = planDrag(dataset, item, parts, deltaDays);
    } catch {
      return;
    }
    if (!command || command.patches.length === 0) return;
    undo.push(command);
    for (const patch of command.patches) {
      const markdown = await options.edit.read(patch.path);
      await options.edit.write(patch.path, applyCommandToNote(markdown, { label: command.label, patches: [patch] }));
    }
    await reload({ fit: false });
  }

  void reload({ fit: true });

  return {
    reload,
    destroy() {
      generation += 1;
      observer.disconnect();
      view.body.removeEventListener("scroll", onScroll);
      view.root.removeEventListener("keydown", onKeyDown);
      unbind();
      unsubscribe?.();
    view.destroy();
  },
};
}

function accountCultures(items: readonly TimelineItem[]): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  const add = (value: string | undefined): void => {
    if (!value) return;
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    list.push(value);
  };
  for (const item of items) {
    for (const account of item.accounts ?? []) add(account.by);
  }
  return list;
}

function hitParts(id: string): { noteId: string; accountIndex: number | null; noteGhost: boolean } {
  const mark = id.lastIndexOf("#");
  if (mark < 0) return { noteId: id, accountIndex: null, noteGhost: false };
  const suffix = id.slice(mark + 1);
  if (suffix === "primary") return { noteId: id.slice(0, mark), accountIndex: null, noteGhost: true };
  if (/^\d+$/.test(suffix)) return { noteId: id.slice(0, mark), accountIndex: Number(suffix), noteGhost: false };
  return { noteId: id, accountIndex: null, noteGhost: false };
}

function noteIdFromHit(id: string): string {
  return hitParts(id).noteId;
}

function dragPreview(dataset: TimelineDataset, id: string, deltaDays: number): string | null {
  try {
    const parts = hitParts(id);
    const item = dataset.items.find((entry) => entry.id === parts.noteId);
    if (!item) return null;
    if (parts.accountIndex !== null) {
      const account = item.accounts?.[parts.accountIndex];
      const calendar = account && dataset.calendars.find((engine) => engine.def.id === account.calendarId);
      if (!account || !calendar) return null;
      const plan = planAccountMove(item, parts.accountIndex, deltaDays, "move", { fine: false, calendar });
      return plan.endRaw ? `${plan.startRaw} – ${plan.endRaw}` : plan.startRaw;
    }
    if (item.relations && item.relations.length > 0) {
      const notes = resolveDates(dataset.items, dataset.settings, dataset.calendars);
      const calendar = calendarForItem(item, dataset.calendars);
      const plan = planRelativeMove(item, deltaDays, {
        calendar,
        units: dataset.settings?.units,
        anchorDays: anchorDaysFor(item, dataset.items, notes),
      });
      return plan.gap;
    }
    if (!item.source.startRaw.trim()) return null;
    const calendar = calendarForItem(item, dataset.calendars);
    const plan = planMove(item, deltaDays, "move", { fine: false, calendar });
    return plan.endRaw ? `${plan.startRaw} – ${plan.endRaw}` : plan.startRaw;
  } catch {
    return null;
  }
}

function planDrag(
  dataset: TimelineDataset,
  item: TimelineItem,
  parts: { accountIndex: number | null },
  deltaDays: number
): EditCommand | null {
  if (parts.accountIndex !== null) {
    const account = item.accounts?.[parts.accountIndex];
    const calendar = account && dataset.calendars.find((engine) => engine.def.id === account.calendarId);
    if (!account || !calendar) return null;
    return planAccountMove(item, parts.accountIndex, deltaDays, "move", { fine: false, calendar }).command;
  }
  if (item.relations && item.relations.length > 0) {
    const notes = resolveDates(dataset.items, dataset.settings, dataset.calendars);
    const calendar = calendarForItem(item, dataset.calendars);
    return planRelativeMove(item, deltaDays, {
      calendar,
      units: dataset.settings?.units,
      anchorDays: anchorDaysFor(item, dataset.items, notes),
    }).command;
  }
  if (!item.source.startRaw.trim()) return null;
  const calendar = calendarForItem(item, dataset.calendars);
  return planMove(item, deltaDays, "move", { fine: false, calendar }).command;
}
