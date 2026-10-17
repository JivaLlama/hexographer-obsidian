import {
  createCalendar,
  extentOf,
  filterItems,
  GREGORIAN,
  parseTimelineConfig,
  parseTimelineNote,
  RECKONING,
  scaleLimitsForCalendar,
  type CalendarEngine,
  type Lane,
  type TimelineConfig,
  type TimelineItem,
} from "../../../core";
import { fitRange } from "./rebase";
import type { ViewState } from "../store";

/**
 * View-side dataset. The core parses one note and one config block; it does not
 * scan a vault or invent sample items. This module does both.
 */
export interface TimelineDataset {
  items: TimelineItem[];
  calendar: CalendarEngine;
  config: TimelineConfig;
  origin: "vault" | "stub";
  notice?: string;
}

export function readTimelineConfig(
  yaml: string,
  fallbackCalendarId: string
): { config: TimelineConfig; error?: string } {
  const trimmed = yaml.trim();
  if (!trimmed) return { config: { source: {}, calendarId: fallbackCalendarId } };
  try {
    return { config: parseTimelineConfig(trimmed, fallbackCalendarId) };
  } catch (error) {
    return {
      config: { source: {}, calendarId: fallbackCalendarId },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Strip a wikilink down to the visible label. View-side; the core keeps the raw lane id. */
export function displayLaneLabel(laneId: string): string {
  const wiki = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/.exec(laneId.trim());
  if (!wiki) return laneId;
  return (wiki[2] || wiki[1]).trim();
}

export function buildLanes(items: readonly TimelineItem[], order: readonly string[] | undefined): Lane[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (id: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };
  for (const id of order ?? []) add(id);
  for (const item of items) {
    if (item.kind === "era") continue;
    add(item.laneId ?? "");
  }
  if (ids.length === 0) ids.push("");
  return ids.map((id, index) => ({
    id,
    label: id === "" ? "Events" : displayLaneLabel(id),
    order: index,
    collapsed: false,
  }));
}

/**
 * Days the camera should fit. An explicit `view.from` / `view.to` wins.
 * Otherwise eras are ignored when any event or span exists, so a long era
 * band does not zoom the items into a hairline.
 */
export function visibleRange(
  calendar: CalendarEngine,
  items: readonly TimelineItem[],
  view: TimelineConfig["view"]
): { from: number; to: number } {
  if (view?.from && view?.to) {
    const parsed = parseViewRange(calendar, view.from, view.to);
    if (parsed) return parsed;
  }
  const ranged = items.filter((item) => item.kind !== "era");
  const source = ranged.length > 0 ? ranged : items;
  let min = Infinity;
  let max = -Infinity;
  for (const item of source) {
    const extent = extentOf(item);
    if (Number.isFinite(extent.from)) min = Math.min(min, extent.from);
    if (Number.isFinite(extent.to)) max = Math.max(max, extent.to);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) return { from: 0, to: 365 };
  return { from: min, to: max };
}

export function cameraForDataset(dataset: TimelineDataset, viewportPx: number, padPx = 32): ViewState {
  const width = Math.max(viewportPx, 1);
  const filtered = filterItems(dataset.items, dataset.config.filters);
  const limits = scaleLimitsForCalendar(dataset.calendar, { viewportPx: width });
  const range = visibleRange(dataset.calendar, filtered, dataset.config.view);
  const scale = fitRange(limits, range, width, padPx);
  return { originDays: scale.originDays, pxPerDay: scale.pxPerDay, laneScroll: 0 };
}

export function itemsFromNotes(
  notes: readonly { path: string; markdown: string }[],
  calendars: readonly CalendarEngine[],
  defaultCalendarId: string
): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const note of notes) {
    const item = parseTimelineNote(note.markdown, {
      path: note.path,
      calendars,
      defaultCalendarId,
      title: titleFromPath(note.path),
    });
    if (item) items.push(item);
  }
  return items;
}

/** Sample dates used when a block matches no notes. Built through the core parser. */
export function stubDataset(calendars?: readonly CalendarEngine[]): TimelineDataset {
  const list = calendars && calendars.length > 0 ? [...calendars] : defaultCalendars();
  const config = parseTimelineConfig(STUB_CONFIG, "reckoning");
  const calendar = list.find((engine) => engine.def.id === config.calendarId) ?? list[0];
  const engines = list.some((engine) => engine.def.id === calendar.def.id) ? list : [...list, calendar];
  return {
    items: itemsFromNotes(STUB_NOTES, engines, calendar.def.id),
    calendar,
    config,
    origin: "stub",
  };
}

export function defaultCalendars(): CalendarEngine[] {
  return [createCalendar(GREGORIAN), createCalendar(RECKONING)];
}

function titleFromPath(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.md$/i, "");
}

