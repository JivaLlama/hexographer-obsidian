import { describe, expect, it } from "vitest";
import {
  applyPlanToNote,
  createCalendar,
  createScale,
  DEFAULT_LANE_ID,
  extentOf,
  filterItems,
  GREGORIAN,
  itemMatches,
  packLanes,
  parseTimelineConfig,
  parseTimelineNote,
  planMove,
  RECKONING,
  scaleLimitsForCalendar,
  serializeTimelineNote,
} from "../src/core";
import type { Lane, TimelineItem } from "../src/core";

const reckoning = createCalendar(RECKONING);
const gregorian = createCalendar(GREGORIAN);

const SIEGE = `---
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

The harbor chain held.
`;

describe("frontmatter", () => {
  it("parses an event and preserves the body on writeback", () => {
    const item = parseTimelineNote(SIEGE, {
      path: "notes/siege.md",
      calendars: [reckoning],
      defaultCalendarId: "reckoning",
    });
    expect(item).not.toBeNull();
    if (!item) return;
    expect(item.kind).toBe("event");
    expect(item.title).toBe("Siege of Port Haven");
    expect(item.startPrecision).toBe("year");
    expect(item.endPrecision).toBe("day");
    expect(item.laneId).toBe("[[House Vey]]");
    expect(item.tags).toEqual(["war", "siege"]);
    expect(item.links.places).toEqual(["[[Port Haven]]"]);
    expect(item.color).toBe("#c0392b");
    expect(item.parseError).toBeUndefined();
    const extent = extentOf(item);
    expect(extent.from).toBe(item.start);
    expect(extent.to).toBeGreaterThan(item.end ?? item.start);

    const next = serializeTimelineNote(SIEGE, { start: "3A 413", end: "3A 413 Frostmoot 9" });
    expect(next.endsWith("# Siege of Port Haven\n\nThe harbor chain held.\n")).toBe(true);
    const again = parseTimelineNote(next, {
      path: "notes/siege.md",
      calendars: [reckoning],
      defaultCalendarId: "reckoning",
    });
    expect(again?.startPrecision).toBe("year");
    expect(again?.endPrecision).toBe("day");
    expect(again?.source.startRaw).toBe("3A 413");
    expect(again?.links.people).toEqual(["[[Aldric Vey]]"]);
  });

  it("keeps a note with a bad date and drops unrelated notes", () => {
    const bad = parseTimelineNote("---\ntype: span\nstart: \"nope\"\n---\n# Broken\n", {
      path: "notes/bad.md",
      calendars: [reckoning],
      defaultCalendarId: "reckoning",
    });
    expect(bad?.parseError).toMatch(/start/);
    expect(bad?.kind).toBe("span");
    expect(parseTimelineNote("---\ntype: place\n---\n", {
      path: "notes/place.md",
      calendars: [reckoning],
      defaultCalendarId: "reckoning",
    })).toBeNull();
  });
});

describe("planMove", () => {
  it("moves a year/day pair by calendar years and keeps each precision", () => {
    const item = mustParse(SIEGE);
    const plan = planMove(item, 400, "move", { fine: false, calendar: reckoning });
    expect(plan.startRaw).toBe("3A 413");
    expect(plan.endRaw).toBe("3A 413 Frostmoot 9");
    expect(plan.command.patches[0]?.fields.map((field) => field.key)).toEqual(["start", "end"]);
    const written = applyPlanToNote(SIEGE, plan);
    const again = mustParse(written);
    expect(again.startPrecision).toBe("year");
    expect(again.endPrecision).toBe("day");
    expect(again.end! - again.start).toBe(item.end! - item.start);
    expect(reckoning.fromDays(again.end!, "day")).toMatchObject({ era: "3A", year: 413, month: 7, day: 9 });
  });

  it("preserves the original strings when the drag snaps back", () => {
    const markdown = SIEGE.replace('start: "3A 412"', 'start: "3A  412"');
    const item = mustParse(markdown);
    const plan = planMove(item, 0, "move", { fine: false, calendar: reckoning });
    expect(plan.startRaw).toBe("3A  412");
    expect(plan.endRaw).toBe("3A 412 Frostmoot 9");
    expect(plan.command.patches).toEqual([]);
  });

  it("upgrades precision on a fine drag and can open an end", () => {
    const point = mustParse("---\ntype: event\nstart: \"3A 412\"\n---\n# Point\n");
    const fine = planMove(point, 40, "move", { fine: true, calendar: reckoning });
    expect(fine.startRaw).toMatch(/^3A \d+ \w+/);
    const resized = planMove(point, 10, "resize-end", { fine: false, calendar: reckoning });
    expect(resized.end).not.toBeNull();
    expect(resized.endRaw).toBeTruthy();
    expect(resized.command.patches[0]?.fields.some((field) => field.key === "end")).toBe(true);
  });

  it("does not let a resize invert the span", () => {
    const item = mustParse(SIEGE);
    const plan = planMove(item, 10_000, "resize-start", { fine: false, calendar: reckoning });
    expect(plan.start).toBeLessThanOrEqual(plan.end ?? plan.start);
  });
});

