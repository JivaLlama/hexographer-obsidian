import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  applyPlanToNote,
  calendarForItem,
  commitPan,
  createCalendar,
  createScale,
  formatYearsAgo,
  GREGORIAN,
  parseTimelineNote,
  planMove,
  RECKONING,
  scanVault,
  zoomToFit,
} from "../src/core";
import { layoutTicks } from "../src/views/timeline/scene/axis";
import {
  buildLanes,
  cameraForDataset,
  notesFromMarkdown,
  stubDataset,
  visibleRange,
  yearsAgoDataset,
} from "../src/views/timeline/scene/dataset";
import {
  beforeBandInset,
  ellipsizeToPx,
  estimateLabelPx,
  HINT_LINE,
  LANE_COL_MAX_PX,
  LANE_COL_MIN_PX,
  laneBlockHeight,
  laneColumnWidth,
  layoutScene,
  pointRadius,
} from "../src/views/timeline/scene/layout";

describe("scale re-base", () => {
  it("keeps scene x relative to a local origin", () => {
    const origin = 10_000_000;
    const pxPerDay = 0.4;
    const local = createScale({ originDays: origin, pxPerDay, minPxPerDay: 1e-9, maxPxPerDay: 10 });
    const rooted = createScale({ originDays: 0, pxPerDay, minPxPerDay: 1e-9, maxPxPerDay: 10 });
    expect(local.toPx(origin)).toBe(0);
    expect(local.toPx(origin + 25)).toBeCloseTo(10);
    expect(Math.abs(rooted.toPx(origin + 25))).toBeGreaterThan(1_000_000);
  });

  it("commits a pan without moving the day under a pixel", () => {
    const scale = createScale({ originDays: 1_500_000.5, pxPerDay: 2.5, minPxPerDay: 1e-6, maxPxPerDay: 400 });
    const translate = -180;
    const pixel = 240;
    const before = scale.toDays(pixel - translate);
    const next = commitPan(scale, translate);
    expect(next.toDays(pixel)).toBeCloseTo(before);
    expect(next.pxPerDay).toBe(scale.pxPerDay);
    expect(commitPan(scale, 0)).toBe(scale);
  });

  it("zooms around the cursor after a translate, including at deep time", () => {
    const cases = [
      { originDays: 0, pxPerDay: 1, translate: 0, focus: 120, factor: 2 },
      { originDays: 8_765_432, pxPerDay: 0.35, translate: 460, focus: 300, factor: 1.6 },
      { originDays: -2_000_000, pxPerDay: 12, translate: -80, focus: 40, factor: 0.5 },
    ];
    for (const sample of cases) {
      const scale = createScale({
        originDays: sample.originDays,
        pxPerDay: sample.pxPerDay,
        minPxPerDay: 1e-8,
        maxPxPerDay: 20_000,
      });
      const day = scale.toDays(sample.focus - sample.translate);
      const next = commitPan(scale, sample.translate).zoomAt(sample.focus, sample.factor);
      expect(next.toDays(sample.focus)).toBeCloseTo(day);
      expect(next.toPx(day)).toBeCloseTo(sample.focus);
      expect(Math.abs(next.toPx(day))).toBeLessThan(1_000);
    }
  });

  it("fits a range inside the viewport and centers it when zoom is clamped", () => {
    const limits = { minPxPerDay: 0.01, maxPxPerDay: 8 };
    const base = () => createScale({ minPxPerDay: limits.minPxPerDay, maxPxPerDay: limits.maxPxPerDay });
    const fitted = zoomToFit(base(), { from: 1000, to: 1100 }, 800, 40);
    expect(fitted.toPx(1000)).toBeCloseTo(40);
    expect(fitted.toPx(1100)).toBeCloseTo(760);

    const clamped = zoomToFit(base(), { from: 0, to: 1 }, 800, 20);
    expect(clamped.pxPerDay).toBe(8);
    expect(clamped.toPx(0.5)).toBeCloseTo(400);
  });
});

