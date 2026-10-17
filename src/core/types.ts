import type { DayCount, Precision } from "./calendar/types";

export type { DayCount, Precision } from "./calendar/types";

export type ItemKind = "event" | "span" | "era";

/** How sure the author is. Frontmatter is trimmed and compared case-insensitively. */
export const CERTAINTIES = ["locked", "working", "uncertain", "open"] as const;
export type Certainty = (typeof CERTAINTIES)[number];

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
  /** Set only for a known certainty value. An unknown value is a warning, not a failure. */
  certainty?: Certainty;
  /**
   * Author hint for the view (`displayHint`). Passed through on read.
   * Writeback of a drag never writes this field.
   */
  displayHint?: string;
  /** Non-fatal notes, such as an unknown `certainty` value. */
  warnings?: string[];
  links: { places: string[]; people: string[]; other: string[] };
  source: { path: string; startRaw: string; endRaw?: string; calendarId: string };
  /** Set when a date failed to parse. The item is kept. */
  parseError?: string;
}

/**
 * An event with `order` and no `start`. It is not a `TimelineItem`: `start` stays a number there.
 * `eraRef` is the raw frontmatter value (a wikilink or an era id).
 */
export interface OrderedItem {
  id: string;
  title: string;
  order: number;
  eraRef: string;
  laneId: string | null;
  tags: string[];
  certainty?: Certainty;
  /** Set only when the note itself names a calendar. Ordered items have no dates to default. */
  calendarId?: string;
  culture?: string;
  color?: string;
  displayHint?: string;
  links: { places: string[]; people: string[]; other: string[] };
  warnings?: string[];
  source: { path: string; eraRaw: string };
}

/** Full note parse. `parseTimelineNote` still returns only the dated arm, or null. */
export type TimelineNoteResult = { kind: "dated"; item: TimelineItem } | { kind: "ordered"; item: OrderedItem };

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
