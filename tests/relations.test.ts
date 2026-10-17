import { describe, expect, it } from "vitest";
import {
  applyCommandToNote,
  applyPlanToNote,
  createCalendar,
  createUndoStack,
  formatGap,
  GREGORIAN,
  HARBOR,
  parseGap,
  parseTimelineNote,
  planMove,
  planRelativeMove,
  resolveDates,
} from "../src/core";
import type { TimelineItem } from "../src/core";

const harbor = createCalendar(HARBOR);
const gregorian = createCalendar(GREGORIAN);
const calendars = [harbor, gregorian];
const settings = { units: { gen: "40-60y" } };

function markdown(title: string, yaml: string, calendar = "harbor"): string {
  return `---\ntype: event\ncalendar: ${calendar}\n${yaml}\n---\n# ${title}\n`;
}

function load(path: string, title: string, yaml: string, calendar = "harbor"): { md: string; item: TimelineItem } {
  const md = markdown(title, yaml, calendar);
  const item = parseTimelineNote(md, { path, calendars, defaultCalendarId: "harbor", title });
  if (!item) throw new Error(`did not parse ${path}`);
  return { md, item };
}

function yearsBetween(days: number): number {
  return days / harbor.daysInYear(1000);
}

describe("gap grammar", () => {
  it("parses a sum, a spaced minus, and a leading negative term", () => {
    expect(parseGap("2 gen + 10y")).toEqual([
      { count: 2, unit: "gen" },
      { count: 10, unit: "y" },
    ]);
    expect(parseGap("2 gen - 10y")).toEqual([
      { count: 2, unit: "gen" },
      { count: -10, unit: "y" },
    ]);
    expect(parseGap("2 gen + -10y")).toEqual([
      { count: 2, unit: "gen" },
      { count: -10, unit: "y" },
    ]);
    expect(formatGap([{ count: 1, unit: "gen" }, { count: -10, unit: "y" }])).toBe("1 gen - 10y");
    expect(formatGap([{ count: 3, unit: "gen" }, { count: 20, unit: "y" }])).toBe("3 gen + 20y");
  });
});

