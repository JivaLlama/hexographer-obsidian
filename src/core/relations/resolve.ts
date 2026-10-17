import type { CalendarDate, CalendarEngine } from "../calendar/types";
import type { Interval, Relation, ResolvedBounds, ResolvedNote, TimelineItem } from "../types";
import type { VaultSettings } from "../vault/settings";
import { splitApproximate } from "./approximate";
import { gapSpan, normalizeUnits } from "./gap";

const EMPTY_INTERSECTION = "relation does not meet the written date";

/**
 * Place every note. Absolute dates, `~` years, and relations share one bounds model.
 * A cycle is an error and names the notes. A missing or unresolved anchor is a warning
 * and that note gets no bounds. Dependents are not patched here; call this again after a move.
 *
 * Gap years use the dependent note's calendar at the anchor's likely year.
 * Do not pass `item.start` through `convert`. A pure relative note leaves `item.start` at 0;
 * that number is not a world day.
 */
export function resolveDates(
  items: readonly TimelineItem[],
  settings: VaultSettings | undefined,
  calendars: readonly CalendarEngine[]
): ResolvedNote[] {
  const units = normalizeUnits(settings?.units);
  const byId = new Map<string, TimelineItem>();
  for (const item of items) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  const alias = new Map<string, TimelineItem>();
  for (const item of items) {
    for (const name of itemAliases(item)) {
      if (!alias.has(name)) alias.set(name, item);
    }
  }

  const deps = new Map<string, string[]>();
  for (const item of items) {
    const targets: string[] = [];
    for (const relation of item.relations ?? []) {
      const anchor = matchItem(relation.target, alias);
      if (anchor) targets.push(anchor.id);
    }
    deps.set(item.id, targets);
  }
  const titles = new Map(items.map((item) => [item.id, item.title || item.id]));
  const cycles = findCycles(
    items.map((item) => item.id),
    deps,
    titles
  );

  const bounds = new Map<string, ResolvedBounds>();
  const errors = new Map<string, string>();
  const warnings = new Map<string, string[]>();
  const failed = new Set<string>();

  const pushWarning = (id: string, text: string) => {
    const list = warnings.get(id) ?? [];
    if (!list.includes(text)) list.push(text);
    warnings.set(id, list);
  };

  for (const item of items) {
    const cycle = cycles.get(item.id);
    if (cycle) {
      errors.set(item.id, cycle);
      failed.add(item.id);
    }
  }

  const pending = new Set(items.map((item) => item.id).filter((id) => !failed.has(id)));
  let progressed = true;
  while (progressed && pending.size > 0) {
    progressed = false;
    for (const id of [...pending]) {
      const item = byId.get(id);
      if (!item) continue;
      const relations = item.relations ?? [];
      if (relations.length === 0) {
        const placed = place(item, calendars, units, bounds, alias);
        if (placed.error) errors.set(id, placed.error);
        else if (placed.bounds) bounds.set(id, placed.bounds);
        for (const warning of placed.warnings) pushWarning(id, warning);
        if (!placed.bounds) failed.add(id);
        pending.delete(id);
        progressed = true;
        continue;
      }

      let blocked = false;
      let unusable = false;
      for (const relation of relations) {
        const anchor = matchItem(relation.target, alias);
        if (!anchor || failed.has(anchor.id) || cycles.has(anchor.id)) {
          pushWarning(id, `unresolved anchor ${wikiLabel(relation.target)}`);
          unusable = true;
          continue;
        }
        if (!bounds.has(anchor.id)) blocked = true;
      }
      if (unusable) {
        failed.add(id);
        pending.delete(id);
        progressed = true;
        continue;
      }
      if (blocked) continue;

      const placed = place(item, calendars, units, bounds, alias);
      if (placed.error) {
        errors.set(id, placed.error);
        failed.add(id);
      } else if (placed.bounds) bounds.set(id, placed.bounds);
      else failed.add(id);
      for (const warning of placed.warnings) pushWarning(id, warning);
      pending.delete(id);
      progressed = true;
    }
  }

  for (const id of pending) {
    failed.add(id);
    const item = byId.get(id);
    for (const relation of item?.relations ?? []) {
      const anchor = matchItem(relation.target, alias);
      if (!anchor || !bounds.has(anchor.id)) pushWarning(id, `unresolved anchor ${wikiLabel(relation.target)}`);
    }
  }

  return items.map((item) => {
    const note: ResolvedNote = { id: item.id };
    const error = errors.get(item.id);
    const noteWarnings = warnings.get(item.id);
    const resolved = bounds.get(item.id);
    if (error) note.error = error;
    else if (resolved) note.bounds = resolved;
    if (noteWarnings && noteWarnings.length > 0) note.warnings = noteWarnings;
    return note;
  });
}

interface Placement {
  bounds?: ResolvedBounds;
  error?: string;
  warnings: string[];
}

