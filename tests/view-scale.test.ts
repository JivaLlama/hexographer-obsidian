import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { createCalendar, createScale, GREGORIAN, parseCalendarDocument, RECKONING } from "../src/core";
import { layoutTicks } from "../src/views/timeline/scene/axis";
import { buildLanes, cameraForDataset, itemsFromNotes, stubDataset, visibleRange } from "../src/views/timeline/scene/dataset";
import {
  ellipsizeToPx,
  estimateLabelPx,
  laneBlockHeight,
  layoutScene,
  pointRadius,
} from "../src/views/timeline/scene/layout";
import { commitPan, dayUnderPixel, fitRange, localX, zoomAround } from "../src/views/timeline/scene/rebase";

describe("scale re-base", () => {
  it("keeps scene x relative to a local origin", () => {
    const origin = 10_000_000;
    const pxPerDay = 0.4;
    expect(localX(origin, origin, pxPerDay)).toBe(0);
    expect(localX(origin + 25, origin, pxPerDay)).toBeCloseTo(10);
    expect(Math.abs(localX(origin + 25, 0, pxPerDay))).toBeGreaterThan(1_000_000);
  });

  it("commits a pan without moving the day under a pixel", () => {
    const scale = createScale({ originDays: 1_500_000.5, pxPerDay: 2.5, minPxPerDay: 1e-6, maxPxPerDay: 400 });
    const translate = -180;
    const pixel = 240;
    const before = dayUnderPixel(scale, pixel, translate);
    const next = commitPan(scale, translate);
    expect(dayUnderPixel(next, pixel, 0)).toBeCloseTo(before);
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
      const day = dayUnderPixel(scale, sample.focus, sample.translate);
      const next = zoomAround(scale, sample.translate, sample.focus, sample.factor);
      expect(next.toDays(sample.focus)).toBeCloseTo(day);
      expect(next.toPx(day)).toBeCloseTo(sample.focus);
      expect(Math.abs(next.toPx(day))).toBeLessThan(1_000);
    }
  });

  it("fits a range inside the viewport and centers it when zoom is clamped", () => {
    const limits = { minPxPerDay: 0.01, maxPxPerDay: 8 };
    const fitted = fitRange(limits, { from: 1000, to: 1100 }, 800, 40);
    expect(fitted.toPx(1000)).toBeCloseTo(40);
    expect(fitted.toPx(1100)).toBeCloseTo(760);

    const clamped = fitRange(limits, { from: 0, to: 1 }, 800, 20);
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
    expect(lanes.map((lane) => lane.label)).toEqual(["House Vey", "Climate", "Treaties"]);
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
    expect(climate?.height).toBe(laneBlockHeight(1, 22));
    expect(treaties?.height).toBe(laneBlockHeight(1, 22));
    const houseRows = new Set(model.items.filter((item) => item.laneId === house?.id).map((item) => item.y));
    expect(houseRows.size).toBeGreaterThan(1);
    expect(house?.height).toBe(laneBlockHeight(houseRows.size, 22));
    expect(model.contentHeight).toBe(model.lanes.reduce((sum, lane) => sum + lane.height, 0));
    expect(model.contentHeight).toBeLessThan(280);

    const siege = model.items.find((item) => item.title === "Siege of Port Haven");
    expect(siege?.color).toBe("#c0392b");
    expect(siege?.parseError).toBeUndefined();
    expect(siege?.shape).toBe("bar");
    expect(siege?.tooltip).toBe("Siege of Port Haven");
    expect(siege?.labelOutside).toBe(true);
    expect(siege?.label).toBe("Siege of Port Haven");
  });

  it("truncates a label that still collides and keeps the full title on the tooltip", () => {
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
    expect(bar?.tooltip).toBe("Siege of Port Haven");
    expect(bar?.label.endsWith("…") || bar?.label === "").toBe(true);
    expect(bar?.label).not.toBe(siege.title);
    const error = model.items.find((item) => item.id === broken.id);
    expect(error?.tooltip).toBe("Treaty of Amber — Unknown month");
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

describe("sample vault notes", () => {
  it("parses the sample timeline with the sample calendar file", () => {
    const root = process.cwd();
    const calendar = createCalendar(
      parseCalendarDocument(fs.readFileSync(path.join(root, "samples/calendars/reckoning.calendar.md"), "utf8"))
    );
    const gregorian = createCalendar(GREGORIAN);
    const dir = path.join(root, "samples/timeline");
    const notes = walkMarkdown(dir).filter((file) => !file.endsWith(`${path.sep}World Timeline.md`));
    expect(notes.length).toBeGreaterThanOrEqual(6);
    const items = itemsFromNotes(
      notes.map((file) => ({ path: path.relative(root, file), markdown: fs.readFileSync(file, "utf8") })),
      [gregorian, calendar],
      "reckoning"
    );
    expect(items).toHaveLength(notes.length);
    expect(items.every((item) => item.parseError === undefined)).toBe(true);
    expect(items.some((item) => item.kind === "era")).toBe(true);
    expect(items.some((item) => item.kind === "span")).toBe(true);
    expect(items.some((item) => item.kind === "event" && item.end === null)).toBe(true);
    const block = fs.readFileSync(path.join(dir, "World Timeline.md"), "utf8");
    expect(block).toContain("```worldtimeline");
    expect(block).toContain("samples/timeline");
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
