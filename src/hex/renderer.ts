import { HexGrid } from "./grid";
import { HexLayers } from "./layers";
import { BIOME_BY_ID, ICON_BY_ID } from "./catalog";
import type { AssetCache } from "./assets";
import { BIOME_COLORS, type BiomeId, parseAxialKey } from "./types";

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export function createCamera(): Camera {
  return { x: 40, y: 40, zoom: 1 };
}

/** Axial neighbor deltas (pointy-top). */
const NEIGHBORS: Array<[number, number]> = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

/**
 * Lean 2D canvas renderer for the hex engine.
 */
export class HexRenderer {
  grid: HexGrid;
  layers: HexLayers;
  camera: Camera;
  cols: number;
  rows: number;
  assets: AssetCache | null = null;

  constructor(
    hexSize: number,
    cols: number,
    rows: number,
    layers?: HexLayers,
    camera?: Camera,
    assets?: AssetCache | null
  ) {
    this.grid = new HexGrid(hexSize);
    this.layers = layers ?? new HexLayers();
    this.camera = camera ?? createCamera();
    this.cols = cols;
    this.rows = rows;
    this.assets = assets ?? null;
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: (wx + this.camera.x) * this.camera.zoom,
      y: (wy + this.camera.y) * this.camera.zoom,
    };
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: sx / this.camera.zoom - this.camera.x,
      y: sy / this.camera.zoom - this.camera.y,
    };
  }

  screenToAxial(sx: number, sy: number): { q: number; r: number } {
    const w = this.screenToWorld(sx, sy);
    return this.grid.pixelToAxial(w.x, w.y);
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#1a1a1e";
    ctx.fillRect(0, 0, width, height);

    const size = this.grid.size * this.camera.zoom;

    for (const { q, r } of this.grid.cells(this.cols, this.rows)) {
      const { x, y } = this.grid.axialToPixel(q, r);
      const s = this.worldToScreen(x, y);
      if (s.x < -size * 2 || s.y < -size * 2 || s.x > width + size * 2 || s.y > height + size * 2) {
        continue;
      }
      this.drawHexOutline(ctx, s.x, s.y, size, "rgba(255,255,255,0.08)");
    }

    if (this.layers.visibility.biome) {
      for (const [key, biome] of this.layers.biome) {
        const { q, r } = parseAxialKey(key);
        if (q < 0 || r < 0 || q >= this.cols || r >= this.rows) continue;
        const { x, y } = this.grid.axialToPixel(q, r);
        const s = this.worldToScreen(x, y);
        this.drawBiomeHex(ctx, s.x, s.y, size, biome as BiomeId);
      }
    }

    if (this.layers.visibility.river) {
      this.drawPathNetwork(ctx, this.layers.river, size, "#4a9fd4", Math.max(2.5, size * 0.22));
    }

    if (this.layers.visibility.road) {
      this.drawPathNetwork(ctx, this.layers.road, size, "#c4a35a", Math.max(2, size * 0.16));
    }

    if (this.layers.visibility.icon) {
      for (const [key, iconId] of this.layers.icon) {
        const { q, r } = parseAxialKey(key);
        if (q < 0 || r < 0 || q >= this.cols || r >= this.rows) continue;
        const { x, y } = this.grid.axialToPixel(q, r);
        const s = this.worldToScreen(x, y);
        this.drawIcon(ctx, s.x, s.y, size, iconId);
      }
    }

    if (this.layers.visibility.label) {
      ctx.fillStyle = "#f0f0f0";
      ctx.strokeStyle = "rgba(0,0,0,0.75)";
      ctx.lineWidth = 3;
      ctx.font = `bold ${Math.max(10, size * 0.4)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const [key, text] of this.layers.label) {
        const { q, r } = parseAxialKey(key);
        if (q < 0 || r < 0 || q >= this.cols || r >= this.rows) continue;
        const { x, y } = this.grid.axialToPixel(q, r);
        const s = this.worldToScreen(x, y);
        const ty = s.y + size * 0.55;
        ctx.strokeText(text, s.x, ty);
        ctx.fillText(text, s.x, ty);
      }
    }
  }

  private drawBiomeHex(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    size: number,
    biome: BiomeId
  ): void {
    const def = BIOME_BY_ID[biome];
    const color = def?.color ?? BIOME_COLORS[biome] ?? "#444";
    const tilePath = def?.tile ?? null;
    const img = tilePath && this.assets ? this.assets.get(tilePath) : null;

    if (img && img.complete && img.naturalWidth > 0) {
      ctx.save();
      this.hexPath(ctx, cx, cy, size);
      ctx.clip();
      const w = size * 2;
      const h = size * 2;
      ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
      ctx.restore();
      this.drawHexOutline(ctx, cx, cy, size, "rgba(0,0,0,0.3)");
    } else {
      this.drawHexFill(ctx, cx, cy, size, color);
      this.drawHexOutline(ctx, cx, cy, size, "rgba(0,0,0,0.25)");
    }
  }

  private drawIcon(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    size: number,
    iconId: string
  ): void {
    const def = ICON_BY_ID[iconId];
    const img = def && this.assets ? this.assets.get(def.icon) : null;
    if (img && img.complete && img.naturalWidth > 0) {
      const iw = size * 1.1;
      const ih = (img.naturalHeight / img.naturalWidth) * iw;
      ctx.drawImage(img, cx - iw / 2, cy - ih * 0.65, iw, ih);
      return;
    }
    // Fallback glyph
    ctx.fillStyle = "#1a1a1e";
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f0e6d0";
    ctx.font = `bold ${Math.max(9, size * 0.35)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((iconId[0] ?? "?").toUpperCase(), cx, cy);
  }

  private drawPathNetwork(
    ctx: CanvasRenderingContext2D,
    cells: Set<string>,
    size: number,
    color: string,
    lineWidth: number
  ): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const key of cells) {
      const { q, r } = parseAxialKey(key);
      if (q < 0 || r < 0 || q >= this.cols || r >= this.rows) continue;
      const { x, y } = this.grid.axialToPixel(q, r);
      const s = this.worldToScreen(x, y);

      let linked = false;
      for (const [dq, dr] of NEIGHBORS) {
        const nq = q + dq;
        const nr = r + dr;
        if (!cells.has(`${nq},${nr}`)) continue;
        // Draw each edge once (only toward "greater" neighbor)
        if (nq < q || (nq === q && nr < r)) continue;
        const np = this.grid.axialToPixel(nq, nr);
        const ns = this.worldToScreen(np.x, np.y);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(ns.x, ns.y);
        ctx.stroke();
        linked = true;
      }

      if (!linked) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, lineWidth * 0.7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
    const corners = this.cornersAt(cx, cy, size);
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
  }

  private drawHexFill(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    size: number,
    color: string
  ): void {
    this.hexPath(ctx, cx, cy, size);
    ctx.fillStyle = color;
    ctx.fill();
  }

  private drawHexOutline(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    size: number,
    color: string
  ): void {
    this.hexPath(ctx, cx, cy, size);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private cornersAt(
    cx: number,
    cy: number,
    size: number
  ): Array<{ x: number; y: number }> {
    const out: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      out.push({
        x: cx + size * Math.cos(angle),
        y: cy + size * Math.sin(angle),
      });
    }
    return out;
  }
}