function place(
  item: TimelineItem,
  calendars: readonly CalendarEngine[],
  units: readonly TimeUnitDefLike[],
  resolved: Map<string, ResolvedBounds>,
  alias: Map<string, TimelineItem>
): Placement {
  const warnings: string[] = [];
  const calendar = calendars.find((engine) => engine.def.id === item.calendarId);
  if (!calendar) return { error: `unknown calendar "${item.calendarId}"`, warnings };

  const startRels = (item.relations ?? []).filter((relation) => relation.edge !== "end");
  const endRels = (item.relations ?? []).filter((relation) => relation.edge === "end");
  const absStart = item.source.startRaw ? absoluteInterval(calendar, item.source.startRaw, item.startApproximate) : undefined;
  const absEnd = item.source.endRaw ? absoluteInterval(calendar, item.source.endRaw, item.endApproximate) : undefined;
  const endIndependent = Boolean(item.endApproximate) || endRels.length > 0;
  const nominal = item.source.startRaw ? nominalInstant(calendar, item.source.startRaw, item.startApproximate) : null;
  const writtenEnd = item.source.endRaw && !item.endApproximate ? exactInstant(calendar, item.source.endRaw) : null;
  const duration = !endIndependent && nominal !== null && writtenEnd !== null ? writtenEnd - nominal : null;

  const startParts = relationIntervals(startRels, calendar, units, resolved, alias);
  if ("error" in startParts) return { error: startParts.error, warnings };
  const startCombined = combine(absStart ?? undefined, startParts);
  if (!startCombined.interval) return { warnings: ["missing start"] };
  if (startCombined.empty) warnings.push(EMPTY_INTERSECTION);

  let end: Interval | null = null;
  if (duration !== null) {
    end = shift(startCombined.interval, duration);
  } else if (endRels.length > 0 || absEnd) {
    const endParts = relationIntervals(endRels, calendar, units, resolved, alias);
    if ("error" in endParts) return { error: endParts.error, warnings };
    const endCombined = combine(absEnd ?? undefined, endParts);
    if (endCombined.empty) warnings.push(EMPTY_INTERSECTION);
    end = endCombined.interval ?? null;
  }

  if (end && (end.max < startCombined.interval.min || end.likely < startCombined.interval.likely)) {
    warnings.push(`end ${formatRange(end)} is before start ${formatRange(startCombined.interval)}`);
  }

  return { bounds: { start: startCombined.interval, end }, warnings };
}

type TimeUnitDefLike = { id: string; minYears: number; maxYears: number };

function relationIntervals(
  relations: readonly Relation[],
  calendar: CalendarEngine,
  units: readonly TimeUnitDefLike[],
  resolved: Map<string, ResolvedBounds>,
  alias: Map<string, TimelineItem>
): Interval[] | { error: string } {
  const out: Interval[] = [];
  for (const relation of relations) {
    const anchor = matchItem(relation.target, alias);
    const anchorBounds = anchor ? resolved.get(anchor.id) : undefined;
    if (!anchorBounds) return { error: `unresolved anchor ${wikiLabel(relation.target)}` };
    const edge = relationEdge(relation, anchorBounds);
    const gap = gapSpan(relation.gap, calendar, edge.likely, units);
    if ("error" in gap) return gap;
    out.push(applyRelation(relation, anchorBounds, gap));
  }
  return out;
}

function relationEdge(relation: Relation, bounds: ResolvedBounds): Interval {
  if (relation.kind === "before") return bounds.start;
  if (relation.kind === "overlaps") {
    if (!bounds.end) return bounds.start;
    return {
      min: bounds.start.min,
      max: bounds.end.max,
      likely: (bounds.start.min + bounds.end.max) / 2,
    };
  }
  return bounds.end ?? bounds.start;
}

function applyRelation(relation: Relation, bounds: ResolvedBounds, gap: { min: number; max: number; likely: number }): Interval {
  if (relation.kind === "after") {
    const anchorEnd = bounds.end ?? bounds.start;
    return {
      min: anchorEnd.min + gap.min,
      max: anchorEnd.max + gap.max,
      likely: anchorEnd.likely + gap.likely,
    };
  }
  if (relation.kind === "before") {
    return {
      min: bounds.start.min - gap.max,
      max: bounds.start.max - gap.min,
      likely: bounds.start.likely - gap.likely,
    };
  }
  const occupied = bounds.end
    ? { min: bounds.start.min, max: bounds.end.max, likely: (bounds.start.min + bounds.end.max) / 2 }
    : bounds.start;
  return {
    min: occupied.min - gap.max,
    max: occupied.max + gap.max,
    likely: occupied.likely,
  };
}

/**
 * `likely` stays when it still lies in the overlap. Otherwise it becomes the overlap's midpoint.
 * Starting from the absolute interval keeps an exact date from jumping to the middle of a wide relation.
 */
