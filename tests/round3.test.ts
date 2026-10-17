import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  applyPlanToNote,
  BEFORE_RECKONING,
  calendarForItem,
  CERTAINTIES,
  commitPan,
  createCalendar,
  createScale,
  eraAnchors,
  formatYearsAgo,
  GREGORIAN,
  groupOrderedItems,
  HARBOR,
  packLanes,
  parseTimelineNote,
  parseTimelineNoteResult,
  planMove,
  RECKONING,
  resolveDefaultCalendar,
  scanVault,
  WT_DATA,
  WT_VAR,
  zoomToFit,
} from "../src/core";
import type { TimelineItem } from "../src/core";

const reckoning = createCalendar(RECKONING);
const gregorian = createCalendar(GREGORIAN);
const harbor = createCalendar(HARBOR);
const ago = createCalendar({
  ...GREGORIAN,
  id: "ago",
  display: { mode: "before-present", presentYear: 2000, suffix: "ya" },
});

describe("certainty and displayHint", () => {
  it("accepts a trimmed certainty and warns on an unknown value", () => {
    const item = parseTimelineNote(note({ certainty: "  Working " }), options());
    expect(item?.certainty).toBe("working");
    expect(item?.warnings).toBeUndefined();
    expect(item?.parseError).toBeUndefined();

    const bad = parseTimelineNote(note({ certainty: "maybe" }), options());
    expect(bad?.certainty).toBeUndefined();
    expect(bad?.parseError).toBeUndefined();
    expect(bad?.warnings).toEqual(['unknown certainty "maybe"']);
    expect(CERTAINTIES).toEqual(["locked", "working", "uncertain", "open"]);
    expect(WT_DATA.certainty).toBe("data-certainty");
    expect(WT_VAR.certaintyLocked).toBe("--wt-certainty-locked");
    expect(WT_VAR.certaintyWorking).toBe("--wt-certainty-working");
    expect(WT_VAR.certaintyUncertain).toBe("--wt-certainty-uncertain");
    expect(WT_VAR.certaintyOpen).toBe("--wt-certainty-open");
  });

  it("keeps displayHint through a drag writeback", () => {
    const markdown = note({ displayHint: "around the siege", certainty: "locked" });
    const item = parseTimelineNote(markdown, options());
    expect(item?.displayHint).toBe("around the siege");
    if (!item) throw new Error("expected a note");
    const plan = planMove(item, 400, "move", { fine: false, calendar: calendarForItem(item, [reckoning]) });
    expect(plan.command.patches[0]?.fields.every((field) => field.key === "start" || field.key === "end")).toBe(true);
    const written = applyPlanToNote(markdown, plan);
    expect(written).toContain("around the siege");
    expect(written).toContain("certainty: locked");
    const again = parseTimelineNote(written, options());
    expect(again?.displayHint).toBe("around the siege");
    expect(again?.certainty).toBe("locked");
    expect(again?.source.startRaw).toBe(plan.startRaw);
  });
});

describe("ordered items", () => {
  const era = mustDated(`---
type: era
calendar: reckoning
start: "3A 1"
end: "3A 500"
---
# Third Age
`);

  it("stays out of TimelineItem and groups by era with a stable tiebreak", () => {
    const first = mustOrdered(orderNote(2, "[[Third Age]]", "Second"));
    const tiedB = mustOrdered(orderNote(1, "[[eras/Third Age]]", "Bee"));
    const tiedA = mustOrdered(orderNote(1, "3A", "Aye"));
    const lost = mustOrdered(orderNote(0, "[[No Such Age]]", "Lost"));
    expect(parseTimelineNote(orderNote(2, "[[Third Age]]", "Second"), options())).toBeNull();

    const groups = groupOrderedItems(
      [first, tiedB, tiedA, lost],
      eraAnchors([era], [reckoning])
    );
    expect(groups.map((group) => group.eraKey)).toEqual([BEFORE_RECKONING, era.id]);
    expect(groups[0]?.unresolved).toBe(true);
    expect(groups[0]?.label).toBe("before reckoning");
    expect(groups[0]?.items.map((item) => item.title)).toEqual(["Lost"]);
    expect(groups[1]?.items.map((item) => item.title)).toEqual(["Aye", "Bee", "Second"]);
    expect(groups[1]?.items[0]?.eraRef).toBe("3A");
  });
});

describe("years-ago display", () => {
  it("labels axis years as years ago and refuses them as input", () => {
    const date = ago.fromDays(ago.toDays({ era: "CE", year: 500, month: 0, day: 1, precision: "year" }), "year");
    expect(formatYearsAgo(ago.def, ago.toAbsoluteYear(date))).toBe("1500 ya");
    expect(ago.format(date, "{ya}")).toBe("1500 ya");
    expect(ago.parse("1500 ya").ok).toBe(false);
    expect(ago.parse("~1500ya").ok).toBe(false);
    expect(ago.parse("500 CE").ok).toBe(true);

    const start = ago.toDays({ era: "CE", year: 500, month: 0, day: 1, precision: "day" });
    const ticks = ago.ticks({ from: start, to: start + 800 }, 1, 40);
    expect(ticks.major.some((tick) => tick.label === "1500 ya")).toBe(true);

    const markdown = `---
type: event
calendar: ago
start: "500 CE"
---
# Distant
`;
    const item = parseTimelineNote(markdown, {
      path: "notes/distant.md",
      calendars: [ago],
      defaultCalendarId: "ago",
    });
    if (!item) throw new Error("expected a note");
    const plan = planMove(item, 400, "move", { fine: false, calendar: ago });
    expect(plan.startRaw).not.toMatch(/ya/i);
    expect(plan.startRaw).toMatch(/CE/);
  });
});