describe("axis and virtualization", () => {
  const dataset = stubDataset();

  it("parses the stub through the calendar engine and fits the requested view", () => {
    expect(dataset.origin).toBe("stub");
    expect(dataset.items.every((item) => item.parseError === undefined)).toBe(true);
    expect(dataset.calendar.def.id).toBe("reckoning");
    const camera = cameraForDataset(dataset, 900);
    const scale = createScale({
      originDays: camera.originDays,
      pxPerDay: camera.pxPerDay,
      minPxPerDay: 1e-9,
      maxPxPerDay: 100_000,
    });
    const range = visibleRange(dataset.calendar, dataset.items, dataset.config.view);
    expect(scale.toPx(range.from)).toBeGreaterThanOrEqual(-1);
    expect(scale.toPx(range.to)).toBeLessThanOrEqual(901);
    const lanes = buildLanes(dataset.items, dataset.config.lanes?.order);
    expect(lanes.map((lane) => lane.label)).toEqual(["House Vey", "Climate", "Treaties", "Records"]);
  });

  it("draws calendar ticks in local pixels and drops items outside the window", () => {
    const siege = dataset.items.find((item) => item.title === "Siege of Port Haven");
    expect(siege).toBeDefined();
    if (!siege) return;
    const scale = createScale({
      originDays: siege.start - 2,
      pxPerDay: 36,
      minPxPerDay: 1e-8,
      maxPxPerDay: 50_000,
    });
    const ticks = layoutTicks(dataset.calendar, scale, 720, 40, 64);
    expect(ticks.some((tick) => tick.major)).toBe(true);
    for (const tick of ticks) {
      expect(tick.x).toBeGreaterThan(-41);
      expect(tick.x).toBeLessThan(761);
      expect(Math.abs(tick.x)).toBeLessThan(1_000);
    }

    const model = layoutScene({
      items: dataset.items,
      lanes: buildLanes(dataset.items, dataset.config.lanes?.order),
      calendar: dataset.calendar,
      scale,
      viewportWidth: 720,
      itemHeight: 22,
      overscanPx: 40,
      minLabelPx: 64,
      selection: [siege.id],
    });
    const titles = model.items.map((item) => item.title);
    expect(titles).toContain("Siege of Port Haven");
    expect(titles).not.toContain("Founding of Port Haven");
    expect(titles).not.toContain("Treaty of Amber");
    expect(model.items.every((item) => item.x > -80 && item.x < 800)).toBe(true);
    expect(model.eras).toHaveLength(1);
    expect(model.eras[0]?.x).toBeGreaterThan(-41);
    const selected = model.items.find((item) => item.id === siege.id);
    expect(selected?.selected).toBe(true);
  });

  it("draws a faint bracket once a year-precision point is wider than the mark", () => {
    const coronation = dataset.items.find((item) => item.title === "Coronation of Aldric");
    expect(coronation?.startPrecision).toBe("year");
    expect(coronation?.end).toBeNull();
    if (!coronation) return;
    const scale = createScale({
      originDays: coronation.start,
      pxPerDay: 2,
      minPxPerDay: 1e-8,
      maxPxPerDay: 50_000,
    });
    const model = layoutScene({
      items: dataset.items,
      lanes: buildLanes(dataset.items, dataset.config.lanes?.order),
      calendar: dataset.calendar,
      scale,
      viewportWidth: 800,
      itemHeight: 22,
      overscanPx: 40,
      minLabelPx: 64,
      selection: [],
    });
    const box = model.items.find((item) => item.id === coronation.id);
    expect(box?.shape).toBe("point");
    expect(box?.bracket).not.toBeNull();
    expect(box?.bracket?.width).toBeGreaterThan(12);
  });

  it("stacks point labels that would overlap and sizes lanes to their rows", () => {
    const camera = cameraForDataset(dataset, 900);
    const scale = createScale({
      originDays: camera.originDays,
      pxPerDay: camera.pxPerDay,
      minPxPerDay: 1e-9,
      maxPxPerDay: 100_000,
    });
    const model = layoutScene({
      items: dataset.items,
      lanes: buildLanes(dataset.items, dataset.config.lanes?.order),
      calendar: dataset.calendar,
      scale,
      viewportWidth: 900,
      itemHeight: 22,
      overscanPx: 40,
      minLabelPx: 64,
      selection: [],
    });
    const founding = model.items.find((item) => item.title === "Founding of Port Haven");
    const coronation = model.items.find((item) => item.title === "Coronation of Aldric");
    expect(founding?.label).toBe("Founding of Port Haven");
    expect(coronation?.label).toBe("Coronation of Aldric");
    expect(founding?.y).not.toBe(coronation?.y);

    const byRow = new Map<string, typeof model.items>();
    for (const item of model.items) {
      const key = `${item.laneId}:${item.y}`;
      const list = byRow.get(key);
      if (list) list.push(item);
      else byRow.set(key, [item]);
    }
    for (const row of byRow.values()) {
      const ordered = [...row].sort((a, b) => a.x - b.x);
      for (let index = 0; index < ordered.length - 1; index++) {
        const item = ordered[index];
        const next = ordered[index + 1];
        if (!item?.label || !next) continue;
        const edge = next.shape === "point" ? next.x - pointRadius(next.height) : next.x;
        expect(item.labelX + estimateLabelPx(item.label)).toBeLessThanOrEqual(edge - 8 + 0.01);
      }
    }

    const climate = model.lanes.find((lane) => lane.label === "Climate");
    const treaties = model.lanes.find((lane) => lane.label === "Treaties");
    const house = model.lanes.find((lane) => lane.label === "House Vey");
    expect(climate?.height).toBe(laneBlockHeight(2, 22, HINT_LINE));
    expect(treaties?.height).toBe(laneBlockHeight(1, 22, HINT_LINE));
    const houseRows = new Set(model.items.filter((item) => item.laneId === house?.id).map((item) => item.y));
    expect(houseRows.size).toBeGreaterThan(1);
    expect(house?.height).toBe(laneBlockHeight(houseRows.size, 22));
    expect(model.contentHeight).toBe(model.lanes.reduce((sum, lane) => sum + lane.height, 0));
    expect(model.contentHeight).toBeLessThan(360);

    const siege = model.items.find((item) => item.title === "Siege of Port Haven");
    expect(siege?.color).toBe("#c0392b");
    expect(siege?.parseError).toBeUndefined();
    expect(siege?.shape).toBe("bar");
    expect(siege?.tooltip).toBe("Siege of Port Haven");
    expect(siege?.labelOutside).toBe(true);
    expect(siege?.label).toBe("Siege of Port Haven");
  });

  it("keeps a full title when the label reserves its own row, and a parse error stays on the tooltip", () => {
    expect(ellipsizeToPx("Coronation of Aldric", 1000, estimateLabelPx)).toBe("Coronation of Aldric");
    const truncated = ellipsizeToPx("Coronation of Aldric", estimateLabelPx("Coronat…"), estimateLabelPx);
    expect(truncated.endsWith("…")).toBe(true);
    expect(estimateLabelPx(truncated)).toBeLessThanOrEqual(estimateLabelPx("Coronat…"));
    expect(ellipsizeToPx("Coronation of Aldric", 2, estimateLabelPx)).toBe("");

    const siege = dataset.items.find((item) => item.title === "Siege of Port Haven");
    const treaty = dataset.items.find((item) => item.title === "Treaty of Amber");
    expect(siege).toBeDefined();
    expect(treaty).toBeDefined();
    if (!siege || !treaty) return;
    const barItem = { ...siege, end: siege.start, extentTo: siege.start + 1 };
    const neighbor = {
      ...treaty,
      id: "samples/timeline/events/Neighbor.md",
      laneId: siege.laneId,
      start: siege.start + 4,
      extentTo: siege.start + 5,
    };
    const broken = {
      ...treaty,
      id: "samples/timeline/events/Broken Treaty.md",
      start: siege.start,
      extentTo: siege.start + 1,
      parseError: "Unknown month",
    };
    const scale = createScale({
      originDays: siege.start - 5,
      pxPerDay: 3,
      minPxPerDay: 1e-8,
      maxPxPerDay: 50_000,
    });
    const model = layoutScene({
      items: [barItem, neighbor, broken],
      lanes: buildLanes([barItem, neighbor, broken], ["[[House Vey]]", "[[Treaties]]"]),
      calendar: dataset.calendar,
      scale,
      viewportWidth: 900,
      itemHeight: 22,
      overscanPx: 40,
      minLabelPx: 64,
      selection: [],
    });
    const bar = model.items.find((item) => item.id === barItem.id);
    const beside = model.items.find((item) => item.id === neighbor.id);
    expect(bar?.tooltip).toBe("Siege of Port Haven");
    expect(bar?.label).toBe(siege.title);
    expect(beside?.y).not.toBe(bar?.y);
    const error = model.items.find((item) => item.id === broken.id);
    expect(error?.tooltip).toBe("Treaty of Amber\nUnknown month");
    expect(error?.parseError).toBe("Unknown month");
  });

  it("ignores a long era when fitting items that have no explicit view", () => {
    const calendar = createCalendar(RECKONING);
    const range = visibleRange(calendar, dataset.items, undefined);
    const withView = visibleRange(calendar, dataset.items, dataset.config.view);
    expect(range.to - range.from).toBeLessThan(withView.to - withView.from);
    expect(range.to - range.from).toBeLessThan(80 * 400);
  });
});

