import { absoluteToLabelYear, absoluteYearOf, chronologicalEras, eraCovers, eraYearOf, findEra, labelYearToAbsolute } from "./eras";
import { compileFormats, formatDate, formatPattern, parseWithFormats } from "./format";
import { prepareMath, type PreparedCalendar } from "./math";
import { buildTicks } from "./ticks";
import type {
  CalendarDate,
  CalendarDef,
  CalendarEngine,
  DayCount,
  EraDef,
  ParseResult,
  Precision,
  Tick,
  WeekdayDef,
} from "./types";
import { validateCalendar } from "./validate";

class Calendar implements CalendarEngine {
  readonly def: CalendarDef;
  private readonly math: PreparedCalendar;
  private readonly compiled: ReturnType<typeof compileFormats>;
  private readonly eraOrder: EraDef[];

  constructor(def: CalendarDef) {
    this.def = deepFreeze(cloneDef(def));
    this.math = prepareMath(this.def);
    this.compiled = compileFormats(this.def);
    this.eraOrder = chronologicalEras(this.def.eras);
  }

  toDays(date: CalendarDate): DayCount {
    if (date.precision === "era") {
      if (!date.era) throw new Error("an era-precision date needs an era");
      return this.bounds(this.requireEra(date.era)).start;
    }
    const year = this.toAbsoluteYear(date);
    let month = 0;
    let day = 1;
    let hour = 0;
    let minute = 0;
    const precision = date.precision;
    if (precision === "month" || precision === "day" || precision === "hour" || precision === "minute") {
      if (date.month === undefined) throw new Error(`${precision} precision needs a month`);
      month = date.month;
    }
    if (precision === "day" || precision === "hour" || precision === "minute") {
      if (date.day === undefined) throw new Error(`${precision} precision needs a day`);
      day = date.day;
    }
    if (precision === "hour" || precision === "minute") hour = date.hour ?? 0;
    if (precision === "minute") minute = date.minute ?? 0;
    this.assertTime(hour, minute);
    const local = this.math.localFromParts(year, month, day);
    const minuteOfDay = hour * this.math.time.minutesPerHour + minute;
    return local + this.def.epochOffset + minuteOfDay / this.math.mpd;
  }

  endOfDays(date: CalendarDate): DayCount {
    if (date.precision === "era") {
      if (!date.era) throw new Error("an era-precision date needs an era");
      return this.bounds(this.requireEra(date.era)).end;
    }
    return this.add(this.toDays(date), 1, date.precision);
  }

  fromDays(days: DayCount, precision?: Precision): CalendarDate {
    if (!Number.isFinite(days)) throw new RangeError("day count must be finite");
    const split = this.math.splitLocal(days - this.def.epochOffset);
    const parts = this.math.partsFromLocal(split.dayIndex);
    const resolved = precision ?? inferPrecision(split.minuteOfDay, this.math.time.minutesPerHour);
    return this.dateAt(parts.year, parts.month, parts.day, split.minuteOfDay, resolved);
  }

