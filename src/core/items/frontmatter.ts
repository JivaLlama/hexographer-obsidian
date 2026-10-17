import { parseAccounts } from "../accounts/parse";
import type { CalendarDate, CalendarEngine } from "../calendar/types";
import { splitApproximate } from "../relations/approximate";
import { readRelations } from "../relations/read";
import { CERTAINTIES, type Certainty, type EditCommand, type ItemKind, type OrderedItem, type TimelineItem, type TimelineNoteResult } from "../types";
import { joinFrontmatter, splitFrontmatter } from "../yaml/frontmatter";
import { parseYaml } from "../yaml/parse";
import { stringifyYaml } from "../yaml/stringify";

export interface ParseTimelineNoteOptions {
  /** Vault path. Also the item id. */
  path: string;
  calendars: readonly CalendarEngine[];
  defaultCalendarId: string;
  /** Used when the note has no markdown heading. Defaults to the file name. */
  title?: string;
}

export interface TimelineWriteback {
  start?: string;
  /** `null` removes the end field. Omit to leave it alone. */
  end?: string | null;
  lane?: string | null;
  tags?: string[];
  color?: string | null;
  /** Sugar gap. `null` removes the key. */
  gap?: string | null;
  /** Replacement `relations` list in YAML shape. */
  relations?: unknown;
  /** Replacement `accounts` list in YAML shape. A primary drag omits this. */
  accounts?: unknown;
}

const KINDS: readonly ItemKind[] = ["event", "span", "era"];

/**
 * Dated notes only. An order-only event returns null here; use `parseTimelineNoteResult`.
 * A date that fails to parse still returns an item, with `parseError` set.
 */
export function parseTimelineNote(markdown: string, options: ParseTimelineNoteOptions): TimelineItem | null {
  const result = parseTimelineNoteResult(markdown, options);
  if (!result || result.kind !== "dated") return null;
  return result.item;
}

/**
 * Dated notes (`kind: "dated"`) and order-only events (`kind: "ordered"`).
 * Returns null when the note is not an event, span, or era.
 */