describe("resolveDates", () => {
  it("compounds a 3-deep chain to widths 0/20/40/60y", () => {
    const notes = [
      load("A.md", "A", 'start: "1000"'),
      load("B.md", "B", 'after: "[[A]]"\ngap: "1 gen"'),
      load("C.md", "C", 'after: "[[B]]"\ngap: "1 gen"'),
      load("D.md", "D", 'after: "[[C]]"\ngap: "1 gen"'),
    ].map((entry) => entry.item);
    expect(notes[1].parseError).toBeUndefined();
    expect(notes[1].start).toBe(0);
    expect(notes[1].source.startRaw).toBe("");

    const resolved = resolveDates(notes, settings, calendars);
    const [a, b, c, d] = resolved.map((note) => note.bounds?.start);
    expect(a && b && c && d).toBeTruthy();
    const origin = a!.likely;
    expect(yearsBetween(a!.max - a!.min)).toBe(0);
    expect(yearsBetween(b!.min - origin)).toBe(40);
    expect(yearsBetween(b!.likely - origin)).toBe(50);
    expect(yearsBetween(b!.max - origin)).toBe(60);
    expect(yearsBetween(b!.max - b!.min)).toBe(20);
    expect(yearsBetween(c!.min - origin)).toBe(80);
    expect(yearsBetween(c!.likely - origin)).toBe(100);
    expect(yearsBetween(c!.max - origin)).toBe(120);
    expect(yearsBetween(c!.max - c!.min)).toBe(40);
    expect(yearsBetween(d!.min - origin)).toBe(120);
    expect(yearsBetween(d!.likely - origin)).toBe(150);
    expect(yearsBetween(d!.max - origin)).toBe(180);
    expect(yearsBetween(d!.max - d!.min)).toBe(60);
    for (const note of resolved) {
      expect(note.error).toBeUndefined();
      expect(note.warnings).toBeUndefined();
    }
  });

  it("mirrors before by swapping the gap ends", () => {
    const notes = [
      load("A.md", "A", 'start: "1000"').item,
      load("E.md", "E", 'before: "[[A]]"\ngap: "1 gen"').item,
    ];
    const [a, e] = resolveDates(notes, settings, calendars);
    const origin = a.bounds!.start.likely;
    expect(yearsBetween(origin - e.bounds!.start.max)).toBe(40);
    expect(yearsBetween(origin - e.bounds!.start.likely)).toBe(50);
    expect(yearsBetween(origin - e.bounds!.start.min)).toBe(60);
  });

  it("names a cycle and does not give those notes bounds", () => {
    const notes = [
      load("A.md", "A", 'after: "[[B]]"\ngap: "1 gen"').item,
      load("B.md", "B", 'after: "[[A]]"\ngap: "1 gen"').item,
    ];
    const [a, b] = resolveDates(notes, settings, calendars);
    expect(a.error).toBe("cycle: [[A]] → [[B]] → [[A]]");
    expect(b.error).toBe("cycle: [[A]] → [[B]] → [[A]]");
    expect(a.bounds).toBeUndefined();
    expect(b.bounds).toBeUndefined();
  });

  it("warns on an unresolved anchor and on a note that depends on it", () => {
    const notes = [
      load("B.md", "B", 'after: "[[Missing]]"\ngap: "1 gen"').item,
      load("C.md", "C", 'after: "[[B]]"\ngap: "1 gen"').item,
    ];
    const [b, c] = resolveDates(notes, settings, calendars);
    expect(b.error).toBeUndefined();
    expect(b.bounds).toBeUndefined();
    expect(b.warnings).toEqual(["unresolved anchor [[Missing]]"]);
    expect(c.bounds).toBeUndefined();
    expect(c.error).toBeUndefined();
    expect(c.warnings).toEqual(["unresolved anchor [[B]]"]);
  });

  it("intersects relations and warns when the intersection is empty", () => {
    const meet = resolveDates(
      [
        load("A.md", "A", 'start: "1000"').item,
        load("C.md", "C", 'start: "1100"').item,
        load(
          "B.md",
          "B",
          'relations:\n  - after: "[[A]]"\n    gap: "1 gen"\n  - before: "[[C]]"\n    gap: "1 gen"'
        ).item,
      ],
      settings,
      calendars
    );
    const b = meet[2].bounds!.start;
    const origin = meet[0].bounds!.start.likely;
    expect(yearsBetween(b.min - origin)).toBe(40);
    expect(yearsBetween(b.max - origin)).toBe(60);
    expect(meet[2].warnings).toBeUndefined();

    const miss = resolveDates(
      [
        load("A.md", "A", 'start: "1000"').item,
        load("C.md", "C", 'start: "1100"').item,
        load(
          "B.md",
          "B",
          'relations:\n  - after: "[[A]]"\n    gap: "1 gen"\n  - before: "[[C]]"'
        ).item,
      ],
      settings,
      calendars
    );
    const loose = miss[2];
    expect(loose.warnings).toEqual(["relation does not meet the written date"]);
    expect(yearsBetween(loose.bounds!.start.min - origin)).toBe(40);
    expect(yearsBetween(loose.bounds!.start.max - origin)).toBe(60);

    const pinned = resolveDates(
      [
        load("A.md", "A", 'start: "1000"').item,
        load("B.md", "B", 'start: "1100"\nafter: "[[A]]"\ngap: "1 gen"').item,
      ],
      settings,
      calendars
    );
    expect(pinned[1].warnings).toEqual(["relation does not meet the written date"]);
    expect(pinned[1].bounds!.start.min).toBe(pinned[1].bounds!.start.max);
    expect(yearsBetween(pinned[1].bounds!.start.likely - origin)).toBe(100);
  });

  it("keeps an exact date inside a wide relation and preserves a ~ span's width", () => {
    const notes = [
      load("A.md", "A", 'start: "1000"').item,
      load("S.md", "S", 'start: "1045"\nend: "1055"\nafter: "[[A]]"\ngap: "1 gen"').item,
    ];
    const [a, s] = resolveDates(notes, settings, calendars);
    const origin = a.bounds!.start.likely;
    expect(yearsBetween(s.bounds!.start.likely - origin)).toBe(45);
    expect(s.bounds!.start.min).toBe(s.bounds!.start.max);
    expect(yearsBetween(s.bounds!.end!.likely - origin)).toBe(55);
    expect(s.bounds!.end!.max - s.bounds!.end!.min).toBe(0);

    const fuzzy = resolveDates(
      [load("F.md", "F", 'start: "~1100"\nend: "1110"').item],
      settings,
      calendars
    )[0].bounds!;
    expect(fuzzy.end!.max - fuzzy.end!.min).toBe(fuzzy.start.max - fuzzy.start.min);
    expect(fuzzy.start.max).toBeGreaterThan(fuzzy.start.min);
    const writtenEnd = harbor.parse("1110");
    expect(writtenEnd.ok).toBe(true);
    if (writtenEnd.ok) expect(fuzzy.end!.likely).toBeCloseTo(writtenEnd.days, 6);
    expect(fuzzy.end!.min).not.toBe(fuzzy.end!.likely);
  });

  it("leaves a pure relative end as a zero-width instant", () => {
    const notes = [
      load("A.md", "A", 'start: "1000"').item,
      load("B.md", "B", 'after: "[[A]]"\ngap: "1 gen"\nend: "1110"').item,
    ];
    const resolved = resolveDates(notes, settings, calendars)[1].bounds!;
    expect(yearsBetween(resolved.start.max - resolved.start.min)).toBe(20);
    expect(resolved.end!.min).toBe(resolved.end!.max);
    const writtenEnd = harbor.parse("1110");
    if (writtenEnd.ok) expect(resolved.end!.likely).toBe(writtenEnd.days);
  });

  it("resolves an approximate end on its own, and an end relation on its own", () => {
    const approx = resolveDates(
      [load("F.md", "F", 'start: "1100"\nend: "~1110"').item],
      settings,
      calendars
    )[0].bounds!;
    expect(approx.start.max - approx.start.min).toBe(0);
    expect(approx.end!.max).toBeGreaterThan(approx.end!.min);

    const edged = resolveDates(
      [
        load("A.md", "A", 'start: "1000"').item,
        load(
          "S.md",
          "S",
          'start: "1000"\nrelations:\n  - after: "[[A]]"\n    gap: "1 gen"\n    edge: end'
        ).item,
      ],
      settings,
      calendars
    )[1].bounds!;
    expect(edged.start.max - edged.start.min).toBe(0);
    expect(yearsBetween(edged.end!.max - edged.end!.min)).toBe(20);
  });

  it("converts gap years through the dependent calendar", () => {
    const harborAnchor = load("A.md", "A", 'start: "1000"', "harbor").item;
    const gregorianNote = load("G.md", "G", 'after: "[[A]]"\ngap: "1y"', "gregorian").item;
    const mixed = resolveDates([harborAnchor, gregorianNote], settings, calendars);
    const anchor = mixed[0].bounds!.start.likely;
    const shifted = mixed[1].bounds!.start.min - anchor;
    const gregorianYear = gregorian.daysInYear(gregorian.toAbsoluteYear(gregorian.fromDays(anchor, "year")));
    expect(shifted).toBe(gregorianYear);
    expect(gregorianYear).not.toBe(harbor.daysInYear(1000));

    const gregorianAnchor = load("H.md", "H", 'start: "2000 CE"', "gregorian").item;
    const harborNote = load("P.md", "P", 'after: "[[H]]"\ngap: "1y"', "harbor").item;
    const back = resolveDates([gregorianAnchor, harborNote], settings, calendars);
    expect(back[1].bounds!.start.min - back[0].bounds!.start.likely).toBe(harbor.daysInYear(1000));
  });

  it("treats ~4115 as a year-wide bounds interval", () => {
    const item = load("T.md", "T", 'start: "~4115"').item;
    expect(item.startApproximate).toBe(true);
    expect(item.source.startRaw).toBe("~4115");
    const bounds = resolveDates([item], settings, calendars)[0].bounds!.start;
    expect(bounds.min).toBe(item.start);
    expect(bounds.max).toBeGreaterThan(bounds.min);
    const nextYear = harbor.parse("4116");
    expect(nextYear.ok).toBe(true);
    if (nextYear.ok) expect(bounds.max).toBeLessThan(nextYear.days);
    expect(bounds.likely).toBeCloseTo((bounds.min + bounds.max) / 2, 8);
  });

  it("reports an unknown unit as an error", () => {
    const item = load("B.md", "B", 'after: "[[A]]"\ngap: "1 age"').item;
    const anchor = load("A.md", "A", 'start: "1000"').item;
    const resolved = resolveDates([anchor, item], settings, calendars)[1];
    expect(resolved.bounds).toBeUndefined();
    expect(resolved.error).toBe('unknown unit "age"');
  });
});