  parse(text: string): ParseResult {
    const date = parseWithFormats(this.def, this.compiled, text);
    if (!date) return { ok: false, error: `could not parse "${text.trim()}"` };
    try {
      const days = this.toDays(date);
      return { ok: true, date, days };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  format(date: CalendarDate | DayCount, pattern?: string, precision?: Precision): string {
    const resolved = typeof date === "number" ? this.fromDays(date, precision ?? "day") : date;
    const prec = precision ?? resolved.precision;
    const chosen = formatPattern(this.def, pattern, prec);
    return formatDate(this.def, resolved, chosen);
  }

  isLeapYear(absYear: number): boolean {
    return this.math.isLeapYear(absYear);
  }

  daysInYear(absYear: number): number {
    return this.math.yearLength(absYear);
  }

  daysInMonth(absYear: number, monthIndex: number): number {
    return this.math.monthLength(absYear, monthIndex);
  }

  weekday(days: DayCount): WeekdayDef | null {
    const split = this.math.splitLocal(days - this.def.epochOffset);
    const index = this.math.weekdayIndex(split.dayIndex);
    if (index === null) return null;
    return this.def.weekdays[index] ?? null;
  }

  eraOf(absYear: number): EraDef | null {
    return findEra(this.def.eras, absYear);
  }

  toAbsoluteYear(date: Pick<CalendarDate, "era" | "year">): number {
    if (date.era) {
      const era = this.requireEra(date.era);
      if (!Number.isInteger(date.year) || date.year < 1) {
        throw new Error(`era year must be an integer >= 1 (got ${date.year})`);
      }
      const abs = absoluteYearOf(era, date.year);
      if (!eraCovers(era, abs)) throw new Error(`year ${date.year} is outside ${era.id}`);
      return abs;
    }
    return labelYearToAbsolute(date.year, this.def.hasYearZero);
  }

  add(days: DayCount, amount: number, unit: Precision): DayCount {
    if (!Number.isInteger(amount)) throw new Error("amount must be an integer");
    if (amount === 0) return days;
    if (!Number.isFinite(days)) return days;
    if (unit === "day") return days + amount;
    if (unit === "hour") return days + (amount * this.math.time.minutesPerHour) / this.math.mpd;
    if (unit === "minute") return days + amount / this.math.mpd;

    const split = this.math.splitLocal(days - this.def.epochOffset);
    const parts = this.math.partsFromLocal(split.dayIndex);
    if (unit === "era") {
      const current = this.eraOf(parts.year);
      if (!current) return days;
      const index = this.eraOrder.findIndex((era) => era.id === current.id);
      const next = this.eraOrder[index + amount];
      if (!next) return days;
      const start = this.bounds(next).start;
      if (!Number.isFinite(start)) return days;
      return start + split.minuteOfDay / this.math.mpd;
    }

    let year = parts.year;
    let month = parts.month;
    let day = parts.day;
    if (unit === "month") {
      const count = this.def.months.length;
      const total = year * count + month + amount;
      year = Math.floor(total / count);
      month = total - year * count;
    } else {
      year += amount;
    }
    const dim = this.math.monthLength(year, month);
    if (day > dim) day = dim;
    const local = this.math.localFromParts(year, month, day);
    return local + this.def.epochOffset + split.minuteOfDay / this.math.mpd;
  }

  startOf(days: DayCount, unit: Precision): DayCount {
    if (!Number.isFinite(days)) return days;
    if (unit === "minute" || unit === "hour" || unit === "day") {
      const split = this.math.splitLocal(days - this.def.epochOffset);
      let minute = split.minuteOfDay;
      if (unit === "hour") minute -= minute % this.math.time.minutesPerHour;
      if (unit === "day") minute = 0;
      return split.dayIndex + this.def.epochOffset + minute / this.math.mpd;
    }
    const date = this.fromDays(days, "day");
    if (unit === "month") return this.toDays({ ...date, day: 1, precision: "day" });
    if (unit === "year") return this.toDays({ ...date, month: 0, day: 1, precision: "day" });
    const era = this.eraOf(this.toAbsoluteYear(date));
    if (!era) return this.toDays({ ...date, month: 0, day: 1, precision: "day" });
    return this.bounds(era).start;
  }

  snap(days: DayCount, precision: Precision): DayCount {
    const start = this.startOf(days, precision);
    if (!Number.isFinite(start)) return start;
    const end = this.add(start, 1, precision);
    if (!Number.isFinite(end) || end === start) return start;
    const mid = start + (end - start) / 2;
    return days < mid ? start : end;
  }

  ticks(
    range: { from: DayCount; to: DayCount },
    pxPerDay: number,
    minLabelPx: number
  ): { major: Tick[]; minor: Tick[] } {
    return buildTicks(this, range, pxPerDay, minLabelPx);
  }

  private dateAt(
    absYear: number,
    month: number,
    day: number,
    minuteOfDay: number,
    precision: Precision
  ): CalendarDate {
    const era = findEra(this.def.eras, absYear);
    if (precision === "era") {
      if (!era) return { year: absoluteToLabelYear(absYear, this.def.hasYearZero), precision: "year" };
      return { era: era.id, year: 1, precision: "era" };
    }
    const date: CalendarDate = {
      year: era ? eraYearOf(era, absYear) : absoluteToLabelYear(absYear, this.def.hasYearZero),
      precision,
    };
    if (era) date.era = era.id;
    if (precision === "year") return date;
    date.month = month;
    if (precision === "month") return date;
    date.day = day;
    if (precision === "day") return date;
    const hour = Math.floor(minuteOfDay / this.math.time.minutesPerHour);
    date.hour = hour;
    if (precision === "hour") return date;
    date.minute = minuteOfDay % this.math.time.minutesPerHour;
    return date;
  }

  private bounds(era: EraDef): { start: number; end: number } {
    const startOfYear = (year: number): number => this.math.daysBeforeYear(year) + this.def.epochOffset;
    if (!era.backward) {
      return {
        start: startOfYear(era.startYear),
        end: era.endYear === undefined ? Number.POSITIVE_INFINITY : startOfYear(era.endYear),
      };
    }
    return {
      start: era.endYear === undefined ? Number.NEGATIVE_INFINITY : startOfYear(era.endYear + 1),
      end: startOfYear(era.startYear + 1),
    };
  }

  private requireEra(id: string): EraDef {
    const era = this.def.eras.find((item) => item.id === id);
    if (!era) throw new Error(`unknown era ${id}`);
    return era;
  }

  private assertTime(hour: number, minute: number): void {
    if (!Number.isInteger(hour) || hour < 0 || hour >= this.math.time.hoursPerDay) {
      throw new Error(`hour ${hour} is outside 0..${this.math.time.hoursPerDay - 1}`);
    }
    if (!Number.isInteger(minute) || minute < 0 || minute >= this.math.time.minutesPerHour) {
      throw new Error(`minute ${minute} is outside 0..${this.math.time.minutesPerHour - 1}`);
    }
  }
}

function inferPrecision(minuteOfDay: number, minutesPerHour: number): Precision {
  if (minuteOfDay === 0) return "day";
  if (minuteOfDay % minutesPerHour === 0) return "hour";
  return "minute";
}

function cloneDef(def: CalendarDef): CalendarDef {
  return JSON.parse(JSON.stringify(def)) as CalendarDef;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

export function createCalendar(def: CalendarDef): CalendarEngine {
  const errors = validateCalendar(def);
  if (errors.length > 0) {
    throw new Error(`Invalid calendar "${def && def.id ? def.id : "unknown"}":\n${errors.join("\n")}`);
  }
  return new Calendar(def);
}

/**
 * Rebase a calendar-local day count (0 = that calendar's absolute year 0, month 0, day 1).
 * World day = local + epochOffset. `toDays` and `TimelineItem.start` are already world days;
 * passing them here applies the offset twice.
 */
export function convert(localDays: DayCount, from: CalendarEngine, to: CalendarEngine): DayCount {
  return localDays + from.def.epochOffset - to.def.epochOffset;
}

export function toLocalDays(engine: CalendarEngine, worldDays: DayCount): DayCount {
  return worldDays - engine.def.epochOffset;
}

export function fromLocalDays(engine: CalendarEngine, localDays: DayCount): DayCount {
  return localDays + engine.def.epochOffset;
}
