import { assertSafeInt, mod } from "../num";
import { isLeapByRule, leapCycleYears, MAX_LEAP_CYCLE } from "./leap";
import type { CalendarDef, MonthDef, TimeDef } from "./types";

const DEFAULT_TIME: TimeDef = { hoursPerDay: 24, minutesPerHour: 60 };

export interface Ymd {
  year: number;
  month: number;
  day: number;
}

export interface PreparedCalendar {
  def: CalendarDef;
  months: readonly MonthDef[];
  time: TimeDef;
  /** Minutes in one local day. */
  mpd: number;
  commonYearLength: number;
  leapExtra: number;
  minYearLength: number;
  maxYearLength: number;
  isLeapYear(absYear: number): boolean;
  yearLength(absYear: number): number;
  monthLength(absYear: number, monthIndex: number): number;
  /** Local day index of absolute `year` month 0 day 1. Local day 0 is year 0. */
  daysBeforeYear(absYear: number): number;
  localFromParts(year: number, monthIndex: number, day: number): number;
  partsFromLocal(dayIndex: number): Ymd;
  /**
   * Split a local day number into an integer day and a minute within that day.
   * Rounds to the nearest minute so values produced by `toDays` round-trip.
   */
  splitLocal(local: number): { dayIndex: number; minuteOfDay: number };
  /**
   * Weekday index for this local day, or null when the day is intercalary and
   * `intercalaryInWeek` is not set.
   */
  weekdayIndex(dayIndex: number): number | null;
}

