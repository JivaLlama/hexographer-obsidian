import { chronologicalEras } from "./eras";
import { formatYearsAgo } from "./format";
import { mod } from "../num";
import type { CalendarEngine, DayCount, Tick, TickUnit } from "./types";

const MAX_TICKS = 400;
const ORDER: readonly TickUnit[] = [
  "hour",
  "day",
  "week",
  "month",
  "year",
  "decade",
  "century",
  "millennium",
  "era",
];

export function buildTicks(
  engine: CalendarEngine,
  range: { from: DayCount; to: DayCount },
  pxPerDay: number,
  minLabelPx: number
): { major: Tick[]; minor: Tick[] } {
  if (!(pxPerDay > 0) || !(minLabelPx > 0) || !(range.to > range.from)) {
    return { major: [], minor: [] };
  }
  const approx = approximateDays(engine);
  const minDays = minLabelPx / pxPerDay;
  let chosen: TickUnit = "millennium";
  for (const unit of ORDER) {
    if (unit === "week" && engine.def.weekdays.length === 0) continue;
    if (unit === "era" && engine.def.eras.length === 0) continue;
    if (approx[unit] >= minDays) {
      chosen = unit;
      break;
    }
  }

  let index = ORDER.indexOf(chosen);
  let unit = chosen;
  let stride = 1;
  while (index < ORDER.length) {
    unit = ORDER[index];
    if ((unit === "week" && engine.def.weekdays.length === 0) || (unit === "era" && engine.def.eras.length === 0)) {
      index++;
      continue;
    }
    const count = (range.to - range.from) / approx[unit];
    if (count <= MAX_TICKS) {
      stride = 1;
      break;
    }
    if (unit !== "era") {
      stride = Math.max(1, Math.ceil(count / MAX_TICKS));
      break;
    }
    index++;
  }
  if (index >= ORDER.length) {
    unit = "millennium";
    stride = Math.max(1, Math.ceil((range.to - range.from) / approx.millennium / MAX_TICKS));
  }

  const major = collect(engine, range, unit, stride, true);
  const minorUnit = previousUnit(unit, engine);
  const minor = minorUnit
    ? collect(engine, range, minorUnit, 1, false).filter((tick) => !major.some((item) => item.days === tick.days))
    : [];
  return { major, minor: cap(minor) };
}

function approximateDays(engine: CalendarEngine): Record<TickUnit, number> {
  let total = 0;
  const sample = 48;
  for (let year = 1; year <= sample; year++) total += engine.daysInYear(year);
  const avgYear = total / sample;
  const hours = engine.def.time?.hoursPerDay ?? 24;
  const week = engine.def.weekdays.length > 0 ? engine.def.weekdays.length : 7;
  return {
    hour: 1 / hours,
    day: 1,
    week,
    month: avgYear / Math.max(engine.def.months.length, 1),
    year: avgYear,
    decade: avgYear * 10,
    century: avgYear * 100,
    millennium: avgYear * 1000,
    era: Math.max(avgYear * 100, 1),
  };
}

function previousUnit(unit: TickUnit, engine: CalendarEngine): TickUnit | null {
  let index = ORDER.indexOf(unit) - 1;
  while (index >= 0) {
    const candidate = ORDER[index];
    if (candidate === "week" && engine.def.weekdays.length === 0) {
      index--;
      continue;
    }
    return candidate;
  }
  return null;
}

function collect(
  engine: CalendarEngine,
  range: { from: DayCount; to: DayCount },
  unit: TickUnit,
  stride: number,
  major: boolean
): Tick[] {
  if (unit === "era") return eraTicks(engine, range, major);
  const ticks: Tick[] = [];
  let cursor = align(engine, range.from, unit);
  let guard = 0;
  while (cursor < range.to && ticks.length < MAX_TICKS && guard < 8000) {
    if (cursor >= range.from) {
      ticks.push({
        days: cursor,
        label: tickLabel(engine, cursor, unit),
        unit,
        major,
      });
    }
    const next = advance(engine, cursor, unit, stride);
    if (!(next > cursor)) break;
    cursor = next;
    guard++;
  }
  return ticks;
}

function cap(ticks: Tick[]): Tick[] {
  if (ticks.length <= MAX_TICKS) return ticks;
  const step = Math.ceil(ticks.length / MAX_TICKS);
  return ticks.filter((_tick, index) => index % step === 0);
}

function align(engine: CalendarEngine, days: DayCount, unit: TickUnit): DayCount {
  if (unit === "hour") return engine.startOf(days, "hour");
  if (unit === "day") return engine.startOf(days, "day");
  if (unit === "month") return engine.startOf(days, "month");
  if (unit === "year") return engine.startOf(days, "year");
  if (unit === "week") {
    const week = Math.max(engine.def.weekdays.length, 1);
    const local = Math.floor(days - engine.def.epochOffset);
    const aligned = local - mod(local, week);
    return aligned + engine.def.epochOffset;
  }
  const size = unit === "decade" ? 10 : unit === "century" ? 100 : 1000;
  const yearStart = engine.startOf(days, "year");
  const abs = engine.toAbsoluteYear(engine.fromDays(yearStart, "year"));
  const floored = abs - mod(abs, size);
  return engine.add(yearStart, floored - abs, "year");
}

function advance(engine: CalendarEngine, days: DayCount, unit: TickUnit, stride: number): DayCount {
  if (unit === "hour") return engine.add(days, stride, "hour");
  if (unit === "day") return engine.add(days, stride, "day");
  if (unit === "week") return engine.add(days, stride * Math.max(engine.def.weekdays.length, 1), "day");
  if (unit === "month") return engine.add(days, stride, "month");
  if (unit === "year") return engine.add(days, stride, "year");
  if (unit === "decade") return engine.add(days, 10 * stride, "year");
  if (unit === "century") return engine.add(days, 100 * stride, "year");
  if (unit === "millennium") return engine.add(days, 1000 * stride, "year");
  return days;
}

function eraTicks(engine: CalendarEngine, range: { from: DayCount; to: DayCount }, major: boolean): Tick[] {
  const ticks: Tick[] = [];
  for (const era of chronologicalEras(engine.def.eras)) {
    const days = engine.toDays({ era: era.id, year: 1, precision: "era" });
    if (!Number.isFinite(days) || days < range.from || days >= range.to) continue;
    ticks.push({ days, label: era.abbr, unit: "era", major });
  }
  return ticks;
}

function tickLabel(engine: CalendarEngine, days: DayCount, unit: TickUnit): string {
  if (unit === "hour") return engine.format(days, undefined, "hour");
  if (unit === "day" || unit === "week") return engine.format(days, undefined, "day");
  if (unit === "month") return engine.format(days, undefined, "month");
  if (engine.def.display?.mode === "before-present") {
    const date = engine.fromDays(days, "year");
    return formatYearsAgo(engine.def, engine.toAbsoluteYear(date));
  }
  return engine.format(days, undefined, "year");
}
