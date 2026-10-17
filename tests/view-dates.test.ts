import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { createScale, resolveDates } from "../src/core";
import { anchorDaysFor, dependentsAfterAnchorMove, gapDragText } from "../src/views/timeline/scene/drag";
import { buildLanes, notesFromMarkdown } from "../src/views/timeline/scene/dataset";
import { layoutScene } from "../src/views/timeline/scene/layout";
import { RELATION_SETTINGS, relationDataset } from "../src/views/timeline/scene/relations";
import { parseUnitsText } from "../src/views/timeline/scene/units";

function chainNotes(): { path: string; markdown: string }[] {
  const root = path.join("samples", "relations", "events");
  return ["Marker A.md", "Marker B.md", "Marker C.md", "Marker D.md"].map((name) => ({
    path: path.join(root, name),
    markdown: fs.readFileSync(path.join(root, name), "utf8"),
  }));
}

describe("resolved bounds", () => {
  it("places a relative note on resolveDates bounds instead of item.start", () => {
    const dataset = relationDataset("master");
    const relative = dataset.items.find((item) => item.title === "Marker B");
    expect(relative).toBeDefined();
    if (!relative) return;
    expect(relative.source.startRaw.trim()).toBe("");
    expect(relative.start).toBe(0);

    const notes = resolveDates(dataset.items, dataset.settings, dataset.calendars);
    const bounds = notes.find((note) => note.id === relative.id)?.bounds;
    expect(bounds).toBeDefined();
    if (!bounds) return;
    expect(bounds.start.likely).not.toBe(0);
    expect(bounds.start.min).toBeLessThan(bounds.start.max);

    const anchor = dataset.items.find((item) => item.title === "Marker A");
    const scale = createScale({
      originDays: (anchor?.start ?? bounds.start.likely) - 4000,
      pxPerDay: 0.15,
      minPxPerDay: 1e-8,
      maxPxPerDay: 50_000,
    });
    const model = layoutScene({
      items: dataset.items,
      lanes: buildLanes(dataset.items, dataset.config.lanes?.order),
      calendar: dataset.calendar,
      calendars: dataset.calendars,
      settings: dataset.settings,
      accounts: true,
      scale,
      viewportWidth: 24000,
      itemHeight: 22,
      overscanPx: 2000,
      minLabelPx: 48,
      selection: [],
    });
    const box = model.items.find((item) => item.id === relative.id);
    expect(box).toBeDefined();
    expect(box?.x).toBeCloseTo(scale.toPx(bounds.start.likely), 4);
    expect(Math.abs((box?.x ?? 0) - scale.toPx(relative.start))).toBeGreaterThan(20);
    expect(box?.tooltip).toContain("after [[Marker A]], +1 gen");
    expect(box?.tooltip).toContain("–");
    expect((box?.featherLead?.width ?? 0) + (box?.featherTrail?.width ?? 0)).toBeGreaterThan(0);

    const widths = ["Marker A", "Marker B", "Marker C", "Marker D"].map((title) => {
      const item = model.items.find((entry) => entry.title === title && !entry.ghost);
      return (item?.featherLead?.width ?? 0) + (item?.featherTrail?.width ?? 0);
    });
    expect(widths[0]).toBe(0);
    expect(widths[1]).toBeGreaterThan(0);
    expect(widths[2]).toBeGreaterThan(widths[1] ?? 0);
    expect(widths[3]).toBeGreaterThan(widths[2] ?? 0);

    const cycle = model.items.find((item) => item.title === "Cycle Left" || item.title === "Cycle Right");
    expect(cycle).toBeUndefined();
    expect(model.errors.some((chip) => chip.message.includes("cycle") && chip.message.includes("Cycle Left"))).toBe(true);
    expect(model.errors.some((chip) => chip.message.includes("Cycle Right"))).toBe(true);
  });
});

