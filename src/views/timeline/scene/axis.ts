import type { CalendarEngine, Scale } from "../../../core";

export interface AxisTick {
  x: number;
  label: string;
  major: boolean;
  days: number;
}

/**
 * Place calendar ticks for the visible scene, in local pixels.
 * The engine chooses major and minor units from `pxPerDay`.
 */
export function layoutTicks(
  calendar: CalendarEngine,
  scale: Scale,
  viewportWidth: number,
  overscanPx: number,
  minLabelPx: number
): AxisTick[] {
  if (!(viewportWidth > 0) || !(scale.pxPerDay > 0)) return [];
  const from = scale.toDays(-overscanPx);
  const to = scale.toDays(viewportWidth + overscanPx);
  if (!(to > from)) return [];
  const ticks = calendar.ticks({ from, to }, scale.pxPerDay, minLabelPx);
  const left = -overscanPx;
  const right = viewportWidth + overscanPx;
  const placed: AxisTick[] = [];
  for (const tick of ticks.minor) pushTick(placed, scale, tick.days, tick.label, false, left, right);
  for (const tick of ticks.major) pushTick(placed, scale, tick.days, tick.label, true, left, right);
  return placed;
}

function pushTick(
  out: AxisTick[],
  scale: Scale,
  days: number,
  label: string,
  major: boolean,
  left: number,
  right: number
): void {
  const x = scale.toPx(days);
  if (x < left || x > right || !Number.isFinite(x)) return;
  out.push({ x, label, major, days });
}
