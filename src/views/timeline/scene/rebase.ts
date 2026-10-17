import { createScale, type Scale } from "../../../core";

/**
 * View-side scale adapter.
 *
 * Core `Scale` maps `(days - originDays) * pxPerDay` and `zoomAt` re-bases during
 * a zoom, but it has no operation for folding a pixel pan back into `originDays`.
 * The scene keeps a translate while a gesture is active and commits it here on
 * zoom or pan end, so deep-time SVG coordinates stay near the viewport.
 */
export const ZOOM_STEP = 1.6;

/** x = (days - originDays) * pxPerDay. Scene coordinates are relative to the local origin. */
export function localX(days: number, originDays: number, pxPerDay: number): number {
  return (days - originDays) * pxPerDay;
}

/** World day under a scene pixel, including a translate that is not committed yet. */
export function dayUnderPixel(scale: Scale, pixel: number, translatePx = 0): number {
  return scale.toDays(pixel - translatePx);
}

/** Fold a horizontal translate into `originDays`. A positive translate reveals earlier days. */
export function commitPan(scale: Scale, translatePx: number): Scale {
  if (!Number.isFinite(translatePx) || translatePx === 0) return scale;
  const originDays = scale.originDays - translatePx / scale.pxPerDay;
  if (!Number.isFinite(originDays)) return scale;
  return createScale({
    originDays,
    pxPerDay: scale.pxPerDay,
    minPxPerDay: scale.minPxPerDay,
    maxPxPerDay: scale.maxPxPerDay,
  });
}

/**
 * Commit any in-progress translate, then zoom so the world day under `focusX` stays put.
 * `focusX` is the visual scene pixel (after the translate).
 */
export function zoomAround(scale: Scale, translatePx: number, focusX: number, factor: number): Scale {
  return commitPan(scale, translatePx).zoomAt(focusX, factor);
}

/**
 * Fit a world-day span across the viewport. Core has no zoom-to-fit helper;
 * limits still come from `scaleLimitsForCalendar` / `createScale.clamp`.
 */
export function fitRange(
  limits: { minPxPerDay: number; maxPxPerDay: number },
  range: { from: number; to: number },
  viewportPx: number,
  padPx = 24
): Scale {
  const span = Math.max(range.to - range.from, 1e-9);
  const width = Math.max(viewportPx, 1);
  const pad = Math.min(Math.max(padPx, 0), width / 4);
  const inner = Math.max(width - pad * 2, 1);
  const drafted = createScale({
    originDays: range.from,
    pxPerDay: inner / span,
    minPxPerDay: limits.minPxPerDay,
    maxPxPerDay: limits.maxPxPerDay,
  });
  const fitted = drafted.clamp();
  const used = span * fitted.pxPerDay;
  const side = Math.max((width - used) / 2, 0);
  return createScale({
    originDays: range.from - side / fitted.pxPerDay,
    pxPerDay: fitted.pxPerDay,
    minPxPerDay: fitted.minPxPerDay,
    maxPxPerDay: fitted.maxPxPerDay,
  });
}
