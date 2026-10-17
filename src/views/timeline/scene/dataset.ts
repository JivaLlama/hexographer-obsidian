import {
  createCalendar,
  createScale,
  extentOf,
  GREGORIAN,
  parseTimelineConfig,
  parseTimelineNoteResult,
  RECKONING,
  resolveDates,
  scaleLimitsForCalendar,
  zoomToFit,
  type VaultSettings,
  type CalendarEngine,
  type FilterState,
  type Lane,
  type OrderedItem,
  type TimelineConfig,
  type TimelineItem,
} from "../../../core";
import type { ViewState } from "../store";
import { fitSpan, itemsForView } from "./placed";

/**
 * View-side dataset. The core parses one note and one config block; it does not
 * scan a vault or invent sample items. This module does both.
 */
export interface TimelineDataset {
  items: TimelineItem[];
  ordered: OrderedItem[];
  calendars: CalendarEngine[];
  calendar: CalendarEngine;
  config: TimelineConfig;
  origin: "vault" | "stub";
  notice?: string;
  /** Vault units used by `resolveDates` and relative drags. */
  settings?: VaultSettings;
}

export function readTimelineConfig(
  yaml: string,
  fallbackCalendarId: string
): { config: TimelineConfig; error?: string } {
  const trimmed = yaml.trim();
  if (!trimmed) return { config: { source: {}, displayCalendarId: fallbackCalendarId } };
  try {
    return { config: parseTimelineConfig(trimmed, fallbackCalendarId) };
  } catch (error) {
    return {
      config: { source: {}, displayCalendarId: fallbackCalendarId },
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

export function buildLanes(
  items: readonly TimelineItem[],
  order: readonly string[] | undefined,
  ordered: readonly OrderedItem[] = []
): Lane[] {
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
  for (const item of ordered) add(item.laneId ?? "");
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
  view: TimelineConfig["view"],
  ctx?: { settings?: VaultSettings; calendars?: readonly CalendarEngine[] }
): { from: number; to: number } {
  if (view?.from && view?.to) {
    const parsed = parseViewRange(calendar, view.from, view.to);
    if (parsed) return parsed;
  }
  const ranged = items.filter((item) => item.kind !== "era");
  const source = ranged.length > 0 ? ranged : items;
  const notes = ctx
    ? new Map(resolveDates(source, ctx.settings, ctx.calendars ?? [calendar]).map((note) => [note.id, note]))
    : null;
  let min = Infinity;
  let max = -Infinity;
  for (const item of source) {
    const extent = notes ? fitSpan(item, notes.get(item.id)) : extentOf(item);
    if (!extent) continue;
    if (Number.isFinite(extent.from)) min = Math.min(min, extent.from);
    if (Number.isFinite(extent.to)) max = Math.max(max, extent.to);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) return { from: 0, to: 365 };
  return { from: min, to: max };
}

export function cameraForDataset(dataset: TimelineDataset, viewportPx: number, padPx = 32): ViewState {
  const width = Math.max(viewportPx, 1);
  const filtered = itemsForView(dataset.items, dataset.config.filters, dataset.settings, dataset.calendars);
  const limits = scaleLimitsForCalendar(dataset.calendar, { viewportPx: width });
  const range = visibleRange(dataset.calendar, filtered, dataset.config.view, {
    settings: dataset.settings,
    calendars: dataset.calendars,
  });
  const scale = zoomToFit(
    createScale({ minPxPerDay: limits.minPxPerDay, maxPxPerDay: limits.maxPxPerDay }),
    range,
    width,
    padPx
  );
  return { originDays: scale.originDays, pxPerDay: scale.pxPerDay, laneScroll: 0 };
}

/** Lane, tag, and kind filters for order-only notes. Dated items use `itemsForView`. */
export function filterOrdered(items: readonly OrderedItem[], filters: FilterState | undefined): OrderedItem[] {
  if (!filters) return [...items];
  return items.filter((item) => {
    if (filters.kinds && filters.kinds.length > 0 && !filters.kinds.includes("event")) return false;
    if (filters.lanes && filters.lanes.length > 0) {
      const lane = (item.laneId ?? "").toLowerCase();
      if (!filters.lanes.some((id) => id.toLowerCase() === lane)) return false;
    }
    if (filters.tagsAny && filters.tagsAny.length > 0) {
      const tags = new Set(item.tags.map((tag) => tag.toLowerCase()));
      if (!filters.tagsAny.some((tag) => tags.has(tag.toLowerCase()))) return false;
    }
    if (filters.tagsNone && filters.tagsNone.length > 0) {
      const tags = new Set(item.tags.map((tag) => tag.toLowerCase()));
      if (filters.tagsNone.some((tag) => tags.has(tag.toLowerCase()))) return false;
    }
    if (filters.calendars && filters.calendars.length > 0 && item.calendarId) {
      const id = item.calendarId.toLowerCase();
      if (!filters.calendars.some((calendar) => calendar.toLowerCase() === id)) return false;
    }
    return true;
  });
}

export function itemsFromNotes(
  notes: readonly { path: string; markdown: string }[],
  calendars: readonly CalendarEngine[],
  defaultCalendarId: string
): TimelineItem[] {
  return notesFromMarkdown(notes, calendars, defaultCalendarId).items;
}

export function notesFromMarkdown(
  notes: readonly { path: string; markdown: string }[],
  calendars: readonly CalendarEngine[],
  defaultCalendarId: string
): { items: TimelineItem[]; ordered: OrderedItem[] } {
  const items: TimelineItem[] = [];
  const ordered: OrderedItem[] = [];
  for (const note of notes) {
    const result = parseTimelineNoteResult(note.markdown, {
      path: note.path,
      calendars,
      defaultCalendarId,
      title: titleFromPath(note.path),
    });
    if (!result) continue;
    if (result.kind === "ordered") ordered.push(result.item);
    else items.push(result.item);
  }
  return { items, ordered };
}

/** Sample dates used when a block matches no notes. Built through the core parser. */
export function stubDataset(calendars?: readonly CalendarEngine[]): TimelineDataset {
  const list = calendars && calendars.length > 0 ? [...calendars] : defaultCalendars();
  const config = parseTimelineConfig(STUB_CONFIG, "reckoning");
  const calendar = list.find((engine) => engine.def.id === config.displayCalendarId) ?? list[0];
  const engines = list.some((engine) => engine.def.id === calendar.def.id) ? list : [...list, calendar];
  const notes = notesFromMarkdown(STUB_NOTES, engines, calendar.def.id);
  return {
    items: notes.items,
    ordered: notes.ordered,
    calendars: engines,
    calendar,
    config,
    origin: "stub",
  };
}

/** Second sample block: a before-present axis. Note strings stay absolute years. */
export function yearsAgoDataset(): TimelineDataset {
  const calendar = createCalendar(YEARS_AGO);
  const config = parseTimelineConfig(YEARS_AGO_CONFIG, calendar.def.id);
  const notes = notesFromMarkdown(YEARS_AGO_NOTES, [calendar], calendar.def.id);
  return {
    items: notes.items,
    ordered: notes.ordered,
    calendars: [calendar],
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
  order: ["[[House Vey]]", "[[Climate]]", "[[Treaties]]", "[[Records]]"]
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
  {
    path: "samples/timeline/spans/Dry Interval.md",
    markdown: `---
type: span
calendar: reckoning
start: "3A 416"
end: "3A 424"
lane: "[[Climate]]"
tags: [climate]
certainty: uncertain
displayHint: "dates are approximate"
---
# Dry Interval
`,
  },
  {
    path: "samples/timeline/events/Open Marker.md",
    markdown: `---
type: event
calendar: reckoning
start: "3A 438"
lane: "[[Treaties]]"
tags: [note]
certainty: open
displayHint: "not confirmed"
---
# Open Marker
`,
  },
  {
    path: "samples/timeline/eras/Opening.md",
    markdown: `---
type: era
calendar: reckoning
start: "3A 432"
end: "3A 448"
---
# Opening
`,
  },
  {
    path: "samples/timeline/events/Step One.md",
    markdown: `---
type: event
calendar: reckoning
order: 1
era: "[[Opening]]"
lane: "[[Records]]"
---
# Step One
`,
  },
  {
    path: "samples/timeline/events/Step Two.md",
    markdown: `---
type: event
calendar: reckoning
order: 2
era: "[[Opening]]"
lane: "[[Records]]"
displayHint: "middle of the sequence"
---
# Step Two
`,
  },
  {
    path: "samples/timeline/events/Step Three.md",
    markdown: `---
type: event
calendar: reckoning
order: 3
era: "[[Opening]]"
lane: "[[Records]]"
---
# Step Three
`,
  },
  {
    path: "samples/timeline/events/Earlier Note.md",
    markdown: `---
type: event
order: 1
era: "[[Not Listed]]"
lane: "[[Records]]"
certainty: working
---
# Earlier Note
`,
  },
];

const YEARS_AGO_CONFIG = `
calendar: yearsago
source:
  folders: [samples/timeline/yearsago]
view:
  from: "600"
  to: "1700"
`;

const YEARS_AGO = {
  id: "yearsago",
  name: "Years Ago",
  epochOffset: 0,
  hasYearZero: true,
  weekdayOfEpoch: 0,
  intercalaryInWeek: false,
  time: { hoursPerDay: 24, minutesPerHour: 60 },
  months: Array.from({ length: 12 }, (_, index) => ({
    id: `m${index + 1}`,
    name: `Month ${index + 1}`,
    short: `M${index + 1}`,
    days: 30,
  })),
  weekdays: Array.from({ length: 7 }, (_, index) => ({
    id: `d${index + 1}`,
    name: `Day ${index + 1}`,
    short: `D${index + 1}`,
  })),
  leap: { kind: "cycle" as const, every: 4 },
  eras: [],
  formats: {
    year: "{y}",
    month: "{y}-{MM}",
    day: "{y}-{MM}-{dd}",
    hour: "{y}-{MM}-{dd} {HH}",
    minute: "{y}-{MM}-{dd} {HH}:{mm}",
    ago: "{ya}",
  },
  defaultFormat: "day",
  display: { mode: "before-present" as const, presentYear: 2000, suffix: "ya" },
};

const YEARS_AGO_NOTES: readonly { path: string; markdown: string }[] = [
  {
    path: "samples/timeline/yearsago/Early Marker.md",
    markdown: `---
type: event
calendar: yearsago
start: "800"
---
# Early Marker
`,
  },
  {
    path: "samples/timeline/yearsago/Middle Marker.md",
    markdown: `---
type: event
calendar: yearsago
start: "1200"
displayHint: "halfway"
---
# Middle Marker
`,
  },
  {
    path: "samples/timeline/yearsago/Late Span.md",
    markdown: `---
type: span
calendar: yearsago
start: "1400"
end: "1600"
certainty: working
---
# Late Span
`,
  },
];
