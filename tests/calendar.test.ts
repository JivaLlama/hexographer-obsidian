import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  convert,
  createCalendar,
  GREGORIAN,
  parseCalendarDocument,
  RECKONING,
  serializeCalendarDocument,
  validateCalendar,
} from "../src/core";
import type { CalendarDef } from "../src/core";

const g = createCalendar(GREGORIAN);
const r = createCalendar(RECKONING);
const WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** UTC midnight for an astronomical year. `Date.UTC` maps years 0–99 onto 1900–1999. */
function utcDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

describe("gregorian", () => {
  it("puts 1970-01-01 on world day 0, a Thursday", () => {
    const days = g.toDays({ era: "CE", year: 1970, month: 0, day: 1, precision: "day" });
    expect(days).toBe(0);
    expect(g.weekday(0)?.id).toBe("thursday");
    expect(new Date(Date.UTC(1970, 0, 1)).getUTCDay()).toBe(4);
  });

  it("matches JS Date for known days, including BCE and leap days", () => {
    const samples: Array<[number, number, number]> = [
      [1970, 0, 1],
      [2000, 1, 29],
      [1900, 1, 28],
      [2026, 9, 17],
      [1, 0, 1],
      [0, 0, 1],
      [-1, 11, 31],
      [-44, 2, 15],
      [9999, 11, 31],
    ];
    for (const [year, month, day] of samples) {
      const utc = utcDate(year, month, day).getTime() / 86_400_000;
      const back = g.fromDays(utc, "day");
      expect(g.toAbsoluteYear(back)).toBe(year);
      expect(back.month).toBe(month);
      expect(back.day).toBe(day);
      expect(g.toDays(back)).toBe(utc);
      expect(g.weekday(utc)?.id).toBe(WEEK[utcDate(year, month, day).getUTCDay()]);
    }
  });

  it("knows the Gregorian leap rule", () => {
    expect(g.isLeapYear(2000)).toBe(true);
    expect(g.isLeapYear(1900)).toBe(false);
    expect(g.isLeapYear(1904)).toBe(true);
    expect(g.isLeapYear(0)).toBe(true);
    expect(g.isLeapYear(-100)).toBe(false);
    expect(g.daysInMonth(2000, 1)).toBe(29);
    expect(g.daysInMonth(1900, 1)).toBe(28);
    expect(() => g.toDays({ era: "CE", year: 1900, month: 1, day: 29, precision: "day" })).toThrow();
  });

  it("steps from 1 BCE into 1 CE", () => {
    const last = g.toDays({ era: "BCE", year: 1, month: 11, day: 31, precision: "day" });
    const first = g.toDays({ era: "CE", year: 1, month: 0, day: 1, precision: "day" });
    expect(first - last).toBe(1);
    expect(g.eraOf(0)?.id).toBe("BCE");
    expect(g.eraOf(1)?.id).toBe("CE");
    expect(g.format(g.fromDays(last, "day"), "long")).toContain("BCE");
  });

  it("parses and formats ISO dates and era labels", () => {
    const iso = g.parse("1970-01-01");
    expect(iso.ok).toBe(true);
    if (iso.ok) expect(iso.days).toBe(0);
    const labeled = g.parse("44 BCE");
    expect(labeled.ok).toBe(true);
    if (labeled.ok) {
      expect(g.toAbsoluteYear(labeled.date)).toBe(-43);
      expect(g.format(labeled.date, "year")).toBe("44 BCE");
    }
    expect(g.parse("not a date").ok).toBe(false);
  });

  it("round-trips hours as minutes, not as a float hour", () => {
    const date = { era: "CE" as const, year: 2020, month: 5, day: 15, hour: 13, minute: 45, precision: "minute" as const };
    const days = g.toDays(date);
    expect(g.fromDays(days, "minute")).toEqual(date);
    expect(g.format(date, "minute")).toBe("2020-06-15T13:45 CE");
  });
});

