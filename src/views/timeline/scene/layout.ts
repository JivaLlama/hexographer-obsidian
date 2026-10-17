import { extentOf, packLanes, type CalendarEngine, type ItemKind, type Lane, type Scale, type TimelineItem } from "../../../core";
import { layoutTicks, type AxisTick } from "./axis";

const ROW_GAP = 4;
const LANE_PAD = 8;
const MIN_BAR_PX = 2;
const POINT_BRACKET_MIN_PX = 12;
const POINT_LABEL_PX = 140;

export interface LaneBox {
  id: string;
  label: string;
  y: number;
  height: number;
  alt: boolean;
}

export interface ItemBox {
  id: string;
  kind: ItemKind;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: "point" | "bar";
  bracket: { x: number; width: number } | null;
  laneId: string;
  tags: string;
  color?: string;
  parseError?: string;
  selected: boolean;
}

export interface EraBox {
  id: string;
  title: string;
  x: number;
  width: number;
  labelX: number;
  tags: string;
  color?: string;
}

export interface SceneModel {
  lanes: LaneBox[];
  items: ItemBox[];
  eras: EraBox[];
  ticks: AxisTick[];
  contentHeight: number;
  viewportWidth: number;
  overscanPx: number;
}

export interface SceneLayoutInput {
  items: readonly TimelineItem[];
  lanes: readonly Lane[];
  calendar: CalendarEngine;
  scale: Scale;
  viewportWidth: number;
  laneViewportHeight: number;
  itemHeight: number;
  overscanPx: number;
  minLabelPx: number;
  selection: readonly string[];
}

/** Virtualized scene. Item x is `(days - originDays) * pxPerDay`, clipped to the overscan window. */
export function layoutScene(input: SceneLayoutInput): SceneModel {
  const width = Math.max(input.viewportWidth, 0);
  const overscan = Math.max(input.overscanPx, 0);
  const left = -overscan;
  const right = width + overscan;
  const packed = packLanes(input.items, input.lanes);
  const itemHeight = Math.max(input.itemHeight, 1);

  const natural = input.lanes.map((lane) => {
    const rows = packed.laneHeights.get(lane.id) ?? 1;
    return laneHeight(rows, itemHeight);
  });
  const naturalSum = natural.reduce((sum, height) => sum + height, 0);
  const extra =
    input.laneViewportHeight > naturalSum && natural.length > 0
      ? (input.laneViewportHeight - naturalSum) / natural.length
      : 0;

  const lanes: LaneBox[] = [];
  let y = 0;
  input.lanes.forEach((lane, index) => {
    const height = natural[index] + extra;
    lanes.push({
      id: lane.id,
      label: lane.label,
      y,
      height,
      alt: index % 2 === 1,
    });
    y += height;
  });
  const contentHeight = Math.max(y, input.laneViewportHeight, itemHeight + LANE_PAD * 2);

  const laneY = new Map(lanes.map((lane) => [lane.id, lane]));
  const selected = new Set(input.selection);
  const items: ItemBox[] = [];
  const eras: EraBox[] = [];

  for (const item of input.items) {
    if (item.kind === "era") {
      const band = placeEra(item, input.scale, left, right);
      if (band) eras.push(band);
      continue;
    }
    const laneId = item.laneId ?? "";
    const lane = laneY.get(laneId);
    if (!lane) continue;
    const row = packed.rows.get(item.id) ?? 0;
    const itemY = lane.y + LANE_PAD + row * (itemHeight + ROW_GAP);
    const placed = placeItem(item, input.scale, itemY, itemHeight, left, right, selected.has(item.id));
    if (placed) items.push(placed);
  }

  return {
    lanes,
    items,
    eras,
    ticks: layoutTicks(input.calendar, input.scale, width, overscan, input.minLabelPx),
    contentHeight,
    viewportWidth: width,
    overscanPx: overscan,
  };
}

function placeItem(
  item: TimelineItem,
  scale: Scale,
  y: number,
  height: number,
  left: number,
  right: number,
  selected: boolean
): ItemBox | null {
  const extent = extentOf(item);
  const point = item.kind === "event" && item.end === null;
  const tags = item.tags.join(" ");
  const base = {
    id: item.id,
    kind: item.kind,
    title: item.title,
    y,
    height,
    laneId: item.laneId ?? "",
    tags,
    ...(item.color ? { color: item.color } : {}),
    ...(item.parseError ? { parseError: item.parseError } : {}),
    selected,
  };

  if (point) {
    const x = scale.toPx(item.start);
    const labelReach = POINT_LABEL_PX;
    if (x + labelReach < left || x > right) return null;
    const extentWidth = scale.toPx(extent.to) - scale.toPx(extent.from);
    const bracket =
      extentWidth >= POINT_BRACKET_MIN_PX ? clipSpan(scale.toPx(extent.from), scale.toPx(extent.to), left, right) : null;
    return { ...base, x, width: height, shape: "point", bracket };
  }

  const span = clipSpan(scale.toPx(extent.from), scale.toPx(extent.to), left, right);
  if (!span) return null;
  return { ...base, x: span.x, width: Math.max(span.width, MIN_BAR_PX), shape: "bar", bracket: null };
}

function placeEra(item: TimelineItem, scale: Scale, left: number, right: number): EraBox | null {
  const extent = extentOf(item);
  const span = clipSpan(scale.toPx(extent.from), scale.toPx(extent.to), left, right);
  if (!span) return null;
  return {
    id: item.id,
    title: item.title,
    x: span.x,
    width: span.width,
    labelX: Math.max(span.x + 8, 8),
    tags: item.tags.join(" "),
    ...(item.color ? { color: item.color } : {}),
  };
}

function clipSpan(x0: number, x1: number, left: number, right: number): { x: number; width: number } | null {
  if (!Number.isFinite(x0) || !Number.isFinite(x1)) return null;
  const start = Math.max(Math.min(x0, x1), left);
  const end = Math.min(Math.max(x0, x1), right);
  if (end - start < 0.5) return null;
  return { x: start, width: end - start };
}

function laneHeight(rows: number, itemHeight: number): number {
  const count = Math.max(rows, 1);
  return LANE_PAD * 2 + count * itemHeight + (count - 1) * ROW_GAP;
}
