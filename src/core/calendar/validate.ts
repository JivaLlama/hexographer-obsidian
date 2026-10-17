import { eraCoverage, spansOverlap } from "./eras";
import { leapCycleYears, MAX_LEAP_CYCLE } from "./leap";
import type { CalendarDef, Precision } from "./types";

const PRECISIONS: readonly Precision[] = ["era", "year", "month", "day", "hour", "minute"];

const TOKEN =
  /\{(EEEE|yyyy|MMMM|MMM|HH|MM|dd|mm|ya|E|y|M|d|H|m)\}/g;

/** Precision implied by the tokens in a pattern. */
export function precisionOfPattern(pattern: string): Precision | null {
  const tokens = new Set<string>();
  TOKEN.lastIndex = 0;
  pattern.replace(TOKEN, (_full, name: string) => {
    tokens.add(name);
    return "";
  });
  if (tokens.size === 0 && !pattern.includes("{")) return null;
  if (tokens.has("m") || tokens.has("mm")) return "minute";
  if (tokens.has("H") || tokens.has("HH")) return "hour";
  if (tokens.has("d") || tokens.has("dd")) return "day";
  if (tokens.has("M") || tokens.has("MM") || tokens.has("MMM") || tokens.has("MMMM")) return "month";
  if (tokens.has("y") || tokens.has("yyyy") || tokens.has("ya")) return "year";
  if (tokens.has("E") || tokens.has("EEEE")) return "era";
  return null;
}

export function unknownTokens(pattern: string): string[] {
  const bad: string[] = [];
  const any = /\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = any.exec(pattern))) {
    TOKEN.lastIndex = 0;
    if (!TOKEN.test(match[0])) bad.push(match[0]);
  }
  return bad;
}

function dupes(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) out.push(value);
    seen.add(key);
  }
  return out;
}

