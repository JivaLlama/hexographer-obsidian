import {
  BEFORE_RECKONING,
  barsForItem,
  eraAnchors,
  extentOf,
  formatYearsAgo,
  groupOrderedItems,
  packLanes,
  type Bar,
  type CalendarEngine,
  type Certainty,
  type ItemKind,
  type Lane,
  type OrderedItem,
  type Scale,
  type TimelineItem,
  type VaultSettings,
} from "../../../core";
import { layoutTicks, type AxisTick } from "./axis";
import {
  boundsSpan,
  barDateTooltip,
  boundsTooltip,
  cultureForItem,
  cultureTagText,
  ghostBarLabel,
  ghostSpan,
  prepareDated,
  writtenStart,
  type DatedEntry,
  type DrawSpan,
  type NoticeChip,
} from "./placed";

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
  /** Fuzzy edge before the solid core, in scene pixels. */
  featherLead?: { x: number; width: number };
  /** Fuzzy edge after the solid core, in scene pixels. */
  featherTrail?: { x: number; width: number };
  /** Unresolved-anchor warning. The item is drawn when bounds exist. */
  warning?: string;
  /** Account primary, for example `(South)`. Drawn smaller than the title. */
  cultureTag?: string;
  /** Account or swapped-note bar. Not packed by `packLanes`. */
  ghost?: boolean;
  accountIndex?: number;
  by?: string;
  claim?: string;
  /** Parse error, or no movable date. The pointer machine will not drag it. */
  locked?: boolean;
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
  /** Cycles and parse errors. Cycles are not drawn on the axis. */
  errors: NoticeChip[];
  /** Notes with a warning and no bounds, such as an unresolved anchor. */
  warnings: NoticeChip[];
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
  /** Vault units for `resolveDates`. Omitted units leave custom gaps unresolved. */
  settings?: VaultSettings;
  /** Which ghost bars to draw. `true` is every account; a list matches `by`. */
  accounts?: boolean | string[];
  /** Culture timeline. The first matching account becomes the primary bar. */
  cultures?: readonly string[];
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

/** Lane-name column. Short names keep the theme width; long names grow up to the cap. */
export const LANE_COL_MIN_PX = 148;
export const LANE_COL_MAX_PX = 240;

