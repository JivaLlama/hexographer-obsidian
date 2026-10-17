import type { CalendarDef } from "./types";

/**
 * Sample fantasy calendar used by the timeline sketches ("3A 412 Frostmoot 3").
 *
 * Twelve 30-day months plus Yearsend, a 5-day intercalary festival (6 in a leap year).
 * Leap years are every 4th absolute year. The week has 8 days and skips Yearsend,
 * so each year is exactly 45 weeks and Thawmere 1 falls on the same weekday every year.
 *
 * Epoch: local day 0 (absolute year 0, Thawmere 1) is world day 0, the same instant as
 * Gregorian 1970-01-01. That alignment is a fixture choice, not lore.
 * The First Age begins the following year (absolute year 1).
 */
export const RECKONING: CalendarDef = {
  id: "reckoning",
  name: "The Reckoning",
  epochOffset: 0,
  hasYearZero: true,
  weekdayOfEpoch: 0,
  intercalaryInWeek: false,
  time: { hoursPerDay: 24, minutesPerHour: 60 },
  months: [
    { id: "thawmere", name: "Thawmere", short: "Tha", days: 30 },
    { id: "seedfall", name: "Seedfall", short: "See", days: 30 },
    { id: "greenrise", name: "Greenrise", short: "Gre", days: 30 },
    { id: "highsun", name: "Highsun", short: "Hig", days: 30 },
    { id: "amberfield", name: "Amberfield", short: "Amb", days: 30 },
    { id: "harvestide", name: "Harvestide", short: "Har", days: 30 },
    { id: "duskwane", name: "Duskwane", short: "Dus", days: 30 },
    { id: "frostmoot", name: "Frostmoot", short: "Fro", days: 30 },
    { id: "deepnight", name: "Deepnight", short: "Dee", days: 30 },
    { id: "snowbind", name: "Snowbind", short: "Sno", days: 30 },
    { id: "icevault", name: "Icevault", short: "Ice", days: 30 },
    { id: "lasthearth", name: "Lasthearth", short: "Las", days: 30 },
    { id: "yearsend", name: "Yearsend", short: "End", days: 5, leapDays: 1, intercalary: true },
  ],
  weekdays: [
    { id: "arday", name: "Arday", short: "Ar" },
    { id: "berday", name: "Berday", short: "Be" },
    { id: "carday", name: "Carday", short: "Ca" },
    { id: "dorday", name: "Dorday", short: "Do" },
    { id: "erday", name: "Erday", short: "Er" },
    { id: "ferday", name: "Ferday", short: "Fe" },
    { id: "girday", name: "Girday", short: "Gi" },
    { id: "hestday", name: "Hestday", short: "He" },
  ],
  leap: { kind: "cycle", every: 4 },
  eras: [
    { id: "1A", name: "First Age", abbr: "1A", startYear: 1, endYear: 1201 },
    { id: "2A", name: "Second Age", abbr: "2A", startYear: 1201, endYear: 3001 },
    { id: "3A", name: "Third Age", abbr: "3A", startYear: 3001 },
  ],
  formats: {
    era: "{E}",
    year: "{E} {y}",
    month: "{E} {y} {MMMM}",
    day: "{E} {y} {MMMM} {d}",
    hour: "{E} {y} {MMMM} {d} {HH}",
    minute: "{E} {y} {MMMM} {d} {HH}:{mm}",
    long: "{E} {y} {MMMM} {d}",
    short: "{E} {y}",
  },
  defaultFormat: "day",
};
