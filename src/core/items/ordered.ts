import type { CalendarEngine } from "../calendar/types";
import type { OrderedItem, TimelineItem } from "../types";

/** Group key and label for an ordered item whose era is missing or unknown. */
export const BEFORE_RECKONING = "before reckoning";

export interface EraAnchor {
  /** Era note path. Stable for the life of that note. */
  key: string;
  title: string;
  /** Lowercase match strings: path, title, basename, and the calendar era id when the start parses. */
  aliases: readonly string[];
}

export interface OrderedGroup {
  eraKey: string;
  label: string;
  unresolved: boolean;
  items: OrderedItem[];
}

/**
 * Anchors built from era notes. A calendar era id is included when `start` parses,
 * so `era: 3A` and `era: "[[Third Age]]"` can name the same note.
 */
export function eraAnchors(eras: readonly TimelineItem[], calendars: readonly CalendarEngine[] = []): EraAnchor[] {
  return eras
    .filter((item) => item.kind === "era")
    .map((item) => ({
      key: item.id,
      title: item.title,
      aliases: anchorAliases(item, calendars),
    }));
}

/**
 * Group by resolved era, in the order `eras` were given.
 * Unresolved items share one leading `before reckoning` group.
 * Within a group, sort by `order`, then title, then id. A full tie keeps input order.
 */
export function groupOrderedItems(items: readonly OrderedItem[], eras: readonly EraAnchor[]): OrderedGroup[] {
  const byAlias = new Map<string, EraAnchor>();
  for (const era of eras) {
    for (const alias of era.aliases) {
      if (!byAlias.has(alias)) byAlias.set(alias, era);
    }
  }

  const buckets = new Map<string, OrderedItem[]>();
  const unresolved: OrderedItem[] = [];
  for (const item of items) {
    const anchor = resolveAnchor(item.eraRef, byAlias);
    if (!anchor) {
      unresolved.push(item);
      continue;
    }
    const list = buckets.get(anchor.key);
    if (list) list.push(item);
    else buckets.set(anchor.key, [item]);
  }

  const groups: OrderedGroup[] = [];
  if (unresolved.length > 0) {
    groups.push({
      eraKey: BEFORE_RECKONING,
      label: BEFORE_RECKONING,
      unresolved: true,
      items: sortOrdered(unresolved),
    });
  }
  for (const era of eras) {
    const list = buckets.get(era.key);
    if (!list) continue;
    groups.push({
      eraKey: era.key,
      label: era.title,
      unresolved: false,
      items: sortOrdered(list),
    });
    buckets.delete(era.key);
  }
  return groups;
}

function resolveAnchor(eraRef: string, byAlias: Map<string, EraAnchor>): EraAnchor | undefined {
  for (const alias of refAliases(eraRef)) {
    const found = byAlias.get(alias);
    if (found) return found;
  }
  return undefined;
}

function refAliases(eraRef: string): string[] {
  const trimmed = eraRef.trim();
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

function anchorAliases(item: TimelineItem, calendars: readonly CalendarEngine[]): string[] {
  const base = item.id.split("/").pop() ?? item.id;
  const values = [item.id, item.id.replace(/\.md$/i, ""), base, base.replace(/\.md$/i, ""), item.title];
  const calendar = calendars.find((engine) => engine.def.id === item.calendarId);
  if (calendar && item.source.startRaw) {
    const parsed = calendar.parse(item.source.startRaw);
    if (parsed.ok && parsed.date.era) {
      const era = calendar.def.eras.find((candidate) => candidate.id === parsed.date.era);
      values.push(parsed.date.era);
      if (era) values.push(era.abbr, era.name, era.id);
    }
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

function sortOrdered(items: readonly OrderedItem[]): OrderedItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      if (a.item.order !== b.item.order) return a.item.order - b.item.order;
      const title = a.item.title.localeCompare(b.item.title);
      if (title !== 0) return title;
      if (a.item.id !== b.item.id) return a.item.id < b.item.id ? -1 : 1;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}
