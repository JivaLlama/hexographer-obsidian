import type { DayCount } from "../calendar/types";
import type { TimelineItem } from "../types";

/**
 * Occupied interval `[from, to)`. Points use the start precision's bucket
 * (`[toDays, endOfDays)`). Ranges run through the exclusive end of the end date,
 * so a year-precision end includes that whole year.
 */
export function extentOf(item: TimelineItem): { from: DayCount; to: DayCount } {
  const from = item.start;
  const to = item.extentTo;
  if (!Number.isFinite(from) || !Number.isFinite(to)) return { from, to };
  if (to < from) return { from, to: from };
  return { from, to };
}
