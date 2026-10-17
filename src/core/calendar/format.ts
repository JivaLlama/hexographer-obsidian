import { absoluteYearOf, labelYearToAbsolute } from "./eras";
import { precisionOfPattern } from "./validate";
import type { CalendarDate, CalendarDef, EraDef, Precision } from "./types";

function tokenRegex(): RegExp {
  return /\{(EEEE|yyyy|MMMM|MMM|HH|MM|dd|mm|ya|E|y|M|d|H|m)\}/g;
}

interface CompiledFormat {
  name: string;
  pattern: string;
  precision: Precision;
  regex: RegExp;
  named: boolean;
}

const GROUP: Record<string, string> = {
  EEEE: "eraName",
  E: "eraAbbr",
  yyyy: "year",
  y: "year",
  MMMM: "monthName",
  MMM: "monthName",
  MM: "month",
  M: "month",
  dd: "day",
  d: "day",
  HH: "hour",
  H: "hour",
  mm: "minute",
  m: "minute",
};

export function compileFormats(def: CalendarDef): CompiledFormat[] {
  const named = Object.entries(def.formats).map(([name, pattern]) => compileOne(def, name, pattern, true));
  const builtins = [
    "{y}-{MM}-{dd}T{HH}:{mm}",
    "{y}-{MM}-{dd}T{HH}",
    "{y}-{MM}-{dd}",
    "{y}-{MM}",
    "{y} {E}",
    "{E} {y}",
    "{MMMM} {d}, {y}",
    "{MMM} {d}, {y}",
    "{y}",
  ]
    .filter((pattern) => !named.some((entry) => entry.pattern === pattern))
    .map((pattern, index) => compileOne(def, `builtin${index}`, pattern, false));

  const rank: Record<Precision, number> = {
    minute: 6,
    hour: 5,
    day: 4,
    month: 3,
    year: 2,
    era: 1,
  };
  return [...named, ...builtins].sort((a, b) => {
    if (a.named !== b.named) return a.named ? -1 : 1;
    if (rank[a.precision] !== rank[b.precision]) return rank[b.precision] - rank[a.precision];
    return b.pattern.length - a.pattern.length;
  });
}

function compileOne(def: CalendarDef, name: string, pattern: string, named: boolean): CompiledFormat {
  const precision = precisionOfPattern(pattern);
  if (!precision) throw new Error(`format ${name} has no date tokens`);
  // `{ya}` is a display label. It must not become a parse pattern.
  if (pattern.includes("{ya}")) {
    return { name, pattern, precision, regex: /(?!)/, named };
  }
  let source = "";
  let last = 0;
  const seen = new Set<string>();
  const tokens = tokenRegex();
  let match: RegExpExecArray | null;
  while ((match = tokens.exec(pattern))) {
    source += flexibleLiteral(pattern.slice(last, match.index));
    const token = match[1];
    const group = GROUP[token];
    if (seen.has(group)) throw new Error(`format ${name} repeats ${group}`);
    seen.add(group);
    source += tokenSource(def, token, group);
    last = match.index + match[0].length;
  }
  source += flexibleLiteral(pattern.slice(last));
  return {
    name,
    pattern,
    precision,
    regex: new RegExp(`^${source}$`, "i"),
    named,
  };
}

function tokenSource(def: CalendarDef, token: string, group: string): string {
  switch (token) {
    case "EEEE":
      return `(?<${group}>${alt(def.eras.map((era) => era.name))})`;
    case "E":
      return `(?<${group}>${alt([...def.eras.map((era) => era.abbr), ...def.eras.map((era) => era.id)])})`;
    case "yyyy":
      return `(?<${group}>-?\\d{1,16})`;
    case "y":
      return `(?<${group}>-?\\d{1,16})`;
    case "MMMM":
    case "MMM":
      return `(?<${group}>${alt(def.months.flatMap((month) => [month.name, month.short ?? ""]))})`;
    case "MM":
    case "M":
      return `(?<${group}>\\d{1,2})`;
    case "dd":
    case "d":
      return `(?<${group}>\\d{1,2})`;
    case "HH":
    case "H":
      return `(?<${group}>\\d{1,2})`;
    case "mm":
    case "m":
      return `(?<${group}>\\d{1,2})`;
    default:
      throw new Error(`unknown token ${token}`);
  }
}

function alt(values: string[]): string {
  const unique = [...new Set(values.filter((value) => value.length > 0))].sort((a, b) => b.length - a.length);
  if (unique.length === 0) return "(?!)";
  return unique.map(escapeRegExp).join("|");
}

