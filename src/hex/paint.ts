import type { BiomeId, PaintTool } from "./types";
import type { HexLayers } from "./layers";

export interface PaintState {
  tool: PaintTool;
  biome: BiomeId;
  icon: string;
  /** When painting roads/rivers, whether to set or clear. */
  pathOn: boolean;
}

export function createPaintState(): PaintState {
  return {
    tool: "biome",
    biome: "grass",
    icon: "castle",
    pathOn: true,
  };
}

/**
 * Apply one paint stroke cell. Returns true if state changed.
 */
export function paintCell(
  layers: HexLayers,
  q: number,
  r: number,
  state: PaintState,
  labelText?: string
): boolean {
  switch (state.tool) {
    case "biome": {
      const prev = layers.getBiome(q, r);
      if (prev === state.biome) return false;
      layers.setBiome(q, r, state.biome);
      return true;
    }
    case "road": {
      const prev = layers.hasRoad(q, r);
      if (prev === state.pathOn) return false;
      layers.setRoad(q, r, state.pathOn);
      return true;
    }
    case "river": {
      const prev = layers.hasRiver(q, r);
      if (prev === state.pathOn) return false;
      layers.setRiver(q, r, state.pathOn);
      return true;
    }
    case "icon": {
      const prev = layers.getIcon(q, r) ?? "";
      if (prev === state.icon) return false;
      layers.setIcon(q, r, state.icon);
      return true;
    }
    case "label": {
      if (labelText === undefined) return false;
      const prev = layers.getLabel(q, r) ?? "";
      if (prev === labelText) return false;
      layers.setLabel(q, r, labelText);
      return true;
    }
    case "erase": {
      const had =
        layers.getBiome(q, r) !== undefined ||
        layers.hasRoad(q, r) ||
        layers.hasRiver(q, r) ||
        layers.getIcon(q, r) !== undefined ||
        layers.getLabel(q, r) !== undefined;
      if (!had) return false;
      layers.erase(q, r);
      return true;
    }
    case "pan":
      return false;
    default:
      return false;
  }
}
