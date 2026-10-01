import type { BiomeId, PaintTool } from "./types";
import type { HexLayers } from "./layers";

export interface PaintState {
  tool: PaintTool;
  biome: BiomeId;
  /** When painting roads, whether to set or clear. Brush sets true; erase clears. */
  roadOn: boolean;
}

export function createPaintState(): PaintState {
  return {
    tool: "biome",
    biome: "grass",
    roadOn: true,
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
      if (prev === state.roadOn) return false;
      layers.setRoad(q, r, state.roadOn);
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
        layers.getLabel(q, r) !== undefined;
      if (!had) return false;
      layers.erase(q, r);
      return true;
    }
    default:
      return false;
  }
}
