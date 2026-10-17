import type { Lane, TimelineItem } from "../types";
import { extentOf } from "../items/extent";

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
export function packLanes(items: readonly TimelineItem[], lanes: readonly Lane[]): PackResult {
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
      const extent = extentOf(item);
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
