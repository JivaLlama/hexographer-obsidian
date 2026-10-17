import {
  barsForItem,
  extentOf,
  filterItems,
  formatYearsAgo,
  itemMatches,
  resolveDates,
  type Bar,
  type CalendarEngine,
  type FilterState,
  type ItemBars,
  type ResolvedNote,
  type TimelineItem,
  type VaultSettings,
} from "../../../core";

/** World-day geometry the scene draws. Pure-relative notes never read `item.start`. */
export interface DrawSpan {
  /** Inclusive fuzzy minimum. */
  min: number;
  /** Inclusive fuzzy maximum. */
  max: number;
  /** Solid core. A point uses the same day for both ends. */
  coreFrom: number;
  coreTo: number;
  point: boolean;
  /** Fade starts here when the left edge is fuzzy. */
  leadFrom: number | null;
  /** Fade ends here when the right edge is fuzzy. */
  trailTo: number | null;
  /** Exclusive end passed to packing. */
  packTo: number;
}

export interface NoticeChip {
  id: string;
  title: string;
  message: string;
}

export interface DatedEntry {
  item: TimelineItem;
  note?: ResolvedNote;
  /** Exact written date: pack and draw with `extentOf`, so the mark matches the previous view. */
  native: boolean;
  packItem: TimelineItem;
  span: DrawSpan;
  bars: ItemBars;
  warning?: string;
}

export interface PreparedScene {
  entries: DatedEntry[];
  errors: NoticeChip[];
  warnings: NoticeChip[];
  notes: Map<string, ResolvedNote>;
}

export function writtenStart(item: TimelineItem): boolean {
  return item.source.startRaw.trim().length > 0;
}

export function noteIsFuzzy(note: ResolvedNote | undefined): boolean {
  const bounds = note?.bounds;
  if (!bounds) return false;
  if (bounds.start.min < bounds.start.max) return true;
  return bounds.end !== null && bounds.end.min < bounds.end.max;
}

/**
 * Exact notes with a written start keep the precision bucket from `extentOf`.
 * A pure-relative note, or any fuzzy interval, is placed from `resolveDates`.
 */
export function useNativeExtent(item: TimelineItem, note: ResolvedNote | undefined, primaryIsNote: boolean): boolean {
  if (!primaryIsNote) return false;
  if (!writtenStart(item)) return false;
  if (note?.error && !note.bounds) return false;
  if (noteIsFuzzy(note)) return false;
  return true;
}

export function prepareDated(
  items: readonly TimelineItem[],
  settings: VaultSettings | undefined,
  calendars: readonly CalendarEngine[],
  options: {
    accounts?: boolean | string[];
    cultureFor?: (item: TimelineItem) => string | undefined;
    resolved?: readonly ResolvedNote[];
  } = {}
): PreparedScene {
  const notes = new Map<string, ResolvedNote>();
  const resolved = options.resolved ?? resolveDates(items, settings, calendars);
  for (const note of resolved) notes.set(note.id, note);

  const entries: DatedEntry[] = [];
  const errors: NoticeChip[] = [];
  const warnings: NoticeChip[] = [];

  for (const item of items) {
    if (item.kind === "era") continue;
    const note = notes.get(item.id);
    if (item.parseError) {
      errors.push({ id: item.id, title: item.title, message: item.parseError });
    }
    if (note?.error && !note.bounds) {
      errors.push({ id: item.id, title: item.title, message: note.error });
      continue;
    }
    if (!note?.bounds && !writtenStart(item)) {
      const message = note?.warnings?.join("; ") || note?.error || "unresolved";
      warnings.push({ id: item.id, title: item.title, message });
      continue;
    }

    const culture = options.cultureFor?.(item);
    const bars = barsForItem(item, {
      ...(culture ? { culture } : {}),
      ...(options.accounts !== undefined ? { accounts: options.accounts } : {}),
    });
    const primaryIsNote = bars.primary.accountIndex === undefined && !bars.primary.notePrimary;
    const native = useNativeExtent(item, note, primaryIsNote);
    const span = native ? nativeSpan(item) : spanForBar(note, bars.primary);
    if (!span) {
      if (note?.warnings && note.warnings.length > 0) {
        warnings.push({ id: item.id, title: item.title, message: note.warnings.join("; ") });
      }
      continue;
    }
    const warning = note?.warnings?.join("; ");
    entries.push({
      item,
      ...(note ? { note } : {}),
      native,
      packItem: native ? item : packCopy(item, span),
      span,
      bars,
      ...(warning ? { warning } : {}),
    });
  }

  return { entries, errors, warnings, notes };
}