describe("reckoning", () => {
  it("parses the sketch examples and keeps each end's precision", () => {
    const day = r.parse("3A 412 Frostmoot 3");
    expect(day.ok).toBe(true);
    if (day.ok) {
      expect(day.date).toMatchObject({ era: "3A", year: 412, month: 7, day: 3, precision: "day" });
      expect(r.format(day.date)).toBe("3A 412 Frostmoot 3");
    }
    const short = r.parse("3A 412 Fro 3");
    expect(short.ok).toBe(true);
    const year = r.parse("3A 380");
    expect(year.ok).toBe(true);
    if (year.ok) {
      expect(year.date.precision).toBe("year");
      expect(r.format(year.days, undefined, "year")).toBe("3A 380");
    }
  });

  it("meets the Second Age on the first day of the Third", () => {
    const last = r.toDays({ era: "2A", year: 1800, month: 12, day: 6, precision: "day" });
    const first = r.toDays({ era: "3A", year: 1, month: 0, day: 1, precision: "day" });
    expect(first - last).toBe(1);
  });

  it("skips Yearsend in the 8-day week and restarts each year on Arday", () => {
    expect(r.weekday(0)?.name).toBe("Arday");
    expect(r.daysInYear(0)).toBe(366);
    expect(r.daysInYear(1)).toBe(365);
    const last = r.toDays({ year: 0, month: 11, day: 30, precision: "day" });
    expect(r.weekday(last)?.name).toBe("Hestday");
    expect(r.weekday(last + 1)).toBeNull();
    expect(r.weekday(last + 6)).toBeNull();
    expect(r.weekday(last + 7)?.name).toBe("Arday");
    const nextYear = r.toDays({ era: "1A", year: 1, month: 0, day: 1, precision: "day" });
    expect(r.weekday(nextYear)?.name).toBe("Arday");
  });

  it("sums month lengths to the year, including the leap festival", () => {
    for (const year of [-4, -1, 0, 1, 4, 3412]) {
      let sum = 0;
      for (let month = 0; month < r.def.months.length; month++) sum += r.daysInMonth(year, month);
      expect(sum).toBe(r.daysInYear(year));
    }
  });

  it("loads the vault sample and round-trips the definition", () => {
    const file = readFileSync(path.join("samples", "calendars", "reckoning.calendar.md"), "utf8");
    expect(parseCalendarDocument(file)).toEqual(RECKONING);
    expect(parseCalendarDocument(serializeCalendarDocument(RECKONING, "A note.\n"))).toEqual(RECKONING);
  });
});

describe("conversion and validation", () => {
  it("rebases calendar-local day counts through the world epoch", () => {
    expect(g.toDays({ era: "CE", year: 1970, month: 0, day: 1, precision: "day" })).toBe(0);
    expect(r.toDays({ year: 0, month: 0, day: 1, precision: "day" })).toBe(0);
    expect(convert(0, r, g)).toBe(r.def.epochOffset - g.def.epochOffset);
    const world = r.toDays({ era: "3A", year: 1, month: 0, day: 1, precision: "day" });
    expect(g.fromDays(world, "day").precision).toBe("day");
    expect(g.toDays(g.fromDays(world, "day"))).toBe(world);
  });

  it("rejects an overlapping era and a huge leap cycle", () => {
    const overlap: CalendarDef = {
      ...RECKONING,
      id: "overlap",
      eras: [
        { id: "A", name: "A", abbr: "A", startYear: 1, endYear: 50 },
        { id: "B", name: "B", abbr: "B", startYear: 40, endYear: 80 },
      ],
    };
    expect(validateCalendar(overlap).some((error) => error.includes("overlap"))).toBe(true);
    expect(() => createCalendar(overlap)).toThrow(/overlap/);

    const huge: CalendarDef = {
      ...RECKONING,
      id: "huge",
      leap: {
        kind: "nested",
        rules: [
          { every: 99991, leap: true },
          { every: 99989, leap: false },
        ],
      },
    };
    expect(validateCalendar(huge).some((error) => error.includes("leap cycle"))).toBe(true);
  });

  it("skips a labeled year 0 when hasYearZero is false and there are no eras", () => {
    const plain = createCalendar({
      ...GREGORIAN,
      id: "plain",
      name: "Plain",
      eras: [],
      hasYearZero: false,
    });
    expect(plain.toAbsoluteYear({ year: -1 })).toBe(0);
    expect(plain.toAbsoluteYear({ year: 1 })).toBe(1);
    expect(plain.toAbsoluteYear({ year: -2 })).toBe(-1);
    expect(() => plain.toAbsoluteYear({ year: 0 })).toThrow(/year 0/);
    const days = plain.toDays({ year: -1, month: 0, day: 1, precision: "day" });
    expect(plain.fromDays(days, "day").year).toBe(-1);
    expect(plain.toDays(plain.fromDays(days, "year"))).toBe(plain.startOf(days, "year"));
  });
});
