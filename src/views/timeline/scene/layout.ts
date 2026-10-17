import {
  BEFORE_RECKONING,
  eraAnchors,
  extentOf,
  formatYearsAgo,
  groupOrderedItems,
  packLanes,
  type CalendarEngine,
  type Certainty,
  type ItemKind,
  type Lane,
  type OrderedItem,
  type Scale,
  type TimelineItem,
} from "../../../core";
import { layoutTicks, type AxisTick } from "./axis";

const ROW_GAP = 4;
const LANE_PAD = 8;
const MIN_BAR_PX = 2;
const POINT_BRACKET_MIN_PX = 12;
const LABEL_GAP = 8;
const LABEL_TEXT_PAD = 6;
const LABEL_CHAR_PX = 6.6;
/** Extra row pixels when a hint is drawn under the title. */
export const HINT_LINE = 12;
/** Hint baseline, below the mark's vertical center. */
export const HINT_DROP = 13;

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
  /** Faint second line. Never written back. */
  hint: string;
  certainty?: Certainty;
  /** Order-only note. Not draggable in time. */
  ordered: boolean;
  /** Viewport-pinned before-reckoning band, rather than the panning scene. */
  pinned: boolean;
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
  /** Fixed band at the left edge when ordered items have no dated era. */
  before: { width: number; label: string } | null;
}

