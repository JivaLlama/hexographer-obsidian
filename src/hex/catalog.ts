/**
 * Terrain / icon catalogs. Paths are relative to the plugin root (assets/...).
 * No Obsidian imports — hosts resolve paths to URLs.
 */

import type { BiomeId } from "./types";

export interface BiomeDef {
  id: BiomeId;
  label: string;
  /** Fallback fill when no image loaded. */
  color: string;
  /** Plugin-relative image path, or null for color-only. */
  tile: string | null;
}

export interface IconDef {
  id: string;
  label: string;
  /** Plugin-relative image path. */
  icon: string;
}

export const BIOME_DEFS: BiomeDef[] = [
  { id: "grass", label: "Grassland", color: "#6aab5f", tile: "assets/terrain/grass.png" },
  { id: "forest", label: "Forest", color: "#2d6a3e", tile: "assets/terrain/forest.png" },
  { id: "water", label: "Water", color: "#3a7ca5", tile: null },
  { id: "mountain", label: "Mountain", color: "#7a7a7a", tile: "assets/terrain/mountain.png" },
  { id: "desert", label: "Desert", color: "#d4b483", tile: "assets/terrain/desert.png" },
  { id: "swamp", label: "Swamp", color: "#4a6b4a", tile: null },
  { id: "snow", label: "Snow", color: "#e8eef5", tile: null },
  { id: "hills", label: "Hills", color: "#8f9e6e", tile: "assets/terrain/hills.png" },
  { id: "coast", label: "Coast", color: "#c2b280", tile: "assets/terrain/coast.png" },
  { id: "void", label: "Void", color: "#2a2a2e", tile: null },
];

export const BIOME_BY_ID: Record<BiomeId, BiomeDef> = Object.fromEntries(
  BIOME_DEFS.map((d) => [d.id, d])
) as Record<BiomeId, BiomeDef>;

export const ICON_DEFS: IconDef[] = [
  { id: "castle", label: "Castle", icon: "assets/icons/castle.png" },
  { id: "house", label: "House", icon: "assets/icons/house.png" },
  { id: "church", label: "Church", icon: "assets/icons/church.png" },
  { id: "farm", label: "Farm", icon: "assets/icons/farm.png" },
  { id: "tower", label: "Tower", icon: "assets/icons/tower.png" },
  { id: "mine", label: "Mine", icon: "assets/icons/mine.png" },
  { id: "tent", label: "Tent", icon: "assets/icons/tent.png" },
  { id: "pine", label: "Pine", icon: "assets/icons/pine.png" },
  { id: "rock", label: "Rock", icon: "assets/icons/rock.png" },
  { id: "well", label: "Well", icon: "assets/icons/well.png" },
  { id: "windmill", label: "Windmill", icon: "assets/icons/windmill.png" },
];

export const ICON_BY_ID: Record<string, IconDef> = Object.fromEntries(
  ICON_DEFS.map((d) => [d.id, d])
);

/** All plugin-relative asset paths that should be preloaded. */
export function allAssetPaths(): string[] {
  const paths = new Set<string>();
  for (const b of BIOME_DEFS) if (b.tile) paths.add(b.tile);
  for (const i of ICON_DEFS) paths.add(i.icon);
  return [...paths];
}
