import { mod } from "../num";
import { prepareMath } from "./math";
import type { CalendarDef, MonthDef, WeekdayDef } from "./types";

const MONTHS: MonthDef[] = [
  { id: "january", name: "January", short: "Jan", days: 31 },
  { id: "february", name: "February", short: "Feb", days: 28, leapDays: 1 },
  { id: "march", name: "March", short: "Mar", days: 31 },
  { id: "april", name: "April", short: "Apr", days: 30 },
  { id: "may", name: "May", short: "May", days: 31 },
  { id: "june", name: "June", short: "Jun", days: 30 },
  { id: "july", name: "July", short: "Jul", days: 31 },
  { id: "august", name: "August", short: "Aug", days: 31 },
  { id: "september", name: "September", short: "Sep", days: 30 },
  { id: "october", name: "October", short: "Oct", days: 31 },
  { id: "november", name: "November", short: "Nov", days: 30 },
  { id: "december", name: "December", short: "Dec", days: 31 },
];

const WEEKDAYS: WeekdayDef[] = [
  { id: "sunday", name: "Sunday", short: "Sun" },
  { id: "monday", name: "Monday", short: "Mon" },
  { id: "tuesday", name: "Tuesday", short: "Tue" },
  { id: "wednesday", name: "Wednesday", short: "Wed" },
  { id: "thursday", name: "Thursday", short: "Thu" },
  { id: "friday", name: "Friday", short: "Fri" },
  { id: "saturday", name: "Saturday", short: "Sat" },
];

function gregorian(epochOffset: number, weekdayOfEpoch: number): CalendarDef {
  return {
    id: "gregorian",
    name: "Gregorian",
    months: MONTHS,
    weekdays: WEEKDAYS,
    weekdayOfEpoch,
    leap: {
      kind: "nested",
      rules: [
        { every: 400, leap: true },
        { every: 100, leap: false },
        { every: 4, leap: true },
      ],
    },
    eras: [
      { id: "BCE", name: "Before Common Era", abbr: "BCE", startYear: 0, backward: true },
      { id: "CE", name: "Common Era", abbr: "CE", startYear: 1 },
    ],
    hasYearZero: false,
    time: { hoursPerDay: 24, minutesPerHour: 60 },
    epochOffset,
    formats: {
      era: "{E}",
      year: "{y} {E}",
      month: "{y}-{MM} {E}",
      day: "{y}-{MM}-{dd} {E}",
      hour: "{y}-{MM}-{dd}T{HH} {E}",
      minute: "{y}-{MM}-{dd}T{HH}:{mm} {E}",
      long: "{MMMM} {d}, {y} {E}",
      short: "{y} {E}",
    },
    defaultFormat: "day",
  };
}

/** Local day of 1970-01-01 when local day 0 is absolute year 0, January 1. */
const UNIX_LOCAL_DAY = prepareMath(gregorian(0, 0)).localFromParts(1970, 0, 1);

/**
 * World day 0 is proleptic Gregorian 1970-01-01 00:00 UTC.
 * `weekdayOfEpoch` is chosen so that day is Thursday (JS `getUTCDay() === 4`).
 */
export const GREGORIAN: CalendarDef = gregorian(-UNIX_LOCAL_DAY, mod(4 - UNIX_LOCAL_DAY, 7));