/** Range filter for notes whose `start` is not a world day. Written dates stay on `extentOf`. */
export function itemsForView(
  items: readonly TimelineItem[],
  filters: FilterState | undefined,
  settings: VaultSettings | undefined,
  calendars: readonly CalendarEngine[]
): TimelineItem[] {
  const range = filters?.range;
  const matched = filterItems(items, range ? { ...filters, range: undefined } : filters);
  if (!range) return matched;
  const notes = new Map(resolveDates(matched, settings, calendars).map((note) => [note.id, note]));
  return matched.filter((item) => {
    if (writtenStart(item)) return itemMatches(item, filters);
    const span = boundsSpan(notes.get(item.id));
    if (!span) return false;
    return span.packTo > range.from && span.min < range.to;
  });
}

export function cultureForItem(item: TimelineItem, filters: FilterState | undefined): string | undefined {
  const cultures = filters?.cultures;
  if (!cultures || cultures.length === 0) return undefined;
  for (const culture of cultures) {
    if (item.accounts?.some((account) => labelsMatch(account.by, culture))) return culture;
  }
  return cultures[0];
}

/** Small primary tag, `[[South]]` or `South` both become `(South)`. */
export function cultureTagText(culture: string | undefined): string {
  const raw = culture?.trim();
  if (!raw) return "";
  const wiki = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/.exec(raw);
  const name = (wiki ? wiki[2] || wiki[1] || "" : raw).trim();
  return name ? `(${name})` : "";
}

/**
 * Ghost label from one `barsForItem` bar.
 * A note's own bar uses that note's `culture`, or "note date" when it has none.
 * It does not borrow another account's `by`. An account ghost uses its own `by`.
 */
export function ghostBarLabel(bar: Bar): string {
  const culture = bar.culture?.trim() ?? "";
  if (bar.notePrimary || bar.accountIndex === undefined) return culture || "note date";
  return culture || "note date";
}

export function relationText(kind: string, target: string, gap: string | undefined): string {
  const label = target.includes("[[") ? target.trim() : `[[${target.trim()}]]`;
  const trimmed = gap?.trim();
  const gapText = trimmed ? `, +${trimmed.replace(/^\+/, "")}` : "";
  return `${kind} ${label}${gapText}`;
}

/** Tooltip for an account bar. The date is that row, not the note's resolved start. */
export function barDateTooltip(
  item: TimelineItem,
  calendar: CalendarEngine,
  span: DrawSpan,
  extra?: { by?: string; claim?: string }
): string {
  const lines = [item.title];
  if (extra?.by) lines.push(`by ${extra.by}`);
  if (extra?.claim) lines.push(extra.claim);
  lines.push(formatInstant(calendar, span.coreFrom));
  if (!span.point && span.coreTo > span.coreFrom) {
    lines.push(`${formatInstant(calendar, span.coreFrom)}–${formatInstant(calendar, span.coreTo)}`);
  }
  return lines.join("\n");
}

export function boundsTooltip(
  item: TimelineItem,
  note: ResolvedNote | undefined,
  calendar: CalendarEngine,
  extra?: { by?: string; claim?: string }
): string {
  const lines = [item.title];
  if (extra?.by) lines.push(`by ${extra.by}`);
  if (extra?.claim) lines.push(extra.claim);
  const bounds = note?.bounds;
  if (bounds) {
    lines.push(formatInstant(calendar, bounds.start.likely));
    const min = Math.min(bounds.start.min, bounds.end?.min ?? bounds.start.min);
    const max = Math.max(bounds.start.max, bounds.end?.max ?? bounds.start.max);
    if (min < max) lines.push(`${formatInstant(calendar, min)}–${formatInstant(calendar, max)}`);
  }
  for (const relation of item.relations ?? []) {
    lines.push(relationText(relation.kind, relation.target, relation.gap));
  }
  if (item.certainty) lines.push(item.certainty);
  if (item.displayHint) lines.push(item.displayHint);
  if (item.parseError) lines.push(item.parseError);
  for (const warning of note?.warnings ?? []) lines.push(warning);
  return lines.join("\n");
}