describe("planRelativeMove", () => {
  function relative(gap: string, kind = "after"): { md: string; item: TimelineItem } {
    return load("B.md", "B", `${kind}: "[[A]]"\ngap: "${gap}"`);
  }

  it("snaps at the unit midpoint and keeps a whole-year remainder", () => {
    const year = harbor.daysInYear(1000);
    const ctx = { calendar: harbor, units: settings.units, anchorDays: 0 };
    expect(planRelativeMove(relative("2 gen").item, 60 * year, ctx).gap).toBe("3 gen + 10y");
    expect(planRelativeMove(relative("2 gen").item, 30 * year, ctx).gap).toBe("2 gen + 30y");
    expect(planRelativeMove(relative("2 gen").item, -60 * year, ctx).gap).toBe("1 gen - 10y");
    expect(planRelativeMove(relative("2 gen + 10y").item, 60 * year, ctx).gap).toBe("3 gen + 20y");
    expect(planRelativeMove(relative("2 gen").item, year / 2, ctx).gap).toBe("2 gen + 1y");
    const tie = planRelativeMove(relative("2 gen").item, -year / 2, ctx);
    expect(tie.gap).toBe("2 gen");
    expect(tie.command.patches).toEqual([]);
  });

  it("shortens a before-gap when the note moves later", () => {
    const year = harbor.daysInYear(1000);
    const item = relative("2 gen", "before").item;
    expect(planRelativeMove(item, 60 * year, { calendar: harbor, units: settings.units, anchorDays: 0 }).gap).toBe(
      "1 gen - 10y"
    );
  });

  it("round-trips a sugar gap and undoes the command", async () => {
    const year = harbor.daysInYear(1000);
    const { md, item } = relative("2 gen");
    const anchor = load("A.md", "A", 'start: "1000"');
    const move = planRelativeMove(item, 60 * year, { calendar: harbor, units: settings.units, anchorDays: 0 });
    expect(move.command.patches[0].fields[0]).toMatchObject({ key: "gap", before: "2 gen", after: "3 gen + 10y" });
    const written = applyCommandToNote(md, move.command);
    const again = parseTimelineNote(written, { path: "B.md", calendars, defaultCalendarId: "harbor", title: "B" });
    expect(again?.relations?.[0].gap).toBe("3 gen + 10y");
    expect(again?.source.gapRaw).toBe("3 gen + 10y");

    const store = new Map<string, unknown>([["gap", move.command.patches[0].fields[0].after]]);
    const stack = createUndoStack({
      readField: (_path, key) => store.get(key),
      applyField: (_path, key, value) => {
        store.set(key, value);
      },
    });
    stack.push(move.command);
    await stack.undo();
    expect(store.get("gap")).toBe("2 gen");
    const restored = applyCommandToNote(written, {
      label: "undo",
      patches: [{ path: "B.md", fields: [{ key: "gap", before: "3 gen + 10y", after: "2 gen" }] }],
    });
    expect(restored).toContain("2 gen");
    expect(anchor.item.source.startRaw).toBe("1000");
  });

  it("patches the relations list and leaves the anchor's command empty of dependents", () => {
    const year = harbor.daysInYear(1000);
    const anchor = load("A.md", "A", 'start: "1000"');
    const dependent = load("B.md", "B", 'relations:\n  - after: "[[A]]"\n    gap: "2 gen"');
    const move = planRelativeMove(dependent.item, 60 * year, {
      calendar: harbor,
      units: settings.units,
      anchorDays: anchor.item.start,
    });
    expect(move.command.patches[0].fields[0].key).toBe("relations");
    const written = applyCommandToNote(dependent.md, move.command);
    const again = parseTimelineNote(written, {
      path: "B.md",
      calendars,
      defaultCalendarId: "harbor",
      title: "B",
    });
    expect(again?.relations?.[0].gap).toBe("3 gen + 10y");
    expect(written).not.toContain("\ngap:");

    const anchorPlan = planMove(anchor.item, year, "move", { fine: false, calendar: harbor });
    expect(anchorPlan.command.patches.every((patch) => patch.path === "A.md")).toBe(true);
    const movedAnchor = parseTimelineNote(applyPlanToNote(anchor.md, anchorPlan), {
      path: "A.md",
      calendars,
      defaultCalendarId: "harbor",
      title: "A",
    });
    expect(movedAnchor).toBeTruthy();
    const before = resolveDates([anchor.item, dependent.item], settings, calendars);
    const after = resolveDates([movedAnchor!, dependent.item], settings, calendars);
    expect(dependent.item.relations?.[0].gap).toBe("2 gen");
    expect(after[1].bounds!.start.likely - before[1].bounds!.start.likely).toBe(
      after[0].bounds!.start.likely - before[0].bounds!.start.likely
    );
    expect(after[1].bounds!.start.max - after[1].bounds!.start.min).toBe(
      before[1].bounds!.start.max - before[1].bounds!.start.min
    );
  });

  it("keeps the tilde when an approximate date is dragged", () => {
    const { item } = load("T.md", "T", 'start: "~4115"');
    const plan = planMove(item, harbor.daysInYear(4115), "move", { fine: false, calendar: harbor });
    expect(plan.startRaw.startsWith("~")).toBe(true);
    expect(plan.startRaw).not.toBe("~4115");
  });
});
