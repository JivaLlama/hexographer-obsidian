import type { DayCount, Precision } from "./calendar/types";

export type { DayCount, Precision } from "./calendar/types";

export type ItemKind = "event" | "span" | "era";

/**
 * One timeline note. `start` / `end` are inclusive world-day instants (the start
 * of each written date). `extentTo` is the exclusive end of the occupied interval,
 * so a year-precision point covers `[start, extentTo)` without the view calling
 * the calendar engine. `end` is null for a point.
 */
export interface TimelineItem {
  /** Vault path of the note. One note is one item. */
  id: string;
  kind: ItemKind;
  title: string;
  start: DayCount;
  end: DayCount | null;
  /** Exclusive end of `[start, extentTo)`. Precomputed at parse time. */
  extentTo: DayCount;
  startPrecision: Precision;
  /** Null when the note has no end. */
  endPrecision: Precision | null;
  /** Null for eras and unlaned items. */
  laneId: string | null;
  tags: string[];
  color?: string;
  links: { places: string[]; people: string[]; other: string[] };
  source: { path: string; startRaw: string; endRaw?: string; calendarId: string };
  /** Set when a date failed to parse. The item is kept. */
  parseError?: string;
}

export interface Lane {
  id: string;
  label: string;
  group?: string;
  order: number;
  collapsed: boolean;
  notePath?: string;
}

export interface TimelineConfig {
  source: { folders?: string[]; tags?: string[]; query?: string };
  calendarId: string;
  lanes?: { order?: string[]; groupBy?: "lane" | "group" | string };
  filters?: FilterState;
  /** Calendar strings. The view parses them with the config's calendar. */
  view?: { from?: string; to?: string };
}

export interface FilterState {
  tagsAny?: string[];
  tagsNone?: string[];
  kinds?: ItemKind[];
  lanes?: string[];
  text?: string;
  /** Half-open world-day window `[from, to)`. */
  range?: { from: DayCount; to: DayCount };
}

export interface FieldPatch {
  key: string;
  before: unknown;
  after: unknown;
}

/** One undoable edit. A drag is one command, committed on pointer-up. */
export interface EditCommand {
  label: string;
  patches: Array<{ path: string; fields: FieldPatch[] }>;
}

export type MoveMode = "move" | "resize-start" | "resize-end";

export interface PlanMoveResult {
  start: DayCount;
  end: DayCount | null;
  startRaw: string;
  endRaw?: string;
  command: EditCommand;
}