export function prepareMath(def: CalendarDef): PreparedCalendar {
  const months = def.months;
  const time = def.time ?? DEFAULT_TIME;
  const mpd = time.hoursPerDay * time.minutesPerHour;
  const commonYearLength = months.reduce((sum, month) => sum + month.days, 0);
  const leapExtra = months.reduce((sum, month) => sum + (month.leapDays ?? 0), 0);
  const cycleYears = leapCycleYears(def.leap);
  const skipIntercalary = months.some((month) => month.intercalary) && def.intercalaryInWeek !== true;

  const leapList =
    def.leap.kind === "list" ? [...def.leap.years].sort((a, b) => a - b) : null;
  const leapSet = leapList ? new Set(leapList) : null;

  let lengthByIndex: number[] = [];
  let dayPrefix: number[] = [];
  let partPrefix: number[] = [];
  let cycleDays = 0;
  let cyclePart = 0;

  function leapFromRule(year: number): boolean {
    if (leapSet) return leapSet.has(year);
    return isLeapByRule(year, def.leap);
  }

  function monthLength(absYear: number, monthIndex: number): number {
    const month = months[monthIndex];
    if (!month) {
      throw new Error(`month ${monthIndex} is out of range`);
    }
    const extra = leapFromRule(absYear) ? month.leapDays ?? 0 : 0;
    return month.days + extra;
  }

  function yearLengthOf(absYear: number): number {
    let n = 0;
    for (let i = 0; i < months.length; i++) n += monthLength(absYear, i);
    return n;
  }

  function participatingInYear(absYear: number): number {
    if (!skipIntercalary) return yearLengthOf(absYear);
    let n = 0;
    for (let i = 0; i < months.length; i++) {
      if (months[i].intercalary) continue;
      n += monthLength(absYear, i);
    }
    return n;
  }

  if (leapList) {
    // Irregular leaps stay a binary search over the sorted year list.
  } else {
    if (!(cycleYears >= 1) || cycleYears > MAX_LEAP_CYCLE) {
      throw new Error(`leap cycle must be between 1 and ${MAX_LEAP_CYCLE} years`);
    }
    lengthByIndex = new Array(cycleYears);
    dayPrefix = new Array(cycleYears + 1);
    partPrefix = new Array(cycleYears + 1);
    dayPrefix[0] = 0;
    partPrefix[0] = 0;
    for (let i = 0; i < cycleYears; i++) {
      lengthByIndex[i] = yearLengthOf(i);
      dayPrefix[i + 1] = dayPrefix[i] + lengthByIndex[i];
      partPrefix[i + 1] = partPrefix[i] + participatingInYear(i);
    }
    cycleDays = dayPrefix[cycleYears];
    cyclePart = partPrefix[cycleYears];
  }

  function countLeapsLessThan(year: number): number {
    if (!leapList) return 0;
    let lo = 0;
    let hi = leapList.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (leapList[mid] < year) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function isLeap(absYear: number): boolean {
    if (leapSet) return leapSet.has(absYear);
    // Cycle is aligned to year 0, so the leap flag repeats every `cycleYears`.
    return isLeapByRule(mod(absYear, cycleYears), def.leap);
  }

  function yearLength(absYear: number): number {
    if (leapList) return commonYearLength + (isLeap(absYear) ? leapExtra : 0);
    return lengthByIndex[mod(absYear, cycleYears)];
  }

  function daysBeforeYear(absYear: number): number {
    assertSafeInt(absYear, "absolute year");
    if (leapList) {
      const leaps =
        absYear >= 0
          ? countLeapsLessThan(absYear) - countLeapsLessThan(0)
          : countLeapsLessThan(0) - countLeapsLessThan(absYear);
      const days = absYear * commonYearLength + (absYear >= 0 ? leaps * leapExtra : -leaps * leapExtra);
      assertSafeInt(days, "day count");
      return days;
    }
    const cycles = Math.floor(absYear / cycleYears);
    const rem = absYear - cycles * cycleYears;
    const days = cycles * cycleDays + dayPrefix[rem];
    assertSafeInt(days, "day count");
    return days;
  }

  function participatingBeforeYear(absYear: number): number {
    if (!skipIntercalary) return daysBeforeYear(absYear);
    if (leapList) {
      const base = participatingLength(false);
      const extra = participatingLength(true) - base;
      const leaps =
        absYear >= 0
          ? countLeapsLessThan(absYear) - countLeapsLessThan(0)
          : countLeapsLessThan(0) - countLeapsLessThan(absYear);
      return absYear * base + (absYear >= 0 ? leaps * extra : -leaps * extra);
    }
    const cycles = Math.floor(absYear / cycleYears);
    const rem = absYear - cycles * cycleYears;
    return cycles * cyclePart + partPrefix[rem];
  }

  function participatingLength(leap: boolean): number {
    let n = 0;
    for (let i = 0; i < months.length; i++) {
      if (skipIntercalary && months[i].intercalary) continue;
      n += months[i].days + (leap ? months[i].leapDays ?? 0 : 0);
    }
    return n;
  }

  function monthLen(absYear: number, monthIndex: number): number {
    const month = months[monthIndex];
    if (!month) throw new Error(`month ${monthIndex} is out of range`);
    return month.days + (isLeap(absYear) ? month.leapDays ?? 0 : 0);
  }

  function localFromParts(year: number, monthIndex: number, day: number): number {
    if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex >= months.length) {
      throw new Error(`month ${monthIndex} is out of range`);
    }
    const dim = monthLen(year, monthIndex);
    if (!Number.isInteger(day) || day < 1 || day > dim) {
      throw new Error(`day ${day} is out of range for month ${monthIndex} of year ${year}`);
    }
    let local = daysBeforeYear(year);
    for (let m = 0; m < monthIndex; m++) local += monthLen(year, m);
    local += day - 1;
    assertSafeInt(local, "local day");
    return local;
  }

  function findYear(dayIndex: number): number {
    const maxL = Math.max(maxYearLength(), 1);
    const minL = Math.max(minYearLength(), 1);
    // Dividing by the shorter year pushes the estimate farther from year 0,
    // so the two estimates swap order when dayIndex is negative.
    const byLongYears = Math.floor(dayIndex / maxL);
    const byShortYears = Math.floor(dayIndex / minL);
    let lo = Math.min(byLongYears, byShortYears) - 2;
    let hi = Math.max(byLongYears, byShortYears) + 2;
    let guard = 0;
    while (daysBeforeYear(lo) > dayIndex) {
      lo -= Math.max(hi - lo, 1);
      if (++guard > 80) throw new Error("year search failed below the target day");
    }
    while (daysBeforeYear(hi) <= dayIndex) {
      hi += Math.max(hi - lo, 1);
      if (++guard > 80) throw new Error("year search failed above the target day");
    }
    while (lo + 1 < hi) {
      const mid = lo + Math.floor((hi - lo) / 2);
      if (daysBeforeYear(mid) <= dayIndex) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  function minYearLength(): number {
    if (leapList) return Math.min(commonYearLength, commonYearLength + leapExtra);
    let min = Infinity;
    for (const len of lengthByIndex) min = Math.min(min, len);
    return min;
  }

  function maxYearLength(): number {
    if (leapList) return Math.max(commonYearLength, commonYearLength + leapExtra);
    let max = 0;
    for (const len of lengthByIndex) max = Math.max(max, len);
    return max;
  }

  function partsFromLocal(dayIndex: number): Ymd {
    assertSafeInt(dayIndex, "local day");
    const year = findYear(dayIndex);
    let rem = dayIndex - daysBeforeYear(year);
    for (let month = 0; month < months.length; month++) {
      const len = monthLen(year, month);
      if (rem < len) return { year, month, day: rem + 1 };
      rem -= len;
    }
    throw new Error("internal: local day fell past the end of its year");
  }

  function splitLocal(local: number): { dayIndex: number; minuteOfDay: number } {
    if (!Number.isFinite(local)) {
      throw new RangeError("day count must be finite");
    }
    // Nudge values that landed a hair below an integer back up before flooring.
    const nearest = Math.round(local);
    const dayIndex = Math.abs(local - nearest) < 1e-6 ? nearest : Math.floor(local + 1e-9);
    const frac = local - dayIndex;
    let minute = Math.round(frac * mpd);
    if (minute >= mpd) return { dayIndex: dayIndex + 1, minuteOfDay: minute - mpd };
    if (minute < 0) return { dayIndex: dayIndex - 1, minuteOfDay: minute + mpd };
    return { dayIndex, minuteOfDay: minute };
  }

  function isSkippedIntercalary(dayIndex: number): boolean {
    if (!skipIntercalary) return false;
    const { month } = partsFromLocal(dayIndex);
    return Boolean(months[month].intercalary);
  }

  function weekdayIndex(dayIndex: number): number | null {
    if (def.weekdays.length === 0) return null;
    if (isSkippedIntercalary(dayIndex)) return null;
    const before = participatingBefore(dayIndex);
    return mod(def.weekdayOfEpoch + before, def.weekdays.length);
  }

  function participatingBefore(dayIndex: number): number {
    const { year, month, day } = partsFromLocal(dayIndex);
    let n = participatingBeforeYear(year);
    for (let m = 0; m < month; m++) {
      if (skipIntercalary && months[m].intercalary) continue;
      n += monthLen(year, m);
    }
    if (!(skipIntercalary && months[month].intercalary)) n += day - 1;
    return n;
  }

  const minLen = minYearLength();
  const maxLen = maxYearLength();
  if (!(minLen >= 1) || !Number.isFinite(minLen)) {
    throw new Error("a year must contain at least one day");
  }

  return {
    def,
    months,
    time,
    mpd,
    commonYearLength,
    leapExtra,
    minYearLength: minLen,
    maxYearLength: maxLen,
    isLeapYear: isLeap,
    yearLength,
    monthLength: monthLen,
    daysBeforeYear,
    localFromParts,
    partsFromLocal,
    splitLocal,
    weekdayIndex,
  };
}