describe("certainty, order, and years-ago", () => {
  it("shows certainty and displayHint, and a drag leaves the hint intact", () => {
    const markdown = `---
type: span
calendar: reckoning
start: "3A 416"
end: "3A 424"
lane: "[[Climate]]"
certainty: uncertain
displayHint: "dates are approximate"
---
# Dry Interval
`;
    const calendars = [createCalendar(RECKONING)];
    const item = parseTimelineNote(markdown, {
      path: "samples/timeline/spans/Dry Interval.md",
      calendars,
      defaultCalendarId: "reckoning",
    });
    expect(item?.certainty).toBe("uncertain");
    expect(item?.displayHint).toBe("dates are approximate");
    if (!item) return;
    const plan = planMove(item, 400, "move", { fine: false, calendar: calendarForItem(item, calendars) });
    expect(plan.command.patches.every((patch) => patch.fields.every((field) => field.key !== "displayHint"))).toBe(true);
    const written = applyPlanToNote(markdown, plan);
    expect(written).toContain("displayHint: dates are approximate");
    expect(written).toContain("certainty: uncertain");
    const again = parseTimelineNote(written, {
      path: item.id,
      calendars,
      defaultCalendarId: "reckoning",
    });
    expect(again?.displayHint).toBe("dates are approximate");
    expect(again?.source.startRaw).not.toBe(item.source.startRaw);

    const sample = stubDataset();
    const reserve = beforeBandInset(
      sample.ordered,
      sample.items.filter((item) => item.kind === "era"),
      sample.calendars
    );
    const camera = cameraForDataset(sample, 900 - reserve);
    const scale = createScale({
      originDays: camera.originDays,
      pxPerDay: camera.pxPerDay,
      minPxPerDay: 1e-9,
      maxPxPerDay: 100_000,
    });
    const model = layoutScene({
      items: sample.items,
      ordered: sample.ordered,
      calendars: sample.calendars,
      lanes: buildLanes(sample.items, sample.config.lanes?.order, sample.ordered),
      calendar: sample.calendar,
      scale,
      viewportWidth: 900,
      itemHeight: 22,
      overscanPx: 40,
      minLabelPx: 64,
      selection: [],
    });
    const dry = model.items.find((entry) => entry.title === "Dry Interval");
    expect(dry?.certainty).toBe("uncertain");
    expect(dry?.hint).toBe("dates are approximate");
    expect(dry?.tooltip).toContain("uncertain");
    expect(dry?.tooltip).toContain("dates are approximate");
    const winter = model.items.find((entry) => entry.title === "The Long Winter");
    expect(winter?.label).toBe("The Long Winter");
    if (dry && winter) expect(dry.y).not.toBe(winter.y);
    const inset = model.before?.width ?? 0;
    expect(inset).toBeGreaterThan(0);
    const thirdAge = model.eras.find((era) => era.title === "Third Age");
    const house = model.items.find((entry) => entry.title === "House Vey");
    expect(thirdAge?.labelX).toBeGreaterThanOrEqual(inset);
    expect(house?.x).toBeGreaterThanOrEqual(inset);
    for (const entry of model.items) {
      if (entry.pinned || !entry.hint) continue;
      const lane = model.lanes.find((item) => item.id === entry.laneId);
      expect(lane?.height).toBeGreaterThan(laneBlockHeight(1, 22));
    }
    expect(HINT_LINE).toBeGreaterThan(0);
    const open = model.items.find((entry) => entry.title === "Open Marker");
    expect(open?.certainty).toBe("open");
    const earlier = model.items.find((entry) => entry.title === "Earlier Note");
    expect(earlier?.ordered).toBe(true);
    expect(earlier?.pinned).toBe(true);
    expect(model.before?.label).toBe("Before reckoning");
    const steps = model.items.filter((entry) => entry.title.startsWith("Step "));
    expect(steps).toHaveLength(3);
    expect(steps.every((entry) => entry.ordered && !entry.pinned)).toBe(true);
    const rows = new Set(steps.map((entry) => entry.y));
    const xs = [...steps].sort((a, b) => a.x - b.x);
    for (let index = 0; index < xs.length - 1; index++) {
      const current = xs[index];
      const next = xs[index + 1];
      if (!current || !next || current.y !== next.y || !current.label) continue;
      expect(current.labelX + estimateLabelPx(current.label)).toBeLessThanOrEqual(next.x - pointRadius(next.height));
    }
    expect(rows.size).toBeGreaterThan(0);
  });

  it("labels a before-present axis in years ago", () => {
    const datasetAgo = yearsAgoDataset();
    expect(datasetAgo.calendar.def.display?.mode).toBe("before-present");
    const camera = cameraForDataset(datasetAgo, 1052);
    const scale = createScale({
      originDays: camera.originDays,
      pxPerDay: camera.pxPerDay,
      minPxPerDay: 1e-9,
      maxPxPerDay: 100_000,
    });
    const ticks = layoutTicks(datasetAgo.calendar, scale, 1052, 48, 72);
    const majors = ticks.filter((tick) => tick.major).sort((a, b) => a.x - b.x);
    const labels = majors.map((tick) => tick.label);
    const seven = labels.indexOf("700 ya");
    expect(seven).toBeGreaterThanOrEqual(0);
    expect(labels[seven + 1]).toBe("600 ya");
    expect(labels[seven + 2]).toBe("500 ya");
    expect(labels).not.toContain("000 ya");
    const absolute = datasetAgo.calendar.toAbsoluteYear(
      datasetAgo.calendar.fromDays(datasetAgo.calendar.toDays({ year: 1400, precision: "year" }), "year")
    );
    expect(formatYearsAgo(datasetAgo.calendar.def, absolute)).toBe("600 ya");
    expect(majors.find((tick) => tick.label === "600 ya")?.label).toBe(
      formatYearsAgo(datasetAgo.calendar.def, absolute)
    );
    const model = layoutScene({
      items: datasetAgo.items,
      ordered: datasetAgo.ordered,
      calendars: datasetAgo.calendars,
      lanes: buildLanes(datasetAgo.items, datasetAgo.config.lanes?.order),
      calendar: datasetAgo.calendar,
      scale,
      viewportWidth: 1052,
      itemHeight: 22,
      overscanPx: 48,
      minLabelPx: 72,
      selection: [],
    });
    const middle = model.items.find((item) => item.title === "Middle Marker");
    expect(middle?.tooltip).toContain("ya");
    expect(middle?.hint).toBe("halfway");
  });
});

