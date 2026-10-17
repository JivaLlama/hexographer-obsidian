import { chronologicalEras } from "../calendar/eras";
import type { CalendarEngine, DayCount, Precision } from "../calendar/types";
import type { EditCommand, FieldPatch, MoveMode, PlanMoveResult, TimelineItem } from "../types";
import { finerPrecision } from "./precision";

export interface PlanMoveOptions {
  /** Alt-drag. Snaps one precision finer and writes that finer precision back. */
  fine: boolean;
  /**
   * The note's own calendar (`calendarForItem`). Writeback keeps that format.
   * Passing the display calendar throws when it is a different id.
   */
  calendar: CalendarEngine;
}

/**
 * Plan a drag. `deltaDays` is a world-day offset (pixels converted by `Scale`).
 * A move shifts both ends by the same number of calendar units, so a leap day
 * does not slide a day-precision end off its month day. Resize moves one edge.
 * Ties in `snap` round toward the later boundary.
 */
export function planMove(
  item: TimelineItem,
  deltaDays: number,
  mode: MoveMode,
  opts: PlanMoveOptions
): PlanMoveResult {
  if (opts.calendar.def.id !== item.calendarId) {
    throw new Error(
      `planMove formats with the note's calendar "${item.calendarId}", not "${opts.calendar.def.id}"`
    );
  }
  const calendar = opts.calendar;
  let startPrecision = opts.fine ? finerPrecision(item.startPrecision) : item.startPrecision;
  let endPrecision: Precision = opts.fine
    ? finerPrecision(item.endPrecision ?? item.startPrecision)
    : item.endPrecision ?? item.startPrecision;

  let start = item.start;
  let end = item.end;

  if (mode === "move") {
    const unit = startPrecision;
    const snapped = calendar.snap(item.start + deltaDays, unit);
    const amount = unitsBetween(calendar, item.start, snapped, unit);
    start = snapped;
    if (item.end !== null) end = calendar.add(item.end, amount, unit);
  } else if (mode === "resize-start") {
    start = calendar.snap(item.start + deltaDays, startPrecision);
    if (end !== null && start > end) {
      start = end;
      startPrecision = precisionForInstant(start);
    }
  } else {
    const base = (item.end ?? item.start) + deltaDays;
    end = calendar.snap(base, endPrecision);
    if (end < start) {
      end = start;
      endPrecision = precisionForInstant(end);
    }
  }

  const startRaw = rawFor(calendar, start, startPrecision, item.source.startRaw, item.start, item.startPrecision, opts.fine);
  let endRaw: string | undefined;
  if (mode === "move" && item.end === null) {
    end = null;
    endRaw = undefined;
  } else if (end !== null) {
    endRaw = rawFor(
      calendar,
      end,
      endPrecision,
      item.source.endRaw,
      item.end,
      item.endPrecision,
      opts.fine
    );
  }

  const fields: FieldPatch[] = [];
  if (startRaw !== item.source.startRaw) {
    fields.push({ key: "start", before: item.source.startRaw, after: startRaw });
  }
  const previousEnd = item.source.endRaw;
  if ((endRaw ?? undefined) !== (previousEnd ?? undefined)) {
    fields.push({ key: "end", before: previousEnd ?? null, after: endRaw ?? null });
  }

  const command: EditCommand = {
    label: commandLabel(mode, item.title),
    patches: fields.length > 0 ? [{ path: item.source.path, fields }] : [],
  };

  return { start, end, startRaw, endRaw, command };
}

function rawFor(
  calendar: CalendarEngine,
  days: DayCount,
  precision: Precision,
  originalRaw: string | undefined,
  originalDays: DayCount | null,
  originalPrecision: Precision | null,
  fine: boolean
): string {
  if (!fine && originalRaw !== undefined && originalDays === days && originalPrecision === precision) {
    return originalRaw;
  }
  return calendar.format(calendar.fromDays(days, precision), undefined, precision);
}

function unitsBetween(calendar: CalendarEngine, from: DayCount, to: DayCount, unit: Precision): number {
  const time = calendar.def.time ?? { hoursPerDay: 24, minutesPerHour: 60 };
  if (unit === "minute") return Math.round((to - from) * time.hoursPerDay * time.minutesPerHour);
  if (unit === "hour") return Math.round((to - from) * time.hoursPerDay);
  if (unit === "day") return Math.round(to - from);
  const a = calendar.fromDays(from, "day");
  const b = calendar.fromDays(to, "day");
  const yearA = calendar.toAbsoluteYear(a);
  const yearB = calendar.toAbsoluteYear(b);
  if (unit === "year") return yearB - yearA;
  if (unit === "month") {
    return (yearB - yearA) * calendar.def.months.length + (b.month ?? 0) - (a.month ?? 0);
  }
  const eraA = calendar.eraOf(yearA);
  const eraB = calendar.eraOf(yearB);
  if (!eraA || !eraB) return 0;
  const ordered = chronologicalEras(calendar.def.eras);
  return ordered.findIndex((era) => era.id === eraB.id) - ordered.findIndex((era) => era.id === eraA.id);
}

function precisionForInstant(days: DayCount): Precision {
  return Number.isInteger(days) ? "day" : "minute";
}

function commandLabel(mode: MoveMode, title: string): string {
  const verb = mode === "move" ? "Move" : mode === "resize-start" ? "Resize start" : "Resize end";
  return title ? `${verb} ${title}` : verb;
}