describe("packLanes, scale, and filter", () => {
  const lanes: Lane[] = [
    { id: "[[House Vey]]", label: "House Vey", order: 0, collapsed: false },
    { id: "[[House Sol]]", label: "House Sol", order: 1, collapsed: false },
  ];

  it("packs in input order and keeps empty lanes", () => {
    const a = fake("a", 0, 10, "[[House Vey]]");
    const b = fake("b", 5, 12, "[[House Vey]]");
    const c = fake("c", 12, 14, "[[House Vey]]");
    const packed = packLanes([a, b, c], lanes);
    expect(packed.rows.get("a")).toBe(0);
    expect(packed.rows.get("b")).toBe(1);
    expect(packed.rows.get("c")).toBe(0);
    expect(packed.laneHeights.get("[[House Vey]]")).toBe(2);
    expect(packed.laneHeights.get("[[House Sol]]")).toBe(1);
    expect(packLanes([a, b, c], lanes).rows).toEqual(packed.rows);
    const reversed = packLanes([b, a, c], lanes);
    expect(reversed.rows.get("b")).toBe(0);
    expect(reversed.rows.get("a")).toBe(1);
  });

  it("sends unlaned items to the default lane and skips eras", () => {
    const item = fake("u", 0, 1, null);
    const era = fake("e", 0, 5, null);
    era.kind = "era";
    const packed = packLanes([item, era], []);
    expect(packed.rows.has("e")).toBe(false);
    expect(packed.rows.get("u")).toBe(0);
    expect(packed.laneHeights.get(DEFAULT_LANE_ID)).toBe(1);
  });

  it("zooms around a pixel and clamps to the calendar limits", () => {
    const limits = scaleLimitsForCalendar(gregorian);
    expect(limits.minPxPerDay).toBeGreaterThan(0);
    expect(limits.maxPxPerDay).toBeGreaterThan(limits.minPxPerDay);
    const scale = createScale({ originDays: 10_000, pxPerDay: 2, ...limits });
    expect(scale.toDays(scale.toPx(10_050))).toBeCloseTo(10_050, 6);
    const zoomed = scale.zoomAt(40, 3);
    expect(zoomed.toDays(40)).toBeCloseTo(scale.toDays(40), 6);
    expect(zoomed.pxPerDay).toBeCloseTo(6, 6);
    const huge = createScale({ originDays: 0, pxPerDay: 1e12, ...limits }).clamp();
    expect(huge.pxPerDay).toBe(limits.maxPxPerDay);
  });

  it("filters by tag, kind, lane, text, and range, and keeps eras", () => {
    const war = fake("war", 0, 5, "[[House Vey]]");
    war.tags = ["war"];
    war.title = "Siege";
    const peace = fake("peace", 10, 12, "[[House Sol]]");
    peace.kind = "span";
    peace.tags = ["peace"];
    const era = fake("age", 0, 100, null);
    era.kind = "era";
    const items = [war, peace, era];
    expect(filterItems(items, { tagsAny: ["#War"] }).map((item) => item.id)).toEqual(["war"]);
    expect(filterItems(items, { tagsNone: ["war"] }).map((item) => item.id)).toEqual(["peace", "age"]);
    expect(filterItems(items, { kinds: ["span"] }).map((item) => item.id)).toEqual(["peace"]);
    expect(filterItems(items, { lanes: ["[[House Sol]]"] }).map((item) => item.id)).toEqual(["peace", "age"]);
    expect(itemMatches(war, { text: "sieg" })).toBe(true);
    expect(filterItems(items, { range: { from: 9, to: 11 } }).map((item) => item.id)).toEqual(["peace", "age"]);
    expect(itemMatches(war, {})).toBe(true);
  });
});

describe("timeline config", () => {
  it("parses a worldtimeline block", () => {
    const config = parseTimelineConfig(
      `
source:
  folders: [notes/history]
  tags: [timeline]
calendar: reckoning
lanes:
  order: ["[[House Vey]]"]
  groupBy: lane
filters:
  tagsAny: [war]
  kinds: [event, span]
view:
  from: "3A 400"
  to: "3A 450"
`,
      "gregorian"
    );
    expect(config.calendarId).toBe("reckoning");
    expect(config.source.folders).toEqual(["notes/history"]);
    expect(config.lanes?.order).toEqual(["[[House Vey]]"]);
    expect(config.filters?.kinds).toEqual(["event", "span"]);
    expect(config.view?.from).toBe("3A 400");
  });
});

function mustParse(markdown: string): TimelineItem {
  const item = parseTimelineNote(markdown, {
    path: "notes/siege.md",
    calendars: [reckoning, gregorian],
    defaultCalendarId: "reckoning",
  });
  if (!item) throw new Error("expected a timeline note");
  return item;
}

function fake(id: string, from: number, to: number, laneId: string | null): TimelineItem {
  return {
    id,
    kind: "event",
    title: id,
    start: from,
    end: to,
    extentTo: to,
    startPrecision: "day",
    endPrecision: "day",
    laneId,
    tags: [],
    links: { places: [], people: [], other: [] },
    source: { path: id, startRaw: String(from), endRaw: String(to), calendarId: "gregorian" },
  };
}
