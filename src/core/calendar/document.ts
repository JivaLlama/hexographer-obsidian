import type { CalendarDef, EraDef, LeapRule, MonthDef, TimeDef, WeekdayDef } from "./types";
import { validateCalendar } from "./validate";
import { joinFrontmatter, splitFrontmatter } from "../yaml/frontmatter";
import { parseYaml } from "../yaml/parse";
import { stringifyYaml } from "../yaml/stringify";

export function parseCalendarDocument(markdown: string): CalendarDef {
  const split = splitFrontmatter(markdown);
  if (!split) throw new Error("calendar file is missing YAML frontmatter");
  const parsed = parseYaml(split.yaml);
  return calendarFromUnknown(parsed);
}

export function serializeCalendarDocument(def: CalendarDef, prose = ""): string {
  const errors = validateCalendar(def);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  const body = prose === "" || prose.endsWith("\n") ? prose : `${prose}\n`;
  return joinFrontmatter(stringifyYaml(calendarToPlain(def)), body);
}

export function calendarFromUnknown(value: unknown): CalendarDef {
  const raw = asMap(value, "calendar");
  const def: CalendarDef = {
    id: requiredString(raw.id, "id"),
    name: requiredString(raw.name, "name"),
    months: readMonths(raw.months),
    weekdays: readWeekdays(raw.weekdays ?? []),
    weekdayOfEpoch: requiredInt(raw.weekdayOfEpoch ?? 0, "weekdayOfEpoch"),
    leap: readLeap(raw.leap),
    eras: readEras(raw.eras ?? []),
    hasYearZero: requiredBool(raw.hasYearZero, "hasYearZero"),
    epochOffset: requiredInt(raw.epochOffset, "epochOffset"),
    formats: readFormats(raw.formats),
    defaultFormat: requiredString(raw.defaultFormat, "defaultFormat"),
  };
  if (raw.intercalaryInWeek !== undefined) {
    def.intercalaryInWeek = requiredBool(raw.intercalaryInWeek, "intercalaryInWeek");
  }
  if (raw.time !== undefined) def.time = readTime(raw.time);
  const errors = validateCalendar(def);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return def;
}

function calendarToPlain(def: CalendarDef): Record<string, unknown> {
  const plain: Record<string, unknown> = {
    id: def.id,
    name: def.name,
    epochOffset: def.epochOffset,
    hasYearZero: def.hasYearZero,
    weekdayOfEpoch: def.weekdayOfEpoch,
    months: def.months.map((month) => {
      const out: Record<string, unknown> = { id: month.id, name: month.name, days: month.days };
      if (month.short) out.short = month.short;
      if (month.leapDays) out.leapDays = month.leapDays;
      if (month.intercalary) out.intercalary = true;
      return out;
    }),
    weekdays: def.weekdays.map((day) => {
      const out: Record<string, unknown> = { id: day.id, name: day.name };
      if (day.short) out.short = day.short;
      return out;
    }),
    leap: def.leap,
    eras: def.eras.map((era) => {
      const out: Record<string, unknown> = {
        id: era.id,
        name: era.name,
        abbr: era.abbr,
        startYear: era.startYear,
      };
      if (era.endYear !== undefined) out.endYear = era.endYear;
      if (era.backward) out.backward = true;
      return out;
    }),
    formats: def.formats,
    defaultFormat: def.defaultFormat,
  };
  if (def.intercalaryInWeek !== undefined) plain.intercalaryInWeek = def.intercalaryInWeek;
  if (def.time) plain.time = def.time;
  return plain;
}

function readMonths(value: unknown): MonthDef[] {
  if (!Array.isArray(value)) throw new Error("months must be a list");
  return value.map((item, index) => {
    const map = asMap(item, `months[${index}]`);
    const month: MonthDef = {
      id: requiredString(map.id, `months[${index}].id`),
      name: requiredString(map.name, `months[${index}].name`),
      days: requiredInt(map.days, `months[${index}].days`),
    };
    if (map.short !== undefined) month.short = requiredString(map.short, `months[${index}].short`);
    if (map.leapDays !== undefined) month.leapDays = requiredInt(map.leapDays, `months[${index}].leapDays`);
    if (map.intercalary !== undefined) month.intercalary = requiredBool(map.intercalary, `months[${index}].intercalary`);
    return month;
  });
}

function readWeekdays(value: unknown): WeekdayDef[] {
  if (!Array.isArray(value)) throw new Error("weekdays must be a list");
  return value.map((item, index) => {
    const map = asMap(item, `weekdays[${index}]`);
    const day: WeekdayDef = {
      id: requiredString(map.id, `weekdays[${index}].id`),
      name: requiredString(map.name, `weekdays[${index}].name`),
    };
    if (map.short !== undefined) day.short = requiredString(map.short, `weekdays[${index}].short`);
    return day;
  });
}

function readEras(value: unknown): EraDef[] {
  if (!Array.isArray(value)) throw new Error("eras must be a list");
  return value.map((item, index) => {
    const map = asMap(item, `eras[${index}]`);
    const era: EraDef = {
      id: requiredString(map.id, `eras[${index}].id`),
      name: requiredString(map.name, `eras[${index}].name`),
      abbr: requiredString(map.abbr, `eras[${index}].abbr`),
      startYear: requiredInt(map.startYear, `eras[${index}].startYear`),
    };
    if (map.endYear !== undefined) era.endYear = requiredInt(map.endYear, `eras[${index}].endYear`);
    if (map.backward !== undefined) era.backward = requiredBool(map.backward, `eras[${index}].backward`);
    return era;
  });
}

function readLeap(value: unknown): LeapRule {
  const map = asMap(value, "leap");
  const kind = requiredString(map.kind, "leap.kind");
  if (kind === "none") return { kind: "none" };
  if (kind === "cycle") {
    const every = requiredInt(map.every, "leap.every");
    if (map.offset !== undefined) {
      return { kind: "cycle", every, offset: requiredInt(map.offset, "leap.offset") };
    }
    return { kind: "cycle", every };
  }
  if (kind === "nested") {
    if (!Array.isArray(map.rules)) throw new Error("leap.rules must be a list");
    return {
      kind: "nested",
      rules: map.rules.map((item, index) => {
        const rule = asMap(item, `leap.rules[${index}]`);
        return {
          every: requiredInt(rule.every, `leap.rules[${index}].every`),
          leap: requiredBool(rule.leap, `leap.rules[${index}].leap`),
        };
      }),
    };
  }
  if (kind === "list") {
    if (!Array.isArray(map.years)) throw new Error("leap.years must be a list");
    return { kind: "list", years: map.years.map((year, index) => requiredInt(year, `leap.years[${index}]`)) };
  }
  throw new Error(`unknown leap kind ${kind}`);
}

function readTime(value: unknown): TimeDef {
  const map = asMap(value, "time");
  return {
    hoursPerDay: requiredInt(map.hoursPerDay, "time.hoursPerDay"),
    minutesPerHour: requiredInt(map.minutesPerHour, "time.minutesPerHour"),
  };
}

function readFormats(value: unknown): Record<string, string> {
  const map = asMap(value, "formats");
  const formats: Record<string, string> = {};
  for (const [key, pattern] of Object.entries(map)) {
    formats[key] = requiredString(pattern, `formats.${key}`);
  }
  return formats;
}

function asMap(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a map`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a string`);
  return value;
}

function requiredInt(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`${label} must be an integer`);
  return value;
}

function requiredBool(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`);
  return value;
}