describe("scale and lanes", () => {
  it("commits a pan by rebasing the origin", () => {
    const scale = createScale({ originDays: 100, pxPerDay: 2, minPxPerDay: 0.01, maxPxPerDay: 10 });
    const panned = scale.commitPan(10);
    expect(panned.originDays).toBe(95);
    expect(panned.pxPerDay).toBe(2);
    expect(commitPan(scale, 0)).toBe(scale);
  });

  it("zooms to fit an extent inside the viewport", () => {
    const scale = createScale({ originDays: 0, pxPerDay: 1, minPxPerDay: 0.01, maxPxPerDay: 10 });
    const fitted = zoomToFit(scale, { from: 0, to: 100 }, 200, 0);
    expect(fitted.pxPerDay).toBeCloseTo(2, 6);
    expect(fitted.originDays).toBeCloseTo(0, 6);
    expect(fitted.toPx(100)).toBeCloseTo(200, 6);
    const padded = scale.zoomToFit({ from: 0, to: 100 }, 200, 20);
    expect(padded.toPx(0)).toBeGreaterThan(0);
    expect(padded.toPx(100)).toBeLessThan(200);
  });

  it("reserves label space only when a callback is passed", () => {
    const a = point("a", 0);
    const b = point("b", 5);
    const plain = packLanes([a, b], []);
    expect(plain.rows.get("a")).toBe(0);
    expect(plain.rows.get("b")).toBe(0);
    const reserved = packLanes([a, b], [], {
      labelExtent: (item) => (item.id === "a" ? { from: 0, to: 10 } : null),
    });
    expect(reserved.rows.get("a")).toBe(0);
    expect(reserved.rows.get("b")).toBe(1);
  });
});

describe("vault scan", () => {
  it("resolves the vault default and separates ordered notes from eras", () => {
    expect(resolveDefaultCalendar({ defaultCalendarId: "harbor" }, ["gregorian", "harbor"]).calendarId).toBe("harbor");
    expect(resolveDefaultCalendar({ defaultCalendarId: "nope" }, ["gregorian"]).warning).toMatch(/nope/);
    expect(resolveDefaultCalendar(undefined, ["gregorian", "harbor"]).calendarId).toBe("gregorian");

    const harborFile = readFileSync(path.join("samples", "calendars", "harbor.calendar.md"), "utf8");
    const scan = scanVault(
      [
        { path: "calendars/harbor.calendar.md", content: harborFile },
        { path: "calendars/again.calendar.md", content: harborFile },
        {
          path: "notes/tide.md",
          content: `---
type: event
start: "0 Tidewake 1"
culture: "[[Tideborn]]"
---
# Tide
`,
        },
        {
          path: "notes/order.md",
          content: `---
type: event
order: 1
era: "[[Third Age]]"
---
# Before dates
`,
        },
        {
          path: "notes/age.md",
          content: `---
type: era
calendar: gregorian
start: "1 CE"
end: "20 CE"
---
# Third Age
`,
        },
      ],
      { defaultCalendarId: "harbor" }
    );
    expect(scan.calendars.map((engine) => engine.def.id)).toEqual(["gregorian", "harbor"]);
    expect(scan.warnings.some((warning) => warning.message.includes("duplicate"))).toBe(true);
    expect(scan.items.map((item) => item.id).sort()).toEqual(["notes/age.md", "notes/tide.md"]);
    expect(scan.eras.map((item) => item.id)).toEqual(["notes/age.md"]);
    expect(scan.ordered.map((item) => item.id)).toEqual(["notes/order.md"]);
    expect(scan.items.find((item) => item.id === "notes/tide.md")?.calendarId).toBe("harbor");
    expect(scan.items.find((item) => item.id === "notes/age.md")?.parseError).toBeUndefined();
  });
});

function note(extra: { certainty?: string; displayHint?: string }): string {
  const lines = ["---", "type: event", "calendar: reckoning", 'start: "3A 412"'];
  if (extra.certainty) lines.push(`certainty: "${extra.certainty}"`);
  if (extra.displayHint) lines.push(`displayHint: "${extra.displayHint}"`);
  lines.push("---", "# Siege", "");
  return lines.join("\n");
}

function orderNote(order: number, era: string, title: string): string {
  return `---
type: event
order: ${order}
era: "${era}"
---
# ${title}
`;
}

function options() {
  return { path: "notes/siege.md", calendars: [reckoning, gregorian, harbor], defaultCalendarId: "reckoning" };
}

function mustDated(markdown: string): TimelineItem {
  const result = parseTimelineNoteResult(markdown, { ...options(), path: "eras/Third Age.md" });
  if (!result || result.kind !== "dated") throw new Error("expected a dated note");
  return result.item;
}

function mustOrdered(markdown: string) {
  const result = parseTimelineNoteResult(markdown, options());
  if (!result || result.kind !== "ordered") throw new Error("expected an ordered note");
  return result.item;
}

function point(id: string, day: number): TimelineItem {
  return {
    id,
    kind: "event",
    title: id,
    start: day,
    end: null,
    extentTo: day + 1,
    startPrecision: "day",
    endPrecision: null,
    laneId: null,
    tags: [],
    calendarId: "gregorian",
    links: { places: [], people: [], other: [] },
    source: { path: id, startRaw: String(day), calendarId: "gregorian" },
  };
}
