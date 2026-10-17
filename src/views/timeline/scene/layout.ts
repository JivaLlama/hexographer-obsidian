import { extentOf, packLanes, type CalendarEngine, type ItemKind, type Lane, type Scale, type TimelineItem } from "../../../core";
import { layoutTicks, type AxisTick } from "./axis";

const ROW_GAP = 4;
const LANE_PAD = 8;
const MIN_BAR_PX = 2;
const POINT_BRACKET_MIN_PX = 12;
const LABEL_GAP = 8;
const LABEL_TEXT_PAD = 6;
const LABEL_CHAR_PX = 6.6;

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
  /** Visible label after same-row truncation. Empty when nothing fits. */
  label: string;
  labelX: number;
  /** True when a bar is too narrow and the label sits to its right. */
  labelOutside: boolean;
  /** Full title, plus the parse error when the note failed to parse. */
  tooltip: string;
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
  itemHeight: number;
  overscanPx: number;
  minLabelPx: number;
  selection: readonly string[];
  /**
   * Measured label width in pixels. The DOM host passes a canvas measurement
   * of the item font. Tests omit it and get a stable per-character estimate.
   */
  labelWidth?: (title: string) => number;
}

/** Diamond radius. Shared with the renderer so the reserved label start matches the mark. */
export function pointRadius(itemHeight: number): number {
  return Math.max(5, Math.min(8, itemHeight * 0.32));
}

/** Pixels from a point's center to the start of its label. */
export function pointMarkPad(itemHeight: number): number {
  return pointRadius(itemHeight) + 4;
}

/** Lane block: padding plus one row per packed row, and at least one row. */
export function laneBlockHeight(rows: number, itemHeight: number): number {
  const count = Math.max(rows, 1);
  const height = Math.max(itemHeight, 1);
  return LANE_PAD * 2 + count * height + (count - 1) * ROW_GAP;
}

/** Fallback when the host has not measured the item font. */
export function estimateLabelPx(title: string): number {
  return Math.ceil(title.length * LABEL_CHAR_PX);
}

/**
 * Truncate `title` so `measure` reports at most `maxPx`. A remaining collision
 * keeps a trailing ellipsis. Returns "" when even the ellipsis does not fit;
 * the caller still exposes the full title as a tooltip.
 */
export function ellipsizeToPx(title: string, maxPx: number, measure: (text: string) => number): string {
  if (!title || !(maxPx > 0)) return "";
  if (measure(title) <= maxPx) return title;
  const ellipsis = "…";
  if (measure(ellipsis) > maxPx) return "";
  let lo = 1;
  let hi = title.length;
  let best = "";
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const candidate = `${title.slice(0, mid)}${ellipsis}`;
    if (measure(candidate) <= maxPx) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/** Virtualized scene. Item x is `(days - originDays) * pxPerDay`, clipped to the overscan window. */
export function layoutScene(input: SceneLayoutInput): SceneModel {
  const width = Math.max(input.viewportWidth, 0);
  const overscan = Math.max(input.overscanPx, 0);
  const left = -overscan;
  const right = width + overscan;
  const itemHeight = Math.max(input.itemHeight, 1);
  const measure = input.labelWidth ?? estimateLabelPx;
  // packLanes reads extentTo and nothing else about the label. Copies of point
  // items carry a view-side extent that includes the measured label. Drawn
  // marks still use the original item.
  const packed = packLanes(withLabelExtents(input.items, input.scale, itemHeight, measure), input.lanes);

  const lanes: LaneBox[] = [];
  let y = 0;
  for (const [index, lane] of input.lanes.entries()) {
    const rows = packed.laneHeights.get(lane.id) ?? 1;
    const height = laneBlockHeight(rows, itemHeight);
    lanes.push({
      id: lane.id,
      label: lane.label,
      y,
      height,
      alt: index % 2 === 1,
    });
    y += height;
  }
  const contentHeight = Math.max(y, laneBlockHeight(1, itemHeight));

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
    const placed = placeItem(item, input.scale, itemY, itemHeight, left, right, selected.has(item.id), measure);
    if (placed) items.push(placed);
  }
  assignLabels(items, measure);

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

function withLabelExtents(
  items: readonly TimelineItem[],
  scale: Scale,
  itemHeight: number,
  measure: (title: string) => number
): TimelineItem[] {
  const pxPerDay = scale.pxPerDay;
  if (!(pxPerDay > 0)) return items.slice();
  return items.map((item) => {
    if (!isPoint(item)) return item;
    const reachPx = pointMarkPad(itemHeight) + measure(item.title) + LABEL_GAP;
    const extentTo = Math.max(item.extentTo, item.start + reachPx / pxPerDay);
    if (extentTo === item.extentTo) return item;
    return { ...item, extentTo };
  });
}

function placeItem(
  item: TimelineItem,
  scale: Scale,
  y: number,
  height: number,
  left: number,
  right: number,
  selected: boolean,
  measure: (title: string) => number
): ItemBox | null {
  const extent = extentOf(item);
  const point = isPoint(item);
  const tags = item.tags.join(" ");
  const base = {
    id: item.id,
    kind: item.kind,
    title: item.title,
    label: "",
    labelX: 0,
    labelOutside: false,
    tooltip: item.parseError ? `${item.title} — ${item.parseError}` : item.title,
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
    const labelReach = pointMarkPad(height) + measure(item.title);
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

function assignLabels(items: ItemBox[], measure: (title: string) => number): void {
  const groups = new Map<string, ItemBox[]>();
  for (const item of items) {
    const key = `${item.laneId}:${item.y}`;
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
    for (let index = 0; index < list.length; index++) {
      const item = list[index];
      const next = list[index + 1];
      const limit = next ? leadingEdge(next) - LABEL_GAP : Number.POSITIVE_INFINITY;
      if (item.shape === "point") {
        const labelX = item.x + pointMarkPad(item.height);
        item.labelX = labelX;
        item.label = ellipsizeToPx(item.title, limit - labelX, measure);
        item.labelOutside = false;
        continue;
      }
      const innerWidth = item.width - LABEL_TEXT_PAD * 2;
      if (measure(item.title) <= innerWidth) {
        item.labelX = item.x + LABEL_TEXT_PAD;
        item.label = item.title;
        item.labelOutside = false;
        continue;
      }
      const labelX = item.x + item.width + LABEL_TEXT_PAD;
      item.labelX = labelX;
      item.label = ellipsizeToPx(item.title, limit - labelX, measure);
      item.labelOutside = item.label.length > 0;
    }
  }
}

function leadingEdge(item: ItemBox): number {
  if (item.shape === "point") return item.x - pointRadius(item.height);
  return item.x;
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

function isPoint(item: TimelineItem): boolean {
  return item.kind === "event" && item.end === null;
}