/** Empty array means the definition is usable. */
export function validateCalendar(def: CalendarDef): string[] {
  const errors: string[] = [];
  const fail = (message: string): void => {
    errors.push(message);
  };

  if (!def || typeof def !== "object") return ["calendar definition is missing"];
  if (!def.id || typeof def.id !== "string") fail("id is required");
  if (!def.name || typeof def.name !== "string") fail("name is required");
  if (!Array.isArray(def.months) || def.months.length === 0) {
    fail("at least one month is required");
  } else {
    def.months.forEach((month, i) => {
      if (!month.id) fail(`months[${i}] is missing id`);
      if (!month.name) fail(`months[${i}] is missing name`);
      if (!Number.isInteger(month.days) || month.days < 1) {
        fail(`months[${i}] (${month.name || month.id}) must have days >= 1`);
      }
      if (month.leapDays !== undefined && (!Number.isInteger(month.leapDays) || month.leapDays < 0)) {
        fail(`months[${i}] leapDays must be an integer >= 0`);
      }
    });
    const names = dupes(def.months.map((m) => m.name));
    if (names.length) fail(`duplicate month names: ${names.join(", ")}`);
    const ids = dupes(def.months.map((m) => m.id));
    if (ids.length) fail(`duplicate month ids: ${ids.join(", ")}`);
    const shorts = def.months.map((m) => m.short).filter((s): s is string => Boolean(s));
    const shortDupes = dupes(shorts);
    if (shortDupes.length) fail(`duplicate month short names: ${shortDupes.join(", ")}`);
  }

  if (!Array.isArray(def.weekdays)) fail("weekdays must be an array");
  else {
    const ids = dupes(def.weekdays.map((d) => d.id));
    if (ids.length) fail(`duplicate weekday ids: ${ids.join(", ")}`);
    def.weekdays.forEach((day, i) => {
      if (!day.id || !day.name) fail(`weekdays[${i}] needs an id and a name`);
    });
  }
  if (!Number.isInteger(def.weekdayOfEpoch)) fail("weekdayOfEpoch must be an integer");

  if (!def.leap || typeof def.leap !== "object") fail("leap rule is required");
  else {
    const leap = def.leap;
    if (leap.kind === "cycle") {
      if (!Number.isInteger(leap.every) || leap.every < 1) fail("cycle leap `every` must be an integer >= 1");
      if (leap.offset !== undefined && !Number.isInteger(leap.offset)) fail("cycle leap offset must be an integer");
    } else if (leap.kind === "nested") {
      if (!Array.isArray(leap.rules) || leap.rules.length === 0) fail("nested leap needs at least one rule");
      else {
        for (const rule of leap.rules) {
          if (!Number.isInteger(rule.every) || rule.every < 1) fail("nested leap `every` must be an integer >= 1");
          if (typeof rule.leap !== "boolean") fail("nested leap rules need a boolean `leap`");
        }
      }
    } else if (leap.kind === "list") {
      if (!Array.isArray(leap.years) || leap.years.some((y) => !Number.isInteger(y))) {
        fail("list leap `years` must be integers");
      }
    } else if (leap.kind !== "none") {
      fail(`unknown leap kind`);
    }
    const cycle = def.leap ? leapCycleYears(def.leap) : 0;
    if (cycle > MAX_LEAP_CYCLE) {
      fail(`leap cycle is ${cycle} years; the maximum is ${MAX_LEAP_CYCLE}. Use a list for irregular leaps`);
    }
  }

  if (!Array.isArray(def.eras)) fail("eras must be an array");
  else {
    const ids = dupes(def.eras.map((e) => e.id));
    if (ids.length) fail(`duplicate era ids: ${ids.join(", ")}`);
    const abbrs = dupes(def.eras.map((e) => e.abbr));
    if (abbrs.length) fail(`duplicate era abbreviations: ${abbrs.join(", ")}`);
    def.eras.forEach((era, i) => {
      if (!era.id || !era.name || !era.abbr) fail(`eras[${i}] needs id, name, and abbr`);
      if (!Number.isInteger(era.startYear)) fail(`eras[${i}] startYear must be an integer`);
      if (era.endYear !== undefined && !Number.isInteger(era.endYear)) {
        fail(`eras[${i}] endYear must be an integer`);
      }
    });
    for (let i = 0; i < def.eras.length; i++) {
      for (let j = i + 1; j < def.eras.length; j++) {
        if (spansOverlap(eraCoverage(def.eras[i]), eraCoverage(def.eras[j]))) {
          fail(`eras ${def.eras[i].id} and ${def.eras[j].id} overlap`);
        }
      }
    }
  }

  if (typeof def.hasYearZero !== "boolean") fail("hasYearZero must be a boolean");
  if (!Number.isSafeInteger(def.epochOffset)) fail("epochOffset must be a safe integer");

  if (def.time) {
    if (!Number.isInteger(def.time.hoursPerDay) || def.time.hoursPerDay < 1 || def.time.hoursPerDay > 10000) {
      fail("hoursPerDay must be an integer from 1 to 10000");
    }
    if (!Number.isInteger(def.time.minutesPerHour) || def.time.minutesPerHour < 1 || def.time.minutesPerHour > 10000) {
      fail("minutesPerHour must be an integer from 1 to 10000");
    }
  }

  if (!def.formats || typeof def.formats !== "object") fail("formats are required");
  else {
    for (const precision of PRECISIONS) {
      if (precision === "era" && Array.isArray(def.eras) && def.eras.length === 0) continue;
      const pattern = def.formats[precision];
      if (typeof pattern !== "string" || pattern.length === 0) {
        fail(`formats.${precision} is required`);
        continue;
      }
      const bad = unknownTokens(pattern);
      if (bad.length) fail(`formats.${precision} has unknown tokens: ${bad.join(", ")}`);
      const implied = precisionOfPattern(pattern);
      if (implied !== precision) {
        fail(`formats.${precision} must be a ${precision} pattern (inferred ${implied ?? "none"})`);
      }
      if (pattern.includes("{ya}")) {
        fail(`formats.${precision} is stored as an absolute date; {ya} is display-only`);
      }
    }
    for (const [name, pattern] of Object.entries(def.formats)) {
      if (typeof pattern !== "string") fail(`formats.${name} must be a string`);
      else {
        const bad = unknownTokens(pattern);
        if (bad.length) fail(`formats.${name} has unknown tokens: ${bad.join(", ")}`);
      }
    }
    if (typeof def.defaultFormat !== "string" || !(def.defaultFormat in def.formats)) {
      fail("defaultFormat must be a key in formats");
    }
    const usesYearsAgo = Object.values(def.formats).some(
      (pattern) => typeof pattern === "string" && pattern.includes("{ya}")
    );
    if (usesYearsAgo && def.display?.mode !== "before-present") {
      fail("{ya} requires display.mode before-present");
    }
  }

  if (def.display !== undefined) {
    const display = def.display;
    if (!display || display.mode !== "before-present") fail('display.mode must be "before-present"');
    else {
      if (!Number.isSafeInteger(display.presentYear)) fail("display.presentYear must be a safe integer");
      if (typeof display.suffix !== "string" || display.suffix.trim().length === 0) {
        fail("display.suffix must be a non-empty string");
      }
    }
  }

  if (Array.isArray(def.months) && def.months.length > 0 && def.leap && def.leap.kind !== undefined) {
    const common = def.months.reduce((sum, month) => sum + (Number.isInteger(month.days) ? month.days : 0), 0);
    if (common < 1) fail("a common year must contain at least one day");
  }

  return errors;
}
