import {
  axialKey,
  type BiomeId,
  type HexMapData,
  type LayerKind,
  type LayerVisibility,
} from "./types";

/**
 * Mutable layer store for one map. Engine-side only.
 */
export class HexLayers {
  biome: Map<string, BiomeId> = new Map();
  road: Set<string> = new Set();
  label: Map<string, string> = new Map();

  visibility: LayerVisibility = {
    biome: true,
    road: true,
    label: true,
  };

  clear(): void {
    this.biome.clear();
    this.road.clear();
    this.label.clear();
  }

  setBiome(q: number, r: number, id: BiomeId): void {
    this.biome.set(axialKey(q, r), id);
  }

  getBiome(q: number, r: number): BiomeId | undefined {
    return this.biome.get(axialKey(q, r));
  }

  setRoad(q: number, r: number, on: boolean): void {
    const k = axialKey(q, r);
    if (on) this.road.add(k);
    else this.road.delete(k);
  }

  hasRoad(q: number, r: number): boolean {
    return this.road.has(axialKey(q, r));
  }

  setLabel(q: number, r: number, text: string): void {
    const k = axialKey(q, r);
    if (text.trim() === "") this.label.delete(k);
    else this.label.set(k, text);
  }

  getLabel(q: number, r: number): string | undefined {
    return this.label.get(axialKey(q, r));
  }

  erase(q: number, r: number, layer?: LayerKind): void {
    const k = axialKey(q, r);
    if (!layer || layer === "biome") this.biome.delete(k);
    if (!layer || layer === "road") this.road.delete(k);
    if (!layer || layer === "label") this.label.delete(k);
  }

  toggleVisibility(kind: LayerKind): void {
    this.visibility[kind] = !this.visibility[kind];
  }

  loadFromData(data: HexMapData): void {
    this.clear();
    for (const [k, v] of Object.entries(data.layers.biome)) {
      this.biome.set(k, v);
    }
    for (const [k, v] of Object.entries(data.layers.road)) {
      if (v) this.road.add(k);
    }
    for (const [k, v] of Object.entries(data.layers.label)) {
      this.label.set(k, v);
    }
  }

  toLayerRecords(): HexMapData["layers"] {
    const biome: Record<string, BiomeId> = {};
    const road: Record<string, boolean> = {};
    const label: Record<string, string> = {};
    for (const [k, v] of this.biome) biome[k] = v;
    for (const k of this.road) road[k] = true;
    for (const [k, v] of this.label) label[k] = v;
    return { biome, road, label };
  }
}