function parseViewRange(
  calendar: CalendarEngine,
  fromText: string,
  toText: string
): { from: number; to: number } | null {
  const from = calendar.parse(fromText);
  const to = calendar.parse(toText);
  if (!from.ok || !to.ok) return null;
  let end = to.days;
  try {
    const exclusive = calendar.endOfDays(to.date);
    if (Number.isFinite(exclusive)) end = exclusive;
  } catch {
    end = to.days;
  }
  if (!(end > from.days)) return null;
  return { from: from.days, to: end };
}

const STUB_CONFIG = `
calendar: reckoning
source:
  folders: [samples/timeline]
lanes:
  order: ["[[House Vey]]", "[[Climate]]", "[[Treaties]]"]
view:
  from: "3A 370"
  to: "3A 450"
`;

const STUB_NOTES: readonly { path: string; markdown: string }[] = [
  {
    path: "samples/timeline/eras/Third Age.md",
    markdown: `---
type: era
calendar: reckoning
start: "3A 1"
end: "3A 500"
---
# Third Age
`,
  },
  {
    path: "samples/timeline/spans/House Vey.md",
    markdown: `---
type: span
calendar: reckoning
start: "3A 380"
end: "3A 431"
lane: "[[House Vey]]"
tags: [dynasty]
---
# House Vey
`,
  },
  {
    path: "samples/timeline/spans/Reign of Aldric.md",
    markdown: `---
type: span
calendar: reckoning
start: "3A 400"
end: "3A 428"
lane: "[[House Vey]]"
tags: [reign]
people: ["[[Aldric Vey]]"]
---
# Reign of Aldric
`,
  },
  {
    path: "samples/timeline/spans/The Long Winter.md",
    markdown: `---
type: span
calendar: reckoning
start: "3A 408"
end: "3A 411"
lane: "[[Climate]]"
tags: [climate]
---
# The Long Winter
`,
  },
  {
    path: "samples/timeline/events/Founding of Port Haven.md",
    markdown: `---
type: event
calendar: reckoning
start: "3A 390 Frostmoot 3"
lane: "[[House Vey]]"
tags: [founding]
places: ["[[Port Haven]]"]
---
# Founding of Port Haven
`,
  },
  {
    path: "samples/timeline/events/Coronation of Aldric.md",
    markdown: `---
type: event
calendar: reckoning
start: "3A 400"
lane: "[[House Vey]]"
tags: [reign]
people: ["[[Aldric Vey]]"]
---
# Coronation of Aldric
`,
  },
  {
    path: "samples/timeline/events/Siege of Port Haven.md",
    markdown: `---
type: event
calendar: reckoning
start: "3A 412"
end: "3A 412 Frostmoot 9"
lane: "[[House Vey]]"
tags: [war, siege]
places: ["[[Port Haven]]"]
people: ["[[Aldric Vey]]"]
color: "#c0392b"
---
# Siege of Port Haven
`,
  },
  {
    path: "samples/timeline/events/Treaty of Amber.md",
    markdown: `---
type: event
calendar: reckoning
start: "3A 420 Seedfall 1"
lane: "[[Treaties]]"
tags: [diplomacy]
---
# Treaty of Amber
`,
  },
];
