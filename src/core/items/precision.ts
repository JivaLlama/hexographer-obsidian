import type { Precision } from "../calendar/types";

export const PRECISIONS: readonly Precision[] = ["era", "year", "month", "day", "hour", "minute"];

/** Alt-drag steps one level finer. Minute stays minute. */
export function finerPrecision(precision: Precision): Precision {
  const index = PRECISIONS.indexOf(precision);
  if (index < 0 || index >= PRECISIONS.length - 1) return "minute";
  return PRECISIONS[index + 1];
}