export function intersect(a: Interval, b: Interval): Interval | null {
  const min = Math.max(a.min, b.min);
  const max = Math.min(a.max, b.max);
  if (min > max) return null;
  const mid = (min + max) / 2;
  const likely = Math.min(max, Math.max(min, a.likely));
  return { min, max, likely: likely === a.likely ? a.likely : mid };
}

function combine(absolute: Interval | undefined, parts: Interval[]): { interval?: Interval; empty: boolean } {
  if (!absolute && parts.length === 0) return { empty: false };
  let current = absolute;
  const rest = absolute ? parts : parts.slice(1);
  if (!current) current = parts[0];
  let empty = false;
  for (const part of rest) {
    const next = intersect(current, part);
    if (!next) {
      empty = true;
      current = absolute ?? parts[0];
      break;
    }
    current = next;
  }
  return { interval: current, empty };
}

function shift(interval: Interval, duration: number): Interval {
  return {
    min: interval.min + duration,
    max: interval.max + duration,
    likely: interval.likely + duration,
  };
}

function absoluteInterval(calendar: CalendarEngine, raw: string, approximate: boolean | undefined): Interval | null {
  const split = splitApproximate(raw);
  if (!split.text) return null;
  const parsed = calendar.parse(split.text);
  if (!parsed.ok) return null;
  if (!(approximate || split.approximate)) {
    return { likely: parsed.days, min: parsed.days, max: parsed.days };
  }
  const min = parsed.days;
  const max = lastInstant(calendar, parsed.date);
  return { min, max, likely: (min + max) / 2 };
}

function nominalInstant(calendar: CalendarEngine, raw: string, approximate: boolean | undefined): number | null {
  const interval = absoluteInterval(calendar, raw, approximate);
  if (!interval) return null;
  if (approximate || splitApproximate(raw).approximate) return interval.likely;
  return interval.likely;
}

function exactInstant(calendar: CalendarEngine, raw: string): number | null {
  const split = splitApproximate(raw);
  if (!split.text || split.approximate) return null;
  const parsed = calendar.parse(split.text);
  return parsed.ok ? parsed.days : null;
}

function lastInstant(calendar: CalendarEngine, date: CalendarDate): number {
  const end = calendar.endOfDays(date);
  if (!Number.isFinite(end)) return end;
  const time = calendar.def.time ?? { hoursPerDay: 24, minutesPerHour: 60 };
  return end - 1 / (time.hoursPerDay * time.minutesPerHour);
}

function findCycles(
  ids: readonly string[],
  deps: Map<string, string[]>,
  titles: Map<string, string>
): Map<string, string> {
  const errors = new Map<string, string>();
  const color = new Map<string, number>();
  const stack: string[] = [];

  function dfs(id: string): void {
    color.set(id, 1);
    stack.push(id);
    for (const next of deps.get(id) ?? []) {
      const state = color.get(next) ?? 0;
      if (state === 1) {
        const start = stack.indexOf(next);
        const cycleIds = stack.slice(start);
        const text = formatCycle([...cycleIds, next], titles);
        for (const node of cycleIds) {
          if (!errors.has(node)) errors.set(node, text);
        }
      } else if (state === 0) dfs(next);
    }
    stack.pop();
    color.set(id, 2);
  }

  for (const id of ids) {
    if ((color.get(id) ?? 0) === 0) dfs(id);
  }
  return errors;
}

function formatCycle(ids: readonly string[], titles: Map<string, string>): string {
  const names = ids.map((id) => wikiLabel(titles.get(id) ?? id));
  return `cycle: ${names.join(" → ")}`;
}

function itemAliases(item: TimelineItem): string[] {
  const base = item.id.split("/").pop() ?? item.id;
  return uniqueLower([item.id, item.id.replace(/\.md$/i, ""), base, base.replace(/\.md$/i, ""), item.title]);
}

function matchItem(target: string, alias: Map<string, TimelineItem>): TimelineItem | undefined {
  for (const name of refAliases(target)) {
    const found = alias.get(name);
    if (found) return found;
  }
  return undefined;
}

function refAliases(target: string): string[] {
  const trimmed = target.trim();
  const values = [trimmed];
  const wiki = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/.exec(trimmed);
  if (wiki) {
    values.push(wiki[1]);
    if (wiki[2]) values.push(wiki[2]);
    const base = wiki[1].split("/").pop() ?? wiki[1];
    values.push(base.replace(/\.md$/i, ""));
  }
  return uniqueLower(values);
}

function uniqueLower(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function wikiLabel(target: string): string {
  const trimmed = target.trim();
  if (trimmed.includes("[[")) return trimmed;
  return `[[${trimmed}]]`;
}

function formatRange(interval: Interval): string {
  return `[${formatNum(interval.min)}, ${formatNum(interval.max)}]`;
}

function formatNum(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 1000) / 1000);
}
