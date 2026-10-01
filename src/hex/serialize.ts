import type { HexMapData } from "./types";
import { defaultMap } from "./types";
import type { HexLayers } from "./layers";

/**
 * Vault file format: `maps/*.hexmap.json`
 * Plain JSON, versioned. Documented in README.
 */
export const MAP_DIR = "maps";
export const MAP_EXT = ".hexmap.json";

export function mapPath(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, "-") || "untitled";
  return `${MAP_DIR}/${safe}${MAP_EXT}`;
}

export function serializeMap(
  meta: Pick<HexMapData, "name" | "hexSize" | "grid">,
  layers: HexLayers
): HexMapData {
  return {
    version: 1,
    name: meta.name,
    hexSize: meta.hexSize,
    grid: { ...meta.grid },
    layers: layers.toLayerRecords(),
  };
}

export function deserializeMap(raw: string): HexMapData {
  const parsed = JSON.parse(raw) as Partial<HexMapData>;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid hexmap: not an object");
  }
  const base = defaultMap(
    typeof parsed.name === "string" ? parsed.name : "untitled",
    parsed.grid?.cols ?? 20,
    parsed.grid?.rows ?? 15
  );
  return {
    version: 1,
    name: base.name,
    hexSize: typeof parsed.hexSize === "number" ? parsed.hexSize : base.hexSize,
    grid: {
      cols: parsed.grid?.cols ?? base.grid.cols,
      rows: parsed.grid?.rows ?? base.grid.rows,
    },
    layers: {
      biome: { ...(parsed.layers?.biome ?? {}) },
      road: { ...(parsed.layers?.road ?? {}) },
      label: { ...(parsed.layers?.label ?? {}) },
    },
  };
}

export function stringifyMap(data: HexMapData): string {
  return JSON.stringify(data, null, 2) + "\n";
}
