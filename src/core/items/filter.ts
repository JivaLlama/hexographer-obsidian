import type { FilterState, TimelineItem } from "../types";
import { extentOf } from "./extent";

/** Pure filter. Missing fields do not constrain. Eras ignore a lane filter. */
export function itemMatches(item: TimelineItem, filter: FilterState | undefined): boolean {
  if (!filter) return true;
  if (filter.kinds && filter.kinds.length > 0 && !filter.kinds.includes(item.kind)) return false;
  if (filter.tagsAny && filter.tagsAny.length > 0) {
    const tags = new Set(item.tags.map(normalizeTag));
    if (!filter.tagsAny.some((tag) => tags.has(normalizeTag(tag)))) return false;
  }
  if (filter.tagsNone && filter.tagsNone.length > 0) {
    const tags = new Set(item.tags.map(normalizeTag));
    if (filter.tagsNone.some((tag) => tags.has(normalizeTag(tag)))) return false;
  }
  if (filter.lanes && filter.lanes.length > 0 && item.kind !== "era") {
    if (item.laneId === null || !filter.lanes.includes(item.laneId)) return false;
  }
  if (filter.calendars && filter.calendars.length > 0) {
    const ids = new Set(filter.calendars.map(normalizeName));
    if (!ids.has(normalizeName(item.calendarId))) return false;
  }
  if (filter.cultures && filter.cultures.length > 0) {
    if (!item.culture || !filter.cultures.some((culture) => normalizeName(culture) === normalizeName(item.culture ?? ""))) {
      return false;
    }
  }
  if (filter.text) {
    const needle = filter.text.toLowerCase();
    const haystack = `${item.title} ${item.tags.join(" ")} ${item.laneId ?? ""} ${item.culture ?? ""} ${item.calendarId}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  if (filter.range) {
    const extent = extentOf(item);
    if (!Number.isFinite(extent.from) || !Number.isFinite(extent.to)) return false;
    if (extent.to <= filter.range.from || extent.from >= filter.range.to) return false;
  }
  return true;
}

export function filterItems(items: readonly TimelineItem[], filter: FilterState | undefined): TimelineItem[] {
  return items.filter((item) => itemMatches(item, filter));
}

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, "").toLowerCase();
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}