export function ghostSpan(item: TimelineItem, note: ResolvedNote | undefined, bar: Bar): DrawSpan | null {
  if (bar.notePrimary) {
    if (useNativeExtent(item, note, true)) return nativeSpan(item);
    return boundsSpan(note);
  }
  if (bar.start === undefined) return null;
  return instantSpan(bar.start, bar.end ?? null);
}

export function boundsSpan(note: ResolvedNote | undefined): DrawSpan | null {
  const bounds = note?.bounds;
  if (!bounds) return null;
  const start = bounds.start;
  const end = bounds.end;
  const coreFrom = start.likely;
  const coreTo = end ? end.likely : start.likely;
  const min = Math.min(start.min, end?.min ?? start.min);
  const max = Math.max(start.max, end?.max ?? start.max);
  const point = end === null;
  const solidTo = point ? coreFrom : coreTo;
  return {
    min,
    max,
    coreFrom,
    coreTo: solidTo,
    point,
    leadFrom: min < coreFrom ? min : null,
    trailTo: max > solidTo ? max : null,
    packTo: max > min ? max : coreFrom,
  };
}

/** Occupied days for fit. Exact written dates keep `extentOf`. Relative notes use bounds. */
export function fitSpan(
  item: TimelineItem,
  note: ResolvedNote | undefined
): { from: number; to: number } | null {
  if (item.kind === "era") {
    if (!writtenStart(item)) {
      const span = boundsSpan(note);
      return span ? { from: span.min, to: span.max > span.min ? span.max : span.min + 1 } : null;
    }
    return extentOf(item);
  }
  if (!writtenStart(item) || noteIsFuzzy(note)) {
    const span = boundsSpan(note);
    if (!span) return null;
    return { from: span.min, to: span.max > span.min ? span.max : span.min + 1 };
  }
  return extentOf(item);
}

function spanForBar(note: ResolvedNote | undefined, bar: Bar): DrawSpan | null {
  if (bar.accountIndex === undefined) return boundsSpan(note);
  if (bar.start === undefined) return null;
  return instantSpan(bar.start, bar.end ?? null);
}

function nativeSpan(item: TimelineItem): DrawSpan {
  const extent = extentOf(item);
  const point = item.kind === "event" && item.end === null;
  return {
    min: extent.from,
    max: extent.to,
    coreFrom: point ? extent.from : extent.from,
    coreTo: point ? extent.from : extent.to,
    point,
    leadFrom: null,
    trailTo: null,
    packTo: extent.to,
  };
}

function instantSpan(start: number, end: number | null): DrawSpan {
  if (end === null) {
    return {
      min: start,
      max: start,
      coreFrom: start,
      coreTo: start,
      point: true,
      leadFrom: null,
      trailTo: null,
      packTo: start,
    };
  }
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  const point = to === from;
  return {
    min: from,
    max: to,
    coreFrom: from,
    coreTo: point ? from : to,
    point,
    leadFrom: null,
    trailTo: null,
    packTo: to,
  };
}

function packCopy(item: TimelineItem, span: DrawSpan): TimelineItem {
  return {
    ...item,
    kind: span.point ? "event" : "span",
    start: span.min,
    end: span.point ? null : span.coreTo,
    extentTo: Math.max(span.packTo, span.min),
  };
}

function formatInstant(calendar: CalendarEngine, days: number): string {
  if (calendar.def.display?.mode === "before-present") {
    try {
      return formatYearsAgo(calendar.def, calendar.toAbsoluteYear(calendar.fromDays(days, "year")));
    } catch {
      // Fall through to the calendar's own format.
    }
  }
  try {
    return calendar.format(calendar.fromDays(days));
  } catch {
    return String(Math.round(days));
  }
}

function labelsMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
