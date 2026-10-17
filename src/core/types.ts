import type { DayCount, Precision } from "./calendar/types";

export type { DayCount, Precision } from "./calendar/types";

export type ItemKind = "event" | "span" | "era";

/** How sure the author is. Frontmatter is trimmed and compared case-insensitively. */
export const CERTAINTIES = ["locked", "working", "uncertain", "open"] as const;
export type Certainty = (typeof CERTAINTIES)[number];

/** Inclusive world-day range. `likely` is the instant the view draws. */
export interface Interval {
  likely: number;
  /** Inclusive lower bound. */
  min: number;
  /** Inclusive upper bound. Equal to `min` when the instant is exact. */
  max: number;
}

/** Resolved placement of one note. `end` is null for a point. */
export interface ResolvedBounds {
  start: Interval;
  end: Interval | null;
}

/** A vault unit such as `gen: 40-60y`. `y`, `mo`, and `d` are built into the gap grammar. */
export interface TimeUnitDef {
  /** Unit id as written in `gap`, for example `gen`. */
  id: string;
  /** Inclusive span of one unit, in calendar years of the note being placed. */
  minYears: number;
  maxYears: number;
}

export type RelationKind = "after" | "before" | "overlaps";

/** One constraint on a note. Sugar `after` / `before` / `overlaps` becomes one of these. */
export interface Relation {
  kind: RelationKind;
  /** Note path, title, or wikilink. Compared the same way an era ref is. */
  target: string;
  /** Original gap string. Absent means a zero gap. */
  gap?: string;
  /** Which edge of this note the relation constrains. Default `start`. */
  edge?: "start" | "end";
  /** Index in the authored `relations` list. Absent on a sugar relation. */
  sourceIndex?: number;
}

/**
 * One other culture's version of a note.
 * A row is either dated (`start`) or ordered (`order`), never both.
 */
export interface Account {
  /** Culture wikilink or plain label. Brackets are part of the match. */
  by: string;
  startRaw?: string;
  endRaw?: string;
  start?: number;
  end?: number | null;
  startPrecision?: Precision;
  endPrecision?: Precision | null;
  order?: number;
  eraRef?: string;
  claim?: string;
  certainty?: Certainty;
  /**
   * Calendar used to parse this row.
   * The note's calendar when the row omits `calendar`, or when that name is not loaded.
   */
  calendarId: string;
  /** Set only when the author wrote `calendar` on the row. Writeback copies it back. */
  declaredCalendar?: string;
  /** Index of this row in the authored `accounts` list. */
  sourceIndex: number;
  warnings?: string[];
}

/** One note after `resolveDates`. A cycle sets `error` and leaves `bounds` unset. */
export interface ResolvedNote {
  id: string;
  bounds?: ResolvedBounds;
  /** Cycle text, or a gap/calendar failure. Unresolved anchors are warnings. */
  error?: string;
  warnings?: string[];
}

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
  /** Leading `~` on `start`. Bounds come from `resolveDates`. `source.startRaw` keeps the tilde. */
  startApproximate?: boolean;
  /** Leading `~` on `end`. An approximate end does not inherit the start's width. */
  endApproximate?: boolean;
  /**
   * `relations`, with a sugar `after` / `before` / `overlaps` entry appended after the list.
   * A note with relations and no `start` is still dated. `start` is then 0 and is not a world
   * day; draw `resolveDates` bounds. `source.startRaw` is empty.
   */
  relations?: Relation[];
  /** Other cultures' versions of this note. A primary drag does not rewrite them. */
  accounts?: Account[];
  /** Non-fatal notes, such as an unknown `certainty` value. */
  warnings?: string[];
  links: { places: string[]; people: string[]; other: string[] };
  source: {
    path: string;
    startRaw: string;
    endRaw?: string;
    calendarId: string;
    /** Authored sugar `gap`, when that key is present. */
    gapRaw?: string;
    /** Authored `relations` list, before a sugar entry is appended. */
    relationsRaw?: unknown;
    relationForm?: "sugar" | "list" | "mixed";
    /** How many list entries precede the sugar relation. */
    listRelationCount?: number;
    /** Authored `accounts` value, so a ghost drag can patch one row. */
    accountsRaw?: unknown;
  };
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
  /** Other cultures' versions. An order-only note can still carry dated accounts. */
  accounts?: Account[];
  links: { places: string[]; people: string[]; other: string[] };
  warnings?: string[];
  source: { path: string; eraRaw: string; accountsRaw?: unknown };
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
  /**
   * Which account ghosts to draw. This does not remove items.
   * `true` draws every ghost. `false` or omitted draws none.
   * A list draws ghosts whose `by` matches, trimmed and case-insensitive, brackets included.
   */
  accounts?: boolean | string[];
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
