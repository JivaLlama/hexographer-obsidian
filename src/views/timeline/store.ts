import type { FilterState } from "../../core";

/**
 * Camera for one timeline surface. `originDays` is the world day at scene x = 0.
 * The view re-bases it when a zoom or pan ends so SVG coordinates stay small.
 */
export interface ViewState {
  originDays: number;
  pxPerDay: number;
  laneScroll: number;
}

/** Snapshot the shell and overlays read. Selection ids are note paths. */
export interface TimelineSnapshot {
  viewState: ViewState;
  selection: readonly string[];
  hover: string | null;
  filters: FilterState;
}

export interface ViewStore {
  get(): TimelineSnapshot;
  subscribe(listener: (snapshot: TimelineSnapshot) => void): () => void;
  setViewState(viewState: ViewState): void;
  setSelection(selection: readonly string[]): void;
  setHover(hover: string | null): void;
  setFilters(filters: FilterState): void;
}

export function createViewStore(initial?: Partial<TimelineSnapshot>): ViewStore {
  let snapshot: TimelineSnapshot = {
    viewState: initial?.viewState ?? { originDays: 0, pxPerDay: 1, laneScroll: 0 },
    selection: initial?.selection ? [...initial.selection] : [],
    hover: initial?.hover ?? null,
    filters: initial?.filters ?? {},
  };
  const listeners = new Set<(snapshot: TimelineSnapshot) => void>();

  const emit = (next: TimelineSnapshot): void => {
    if (sameSnapshot(snapshot, next)) return;
    snapshot = next;
    for (const listener of listeners) listener(snapshot);
  };

  return {
    get: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setViewState(viewState) {
      emit({ ...snapshot, viewState });
    },
    setSelection(selection) {
      emit({ ...snapshot, selection: [...selection] });
    },
    setHover(hover) {
      emit({ ...snapshot, hover });
    },
    setFilters(filters) {
      emit({ ...snapshot, filters });
    },
  };
}

function sameSnapshot(a: TimelineSnapshot, b: TimelineSnapshot): boolean {
  if (a.hover !== b.hover) return false;
  if (a.viewState.originDays !== b.viewState.originDays) return false;
  if (a.viewState.pxPerDay !== b.viewState.pxPerDay) return false;
  if (a.viewState.laneScroll !== b.viewState.laneScroll) return false;
  if (a.selection.length !== b.selection.length) return false;
  for (let i = 0; i < a.selection.length; i++) {
    if (a.selection[i] !== b.selection[i]) return false;
  }
  return JSON.stringify(a.filters) === JSON.stringify(b.filters);
}
