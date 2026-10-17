import type { FilterState, ItemKind, TimelineConfig } from "../types";
import { parseYaml } from "../yaml/parse";

const KINDS: readonly ItemKind[] = ["event", "span", "era"];

/**
 * Parse the YAML body of a `worldtimeline` code block.
 * `source.query` is kept as a string; the shell interprets it.
 */
export function parseTimelineConfig(yaml: string, fallbackCalendarId: string): TimelineConfig {
  const parsed = parseYaml(yaml);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("timeline config must be a map");
  }
  const raw = parsed as Record<string, unknown>;
  const sourceRaw = raw.source;
  const source: TimelineConfig["source"] = {};
  if (typeof sourceRaw === "string") {
    source.folders = [sourceRaw];
  } else if (sourceRaw && typeof sourceRaw === "object" && !Array.isArray(sourceRaw)) {
    const map = sourceRaw as Record<string, unknown>;
    const folders = stringList(map.folders ?? map.folder);
    const tags = stringList(map.tags ?? map.tag);
    if (folders) source.folders = folders;
    if (tags) source.tags = tags;
    if (typeof map.query === "string") source.query = map.query;
  }
  const config: TimelineConfig = {
    source,
    displayCalendarId: displayCalendarId(raw, fallbackCalendarId),
  };
  if (raw.lanes && typeof raw.lanes === "object" && !Array.isArray(raw.lanes)) {
    const lanes = raw.lanes as Record<string, unknown>;
    config.lanes = {};
    const order = stringList(lanes.order);
    if (order) config.lanes.order = order;
    if (typeof lanes.groupBy === "string") config.lanes.groupBy = lanes.groupBy;
  }
  if (raw.filters && typeof raw.filters === "object" && !Array.isArray(raw.filters)) {
    config.filters = readFilters(raw.filters as Record<string, unknown>);
  }
  if (raw.view && typeof raw.view === "object" && !Array.isArray(raw.view)) {
    const view = raw.view as Record<string, unknown>;
    config.view = {};
    if (typeof view.from === "string") config.view.from = view.from;
    if (typeof view.to === "string") config.view.to = view.to;
  }
  return config;
}

function readFilters(raw: Record<string, unknown>): FilterState {
  const filters: FilterState = {};
  const tagsAny = stringList(raw.tagsAny);
  const tagsNone = stringList(raw.tagsNone);
  const lanes = stringList(raw.lanes);
  const calendars = stringList(raw.calendars ?? raw.calendar);
  const cultures = stringList(raw.cultures ?? raw.culture);
  if (tagsAny) filters.tagsAny = tagsAny;
  if (tagsNone) filters.tagsNone = tagsNone;
  if (lanes) filters.lanes = lanes;
  if (calendars) filters.calendars = calendars;
  if (cultures) filters.cultures = cultures;
  if (typeof raw.text === "string") filters.text = raw.text;
  if (Array.isArray(raw.kinds)) {
    filters.kinds = raw.kinds.filter((kind): kind is ItemKind => typeof kind === "string" && KINDS.includes(kind as ItemKind));
  }
  if (raw.range && typeof raw.range === "object" && !Array.isArray(raw.range)) {
    const range = raw.range as Record<string, unknown>;
    if (typeof range.from === "number" && typeof range.to === "number") {
      filters.range = { from: range.from, to: range.to };
    }
  }
  return filters;
}

function displayCalendarId(raw: Record<string, unknown>, fallbackCalendarId: string): string {
  if (typeof raw.displayCalendar === "string" && raw.displayCalendar) return raw.displayCalendar;
  if (typeof raw.calendar === "string" && raw.calendar) return raw.calendar;
  return fallbackCalendarId;
}

function stringList(value: unknown): string[] | undefined {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return undefined;
  const list = value.filter((item): item is string => typeof item === "string");
  return list;
}