describe("sample vault notes", () => {
  it("parses the sample timeline with the sample calendar file", () => {
    const root = process.cwd();
    const dir = path.join(root, "samples/timeline");
    const notes = walkMarkdown(dir).filter((file) => !file.endsWith(`${path.sep}World Timeline.md`));
    expect(notes.length).toBeGreaterThanOrEqual(6);
    const calendars = walkMarkdown(path.join(root, "samples/calendars")).map((file) => ({
      path: path.relative(root, file),
      content: fs.readFileSync(file, "utf8"),
    }));
    const scan = scanVault(
      [
        ...calendars,
        ...notes.map((file) => ({ path: path.relative(root, file), content: fs.readFileSync(file, "utf8") })),
      ],
      { defaultCalendarId: "gregorian" }
    );
    const parsed = notesFromMarkdown(
      notes.map((file) => ({ path: path.relative(root, file), markdown: fs.readFileSync(file, "utf8") })),
      scan.calendars,
      "reckoning"
    );
    expect(parsed.items.length + parsed.ordered.length).toBe(notes.length);
    expect(parsed.items.every((item) => item.parseError === undefined)).toBe(true);
    expect(parsed.items.some((item) => item.certainty === "uncertain")).toBe(true);
    expect(parsed.items.some((item) => item.certainty === "open")).toBe(true);
    expect(parsed.ordered.map((item) => item.order).sort()).toEqual([1, 1, 2, 3]);
    expect(scan.calendars.some((engine) => engine.def.display?.mode === "before-present")).toBe(true);
    expect(parsed.items.some((item) => item.kind === "era")).toBe(true);
    expect(parsed.items.some((item) => item.kind === "span")).toBe(true);
    expect(parsed.items.some((item) => item.kind === "event" && item.end === null)).toBe(true);
    const block = fs.readFileSync(path.join(dir, "World Timeline.md"), "utf8");
    expect(block).toContain("```worldtimeline");
    expect(block).toContain("samples/timeline");
    expect(block).toContain("yearsago");
  });
});