describe("relative drag", () => {
  it("shows the snapped gap string while the note is dragged", () => {
    const dataset = relationDataset("master");
    const notes = chainNotes();
    const parsed = notesFromMarkdown(notes, dataset.calendars, dataset.calendar.def.id);
    const markerB = parsed.items.find((item) => item.title === "Marker B");
    const markerA = parsed.items.find((item) => item.title === "Marker A");
    expect(markerB && markerA).toBeTruthy();
    if (!markerB || !markerA) return;
    const resolved = resolveDates(parsed.items, RELATION_SETTINGS, dataset.calendars);
    const anchorDays = anchorDaysFor(markerB, parsed.items, resolved);
    const year = dataset.calendar.daysInYear(dataset.calendar.toAbsoluteYear(dataset.calendar.fromDays(anchorDays, "year")));
    const text = gapDragText(markerB, year * 55, {
      calendar: dataset.calendar,
      units: RELATION_SETTINGS.units,
      anchorDays,
    });
    expect(text).not.toBe("1 gen");
    expect(text).toMatch(/2 gen/);
  });

  it("moves dependents when the anchor is dragged and dates are resolved again", () => {
    const dataset = relationDataset("master");
    const notes = chainNotes();
    const anchor = notes.find((note) => note.path.endsWith("Marker A.md"));
    expect(anchor).toBeDefined();
    if (!anchor) return;
    const year = dataset.calendar.daysInYear(400);
    const moved = dependentsAfterAnchorMove({
      notes,
      anchorId: anchor.path,
      deltaDays: year * 10,
      settings: RELATION_SETTINGS,
      calendars: dataset.calendars,
      defaultCalendarId: dataset.calendar.def.id,
    });
    const beforeB = moved.before.find((note) => note.id.endsWith("Marker B.md"));
    const afterB = moved.after.find((note) => note.id.endsWith("Marker B.md"));
    const beforeD = moved.before.find((note) => note.id.endsWith("Marker D.md"));
    const afterD = moved.after.find((note) => note.id.endsWith("Marker D.md"));
    expect(beforeB?.bounds && afterB?.bounds && beforeD?.bounds && afterD?.bounds).toBeTruthy();
    if (!beforeB?.bounds || !afterB?.bounds || !beforeD?.bounds || !afterD?.bounds) return;
    expect(afterB.bounds.start.likely).toBeGreaterThan(beforeB.bounds.start.likely + year);
    expect(afterD.bounds.start.likely).toBeGreaterThan(beforeD.bounds.start.likely + year);
    expect(afterB.bounds.start.likely).toBeLessThan(afterD.bounds.start.likely);
  });
});

describe("ghost filter", () => {
  it("draws account ghosts for all, a matching list, and neither off nor a bare name", () => {
    const dataset = relationDataset("master");
    const origin = dataset.calendar.parse("3A 400");
    const scale = createScale({
      originDays: origin.ok ? origin.days - 2000 : 0,
      pxPerDay: 0.2,
      minPxPerDay: 1e-9,
      maxPxPerDay: 50_000,
    });
    const layout = (accounts?: boolean | string[]) =>
      layoutScene({
        items: dataset.items,
        lanes: buildLanes(dataset.items, dataset.config.lanes?.order),
        calendar: dataset.calendar,
        calendars: dataset.calendars,
        settings: dataset.settings,
        ...(accounts !== undefined ? { accounts } : {}),
        scale,
        viewportWidth: 12000,
        itemHeight: 22,
        overscanPx: 1000,
        minLabelPx: 48,
        selection: [],
      });

    const ghostsOf = (accounts?: boolean | string[]) => layout(accounts).items.filter((item) => item.ghost);
    const all = ghostsOf(true);
    expect(all.map((item) => item.by).sort()).toEqual(["[[North]]", "[[South]]"]);
    expect(all.every((item) => item.tooltip.includes("by "))).toBe(true);
    expect(all.some((item) => item.tooltip.includes("recorded earlier"))).toBe(true);
    expect(all.some((item) => item.tooltip.includes("recorded later"))).toBe(true);

    expect(ghostsOf(false)).toHaveLength(0);
    expect(ghostsOf(undefined)).toHaveLength(0);
    expect(ghostsOf(["[[South]]"]).map((item) => item.by)).toEqual(["[[South]]"]);
    expect(ghostsOf(["south"])).toHaveLength(0);

    const culture = layoutScene({
      items: dataset.items.filter((item) => item.accounts && item.accounts.length > 0),
      lanes: buildLanes(dataset.items, ["[[Accounts]]"]),
      calendar: dataset.calendar,
      calendars: dataset.calendars,
      settings: dataset.settings,
      accounts: true,
      cultures: ["[[South]]"],
      scale,
      viewportWidth: 12000,
      itemHeight: 22,
      overscanPx: 400,
      minLabelPx: 48,
      selection: [],
    });
    const primary = culture.items.find((item) => !item.ghost && item.title === "Shared Event");
    const south = dataset.items.find((item) => item.title === "Shared Event")?.accounts?.find((account) => account.by === "[[South]]");
    const noteGhost = culture.items.find((item) => item.ghost && item.id.endsWith("#primary"));
    expect(primary && south).toBeTruthy();
    if (!primary || !south?.start) return;
    expect(primary.x).toBeCloseTo(scale.toPx(south.start), 3);
    expect(noteGhost?.by).toBe("[[North]]");
    expect(noteGhost?.tooltip).toContain("by [[North]]");
  });
});