export function parseTimelineNoteResult(
  markdown: string,
  options: ParseTimelineNoteOptions
): TimelineNoteResult | null {
  const split = splitFrontmatter(markdown);
  if (!split) return null;
  let parsed: unknown;
  try {
    parsed = parseYaml(split.yaml);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const fields = parsed as Record<string, unknown>;
  const kind = fields.type;
  if (typeof kind !== "string" || !KINDS.includes(kind as ItemKind)) return null;

  const wroteCalendar = typeof fields.calendar === "string" && fields.calendar.length > 0;
  const calendarId = wroteCalendar ? (fields.calendar as string) : options.defaultCalendarId;
  const calendar = options.calendars.find((engine) => engine.def.id === calendarId);
  const culture = scalarString(fields.culture)?.trim();
  const startRaw = scalarString(fields.start) ?? "";
  const endRaw = scalarString(fields.end);
  const title = options.title ?? titleFrom(split.body, options.path);
  const laneRaw = scalarString(fields.lane);
  const laneId = kind === "era" ? null : laneRaw && laneRaw.length > 0 ? laneRaw : null;
  const tags = readTags(fields.tags);
  const color = scalarString(fields.color);
  const displayHint = scalarString(fields.displayHint)?.trim();
  const certainty = readCertainty(fields.certainty);
  const order = finiteNumber(fields.order);
  const relationRead = readRelations(fields);
  const accountRead = parseAccounts(fields.accounts, calendarId, options.calendars);
  const accountsRaw = fields.accounts !== undefined ? fields.accounts : undefined;

  if (
    (kind as ItemKind) === "event" &&
    startRaw.length === 0 &&
    order !== undefined &&
    relationRead.relations.length === 0
  ) {
    const warnings = [...certainty.warnings, ...accountRead.warnings];
    let orderedCalendar: string | undefined;
    if (wroteCalendar) {
      orderedCalendar = calendarId;
      if (!calendar) warnings.push(`unknown calendar "${calendarId}"`);
    }
    const eraRef = scalarString(fields.era)?.trim() ?? "";
    const item: OrderedItem = {
      id: options.path,
      title,
      order,
      eraRef,
      laneId,
      tags,
      ...(certainty.certainty ? { certainty: certainty.certainty } : {}),
      ...(orderedCalendar ? { calendarId: orderedCalendar } : {}),
      ...(culture ? { culture } : {}),
      ...(color ? { color } : {}),
      ...(displayHint ? { displayHint } : {}),
      ...(accountRead.accounts.length > 0 ? { accounts: accountRead.accounts } : {}),
      links: {
        places: readLinkList(fields.places),
        people: readLinkList(fields.people),
        other: [],
      },
      ...(warnings.length > 0 ? { warnings } : {}),
      source: {
        path: options.path,
        eraRaw: eraRef,
        ...(accountsRaw !== undefined ? { accountsRaw } : {}),
      },
    };
    return { kind: "ordered", item };
  }

  const warnings = [...certainty.warnings, ...relationRead.warnings, ...accountRead.warnings];
  if ((kind as ItemKind) === "event" && startRaw.length === 0 && fields.order !== undefined && order === undefined) {
    warnings.push("order must be a number");
  }
  const base: TimelineItem = {
    id: options.path,
    kind: kind as ItemKind,
    title,
    start: 0,
    end: null,
    extentTo: 0,
    startPrecision: "day",
    endPrecision: null,
    laneId,
    tags,
    calendarId,
    ...(culture ? { culture } : {}),
    ...(certainty.certainty ? { certainty: certainty.certainty } : {}),
    ...(displayHint ? { displayHint } : {}),
    ...(relationRead.relations.length > 0 ? { relations: relationRead.relations } : {}),
    ...(accountRead.accounts.length > 0 ? { accounts: accountRead.accounts } : {}),
    links: {
      places: readLinkList(fields.places),
      people: readLinkList(fields.people),
      other: [],
    },
    source: {
      path: options.path,
      startRaw,
      ...(endRaw !== undefined ? { endRaw } : {}),
      calendarId,
      ...(relationRead.gapRaw !== undefined ? { gapRaw: relationRead.gapRaw } : {}),
      ...(relationRead.relationsRaw !== undefined ? { relationsRaw: relationRead.relationsRaw } : {}),
      ...(relationRead.form ? { relationForm: relationRead.form, listRelationCount: relationRead.listCount } : {}),
      ...(accountsRaw !== undefined ? { accountsRaw } : {}),
    },
  };
  if (color) base.color = color;

  const startSplit = splitApproximate(startRaw);
  const endSplit = endRaw !== undefined ? splitApproximate(endRaw) : undefined;
  if (startSplit.approximate) base.startApproximate = true;
  if (endSplit?.approximate) base.endApproximate = true;
  const hasEndRelation = relationRead.relations.some((relation) => relation.edge === "end");

  const problems: string[] = [];
  if (!calendar) {
    problems.push(`unknown calendar "${calendarId}"`);
    base.parseError = problems.join("; ");
    if (warnings.length > 0) base.warnings = warnings;
    return { kind: "dated", item: base };
  }

  let startParsed = false;
  if (!startSplit.text) {
    if (relationRead.relations.length === 0) problems.push("missing start");
  } else {
    const start = calendar.parse(startSplit.text);
    if (!start.ok) problems.push(`start: ${start.error}`);
    else {
      startParsed = true;
      base.start = start.days;
      base.startPrecision = start.date.precision;
      base.extentTo = safeEnd(calendar, start.date, start.days);
    }
  }

  if (endSplit) {
    if (!endSplit.text) problems.push("end: could not parse \"\"");
    else {
      const end = calendar.parse(endSplit.text);
      if (!end.ok) problems.push(`end: ${end.error}`);
      else {
        base.end = end.days;
        base.endPrecision = end.date.precision;
        base.extentTo = safeEnd(calendar, end.date, end.days);
      }
    }
  } else if ((kind === "span" || kind === "era") && !hasEndRelation) {
    problems.push(`${kind} is missing end`);
  }

  if (startParsed && base.end !== null && base.end < base.start) problems.push("end is before start");
  if (problems.length > 0) base.parseError = problems.join("; ");
  if (warnings.length > 0) base.warnings = warnings;
  return { kind: "dated", item: base };
}

/**
 * Patch frontmatter and leave the note body byte-for-byte.
 * Pass the raw strings from `planMove` so each end keeps its own precision.
 * Strings are written as given; an unchanged drag keeps the original text.
 */
export function serializeTimelineNote(markdown: string, update: TimelineWriteback): string {
  const split = splitFrontmatter(markdown);
  const fields: Record<string, unknown> = {};
  if (split) {
    const parsed = parseYaml(split.yaml);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      Object.assign(fields, parsed);
    }
  }
  if (update.start !== undefined) fields.start = update.start;
  if (update.end === null) delete fields.end;
  else if (update.end !== undefined) fields.end = update.end;
  if (update.lane === null) delete fields.lane;
  else if (update.lane !== undefined) fields.lane = update.lane;
  if (update.tags !== undefined) fields.tags = update.tags;
  if (update.color === null) delete fields.color;
  else if (update.color !== undefined) fields.color = update.color;
  if (update.gap === null) delete fields.gap;
  else if (update.gap !== undefined) fields.gap = update.gap;
  if (update.relations !== undefined) fields.relations = update.relations;
  if (update.accounts !== undefined) fields.accounts = update.accounts;
  const body = split ? split.body : markdown;
  return joinFrontmatter(stringifyYaml(fields), body);
}

