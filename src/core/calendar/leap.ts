import type { LeapRule } from "./types";

/** Longest leap cycle we will tabulate. Longer rules must use `kind: "list"`. */
export const MAX_LEAP_CYCLE = 100_000;

export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

export function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return Math.abs((a / gcd(a, b)) * b);
}

/**
 * Years in one repeating leap pattern, aligned so year 0 starts a cycle.
 * `0` means a non-repeating `list` rule.
 */
export function leapCycleYears(rule: LeapRule): number {
  switch (rule.kind) {
    case "none":
      return 1;
    case "cycle":
      return rule.every;
    case "list":
      return 0;
    case "nested": {
      let n = 1;
      for (const part of rule.rules) {
        n = lcm(n, part.every);
      }
      return n;
    }
    default: {
      const never: never = rule;
      return never;
    }
  }
}

/** Leap test against the rule itself. Prefer the prepared table for hot paths. */
export function isLeapByRule(year: number, rule: LeapRule): boolean {
  switch (rule.kind) {
    case "none":
      return false;
    case "cycle": {
      const offset = rule.offset ?? 0;
      const every = rule.every;
      return ((year - offset) % every + every) % every === 0;
    }
    case "list":
      return rule.years.includes(year);
    case "nested": {
      const ranked = [...rule.rules].sort((a, b) => b.every - a.every);
      for (const part of ranked) {
        if (part.every > 0 && ((year % part.every) + part.every) % part.every === 0) {
          return part.leap;
        }
      }
      return false;
    }
    default: {
      const never: never = rule;
      return never;
    }
  }
}
