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
  /**
   * Calendar id of this note's `start` / `end` strings.
   * The vault default when frontmatter omits `calendar`.
   * Writeback formats with this calendar, not the view's display calendar.
   */
  calendarId: string;
  /** Optional culture. Independent of `calendarId`: two cultures may share a calendar. */
  culture?: string;
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
  /**
   * Display calendar for the axis and for labeling world days.
   * A master view sets this to any calendar and leaves `filters.calendars` empty,
   * so every item is drawn. A culture view sets this to that culture's calendar
   * and filters to its calendar and culture. Items are not rewritten into it.
   * YAML `displayCalendar`, or `calendar` as the same key.
   */
  displayCalendarId: string;
  lanes?: { order?: string[]; groupBy?: "lane" | "group" | string };
  filters?: FilterState;
  /** Calendar strings. The view parses them with `displayCalendarId`. */
  view?: { from?: string; to?: string };
}

export interface FilterState {
  tagsAny?: string[];
  tagsNone?: string[];
  kinds?: ItemKind[];
  lanes?: string[];
  /** Note calendar ids. A culture timeline lists that culture's calendar. */
  calendars?: string[];
  /** Culture labels. An item with no culture fails a non-empty list. Eras are included. */
  cultures?: string[];
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
