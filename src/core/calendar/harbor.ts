import type { CalendarDef } from "./types";

/**
 * Second sample calendar, for a sea culture that does not use the Reckoning.
 *
 * Ten 36-day months, 360-day years, no leap day, and a 6-day week.
 * Local day 0 (year 0, Tidewake 1) is world day 10000: ten thousand days after
 * Gregorian 1970-01-01 and after Reckoning year 0, Thawmere 1. The offset is a
 * fixture so tests can prove two calendars share one master axis.
 */
export const HARBOR_EPOCH_OFFSET = 10_000;

export const HARBOR: CalendarDef = {
  id: "harbor",
  name: "The Harbor Count",
  epochOffset: HARBOR_EPOCH_OFFSET,
  hasYearZero: true,
  weekdayOfEpoch: 0,
  time: { hoursPerDay: 24, minutesPerHour: 60 },
  months: [
    { id: "tidewake", name: "Tidewake", short: "Tid", days: 36 },
    { id: "foamrise", name: "Foamrise", short: "Foa", days: 36 },
    { id: "kelpmoon", name: "Kelpmoon", short: "Kel", days: 36 },
    { id: "saltbar", name: "Saltbar", short: "Sal", days: 36 },
    { id: "drift", name: "Drift", short: "Dri", days: 36 },
    { id: "calmwater", name: "Calmwater", short: "Cal", days: 36 },
    { id: "stormglass", name: "Stormglass", short: "Sto", days: 36 },
    { id: "wrack", name: "Wrack", short: "Wra", days: 36 },
    { id: "icefloe", name: "Icefloe", short: "Ice", days: 36 },
    { id: "stilldeep", name: "Stilldeep", short: "Sti", days: 36 },
  ],
  weekdays: [
    { id: "sailday", name: "Sailday", short: "Sai" },
    { id: "helmday", name: "Helmday", short: "Hel" },
    { id: "netday", name: "Netday", short: "Net" },
    { id: "keelday", name: "Keelday", short: "Kee" },
    { id: "galeday", name: "Galeday", short: "Gal" },
    { id: "havenday", name: "Havenday", short: "Hav" },
  ],
  leap: { kind: "none" },
  eras: [],
  formats: {
    year: "{y}",
    month: "{y} {MMMM}",
    day: "{y} {MMMM} {d}",
    hour: "{y} {MMMM} {d} {HH}",
    minute: "{y} {MMMM} {d} {HH}:{mm}",
    long: "{y} {MMMM} {d}",
    short: "{y}",
  },
  defaultFormat: "day",
};