export function laneColumnWidth(
  labels: readonly string[],
  measure: (text: string) => number,
  pad = 16
): number {
  let widest = 0;
  for (const label of labels) widest = Math.max(widest, measure(label));
  return Math.min(LANE_COL_MAX_PX, Math.max(LANE_COL_MIN_PX, Math.ceil(widest + pad)));
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
  const prepared = prepareDated(input.items, input.settings, input.calendars ?? [input.calendar], {
    ...(input.accounts !== undefined ? { accounts: input.accounts } : {}),
    cultureFor: (item) => cultureForItem(item, input.cultures ? { cultures: [...input.cultures] } : undefined),
  });
  const entryById = new Map(prepared.entries.map((entry) => [entry.item.id, entry]));
  // labelExtent is a world-day interval. packLanes unions it with extentOf.
  // Exact written dates reserve the title the way they always have.
  // Relative and fuzzy notes reserve the resolved span, not item.start.
  const packed = packLanes(
    prepared.entries.map((entry) => entry.packItem),
    input.lanes,
    {
      labelExtent(item) {
        const entry = entryById.get(item.id);
        if (!entry || entry.native) return labelReach(entry?.item ?? item, itemHeight, input.scale.pxPerDay, measure);
        return spanLabelReach(entry, itemHeight, input.scale.pxPerDay, measure);
      },
    }
  );
  const ghosts = assignGhostRows(prepared.entries, packed.rows, scale, itemHeight, measure);

  const datedRows = new Map<string, number>();
  for (const entry of prepared.entries) {
    const laneId = entry.item.laneId ?? "";
    let row = (packed.rows.get(entry.item.id) ?? 0) + 1;
    for (const ghost of ghosts.get(entry.item.id) ?? []) row = Math.max(row, ghost.row + 1);
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
    ...(input.accounts !== undefined ? { accounts: input.accounts } : {}),
    ...(input.cultures ? { cultures: input.cultures } : {}),
  });

  const rowHints = new Map<string, boolean[]>();
  const noteHint = (laneId: string, row: number, hint: string | undefined): void => {
    if (!hint) return;
    const flags = rowHints.get(laneId) ?? [];
    flags[row] = true;
    rowHints.set(laneId, flags);
  };
  for (const entry of prepared.entries) {
    noteHint(entry.item.laneId ?? "", packed.rows.get(entry.item.id) ?? 0, entry.item.displayHint);
  }
  for (const mark of ordered.marks) {
    if (mark.ghost) continue;
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
    if (item.kind !== "era") continue;
    const band = placeEra(item, scale, left, right, origin, prepared.notes.get(item.id));
    if (band) eraBoxes.push(band);
  }

  for (const entry of prepared.entries) {
    const laneId = entry.item.laneId ?? "";
    const lane = laneY.get(laneId);
    const slot = plans.get(laneId)?.[packed.rows.get(entry.item.id) ?? 0];
    if (!lane || !slot) continue;
    const y = lane.y + LANE_PAD + slot.offset;
    const placed = entry.native
      ? placeItem(entry.item, input.calendar, scale, y, itemHeight, left, right, selected.has(entry.item.id), measure)
      : placeFromSpan(
          entry.item,
          entry.span,
          entry.note,
          input.calendar,
          scale,
          y,
          itemHeight,
          left,
          right,
          selected.has(entry.item.id) || selected.has(entry.bars.primary.id),
          measure
        );
    if (placed) {
      if (entry.warning) placed.warning = entry.warning;
      if (entry.item.parseError) placed.locked = true;
      const primary = entry.bars.primary;
      if (primary.accountIndex !== undefined) {
        placed.id = primary.id;
        placed.accountIndex = primary.accountIndex;
        placed.tooltip = barDateTooltip(entry.item, input.calendar, entry.span, {
          ...(primary.culture ? { by: primary.culture } : {}),
          ...(primary.claim ? { claim: primary.claim } : {}),
        });
        if (primary.culture) placed.by = primary.culture;
        if (primary.claim) placed.claim = primary.claim;
        const tag = cultureTagText(primary.culture);
        if (tag) placed.cultureTag = tag;
      }
      items.push(placed);
    }
    for (const ghost of ghosts.get(entry.item.id) ?? []) {
      const ghostSlot = plans.get(laneId)?.[ghost.row];
      if (!lane || !ghostSlot) continue;
      const box = placeGhost(
        entry,
        ghost,
        input.calendar,
        scale,
        lane.y + LANE_PAD + ghostSlot.offset,
        itemHeight,
        left,
        right,
        selected.has(ghost.bar.id),
        measure
      );
      if (box) items.push(box);
    }
  }
  assignLabels(items, measure);

  for (const placed of ordered.marks) {
    const laneId = placed.item.laneId ?? "";
    const lane = laneY.get(laneId);
    const slot = plans.get(laneId)?.[(datedRows.get(laneId) ?? 0) + placed.localRow];
    if (!lane || !slot) continue;
    items.push(orderedBox(placed, lane.y + LANE_PAD + slot.offset, itemHeight, selected.has(placed.barId), measure));
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
    errors: prepared.errors,
    warnings: prepared.warnings,
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

interface GhostSeat {
  bar: Bar;
  span: DrawSpan;
  row: number;
}

function assignGhostRows(
  entries: readonly DatedEntry[],
  rows: ReadonlyMap<string, number>,
  scale: Scale,
  itemHeight: number,
  measure: (title: string) => number
): Map<string, GhostSeat[]> {
  const occupied = new Map<string, Map<number, { from: number; to: number }[]>>();
  const seats = new Map<string, GhostSeat[]>();

  const add = (laneId: string, row: number, span: { from: number; to: number }): void => {
    let lane = occupied.get(laneId);
    if (!lane) {
      lane = new Map();
      occupied.set(laneId, lane);
    }
    const list = lane.get(row) ?? [];
    list.push(span);
    lane.set(row, list);
  };
  const overlaps = (laneId: string, row: number, span: { from: number; to: number }): boolean => {
    const list = occupied.get(laneId)?.get(row) ?? [];
    return list.some((other) => other.from < span.to && span.from < other.to);
  };

  for (const entry of entries) {
    const row = rows.get(entry.item.id) ?? 0;
    const primaryText =
      entry.bars.primary.accountIndex !== undefined
        ? `${entry.item.title} ${cultureTagText(entry.bars.primary.culture)}`.trim()
        : entry.item.title;
    add(entry.item.laneId ?? "", row, pixelOccupancy(entry.span, primaryText, entry.item.displayHint, scale, itemHeight, measure));
  }

  for (const entry of entries) {
    const laneId = entry.item.laneId ?? "";
    const base = rows.get(entry.item.id) ?? 0;
    const placed: GhostSeat[] = [];
    for (const bar of entry.bars.ghosts) {
      const span = ghostSpan(entry.item, entry.note, bar);
      if (!span) continue;
      const label = ghostBarLabel(bar);
      const pixels = pixelOccupancy(span, label, undefined, scale, itemHeight, measure);
      let row = base;
      while (overlaps(laneId, row, pixels)) row += 1;
      add(laneId, row, pixels);
      placed.push({ bar, span, row });
    }
    if (placed.length > 0) seats.set(entry.item.id, placed);
  }
  return seats;
}

function pixelOccupancy(
  span: DrawSpan,
  title: string,
  hint: string | undefined,
  scale: Scale,
  itemHeight: number,
  measure: (title: string) => number
): { from: number; to: number } {
  const titlePx = measure(title);
  const hintPx = hint ? measure(hint) : 0;
  const minX = scale.toPx(span.min);
  const maxX = scale.toPx(Math.max(span.max, span.coreTo, span.coreFrom));
  if (span.point) {
    const x = scale.toPx(span.coreFrom);
    const right = x + pointMarkPad(itemHeight) + Math.max(titlePx, hintPx) + LABEL_GAP;
    return { from: Math.min(minX, x - pointRadius(itemHeight)), to: Math.max(maxX, right) };
  }
  const corePx = Math.max(scale.toPx(span.coreTo) - scale.toPx(span.coreFrom), 0);
  const inner = corePx - LABEL_TEXT_PAD * 2;
  let right = maxX;
  if (titlePx > inner) right = Math.max(right, scale.toPx(span.coreTo) + LABEL_TEXT_PAD + titlePx + LABEL_GAP);
  if (hintPx > inner) right = Math.max(right, scale.toPx(span.coreFrom) + LABEL_TEXT_PAD + hintPx + LABEL_GAP);
  return { from: minX, to: right };
}

function spanLabelReach(
  entry: DatedEntry,
  itemHeight: number,
  pxPerDay: number,
  measure: (title: string) => number
): { from: number; to: number } | null {
  if (!(pxPerDay > 0)) return null;
  const span = entry.span;
  const tag = entry.bars.primary.accountIndex !== undefined ? cultureTagText(entry.bars.primary.culture) : "";
  const titlePx = measure(entry.item.title) + (tag ? measure(tag) + 4 : 0);
  const hintPx = entry.item.displayHint ? measure(entry.item.displayHint) : 0;
  if (span.point) {
    const reachDays = (pointMarkPad(itemHeight) + Math.max(titlePx, hintPx) + LABEL_GAP) / pxPerDay;
    const from = Math.min(span.min, span.coreFrom);
    const to = Math.max(span.max, span.packTo, span.coreFrom + reachDays);
    return to > from ? { from, to } : null;
  }
  const barPx = Math.max(span.coreTo - span.coreFrom, 0) * pxPerDay;
  const inner = barPx - LABEL_TEXT_PAD * 2;
  let endPx = Math.max(span.packTo - span.min, span.coreTo - span.min) * pxPerDay;
  if (titlePx > inner) endPx = Math.max(endPx, (span.coreTo - span.min) * pxPerDay + LABEL_TEXT_PAD + titlePx + LABEL_GAP);
  if (hintPx > inner) endPx = Math.max(endPx, LABEL_TEXT_PAD + hintPx + LABEL_GAP);
  if (!(endPx > 0)) return null;
  return { from: span.min, to: span.min + endPx / pxPerDay };
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
  /** Bar order. Account ghosts can differ from the note's order. */
  order: number;
  x: number;
  localRow: number;
  pinned: boolean;
  eraLabel: string;
  labelLimit: number;
  labelText: string;
  barId: string;
  ghost: boolean;
  claim?: string;
  by?: string;
  accountIndex?: number;
  certainty?: Certainty;
}

interface OrderedSlot {
  item: OrderedItem;
  order: number;
  labelText: string;
  barId: string;
  ghost: boolean;
  claim?: string;
  by?: string;
  accountIndex?: number;
  certainty?: Certainty;
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
  accounts?: boolean | string[];
  cultures?: readonly string[];
}): { marks: OrderedMark[]; extraRows: Map<string, number>; before: { width: number; label: string } | null } {
  const groups = groupOrderedItems(input.ordered, eraAnchors(input.eras, input.calendars));
  const eraById = new Map(input.eras.map((era) => [era.id, era]));
  const pending: Array<Omit<OrderedMark, "localRow">> = [];
  let needsBefore = false;
  const filters = input.cultures ? { cultures: [...input.cultures] } : undefined;

  const pushSlots = (
    slots: readonly OrderedSlot[],
    origin: number,
    inner: number,
    pinned: boolean,
    eraLabel: string,
    labelLimit: number
  ): void => {
    const xAt = xForOrders(slots, origin, inner);
    for (const slot of slots) {
      pending.push({
        item: slot.item,
        order: slot.order,
        x: xAt(slot.order),
        pinned,
        eraLabel,
        labelLimit,
        labelText: slot.labelText,
        barId: slot.barId,
        ghost: slot.ghost,
        ...(slot.claim ? { claim: slot.claim } : {}),
        ...(slot.by ? { by: slot.by } : {}),
        ...(slot.accountIndex !== undefined ? { accountIndex: slot.accountIndex } : {}),
        ...(slot.certainty ? { certainty: slot.certainty } : {}),
      });
    }
  };

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
    const slots = group.items.flatMap((item) => orderedSlots(item, input.accounts, cultureForItem(item, filters)));
    const span = !unbounded && extent ? clipSpan(input.scale.toPx(extent.from), input.scale.toPx(extent.to), input.left, input.right) : null;
    if (unbounded || !span || span.width < 48) {
      needsBefore = true;
      pushSlots(slots, 8, BEFORE_BAND_PX - 16, true, BEFORE_LABEL, BEFORE_BAND_PX - 8);
      continue;
    }
    pushSlots(slots, span.x + 8, Math.max(span.width - 16, 1), false, group.label, Number.POSITIVE_INFINITY);
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
    list.sort((a, b) => a.x - b.x || a.order - b.order || a.barId.localeCompare(b.barId));
    const rowEnds: number[] = [];
    for (const mark of list) {
      const hintPx = mark.ghost || !mark.item.displayHint ? 0 : input.measure(mark.item.displayHint);
      const textPx = Math.max(input.measure(mark.labelText), hintPx);
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
    list.sort((a, b) => a.x - b.x || a.order - b.order);
    for (let index = list.length - 1; index >= 0; index--) {
      const mark = list[index];
      if (!mark?.pinned) continue;
      const hintPx = mark.ghost || !mark.item.displayHint ? 0 : input.measure(mark.item.displayHint);
      const textPx = Math.max(input.measure(mark.labelText), hintPx);
      const roomNeed = pointMarkPad(input.itemHeight) + textPx + LABEL_GAP;
      const maxX = BEFORE_BAND_PX - 8 - roomNeed;
      const prev = list[index - 1];
      const minX = prev ? prev.x + pointRadius(input.itemHeight) * 2 + LABEL_GAP : 8;
      const next = list[index + 1];
      const maxByNext = next ? next.x - pointRadius(input.itemHeight) * 2 - LABEL_GAP : Number.POSITIVE_INFINITY;
      const target = Math.min(mark.x, maxX, maxByNext);
      mark.x = Math.max(minX, Math.max(8, target));
    }
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

/** Even slots for distinct orders. The same order shares an x, so those bars stack on collision. */
function xForOrders(slots: readonly OrderedSlot[], origin: number, inner: number): (order: number) => number {
  const orders = [...new Set(slots.map((slot) => slot.order))].sort((a, b) => a - b);
  const count = Math.max(orders.length, 1);
  const at = new Map(orders.map((order, index) => [order, origin + ((index + 0.5) * inner) / count]));
  return (order) => at.get(order) ?? origin;
}

/**
 * The note plus any order-only account ghosts from `barsForItem`.
 * A dated account on an order-only note is not placed here.
 */
function orderedSlots(
  item: OrderedItem,
  accounts: boolean | string[] | undefined,
  culture: string | undefined
): OrderedSlot[] {
  const bars = barsForItem(item, {
    ...(culture ? { culture } : {}),
    ...(accounts !== undefined ? { accounts } : {}),
  });
  const slots: OrderedSlot[] = [];
  const primary = bars.primary;
  const primaryIsAccount = primary.accountIndex !== undefined;
  slots.push({
    item,
    order: primary.order ?? item.order,
    labelText: primaryIsAccount ? primary.culture?.trim() || item.title : item.title,
    barId: primary.id,
    ghost: false,
    ...(primary.claim ? { claim: primary.claim } : {}),
    ...(primaryIsAccount && primary.culture ? { by: primary.culture } : {}),
    ...(primaryIsAccount ? { accountIndex: primary.accountIndex } : {}),
    certainty: primary.certainty ?? item.certainty,
  });
  for (const ghost of bars.ghosts) {
    if (ghost.order === undefined) continue;
    slots.push({
      item,
      order: ghost.order,
      labelText: ghost.culture?.trim() || (ghost.notePrimary ? "note date" : "account"),
      barId: ghost.id,
      ghost: true,
      ...(ghost.claim ? { claim: ghost.claim } : {}),
      ...(ghost.culture ? { by: ghost.culture } : {}),
      ...(ghost.accountIndex !== undefined ? { accountIndex: ghost.accountIndex } : {}),
      ...(ghost.certainty ? { certainty: ghost.certainty } : {}),
    });
  }
  return slots;
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
  const label = ellipsizeToPx(mark.labelText, room, measure);
  const hint = mark.ghost || !mark.item.displayHint ? "" : ellipsizeToPx(mark.item.displayHint, room, measure);
  const certainty = mark.certainty ?? mark.item.certainty;
  const tooltip = mark.ghost
    ? [mark.item.title, mark.by ? `by ${mark.by}` : "", mark.claim, mark.eraLabel, certainty].filter((line) => Boolean(line)).join("\n")
    : itemTooltip(mark.item.title, certainty, mark.item.displayHint, mark.eraLabel, mark.claim);
  return {
    id: mark.barId,
    kind: "event",
    title: mark.labelText,
    label,
    labelX,
    labelOutside: false,
    tooltip,
    hint,
    ...(certainty ? { certainty } : {}),
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
    ...(mark.ghost || !mark.item.color ? {} : { color: mark.item.color }),
    ...(mark.ghost ? { ghost: true } : {}),
    ...(mark.accountIndex !== undefined ? { accountIndex: mark.accountIndex } : {}),
    ...(mark.by ? { by: mark.by } : {}),
    ...(mark.claim ? { claim: mark.claim } : {}),
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
      const tagPx = item.cultureTag ? measure(item.cultureTag) + 4 : 0;
      if (item.shape === "point") {
        const labelX = item.x + pointMarkPad(item.height);
        item.labelX = labelX;
        item.label = ellipsizeToPx(item.title, limit - labelX - tagPx, measure);
        item.hint = fitHint(item.hint, limit - labelX - tagPx, measure);
        item.labelOutside = false;
        continue;
      }
      const innerWidth = item.width - LABEL_TEXT_PAD * 2 - tagPx;
      if (measure(item.title) <= innerWidth) {
        item.labelX = item.x + LABEL_TEXT_PAD;
        item.label = item.title;
        item.hint = fitHint(item.hint, limit - item.labelX - tagPx, measure);
        item.labelOutside = false;
        continue;
      }
      const labelX = item.x + item.width + LABEL_TEXT_PAD;
      item.labelX = labelX;
      item.label = ellipsizeToPx(item.title, limit - labelX - tagPx, measure);
      item.hint = fitHint(item.hint, limit - labelX - tagPx, measure);
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

function placeFromSpan(
  item: TimelineItem,
  span: DrawSpan,
  note: DatedEntry["note"],
  calendar: CalendarEngine,
  scale: Scale,
  y: number,
  height: number,
  left: number,
  right: number,
  selected: boolean,
  measure: (title: string) => number
): ItemBox | null {
  const occupancy = pixelOccupancy(span, item.title, item.displayHint, scale, height, measure);
  if (occupancy.to < left || occupancy.from > right) return null;
  const feathers = featherPixels(span, scale);
  const box = spanBox(item, span, scale, y, height, left, right, selected);
  if (!box) return null;
  box.tooltip = boundsTooltip(item, note, calendar);
  return { ...box, ...feathers };
}

function placeGhost(
  entry: DatedEntry,
  seat: GhostSeat,
  calendar: CalendarEngine,
  scale: Scale,
  y: number,
  height: number,
  left: number,
  right: number,
  selected: boolean,
  measure: (title: string) => number
): ItemBox | null {
  const label = ghostBarLabel(seat.bar);
  const occupancy = pixelOccupancy(seat.span, label, undefined, scale, height, measure);
  if (occupancy.to < left || occupancy.from > right) return null;
  const box = spanBox(entry.item, seat.span, scale, y, height, left, right, selected);
  if (!box) return null;
  box.id = seat.bar.id;
  box.title = label;
  box.tooltip =
    seat.bar.accountIndex !== undefined
      ? barDateTooltip(entry.item, calendar, seat.span, {
          ...(seat.bar.culture ? { by: seat.bar.culture } : {}),
          ...(seat.bar.claim ? { claim: seat.bar.claim } : {}),
        })
      : boundsTooltip(entry.item, entry.note, calendar, {
          ...(seat.bar.culture ? { by: seat.bar.culture } : {}),
          ...(seat.bar.claim ? { claim: seat.bar.claim } : {}),
        });
  box.ghost = true;
  if (seat.bar.accountIndex !== undefined) box.accountIndex = seat.bar.accountIndex;
  if (seat.bar.culture) box.by = seat.bar.culture;
  if (seat.bar.claim) box.claim = seat.bar.claim;
  if (seat.bar.certainty) box.certainty = seat.bar.certainty;
  const feathers = featherPixels(seat.span, scale);
  return { ...box, ...feathers };
}

function spanBox(
  item: TimelineItem,
  span: DrawSpan,
  scale: Scale,
  y: number,
  height: number,
  left: number,
  right: number,
  selected: boolean
): ItemBox | null {
  const tags = item.tags.join(" ");
  const base = {
    id: item.id,
    kind: item.kind,
    title: item.title,
    label: "",
    labelX: 0,
    labelOutside: false,
    tooltip: item.title,
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
  if (span.point) {
    const x = scale.toPx(span.coreFrom);
    return { ...base, x, width: height, shape: "point", bracket: null };
  }
  const clipped = clipSpan(scale.toPx(span.coreFrom), scale.toPx(span.coreTo), left, right);
  if (!clipped) {
    const x = scale.toPx(span.coreFrom);
    if (x < left || x > right) return null;
    return { ...base, x, width: height, shape: "point", bracket: null };
  }
  return { ...base, x: clipped.x, width: Math.max(clipped.width, MIN_BAR_PX), shape: "bar", bracket: null };
}

function featherPixels(span: DrawSpan, scale: Scale): Pick<ItemBox, "featherLead" | "featherTrail"> {
  const solidTo = span.point ? span.coreFrom : span.coreTo;
  const lead =
    span.leadFrom !== null && span.leadFrom < span.coreFrom
      ? { x: scale.toPx(span.leadFrom), width: scale.toPx(span.coreFrom) - scale.toPx(span.leadFrom) }
      : undefined;
  const trail =
    span.trailTo !== null && span.trailTo > solidTo
      ? { x: scale.toPx(solidTo), width: scale.toPx(span.trailTo) - scale.toPx(solidTo) }
      : undefined;
  return {
    ...(lead && lead.width > 0.5 ? { featherLead: lead } : {}),
    ...(trail && trail.width > 0.5 ? { featherTrail: trail } : {}),
  };
}

function placeEra(
  item: TimelineItem,
  scale: Scale,
  left: number,
  right: number,
  inset: number,
  note: DatedEntry["note"]
): EraBox | null {
  const resolved = !writtenStart(item) ? boundsSpan(note) : null;
  const extent = resolved ? { from: resolved.min, to: resolved.max > resolved.min ? resolved.max : resolved.min + 1 } : extentOf(item);
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
