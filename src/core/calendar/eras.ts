import type { EraDef } from "./types";

/** Half-open absolute-year coverage `[lo, hi)`. */
export interface YearSpan {
  lo: number;
  hi: number;
}

/**
 * Forward: `[startYear, endYear)`.
 * Backward: `(endYear, startYear]`, expressed as `[endYear + 1, startYear + 1)`.
 * An omitted `endYear` is ±Infinity on the open side.
 */
export function eraCoverage(era: EraDef): YearSpan {
  if (era.backward) {
    const lo = era.endYear === undefined ? Number.NEGATIVE_INFINITY : era.endYear + 1;
    return { lo, hi: era.startYear + 1 };
  }
  return {
    lo: era.startYear,
    hi: era.endYear === undefined ? Number.POSITIVE_INFINITY : era.endYear,
  };
}

export function eraCovers(era: EraDef, absYear: number): boolean {
  const span = eraCoverage(era);
  return absYear >= span.lo && absYear < span.hi;
}

export function eraYearOf(era: EraDef, absYear: number): number {
  if (era.backward) return era.startYear - absYear + 1;
  return absYear - era.startYear + 1;
}

export function absoluteYearOf(era: EraDef, eraYear: number): number {
  if (era.backward) return era.startYear - (eraYear - 1);
  return era.startYear + (eraYear - 1);
}

export function findEra(eras: readonly EraDef[], absYear: number): EraDef | null {
  let found: EraDef | null = null;
  for (const era of eras) {
    if (eraCovers(era, absYear)) found = era;
  }
  return found;
}

export function chronologicalEras(eras: readonly EraDef[]): EraDef[] {
  return [...eras].sort((a, b) => {
    const da = eraCoverage(a).lo;
    const db = eraCoverage(b).lo;
    if (da === db) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    return da < db ? -1 : 1;
  });
}

export function spansOverlap(a: YearSpan, b: YearSpan): boolean {
  return a.lo < b.hi && b.lo < a.hi;
}

/** Labeled year → astronomical year. Displayed −1 is absolute 0 when there is no year 0. */
export function labelYearToAbsolute(year: number, hasYearZero: boolean): number {
  if (!Number.isInteger(year)) throw new Error("year must be an integer");
  if (hasYearZero) return year;
  if (year > 0) return year;
  if (year < 0) return year + 1;
  throw new Error("this calendar has no year 0");
}

export function absoluteToLabelYear(absYear: number, hasYearZero: boolean): number {
  if (!Number.isInteger(absYear)) throw new Error("year must be an integer");
  if (hasYearZero) return absYear;
  if (absYear > 0) return absYear;
  return absYear - 1;
}
