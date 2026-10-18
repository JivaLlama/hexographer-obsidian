import type { VaultSettings } from "../../../core";

/**
 * Plugin setting text, one unit per line: `gen: 40-60y`.
 * Empty text leaves `VaultSettings.units` unset.
 */
export function parseUnitsText(text: string | undefined): VaultSettings["units"] {
  if (!text) return undefined;
  const units: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const split = trimmed.indexOf(":");
    if (split <= 0) continue;
    const id = trimmed.slice(0, split).trim();
    const value = trimmed.slice(split + 1).trim();
    if (!id || !value) continue;
    units[id] = value;
  }
  return Object.keys(units).length > 0 ? units : undefined;
}

export function formatUnitsText(units: VaultSettings["units"]): string {
  if (!units) return "";
  if (Array.isArray(units)) {
    return units.map((unit) => `${unit.id}: ${unit.minYears}-${unit.maxYears}y`).join("\n");
  }
  return Object.entries(units)
    .map(([id, value]) => `${id}: ${value}`)
    .join("\n");
}
