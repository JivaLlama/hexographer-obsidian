import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createCalendar, GREGORIAN, PRECISIONS, RECKONING } from "../src/core";
import type { CalendarDate, CalendarEngine } from "../src/core";

const gregorian = createCalendar(GREGORIAN);
const reckoning = createCalendar(RECKONING);
const WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

describe("calendar properties", () => {
  it("round-trips Gregorian dates through JS Date, including negative years", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -20_000, max: 20_000 }),
        fc.integer({ min: 0, max: 11 }),
        fc.integer({ min: 1, max: 31 }),
        (year, month, day) => {
          const probe = utcDate(year, month, day);
          const utc = probe.getTime();
          if (
            !Number.isFinite(utc) ||
            probe.getUTCFullYear() !== year ||
            probe.getUTCMonth() !== month ||
            probe.getUTCDate() !== day
          ) {
            return;
          }
          const days = utc / 86_400_000;
          const back = gregorian.fromDays(days, "day");
          expect(gregorian.toAbsoluteYear(back)).toBe(year);
          expect(back.month).toBe(month);
          expect(back.day).toBe(day);
          expect(gregorian.toDays(back)).toBe(days);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("round-trips day counts at every precision, including deep time", () => {
    const engines = [gregorian, reckoning];
    const days = fc.oneof(
      fc.integer({ min: -20_000 * 400, max: 20_000 * 400 }),
      fc.constant(-1_000_000_000_000),
      fc.constant(1_000_000_000_000),
      fc.constant(-366),
      fc.constant(0)
    );
    fc.assert(
      fc.property(fc.constantFrom(...engines), days, fc.constantFrom(...PRECISIONS), (engine, day, precision) => {
        const date = engine.fromDays(day, precision);
        if (date.precision !== precision) return;
        const start = engine.toDays(date);
        if (!Number.isFinite(start)) return;
        expect(engine.fromDays(start, precision)).toEqual(date);
        expect(engine.toDays(engine.fromDays(start, precision))).toBe(start);
      }),
      { numRuns: 150 }
    );
  });

  it("round-trips explicit deep-time years", () => {
    const deep: CalendarDate[] = [
      { era: "CE", year: 1_000_000, month: 6, day: 15, precision: "day" },
      { era: "BCE", year: 1_000_001, month: 0, day: 1, precision: "day" },
      { era: "3A", year: 50_000, month: 7, day: 3, precision: "day" },
      { era: "1A", year: 1, month: 0, day: 1, precision: "day" },
    ];
    expect(gregorian.toAbsoluteYear(gregorian.fromDays(gregorian.toDays(deep[0]), "day"))).toBe(1_000_000);
    expect(gregorian.toAbsoluteYear(gregorian.fromDays(gregorian.toDays(deep[1]), "day"))).toBe(-1_000_000);
    for (const date of deep.slice(2)) {
      const days = reckoning.toDays(date);
      expect(reckoning.fromDays(days, "day")).toMatchObject({
        era: date.era,
        year: date.year,
        month: date.month,
        day: date.day,
      });
    }
  });

  it("round-trips parse(format) for every named format", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(gregorian, reckoning),
        fc.integer({ min: -4000, max: 8000 }),
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        (engine, day, hour, minute) => {
          const base = engine.fromDays(day, "day");
          if (!base.era) return;
          const full: CalendarDate = { ...base, hour, minute, precision: "minute" };
          for (const name of Object.keys(engine.def.formats)) {
            const text = engine.format(full, name);
            const parsed = engine.parse(text);
            expect(parsed.ok, `${engine.def.id} ${name} → ${text}`).toBe(true);
            if (!parsed.ok) continue;
            const truncated = engine.toDays({ ...full, precision: parsed.date.precision });
            expect(parsed.days).toBe(truncated);
          }
        }
      ),
      { numRuns: 40 }
    );
  });

  it("keeps month lengths, snap, and weekday steps consistent", () => {
    fc.assert(
      fc.property(fc.constantFrom(gregorian, reckoning), fc.integer({ min: -300, max: 4000 }), (engine, year) => {
        let sum = 0;
        for (let month = 0; month < engine.def.months.length; month++) sum += engine.daysInMonth(year, month);
        expect(sum).toBe(engine.daysInYear(year));
        const start = engine.toDays({ year: Math.abs(year) + 1, month: 0, day: 1, precision: "day" });
        expect(engine.snap(engine.snap(start + 10, "month"), "month")).toBe(engine.snap(start + 10, "month"));
        expect(engine.startOf(engine.startOf(start + 10, "year"), "year")).toBe(engine.startOf(start + 10, "year"));
      }),
      { numRuns: 40 }
    );
  });

  it("advances Gregorian weekdays by one each day across leap years", () => {
    assertWeekdaySteps(gregorian, gregorian.toDays({ era: "CE", year: 1899, month: 11, day: 1, precision: "day" }), 800);
  });

  it("advances Reckoning weekdays by one, pausing on Yearsend", () => {
    const start = reckoning.toDays({ era: "3A", year: 412, month: 10, day: 1, precision: "day" });
    let previous = weekdayIndex(reckoning, start);
    expect(previous).not.toBeNull();
    for (let offset = 1; offset < 80; offset++) {
      const next = weekdayIndex(reckoning, start + offset);
      if (next === null) continue;
      expect(next).toBe(((previous ?? 0) + 1) % reckoning.def.weekdays.length);
      previous = next;
    }
  });
});

/** UTC midnight for an astronomical year. `Date.UTC` maps years 0–99 onto 1900–1999. */
function utcDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function assertWeekdaySteps(engine: CalendarEngine, start: number, count: number): void {
  for (let offset = 1; offset <= count; offset++) {
    const js = new Date((start + offset) * 86_400_000);
    expect(engine.weekday(start + offset)?.id).toBe(WEEK[js.getUTCDay()]);
  }
}

function weekdayIndex(engine: CalendarEngine, days: number): number | null {
  const day = engine.weekday(days);
  if (!day) return null;
  return engine.def.weekdays.findIndex((item) => item.id === day.id);
}