describe("culture-view labels", () => {
  it("tags the swapped primary and does not name the note ghost after another culture", () => {
    const dataset = relationDataset("master");
    const origin = dataset.calendar.parse("3A 400");
    const scale = createScale({
      originDays: origin.ok ? origin.days - 2000 : 0,
      pxPerDay: 0.2,
      minPxPerDay: 1e-9,
      maxPxPerDay: 50_000,
    });
    const scene = (items: typeof dataset.items, cultures: string[]) =>
      layoutScene({
        items,
        lanes: buildLanes(items, ["[[Accounts]]"]),
        calendar: dataset.calendar,
        calendars: dataset.calendars,
        settings: dataset.settings,
        accounts: true,
        cultures,
        scale,
        viewportWidth: 12000,
        itemHeight: 22,
        overscanPx: 1000,
        minLabelPx: 48,
        selection: [],
      });

    const shared = scene(
      dataset.items.filter((item) => item.title === "Shared Event"),
      ["[[South]]"]
    );
    const primary = shared.items.find((item) => !item.ghost);
    const noteGhost = shared.items.find((item) => item.ghost && item.id.endsWith("#primary"));
    const northGhost = shared.items.find((item) => item.ghost && item.accountIndex === 0);
    expect(primary?.label).toBe("Shared Event");
    expect(primary?.cultureTag).toBe("(South)");
    expect(primary?.tooltip).toContain("by [[South]]");
    expect(primary?.tooltip).toContain("recorded later");
    expect(noteGhost?.label).toBe("[[North]]");
    expect(northGhost?.label).toBe("[[North]]");
    expect(northGhost?.id.endsWith("#0")).toBe(true);

    const plain = notesFromMarkdown(
      [
        {
          path: "samples/relations/events/Plain Event.md",
          markdown: `---
type: event
calendar: reckoning
start: "3A 420"
lane: "[[Accounts]]"
accounts:
  - by: "[[East]]"
    start: "3A 410"
    claim: "east claim"
  - by: "[[West]]"
    start: "3A 430"
    claim: "west claim"
---
# Plain Event
`,
        },
      ],
      dataset.calendars,
      dataset.calendar.def.id
    ).items;
    const west = scene(plain, ["[[West]]"]);
    const westPrimary = west.items.find((item) => !item.ghost);
    const note = west.items.find((item) => item.id.endsWith("#primary"));
    const east = west.items.find((item) => item.accountIndex === 0);
    expect(westPrimary?.cultureTag).toBe("(West)");
    expect(westPrimary?.label).toBe("Plain Event");
    expect(westPrimary?.tooltip).toContain("west claim");
    expect(note?.label).toBe("note date");
    expect(note?.label).not.toBe("[[East]]");
    expect(note?.label).not.toBe("[[West]]");
    expect(east?.label).toBe("[[East]]");
  });
});

describe("vault units text", () => {
  it("reads one unit per line and ignores blanks", () => {
    expect(parseUnitsText("")).toBeUndefined();
    expect(parseUnitsText("gen: 40-60y\n\n# comment\nage: 80y")).toEqual({ gen: "40-60y", age: "80y" });
    const doc = fs.readFileSync(path.join("samples", "relations", "World Timeline.md"), "utf8");
    expect(doc).toContain("gen: 40-60y");
    expect(doc).toContain('cultures: ["[[South]]"]');
  });
});