function flexibleLiteral(text: string): string {
  return escapeRegExp(text).replace(/ +/g, "\\s+");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function formatPattern(def: CalendarDef, explicit: string | undefined, precision: Precision): string {
  if (explicit) return def.formats[explicit] ?? explicit;
  if (def.formats[precision]) return def.formats[precision];
  return def.formats[def.defaultFormat] ?? def.defaultFormat;
}

export function formatDate(def: CalendarDef, date: CalendarDate, pattern: string): string {
  const era = date.era ? def.eras.find((item) => item.id === date.era) : undefined;
  if (date.era && !era) throw new Error(`unknown era ${date.era}`);
  const month = date.month !== undefined ? def.months[date.month] : undefined;
  const rendered = pattern.replace(tokenRegex(), (_full, token: string) => {
    switch (token) {
      case "E":
        return era?.abbr ?? "";
      case "EEEE":
        return era?.name ?? "";
      case "y":
        return String(date.year);
      case "yyyy":
        return padYear(date.year);
      case "M":
        return String((date.month ?? 0) + 1);
      case "MM":
        return padNumber((date.month ?? 0) + 1, 2);
      case "MMM":
        return month?.short || month?.name || "";
      case "MMMM":
        return month?.name ?? "";
      case "d":
        return String(date.day ?? 1);
      case "dd":
        return padNumber(date.day ?? 1, 2);
      case "H":
        return String(date.hour ?? 0);
      case "HH":
        return padNumber(date.hour ?? 0, 2);
      case "m":
        return String(date.minute ?? 0);
      case "mm":
        return padNumber(date.minute ?? 0, 2);
      case "ya":
        return formatYearsAgo(def, absoluteYearOfDate(def, date));
      default:
        return "";
    }
  });
  return rendered.replace(/[ \t]{2,}/g, " ").trim();
}

/** `1500 ya` for an absolute year. Storage strings never use this. */
export function formatYearsAgo(def: CalendarDef, absoluteYear: number): string {
  const display = def.display;
  if (!display || display.mode !== "before-present") {
    throw new Error("calendar has no before-present display");
  }
  const years = display.presentYear - absoluteYear;
  const suffix = display.suffix.trim();
  return suffix ? `${years} ${suffix}` : String(years);
}

function absoluteYearOfDate(def: CalendarDef, date: CalendarDate): number {
  if (date.era) {
    const era = def.eras.find((item) => item.id === date.era);
    if (!era) throw new Error(`unknown era ${date.era}`);
    return absoluteYearOf(era, date.year);
  }
  return labelYearToAbsolute(date.year, def.hasYearZero);
}

function padNumber(value: number, width: number): string {
  const sign = value < 0 ? "-" : "";
  let digits = String(Math.abs(value));
  while (digits.length < width) digits = `0${digits}`;
  return sign + digits;
}

function padYear(year: number): string {
  return padNumber(year, 4);
}

export interface MatchedDate {
  date: CalendarDate;
}

export function matchFormat(
  def: CalendarDef,
  compiled: { regex: RegExp; precision: Precision },
  text: string
): CalendarDate | null {
  const match = compiled.regex.exec(text.trim());
  if (!match?.groups) return null;
  const groups = match.groups;
  const precision = compiled.precision;
  let era: EraDef | undefined;
  if (groups.eraAbbr || groups.eraName) {
    const raw = groups.eraAbbr ?? groups.eraName;
    era = def.eras.find(
      (item) =>
        item.abbr.toLowerCase() === raw.toLowerCase() ||
        item.id.toLowerCase() === raw.toLowerCase() ||
        item.name.toLowerCase() === raw.toLowerCase()
    );
    if (!era) return null;
  }
  if (precision === "era" && !era) return null;

  const year = groups.year !== undefined ? Number(groups.year) : era ? 1 : NaN;
  if (!Number.isInteger(year)) return null;

  const date: CalendarDate = { year, precision };
  if (era) date.era = era.id;

  if (groups.monthName !== undefined || groups.month !== undefined) {
    let monthIndex = -1;
    if (groups.monthName !== undefined) {
      const raw = groups.monthName.toLowerCase();
      monthIndex = def.months.findIndex(
        (month) => month.name.toLowerCase() === raw || month.short?.toLowerCase() === raw
      );
    } else {
      monthIndex = Number(groups.month) - 1;
    }
    if (monthIndex < 0 || monthIndex >= def.months.length) return null;
    date.month = monthIndex;
  } else if (precision === "month" || precision === "day" || precision === "hour" || precision === "minute") {
    return null;
  }

  if (groups.day !== undefined) {
    const day = Number(groups.day);
    if (!Number.isInteger(day)) return null;
    date.day = day;
  } else if (precision === "day" || precision === "hour" || precision === "minute") {
    return null;
  }

  const hours = def.time?.hoursPerDay ?? 24;
  const minutes = def.time?.minutesPerHour ?? 60;
  if (groups.hour !== undefined) {
    const hour = Number(groups.hour);
    if (!Number.isInteger(hour) || hour < 0 || hour >= hours) return null;
    date.hour = hour;
  } else if (precision === "hour" || precision === "minute") {
    date.hour = 0;
  }
  if (groups.minute !== undefined) {
    const minute = Number(groups.minute);
    if (!Number.isInteger(minute) || minute < 0 || minute >= minutes) return null;
    date.minute = minute;
  } else if (precision === "minute") {
    date.minute = 0;
  }
  return date;
}

export function parseWithFormats(def: CalendarDef, compiled: CompiledFormat[], text: string): CalendarDate | null {
  const input = text.trim();
  for (const format of compiled) {
    const date = matchFormat(def, format, input);
    if (date) return date;
  }
  return null;
}
