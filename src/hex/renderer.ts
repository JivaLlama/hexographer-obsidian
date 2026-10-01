import { HexGrid } from "./grid";
import { HexLayers } from "./layers";
import { BIOME_COLORS, type BiomeId } from "./types";
import { parseAxialKey } from "./types";

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export function createCamera(): Camera {
  return { x: 40, y: 40, zoom: 1 };
}

/**
 * Lean 2D canvas renderer for the hex engine.
 */
export class HexRenderer {
  grid: HexGrid;
  layers: HexLayers;
  camera: Camera;
  cols: number;
  rows: number;

  constructor(
    hexSize: number,
    cols: number,
    rows: number,
    layers?: HexLayers,
    camera?: Camera
  ) {
    this.grid = new HexGrid(hexSize);
    this.layers = layers ?? new HexLayers();
    this.camera = camera ?? createCamera();
    this.cols = cols;
    this.rows = rows;
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

    // Empty grid outlines
    for (const { q, r } of this.grid.cells(this.cols, this.rows)) {
      const { x, y } = this.grid.axialToPixel(q, r);
      const s = this.worldToScreen(x, y);
      this.drawHexOutline(ctx, s.x, s.y, size, "rgba(255,255,255,0.08)");
    }

    if (this.layers.visibility.biome) {
      for (const [key, biome] of this.layers.biome) {
        const { q, r } = parseAxialKey(key);
        if (q < 0 || r < 0 || q >= this.cols || r >= this.rows) continue;
        const { x, y } = this.grid.axialToPixel(q, r);
        const s = this.worldToScreen(x, y);
        this.drawHexFill(ctx, s.x, s.y, size, BIOME_COLORS[biome as BiomeId] ?? "#444");
        this.drawHexOutline(ctx, s.x, s.y, size, "rgba(0,0,0,0.25)");
      }
    }

    if (this.layers.visibility.road) {
      ctx.strokeStyle = "#c4a35a";
      ctx.lineWidth = Math.max(2, size * 0.18);
      ctx.lineCap = "round";
      for (const key of this.layers.road) {
        const { q, r } = parseAxialKey(key);
        if (q < 0 || r < 0 || q >= this.cols || r >= this.rows) continue;
        const { x, y } = this.grid.axialToPixel(q, r);
        const s = this.worldToScreen(x, y);
        ctx.beginPath();
        ctx.arc(s.x, s.y, size * 0.22, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    if (this.layers.visibility.label) {
      ctx.fillStyle = "#f0f0f0";
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.lineWidth = 3;
      ctx.font = `bold ${Math.max(10, size * 0.45)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const [key, text] of this.layers.label) {
        const { q, r } = parseAxialKey(key);
        if (q < 0 || r < 0 || q >= this.cols || r >= this.rows) continue;
        const { x, y } = this.grid.axialToPixel(q, r);
        const s = this.worldToScreen(x, y);
        ctx.strokeText(text, s.x, s.y);
        ctx.fillText(text, s.x, s.y);
      }
    }
  }

  private drawHexFill(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    size: number,
    color: string
  ): void {
    const corners = this.cornersAt(cx, cy, size);
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
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
    const corners = this.cornersAt(cx, cy, size);
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
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