export interface SceneLayoutInput {
  items: readonly TimelineItem[];
  ordered?: readonly OrderedItem[];
  /** Calendars used to match an ordered note's era reference. */
  calendars?: readonly CalendarEngine[];
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

/**
 * Lane block: padding plus one slot per packed row, and at least one row.
 * `extraPx` is the hint-line space added on rows that draw a second line.
 */
export function laneBlockHeight(rows: number, itemHeight: number, extraPx = 0): number {
  const count = Math.max(rows, 1);
  const height = Math.max(itemHeight, 1);
  return LANE_PAD * 2 + count * height + Math.max(extraPx, 0) + (count - 1) * ROW_GAP;
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

/**
 * Width reserved when an ordered note has no dated era. The dated axis starts
 * to the right of this band, so panning cannot draw those items underneath it.
 */
export function beforeBandInset(
  ordered: readonly OrderedItem[],
  eras: readonly TimelineItem[],
  calendars: readonly CalendarEngine[]
): number {
  if (ordered.length === 0) return 0;
  const groups = groupOrderedItems(ordered, eraAnchors(eras, calendars));
  const eraById = new Map(eras.map((era) => [era.id, era]));
  for (const group of groups) {
    const era = eraById.get(group.eraKey);
    const extent = era ? extentOf(era) : null;
    const unbounded =
      group.unresolved ||
      group.eraKey === BEFORE_RECKONING ||
      !extent ||
      !Number.isFinite(extent.from) ||
      !Number.isFinite(extent.to) ||
      !(extent.to > extent.from);
    if (unbounded) return BEFORE_BAND_PX;
  }
  return 0;
}

/** Virtualized scene. Item x is `(days - originDays) * pxPerDay`, clipped to the overscan window. */
export function layoutScene(input: SceneLayoutInput): SceneModel {
  const eras = input.items.filter((item) => item.kind === "era");
  const calendars = input.calendars ?? [input.calendar];
  const inset = beforeBandInset(input.ordered ?? [], eras, calendars);
  const model = layoutSceneAt(input, inset);
  if (inset === 0 && model.before) return layoutSceneAt(input, model.before.width);
  return model;
}

function layoutSceneAt(input: SceneLayoutInput, inset: number): SceneModel {
  const width = Math.max(input.viewportWidth, 0);
  const overscan = Math.max(input.overscanPx, 0);
  const origin = Math.min(Math.max(inset, 0), width);
  const scale = shiftScale(input.scale, origin);
  const left = origin - overscan;
  const right = width + overscan;
  const itemHeight = Math.max(input.itemHeight, 1);
  const measure = input.labelWidth ?? estimateLabelPx;
  // labelExtent is a world-day interval. packLanes unions it with extentOf.
  // Points reserve the title and the hint. Bars reserve whichever of those
  // does not fit inside the bar. Drawn marks stay on the real extent.
  const packed = packLanes(input.items, input.lanes, {
    labelExtent(item) {
      return labelReach(item, itemHeight, input.scale.pxPerDay, measure);
    },
  });

  const datedRows = new Map<string, number>();
  for (const item of input.items) {
    if (item.kind === "era") continue;
    const laneId = item.laneId ?? "";
    const row = (packed.rows.get(item.id) ?? 0) + 1;
    datedRows.set(laneId, Math.max(datedRows.get(laneId) ?? 0, row));
  }

  const ordered = layoutOrdered({
    ordered: input.ordered ?? [],
    eras: input.items.filter((item) => item.kind === "era"),
    calendars: input.calendars ?? [input.calendar],
    scale,
    left,
    right,
    itemHeight,
    measure,
  });

  const rowHints = new Map<string, boolean[]>();
  const noteHint = (laneId: string, row: number, hint: string | undefined): void => {
    if (!hint) return;
    const flags = rowHints.get(laneId) ?? [];
    flags[row] = true;
    rowHints.set(laneId, flags);
  };
  for (const item of input.items) {
    if (item.kind === "era") continue;
    noteHint(item.laneId ?? "", packed.rows.get(item.id) ?? 0, item.displayHint);
  }
  for (const mark of ordered.marks) {
    const laneId = mark.item.laneId ?? "";
    noteHint(laneId, (datedRows.get(laneId) ?? 0) + mark.localRow, mark.item.displayHint);
  }

  const lanes: LaneBox[] = [];
  const plans = new Map<string, RowSlot[]>();
  let y = 0;
  for (const [index, lane] of input.lanes.entries()) {
    const rows = Math.max((datedRows.get(lane.id) ?? 0) + (ordered.extraRows.get(lane.id) ?? 0), 1);
    const plan = rowSlots(rows, rowHints.get(lane.id) ?? [], itemHeight);
    plans.set(lane.id, plan);
    const extra = plan.reduce((sum, slot) => sum + (slot.twoLine ? HINT_LINE : 0), 0);
    const height = laneBlockHeight(rows, itemHeight, extra);
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
  const eraBoxes: EraBox[] = [];

  for (const item of input.items) {
    if (item.kind === "era") {
      const band = placeEra(item, scale, left, right, origin);
      if (band) eraBoxes.push(band);
      continue;
    }
    const laneId = item.laneId ?? "";
    const lane = laneY.get(laneId);
    const slot = plans.get(laneId)?.[packed.rows.get(item.id) ?? 0];
    if (!lane || !slot) continue;
    const placed = placeItem(
      item,
      input.calendar,
      scale,
      lane.y + LANE_PAD + slot.offset,
      itemHeight,
      left,
      right,
      selected.has(item.id),
      measure
    );
    if (placed) items.push(placed);
  }
  assignLabels(items, measure);

  for (const placed of ordered.marks) {
    const laneId = placed.item.laneId ?? "";
    const lane = laneY.get(laneId);
    const slot = plans.get(laneId)?.[(datedRows.get(laneId) ?? 0) + placed.localRow];
    if (!lane || !slot) continue;
    items.push(orderedBox(placed, lane.y + LANE_PAD + slot.offset, itemHeight, selected.has(placed.item.id), measure));
  }

  const datedWidth = Math.max(width - origin, 1);
  const ticks = layoutTicks(input.calendar, input.scale, datedWidth, overscan, input.minLabelPx).map((tick) => ({
    ...tick,
    x: tick.x + origin,
  }));

  return {
    lanes,
    items,
    eras: eraBoxes,
    ticks,
    contentHeight,
    viewportWidth: width,
    overscanPx: overscan,
    before: ordered.before,
  };
}

interface RowSlot {
  offset: number;
  twoLine: boolean;
}

function rowSlots(count: number, hints: readonly boolean[], itemHeight: number): RowSlot[] {
  const slots: RowSlot[] = [];
  let cursor = 0;
  for (let row = 0; row < count; row++) {
    const twoLine = hints[row] === true;
    slots.push({ offset: cursor, twoLine });
    cursor += itemHeight + (twoLine ? HINT_LINE : 0);
    if (row < count - 1) cursor += ROW_GAP;
  }
  return slots;
}

/** Screen x is scale x plus the before-reckoning inset. Day mapping stays on the original scale. */
function shiftScale(scale: Scale, inset: number): Scale {
  if (!(inset > 0)) return scale;
  return {
    ...scale,
    toPx(days) {
      return scale.toPx(days) + inset;
    },
    toDays(px) {
      return scale.toDays(px - inset);
    },
  };
}

function labelReach(
  item: TimelineItem,
  itemHeight: number,
  pxPerDay: number,
  measure: (title: string) => number
): { from: number; to: number } | null {
  if (!(pxPerDay > 0)) return null;
  const titlePx = measure(item.title);
  const hintPx = item.displayHint ? measure(item.displayHint) : 0;
  const extent = extentOf(item);
  if (isPoint(item)) {
    const textPx = Math.max(titlePx, hintPx);
    if (!(textPx > 0)) return null;
    const reachDays = (pointMarkPad(itemHeight) + textPx + LABEL_GAP) / pxPerDay;
    if (!(reachDays > 0)) return null;
    return { from: item.start, to: item.start + reachDays };
  }
  const barPx = (extent.to - extent.from) * pxPerDay;
  if (!(barPx > 0)) return null;
  const inner = barPx - LABEL_TEXT_PAD * 2;
  let endPx = barPx;
  if (titlePx > inner) endPx = Math.max(endPx, barPx + LABEL_TEXT_PAD + titlePx);
  if (hintPx > inner) endPx = Math.max(endPx, LABEL_TEXT_PAD + hintPx);
  if (endPx <= barPx) return null;
  return { from: extent.from, to: extent.from + (endPx + LABEL_GAP) / pxPerDay };
}

const BEFORE_BAND_PX = 220;
const BEFORE_LABEL = "Before reckoning";

interface OrderedMark {
  item: OrderedItem;
  x: number;
  localRow: number;
  pinned: boolean;
  eraLabel: string;
  labelLimit: number;
}

function layoutOrdered(input: {
  ordered: readonly OrderedItem[];
  eras: readonly TimelineItem[];
  calendars: readonly CalendarEngine[];
  scale: Scale;
  left: number;
  right: number;
  itemHeight: number;
  measure: (title: string) => number;
}): { marks: OrderedMark[]; extraRows: Map<string, number>; before: { width: number; label: string } | null } {
  const groups = groupOrderedItems(input.ordered, eraAnchors(input.eras, input.calendars));
  const eraById = new Map(input.eras.map((era) => [era.id, era]));
  const pending: Array<Omit<OrderedMark, "localRow">> = [];
  let needsBefore = false;

  for (const group of groups) {
    const era = eraById.get(group.eraKey);
    const extent = era ? extentOf(era) : null;
    const unbounded =
      group.unresolved ||
      group.eraKey === BEFORE_RECKONING ||
      !extent ||
      !Number.isFinite(extent.from) ||
      !Number.isFinite(extent.to) ||
      !(extent.to > extent.from);
    const span = !unbounded && extent ? clipSpan(input.scale.toPx(extent.from), input.scale.toPx(extent.to), input.left, input.right) : null;
    if (unbounded || !span || span.width < 48) {
      needsBefore = true;
      const inner = BEFORE_BAND_PX - 16;
      group.items.forEach((item, index) => {
        const count = Math.max(group.items.length, 1);
        pending.push({
          item,
          x: 8 + ((index + 0.5) * inner) / count,
          pinned: true,
          eraLabel: BEFORE_LABEL,
          labelLimit: BEFORE_BAND_PX - 8,
        });
      });
      continue;
    }
    group.items.forEach((item, index) => {
      const count = Math.max(group.items.length, 1);
      const inner = Math.max(span.width - 16, 1);
      pending.push({
        item,
        x: span.x + 8 + ((index + 0.5) * inner) / count,
        pinned: false,
        eraLabel: group.label,
        labelLimit: Number.POSITIVE_INFINITY,
      });
    });
  }

  const byLane = new Map<string, Array<Omit<OrderedMark, "localRow">>>();
  for (const mark of pending) {
    const laneId = mark.item.laneId ?? "";
    const list = byLane.get(laneId);
    if (list) list.push(mark);
    else byLane.set(laneId, [mark]);
  }

  const marks: OrderedMark[] = [];
  const extraRows = new Map<string, number>();
  for (const [laneId, list] of byLane) {
    list.sort((a, b) => a.x - b.x || a.item.order - b.item.order || a.item.id.localeCompare(b.item.id));
    const rowEnds: number[] = [];
    for (const mark of list) {
      const textPx = Math.max(
        input.measure(mark.item.title),
        mark.item.displayHint ? input.measure(mark.item.displayHint) : 0
      );
      const reach = mark.x + pointMarkPad(input.itemHeight) + textPx + LABEL_GAP;
      let localRow = rowEnds.findIndex((end) => end <= mark.x - pointRadius(input.itemHeight));
      if (localRow < 0) {
        localRow = rowEnds.length;
        rowEnds.push(reach);
      } else {
        rowEnds[localRow] = reach;
      }
      marks.push({ ...mark, localRow });
    }
    extraRows.set(laneId, Math.max(rowEnds.length, 1));
  }

  const byRow = new Map<string, OrderedMark[]>();
  for (const mark of marks) {
    const key = `${mark.item.laneId ?? ""}:${mark.localRow}`;
    const list = byRow.get(key);
    if (list) list.push(mark);
    else byRow.set(key, [mark]);
  }
  for (const list of byRow.values()) {
    list.sort((a, b) => a.x - b.x);
    for (let index = 0; index < list.length; index++) {
      const mark = list[index];
      const next = list[index + 1];
      if (!mark) continue;
      let limit = next ? next.x - pointRadius(input.itemHeight) - LABEL_GAP : Number.POSITIVE_INFINITY;
      if (mark.pinned) limit = Math.min(limit, BEFORE_BAND_PX - 8);
      mark.labelLimit = limit;
    }
  }

  return {
    marks,
    extraRows,
    before: needsBefore ? { width: BEFORE_BAND_PX, label: BEFORE_LABEL } : null,
  };
}

function orderedBox(
  mark: OrderedMark,
  y: number,
  height: number,
  selected: boolean,
  measure: (title: string) => number
): ItemBox {
  const labelX = mark.x + pointMarkPad(height);
  const room = mark.labelLimit - labelX;
  const label = ellipsizeToPx(mark.item.title, room, measure);
  const hint = mark.item.displayHint ? ellipsizeToPx(mark.item.displayHint, room, measure) : "";
  return {
    id: mark.item.id,
    kind: "event",
    title: mark.item.title,
    label,
    labelX,
    labelOutside: false,
    tooltip: itemTooltip(mark.item.title, mark.item.certainty, mark.item.displayHint, mark.eraLabel),
    hint,
    ...(mark.item.certainty ? { certainty: mark.item.certainty } : {}),
    ordered: true,
    pinned: mark.pinned,
    x: mark.x,
    y,
    width: height,
    height,
    shape: "point",
    bracket: null,
    laneId: mark.item.laneId ?? "",
    tags: mark.item.tags.join(" "),
    ...(mark.item.color ? { color: mark.item.color } : {}),
    selected,
  };
}

function placeItem(
  item: TimelineItem,
  calendar: CalendarEngine,
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
    tooltip: itemTooltip(item.title, item.certainty, item.displayHint, yearsAgoLabel(calendar, item), item.parseError),
    hint: item.displayHint ?? "",
    ...(item.certainty ? { certainty: item.certainty } : {}),
    ordered: false,
    pinned: false,
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
        item.hint = fitHint(item.hint, limit - labelX, measure);
        item.labelOutside = false;
        continue;
      }
      const innerWidth = item.width - LABEL_TEXT_PAD * 2;
      if (measure(item.title) <= innerWidth) {
        item.labelX = item.x + LABEL_TEXT_PAD;
        item.label = item.title;
        item.hint = fitHint(item.hint, limit - item.labelX, measure);
        item.labelOutside = false;
        continue;
      }
      const labelX = item.x + item.width + LABEL_TEXT_PAD;
      item.labelX = labelX;
      item.label = ellipsizeToPx(item.title, limit - labelX, measure);
      item.hint = fitHint(item.hint, limit - labelX, measure);
      item.labelOutside = item.label.length > 0;
    }
  }
}