describe("before-band labels and order ghosts", () => {
  const calendars = [createCalendar(GREGORIAN)];
  const scale = createScale({ originDays: 0, pxPerDay: 0.2, minPxPerDay: 1e-9, maxPxPerDay: 50_000 });

  function scene(notes: { path: string; markdown: string }[], accounts?: boolean) {
    const parsed = notesFromMarkdown(notes, calendars, "gregorian");
    return layoutScene({
      items: parsed.items,
      ordered: parsed.ordered,
      calendars,
      lanes: buildLanes(parsed.items, undefined, parsed.ordered),
      calendar: calendars[0]!,
      scale,
      viewportWidth: 900,
      itemHeight: 22,
      overscanPx: 40,
      minLabelPx: 64,
      selection: [],
      ...(accounts !== undefined ? { accounts } : {}),
    });
  }

  it("keeps a readable label on a mark parked at the right of the before band", () => {
    const titles = [
      "01 - First marker with a long name",
      "02 - Second marker",
      "03 - Third marker",
      "04 - Fourth marker",
      "05 - Fifth marker with a long name",
    ];
    const model = scene(
      titles.map((title, index) => ({
        path: `notes/${title}.md`,
        markdown: `---
type: event
order: ${index + 1}
lane: Gods
---
# ${title}
`,
      }))
    );
    const last = model.items.find((item) => item.title.startsWith("05 - Fifth"));
    expect(last?.pinned).toBe(true);
    expect(last?.label.startsWith("05 - Fifth")).toBe(true);
    expect(last?.label.length).toBeGreaterThan(12);
    expect(model.before?.label).toBe("Before reckoning");
  });

  it("draws order-only account ghosts from barsForItem", () => {
    const markdown = `---
type: event
order: 4
lane: Beasts
accounts:
  - by: "Option A"
    order: 4
    claim: "one event"
  - by: "Option B"
    order: 2.5
    claim: "two waves"
---
# Forked Event
`;
    const shown = scene([{ path: "notes/Forked Event.md", markdown }], true);
    const ghosts = shown.items.filter((item) => item.ghost);
    expect(ghosts.map((item) => item.title).sort()).toEqual(["Option A", "Option B"]);
    const optionB = ghosts.find((item) => item.title === "Option B");
    expect(optionB?.tooltip).toContain("two waves");
    expect(optionB?.tooltip).toContain("by Option B");
    expect(optionB?.pinned).toBe(true);
    const primary = shown.items.find((item) => item.title === "Forked Event");
    expect(primary).toBeDefined();
    expect(primary?.ghost).toBeUndefined();
    const hidden = scene([{ path: "notes/Forked Event.md", markdown }]);
    expect(hidden.items.filter((item) => item.ghost)).toHaveLength(0);
  });
});

describe("lane column width", () => {
  it("grows for a long lane name and stays capped", () => {
    expect(laneColumnWidth(["Beasts"], estimateLabelPx)).toBe(LANE_COL_MIN_PX);
    const long = "Magic · the Word · Temple & Academy";
    const grown = laneColumnWidth([long], estimateLabelPx);
    expect(grown).toBeGreaterThan(LANE_COL_MIN_PX);
    expect(grown).toBeLessThanOrEqual(LANE_COL_MAX_PX);
    expect(laneColumnWidth(["x".repeat(80)], estimateLabelPx)).toBe(LANE_COL_MAX_PX);
  });
});

function walkMarkdown(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walkMarkdown(full));
    else if (entry.name.endsWith(".md")) found.push(full);
  }
  return found;
}
