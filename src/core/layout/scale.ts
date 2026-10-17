import type { CalendarEngine, DayCount } from "../calendar/types";

export interface ScaleLimits {
  minPxPerDay: number;
  maxPxPerDay: number;
}

export interface Scale {
  readonly originDays: DayCount;
  readonly pxPerDay: number;
  readonly minPxPerDay: number;
  readonly maxPxPerDay: number;
  toPx(days: DayCount): number;
  toDays(px: number): number;
  /** Zoom around a viewport x, keeping the day under that pixel fixed. */
  zoomAt(px: number, factor: number): Scale;
  /** Clamp `pxPerDay` into `[minPxPerDay, maxPxPerDay]`. */
  clamp(): Scale;
}

export interface ScaleInit {
  originDays?: DayCount;
  pxPerDay?: number;
  minPxPerDay: number;
  maxPxPerDay: number;
}

/**
 * Pixel mapping relative to `originDays`. The view should re-base `originDays`
 * on zoom and pan end so SVG coordinates stay near zero at deep time.
 */
export function createScale(init: ScaleInit): Scale {
  const minPxPerDay = init.minPxPerDay;
  const maxPxPerDay = Math.max(init.maxPxPerDay, minPxPerDay);
  const pxPerDay = clampNumber(init.pxPerDay ?? 1, minPxPerDay, maxPxPerDay);
  const originDays = init.originDays ?? 0;
  const scale: Scale = {
    originDays,
    pxPerDay,
    minPxPerDay,
    maxPxPerDay,
    toPx(days: DayCount): number {
      return (days - scale.originDays) * scale.pxPerDay;
    },
    toDays(px: number): number {
      return scale.originDays + px / scale.pxPerDay;
    },
    zoomAt(px: number, factor: number): Scale {
      if (!(factor > 0)) return scale;
      const focus = scale.toDays(px);
      const next = clampNumber(scale.pxPerDay * factor, minPxPerDay, maxPxPerDay);
      return createScale({
        originDays: focus - px / next,
        pxPerDay: next,
        minPxPerDay,
        maxPxPerDay,
      });
    },
    clamp(): Scale {
      return createScale({
        originDays: scale.originDays,
        pxPerDay: scale.pxPerDay,
        minPxPerDay,
        maxPxPerDay,
      });
    },
  };
  return scale;
}

export interface ScaleLimitOptions {
  /** Viewport width used for the minimum zoom. Default 1280. */
  viewportPx?: number;
  /** How many pixels one minute should be at maximum zoom. Default 8. */
  minutePx?: number;
  /** Span used when the calendar's eras are not all bounded. Default 10000 years. */
  spanYears?: number;
}

/**
 * `maxPxPerDay` shows one minute as `minutePx`.
 * `minPxPerDay` fits the bounded era span, or `spanYears`, across `viewportPx`.
 */
export function scaleLimitsForCalendar(calendar: CalendarEngine, options: ScaleLimitOptions = {}): ScaleLimits {
  const viewportPx = options.viewportPx ?? 1280;
  const minutePx = options.minutePx ?? 8;
  const time = calendar.def.time ?? { hoursPerDay: 24, minutesPerHour: 60 };
  const maxPxPerDay = minutePx * time.hoursPerDay * time.minutesPerHour;
  const years = options.spanYears ?? boundedSpanYears(calendar) ?? 10_000;
  const avg = averageYearLength(calendar);
  const spanDays = Math.max(years * avg, 1);
  const minPxPerDay = Math.min(viewportPx / spanDays, maxPxPerDay);
  return { minPxPerDay, maxPxPerDay };
}

function boundedSpanYears(calendar: CalendarEngine): number | null {
  if (calendar.def.eras.length === 0) return null;
  if (calendar.def.eras.some((era) => era.endYear === undefined)) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const era of calendar.def.eras) {
    const start = era.backward ? (era.endYear ?? era.startYear) : era.startYear;
    const end = era.backward ? era.startYear : (era.endYear ?? era.startYear);
    lo = Math.min(lo, start);
    hi = Math.max(hi, end);
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return null;
  return hi - lo;
}

function averageYearLength(calendar: CalendarEngine): number {
  let total = 0;
  const sample = 48;
  for (let year = 1; year <= sample; year++) total += calendar.daysInYear(year);
  return total / sample;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