function fitHint(hint: string, maxPx: number, measure: (text: string) => number): string {
  if (!hint) return "";
  return ellipsizeToPx(hint, maxPx, measure);
}

function leadingEdge(item: ItemBox): number {
  if (item.shape === "point") return item.x - pointRadius(item.height);
  return item.x;
}

function placeEra(item: TimelineItem, scale: Scale, left: number, right: number, inset: number): EraBox | null {
  const extent = extentOf(item);
  const span = clipSpan(scale.toPx(extent.from), scale.toPx(extent.to), left, right);
  if (!span) return null;
  return {
    id: item.id,
    title: item.title,
    x: span.x,
    width: span.width,
    labelX: Math.max(span.x + 8, inset + 8),
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

function itemTooltip(
  title: string,
  certainty: Certainty | undefined,
  hint: string | undefined,
  when?: string,
  parseError?: string
): string {
  const lines = [title];
  if (when) lines.push(when);
  if (certainty) lines.push(certainty);
  if (hint) lines.push(hint);
  if (parseError) lines.push(parseError);
  return lines.join("\n");
}

/** Years-ago label for a before-present display calendar. Note text is not rewritten. */
function yearsAgoLabel(calendar: CalendarEngine, item: TimelineItem): string | undefined {
  if (calendar.def.display?.mode !== "before-present") return undefined;
  try {
    const start = formatYearsAgo(calendar.def, calendar.toAbsoluteYear(calendar.fromDays(item.start, "year")));
    if (item.end === null) return start;
    const end = formatYearsAgo(calendar.def, calendar.toAbsoluteYear(calendar.fromDays(item.end, "year")));
    return `${start} – ${end}`;
  } catch {
    return undefined;
  }
}