/**
 * Apply an `EditCommand` to a note. Handles `start`, `end`, `gap`, `relations`, and `accounts`.
 * A primary `planMove` command only carries `start` / `end`, so account rows stay as written.
 */
export function applyCommandToNote(markdown: string, command: EditCommand): string {
  let next = markdown;
  for (const patch of command.patches) {
    const update: TimelineWriteback = {};
    for (const field of patch.fields) {
      if (field.key === "start" && (typeof field.after === "string" || typeof field.after === "number")) {
        update.start = String(field.after);
      } else if (field.key === "end") {
        update.end = field.after === null || field.after === undefined ? null : String(field.after);
      } else if (field.key === "gap") {
        update.gap = field.after === null || field.after === undefined ? null : String(field.after);
      } else if (field.key === "relations") update.relations = field.after;
      else if (field.key === "accounts") update.accounts = field.after;
    }
    next = serializeTimelineNote(next, update);
  }
  return next;
}

/** The engine whose strings this note stores. Throws when that id is not loaded. */
export function calendarForItem(item: TimelineItem, calendars: readonly CalendarEngine[]): CalendarEngine {
  const found = calendars.find((engine) => engine.def.id === item.calendarId);
  if (!found) throw new Error(`unknown calendar "${item.calendarId}"`);
  return found;
}

export function applyPlanToNote(
  markdown: string,
  plan: { startRaw: string; endRaw?: string }
): string {
  return serializeTimelineNote(markdown, {
    start: plan.startRaw,
    ...(plan.endRaw !== undefined ? { end: plan.endRaw } : {}),
  });
}

function safeEnd(calendar: CalendarEngine, date: CalendarDate, fallback: number): number {
  try {
    const end = calendar.endOfDays(date);
    return Number.isFinite(end) ? end : fallback;
  } catch {
    return fallback;
  }
}

function titleFrom(body: string, path: string): string {
  const match = body.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.md$/i, "");
}

function scalarString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function readTags(value: unknown): string[] {
  return readLinkList(value)
    .map((tag) => tag.trim().replace(/^#/, ""))
    .filter((tag) => tag.length > 0);
}

function readCertainty(value: unknown): { certainty?: Certainty; warnings: string[] } {
  if (value === undefined || value === null || value === "") return { warnings: [] };
  if (typeof value !== "string") return { warnings: ["certainty must be a string"] };
  const trimmed = value.trim().toLowerCase();
  if (CERTAINTIES.includes(trimmed as Certainty)) return { certainty: trimmed as Certainty, warnings: [] };
  return { warnings: [`unknown certainty "${value.trim()}"`] };
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readLinkList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string" && value.length > 0) return [value];
  return [];
}
