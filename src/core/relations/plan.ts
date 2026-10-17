import type { CalendarEngine } from "../calendar/types";
import type { EditCommand, Relation, TimelineItem, TimeUnitDef } from "../types";
import type { VaultSettings } from "../vault/settings";
import { formatGap, normalizeUnits, parseGap, sameGap, type GapTerm } from "./gap";
import { relationsToYaml } from "./read";

export interface RelativeMoveContext {
  /** The note's calendar. Year length for the snap comes from here, at `anchorDays`. */
  calendar: CalendarEngine;
  units?: VaultSettings["units"];
  /** Which relation to edit. Default 0. Sugar is the last entry when both forms are present. */
  relationIndex?: number;
  /** Anchor likely world day. `daysInYear` is read in `calendar` at this instant. */
  anchorDays: number;
}

export interface RelativeMoveResult {
  /** Gap string of the edited relation. */
  gap: string;
  relations: Relation[];
  command: EditCommand;
}

/**
 * Drag a relative note by editing `gap`, not `start`.
 * Positive `deltaDays` moves the note later. `before` subtracts that delta.
 * The coarsest ranged term snaps at its midpoint; the leftover is whole years.
 * Dependents are not in the command. They move when `resolveDates` runs again.
 */
export function planRelativeMove(item: TimelineItem, deltaDays: number, ctx: RelativeMoveContext): RelativeMoveResult {
  if (ctx.calendar.def.id !== item.calendarId) {
    throw new Error(
      `planRelativeMove formats with the note's calendar "${item.calendarId}", not "${ctx.calendar.def.id}"`
    );
  }
  const relations = item.relations ?? [];
  const index = ctx.relationIndex ?? 0;
  const relation = relations[index];
  if (!relation) throw new Error(`relation ${index} is missing`);

  const originalGap = relation.gap ?? "";
  if (deltaDays === 0) {
    return { gap: originalGap || "0y", relations: [...relations], command: emptyCommand(item) };
  }

  const parsed = parseGap(originalGap);
  if ("error" in parsed) throw new Error(parsed.error);
  const working = parsed.map((term) => ({ ...term }));
  const units = normalizeUnits(ctx.units);
  const year = ctx.calendar.toAbsoluteYear(ctx.calendar.fromDays(ctx.anchorDays, "year"));
  const yearLen = ctx.calendar.daysInYear(year);
  const deltaYears = deltaDays / yearLen;
  const signed = relation.kind === "before" ? -deltaYears : deltaYears;

  const ranged = working
    .map((term, termIndex) => ({
      term,
      termIndex,
      def: units.find((unit) => unit.id.toLowerCase() === term.unit.toLowerCase()),
    }))
    .filter((entry): entry is { term: GapTerm; termIndex: number; def: TimeUnitDef } => {
      return entry.def !== undefined && entry.def.minYears !== entry.def.maxYears;
    });
  ranged.sort((a, b) => {
    const midA = (a.def.minYears + a.def.maxYears) / 2;
    const midB = (b.def.minYears + b.def.maxYears) / 2;
    if (midB !== midA) return midB - midA;
    return a.termIndex - b.termIndex;
  });

  const snap = ranged[0];
  const mid = snap ? (snap.def.minYears + snap.def.maxYears) / 2 : 1;
  let steps = 0;
  let remainder = signed;
  if (Math.abs(signed) >= mid) {
    steps = Math.trunc(signed / mid);
    remainder = signed - steps * mid;
  }
  if (snap) snap.term.count += steps;
  else addYears(working, steps);
  addYears(working, Math.round(remainder));

  if (sameGap(working, parsed)) {
    return { gap: originalGap || formatGap(working), relations: [...relations], command: emptyCommand(item) };
  }

  const gap = formatGap(working);
  const next = relations.map((entry, entryIndex) => {
    if (entryIndex !== index) return entry;
    return { ...entry, gap };
  });
  const command = commandFor(item, index, relation, gap, next);
  return { gap, relations: next, command };
}

function addYears(terms: GapTerm[], years: number): void {
  if (years === 0) return;
  const existing = terms.find((term) => term.unit.toLowerCase() === "y");
  if (existing) existing.count += years;
  else terms.push({ count: years, unit: "y" });
}

function commandFor(
  item: TimelineItem,
  index: number,
  relation: Relation,
  gap: string,
  next: Relation[]
): EditCommand {
  const form = item.source.relationForm;
  const listCount = item.source.listRelationCount ?? 0;
  const sugar =
    form === "sugar" ||
    (form === "mixed" && index >= listCount) ||
    (form === undefined && item.source.gapRaw !== undefined && item.source.relationsRaw === undefined);
  if (sugar) {
    const before = item.source.gapRaw ?? relation.gap ?? null;
    if (before === gap) return emptyCommand(item);
    return {
      label: `Move ${item.title}`.trim(),
      patches: [{ path: item.source.path, fields: [{ key: "gap", before, after: gap }] }],
    };
  }
  const before = item.source.relationsRaw ?? relationsToYaml(item.relations ?? []);
  const after = patchRelationGap(before, relation, index, gap, next);
  return {
    label: `Move ${item.title}`.trim(),
    patches: [{ path: item.source.path, fields: [{ key: "relations", before, after }] }],
  };
}

function patchRelationGap(
  raw: unknown,
  relation: Relation,
  index: number,
  gap: string,
  next: Relation[]
): unknown {
  if (!Array.isArray(raw)) return relationsToYaml(next);
  const copy = clone(raw);
  const rawIndex = relation.sourceIndex ?? index;
  const entry = copy[rawIndex];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return relationsToYaml(next);
  (entry as Record<string, unknown>).gap = gap;
  return copy;
}

function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => clone(entry)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      out[key] = clone((value as Record<string, unknown>)[key]);
    }
    return out as T;
  }
  return value;
}

function emptyCommand(item: TimelineItem): EditCommand {
  return { label: `Move ${item.title}`.trim(), patches: [] };
}
