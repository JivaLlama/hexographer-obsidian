import type { CalendarEngine } from "../calendar/types";
import type { TimeUnitDef } from "../types";
import type { VaultSettings } from "../vault/settings";

/** One addend in a gap such as `2 gen + 10y`. */
export interface GapTerm {
  /** Whole number. Negative when this addend runs the other way. */
  count: number;
  /** A vault unit id, or built-in `y`, `mo`, `d`. */
  unit: string;
}

export interface GapSpan {
  min: number;
  max: number;
  likely: number;
}

const TERM = /^([+-])?\s*(\d+)\s*([A-Za-z][A-Za-z0-9_-]*)$/;

/**
 * Parse a gap sum. `2 gen - 10y` is `2 gen` plus a `-10y` term.
 * An empty string is a zero gap. Unknown units are reported by `gapSpan`.
 */
export function parseGap(text: string): GapTerm[] | { error: string } {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const normalized = trimmed.replace(/\s+-\s+/g, " + -");
  const pieces = normalized.split("+");
  if (pieces.some((piece) => piece.trim() === "")) return { error: `invalid gap "${text}"` };
  const terms: GapTerm[] = [];
  for (const piece of pieces) {
    const match = TERM.exec(piece.trim());
    if (!match) return { error: `invalid gap "${text}"` };
    const sign = match[1] === "-" ? -1 : 1;
    terms.push({ count: sign * Number(match[2]), unit: match[3] });
  }
  return terms;
}

/** Grammar used by writeback. A negative term is written `- 10y`. Built-ins stay glued (`10y`). */
export function formatGap(terms: readonly GapTerm[]): string {
  const kept = terms.filter((term) => term.count !== 0);
  if (kept.length === 0) return "0y";
  let out = "";
  kept.forEach((term, index) => {
    const piece = gapToken(Math.abs(term.count), term.unit);
    if (index === 0) out = term.count < 0 ? `- ${piece}` : piece;
    else if (term.count < 0) out += ` - ${piece}`;
    else out += ` + ${piece}`;
  });
  return out;
}

export function sameGap(a: readonly GapTerm[], b: readonly GapTerm[]): boolean {
  const norm = (terms: readonly GapTerm[]) =>
    terms
      .filter((term) => term.count !== 0)
      .map((term) => `${term.count}:${term.unit.toLowerCase()}`)
      .join("|");
  return norm(a) === norm(b);
}

/**
 * Accept `{ gen: "40-60y" }` or a `TimeUnitDef` list.
 * A single number (`50y`) is a fixed unit. An unreadable entry is dropped;
 * a gap that names it then fails as an unknown unit.
 */
export function normalizeUnits(units: VaultSettings["units"]): TimeUnitDef[] {
  if (!units) return [];
  if (Array.isArray(units)) {
    const out: TimeUnitDef[] = [];
    for (const unit of units) {
      const parsed = normalizeOne(unit);
      if (parsed) out.push(parsed);
    }
    return out;
  }
  const out: TimeUnitDef[] = [];
  for (const [id, value] of Object.entries(units)) {
    if (typeof value !== "string") continue;
    const parsed = parseUnitSpec(id, value);
    if (parsed) out.push(parsed);
  }
  return out;
}

/**
 * World-day span of a gap, in the dependent note's calendar.
 * Year and month terms use the year (and month) of `anchorDays` in that calendar.
 * `d` is already a world-day count.
 */
export function gapSpan(
  gap: string | undefined,
  calendar: CalendarEngine,
  anchorDays: number,
  units: readonly TimeUnitDef[]
): GapSpan | { error: string } {
  if (!gap || !gap.trim()) return { min: 0, max: 0, likely: 0 };
  const terms = parseGap(gap);
  if ("error" in terms) return terms;
  const year = calendar.toAbsoluteYear(calendar.fromDays(anchorDays, "year"));
  const yearLen = calendar.daysInYear(year);
  const monthIndex = calendar.fromDays(anchorDays, "day").month ?? 0;
  const monthLen = calendar.daysInMonth(year, monthIndex);
  let min = 0;
  let max = 0;
  for (const term of terms) {
    const span = termSpan(term, yearLen, monthLen, units);
    if ("error" in span) return span;
    min += span.min;
    max += span.max;
  }
  return { min, max, likely: (min + max) / 2 };
}

function termSpan(
  term: GapTerm,
  yearLen: number,
  monthLen: number,
  units: readonly TimeUnitDef[]
): { min: number; max: number } | { error: string } {
  const unit = term.unit.toLowerCase();
  let lo: number;
  let hi: number;
  if (unit === "d") {
    lo = 1;
    hi = 1;
  } else if (unit === "y") {
    lo = yearLen;
    hi = yearLen;
  } else if (unit === "mo") {
    lo = monthLen;
    hi = monthLen;
  } else {
    const def = units.find((candidate) => candidate.id.toLowerCase() === unit);
    if (!def) return { error: `unknown unit "${term.unit}"` };
    lo = def.minYears * yearLen;
    hi = def.maxYears * yearLen;
  }
  const a = term.count * lo;
  const b = term.count * hi;
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

function gapToken(count: number, unit: string): string {
  const glued = unit.toLowerCase() === "y" || unit.toLowerCase() === "mo" || unit.toLowerCase() === "d";
  return glued ? `${count}${unit}` : `${count} ${unit}`;
}

function normalizeOne(unit: TimeUnitDef): TimeUnitDef | null {
  if (!unit || typeof unit.id !== "string" || !unit.id.trim()) return null;
  if (!Number.isFinite(unit.minYears) || !Number.isFinite(unit.maxYears)) return null;
  return {
    id: unit.id.trim(),
    minYears: Math.min(unit.minYears, unit.maxYears),
    maxYears: Math.max(unit.minYears, unit.maxYears),
  };
}

function parseUnitSpec(id: string, text: string): TimeUnitDef | null {
  const match = /^(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*y?$/i.exec(text.trim());
  if (!match || !id.trim()) return null;
  const a = Number(match[1]);
  const b = match[2] !== undefined ? Number(match[2]) : a;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { id: id.trim(), minYears: Math.min(a, b), maxYears: Math.max(a, b) };
}
