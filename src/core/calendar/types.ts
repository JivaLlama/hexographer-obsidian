/**
 * Days since the shared world epoch. The fractional part is the time of day.
 * Timeline items store world days. See `convert` for calendar-local counts.
 */
export type DayCount = number;

/** How much of a date was written down. Drives snapping and writeback. */
export type Precision = "era" | "year" | "month" | "day" | "hour" | "minute";

export type TickUnit =
  | "era"
  | "millennium"
  | "century"
  | "decade"
  | "year"
  | "month"
  | "week"
  | "day"
  | "hour";

export interface MonthDef {
  id: string;
  name: string;
  short?: string;
  /** Length in a common (non-leap) year. */
  days: number;
  /** Extra days in a leap year. Usually 0 or 1. */
  leapDays?: number;
  /** Festival days outside the week cycle when `intercalaryInWeek` is false. */
  intercalary?: boolean;
}

export interface WeekdayDef {
  id: string;
  name: string;
  short?: string;
}

/**
 * Leap rules apply to the absolute (astronomical) year, which includes year 0.
 * `nested` matches Gregorian: the matching rule with the greatest `every` wins
 * (400 leap, 100 not, 4 leap).
 */
export type LeapRule =
  | { kind: "none" }
  | { kind: "cycle"; every: number; offset?: number }
  | { kind: "nested"; rules: Array<{ every: number; leap: boolean }> }
  | { kind: "list"; years: number[] };

export interface EraDef {
  id: string;
  name: string;
  abbr: string;
  /**
   * Absolute year where era year 1 begins.
   * Forward eras cover `[startYear, endYear)`.
   * Backward eras (BCE) cover `(endYear, startYear]` and count down as time moves forward.
   */
  startYear: number;
  /** Exclusive absolute bound. Open-ended if omitted. See `EraDef.startYear`. */
  endYear?: number;
  /** Counts down toward `startYear`, like BCE. */
  backward?: boolean;
}

export interface TimeDef {
  hoursPerDay: number;
  minutesPerHour: number;
}

export interface CalendarDef {
  id: string;
  name: string;
  months: MonthDef[];
  /** Empty means the calendar has no week cycle. */
  weekdays: WeekdayDef[];
  /** Weekday index of this calendar's local day 0 (absolute year 0, first month, day 1). */
  weekdayOfEpoch: number;
  /**
   * When false (the default), intercalary days are skipped by `weekday()` and return null.
   * When true, they take part in the week cycle.
   */
  intercalaryInWeek?: boolean;
  leap: LeapRule;
  /** Empty means plain absolute years, no era labels. */
  eras: EraDef[];
  /**
   * When false, labeled years skip 0: displayed −1 is absolute year 0.
   * Absolute arithmetic always includes year 0. Era years are 1-based either way.
   */
  hasYearZero: boolean;
  /** Defaults to 24 hours and 60 minutes. */
  time?: TimeDef;
  /** World day of this calendar's local day 0. */
  epochOffset: DayCount;
  /**
   * Named patterns. Keys `era`, `year`, `month`, `day`, `hour`, and `minute` are
   * required and must carry exactly that precision. Extra names (`long`, `short`) are allowed.
   */
  formats: Record<string, string>;
  /** A key in `formats`. */
  defaultFormat: string;
  /**
   * Display-only labeling. Storage and note strings stay absolute years.
   * `presentYear` is an absolute year. A year Y is shown as `(presentYear - Y) suffix`.
   */
  display?: BeforePresentDisplay;
}

/** Axis and tooltip labels such as `1500 ya`. Not a parse format. */
export interface BeforePresentDisplay {
  mode: "before-present";
  presentYear: number;
  suffix: string;
}

export interface CalendarDate {
  /** `EraDef.id`. Absent when the calendar has no eras, or none cover the year. */
  era?: string;
  /** Era-relative when `era` is set (1-based). Otherwise a labeled absolute year. */
  year: number;
  /** 0-based index into `months`. */
  month?: number;
  /** 1-based day of month. */
  day?: number;
  hour?: number;
  minute?: number;
  precision: Precision;
}

export type ParseResult =
  | { ok: true; date: CalendarDate; days: DayCount }
  | { ok: false; error: string; offset?: number };

export interface Tick {
  days: DayCount;
  label: string;
  unit: TickUnit;
  major: boolean;
}

export interface CalendarEngine {
  readonly def: CalendarDef;

  /** Inclusive start of `date` at its precision, as a world day. */
  toDays(date: CalendarDate): DayCount;
  /** Exclusive end of `date` at its precision. May be ±Infinity for an open era. */
  endOfDays(date: CalendarDate): DayCount;
  fromDays(days: DayCount, precision?: Precision): CalendarDate;

  parse(text: string): ParseResult;
  /**
   * `pattern` is a format name or a raw pattern.
   * When `pattern` is omitted, the pattern for `precision` (or the date's precision) is used.
   */
  format(date: CalendarDate | DayCount, pattern?: string, precision?: Precision): string;

  isLeapYear(absYear: number): boolean;
  daysInYear(absYear: number): number;
  daysInMonth(absYear: number, monthIndex: number): number;
  /** Null when the calendar has no weekdays, or this day is intercalary and outside the week. */
  weekday(days: DayCount): WeekdayDef | null;
  eraOf(absYear: number): EraDef | null;
  toAbsoluteYear(date: Pick<CalendarDate, "era" | "year">): number;

  add(days: DayCount, amount: number, unit: Precision): DayCount;
  startOf(days: DayCount, unit: Precision): DayCount;
  /** Nearest boundary of `precision`. Ties round toward the later boundary. */
  snap(days: DayCount, precision: Precision): DayCount;

  ticks(
    range: { from: DayCount; to: DayCount },
    pxPerDay: number,
    minLabelPx: number
  ): { major: Tick[]; minor: Tick[] };
}
