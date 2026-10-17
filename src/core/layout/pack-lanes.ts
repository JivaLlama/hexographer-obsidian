import type { Lane, TimelineItem } from "../types";
import { extentOf } from "../items/extent";
import type { DayCount } from "../calendar/types";

/** Extra world-day interval a label occupies. The view converts pixels to days. */
export interface LabelExtent {
  from: DayCount;
  to: DayCount;
}

export interface PackOptions {
  /**
   * Horizontal space reserved for a label, in world days.
   * Return null to pack that item from `extentOf` alone.
   * Omit the option and every item packs exactly as before.
   */
  labelExtent?: (item: TimelineItem) => LabelExtent | null | undefined;
}

/** Lane id used for items with `laneId === null`. */
export const DEFAULT_LANE_ID = "";

export interface PackResult {
  /** Item id → row within its lane. Eras are omitted. */
  rows: Map<string, number>;
  /** Lane id → row count. Listed lanes stay at least 1 so an empty lane remains visible. */
  laneHeights: Map<string, number>;
}

/**
 * Greedy interval packing in input order. The same order always yields the same
 * rows, including after a drag that does not reorder the array. Callers that
 * re-sort by start before every pack will reshuffle rows when items cross.
 * Overlap is half-open `[from, to)`.
 */
export function packLanes(
  items: readonly TimelineItem[],
  lanes: readonly Lane[],
  options?: PackOptions
): PackResult {
  const rows = new Map<string, number>();
  const laneHeights = new Map<string, number>();
  for (const lane of lanes) laneHeights.set(lane.id, 1);

  const grouped = new Map<string, TimelineItem[]>();
  for (const item of items) {
    if (item.kind === "era") continue;
    const laneId = item.laneId ?? DEFAULT_LANE_ID;
    const list = grouped.get(laneId);
    if (list) list.push(item);
    else grouped.set(laneId, [item]);
  }

  for (const [laneId, list] of grouped) {
    const rowEnds: number[] = [];
    for (const item of list) {
      const extent = occupiedExtent(item, options);
      if (!Number.isFinite(extent.from) || !Number.isFinite(extent.to)) continue;
      let placed = -1;
      for (let row = 0; row < rowEnds.length; row++) {
        if (rowEnds[row] <= extent.from) {
          placed = row;
          rowEnds[row] = Math.max(rowEnds[row], extent.to);
          break;
        }
      }
      if (placed < 0) {
        placed = rowEnds.length;
        rowEnds.push(extent.to);
      }
      rows.set(item.id, placed);
    }
    laneHeights.set(laneId, Math.max(rowEnds.length, laneHeights.get(laneId) ?? 0, 1));
  }

  return { rows, laneHeights };
}

function occupiedExtent(item: TimelineItem, options: PackOptions | undefined): { from: number; to: number } {
  const extent = extentOf(item);
  const label = options?.labelExtent?.(item);
  if (!label || !Number.isFinite(label.from) || !Number.isFinite(label.to) || !(label.to > label.from)) {
    return extent;
  }
  if (!Number.isFinite(extent.from) || !Number.isFinite(extent.to)) return extent;
  return { from: Math.min(extent.from, label.from), to: Math.max(extent.to, label.to) };
}
