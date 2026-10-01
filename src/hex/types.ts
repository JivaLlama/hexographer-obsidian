/** Axial coordinate (pointy-top). */
export interface Axial {
  q: number;
  r: number;
}

export type LayerKind = "biome" | "road" | "label";

export type BiomeId =
  | "grass"
  | "forest"
  | "water"
  | "mountain"
  | "desert"
  | "swamp"
  | "snow"
  | "hills"
  | "coast"
  | "void";

export const BIOME_COLORS: Record<BiomeId, string> = {
  grass: "#6aab5f",
  forest: "#2d6a3e",
  water: "#3a7ca5",
  mountain: "#7a7a7a",
  desert: "#d4b483",
  swamp: "#4a6b4a",
  snow: "#e8eef5",
  hills: "#8f9e6e",
  coast: "#c2b280",
  void: "#2a2a2e",
};

export const BIOME_LIST: BiomeId[] = [
  "grass",
  "forest",
  "water",
  "mountain",
  "desert",
  "swamp",
  "snow",
  "hills",
  "coast",
  "void",
];

export type PaintTool = "biome" | "road" | "label" | "erase";

export interface LayerVisibility {
  biome: boolean;
  road: boolean;
  label: boolean;
}

export interface HexMapData {
  version: 1;
  name: string;
  hexSize: number;
  grid: { cols: number; rows: number };
  layers: {
    biome: Record<string, BiomeId>;
    road: Record<string, boolean>;
    label: Record<string, string>;
  };
}

export function axialKey(q: number, r: number): string {
  return `${q},${r}`;
}

export function parseAxialKey(key: string): Axial {
  const [qs, rs] = key.split(",");
  return { q: Number(qs), r: Number(rs) };
}

export function defaultMap(name = "untitled", cols = 20, rows = 15): HexMapData {
  return {
    version: 1,
    name,
    hexSize: 24,
    grid: { cols, rows },
    layers: {
      biome: {},
      road: {},
      label: {},
    },
  };
}
