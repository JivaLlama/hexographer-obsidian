import type { Axial } from "./types";

/**
 * Pointy-top hex grid helpers (axial coordinates).
 * Pure math — no Obsidian dependency. Safe for standalone hosts.
 */
export class HexGrid {
  /** Distance from center to vertex (also flat-to-flat / 2 for pointy). */
  constructor(public size: number) {}

  /** Pixel width of one hex (pointy-top). */
  get hexWidth(): number {
    return Math.sqrt(3) * this.size;
  }

  /** Pixel height of one hex (pointy-top). */
  get hexHeight(): number {
    return 2 * this.size;
  }

  /** Horizontal spacing between column centers. */
  get horizSpacing(): number {
    return this.hexWidth;
  }

  /** Vertical spacing between row centers. */
  get vertSpacing(): number {
    return (3 / 2) * this.size;
  }

  /** Center of hex (q, r) in pixel space (origin at 0,0). */
  axialToPixel(q: number, r: number): { x: number; y: number } {
    const x = this.size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
    const y = this.size * ((3 / 2) * r);
    return { x, y };
  }

  /** Nearest axial hex for a pixel point. */
  pixelToAxial(x: number, y: number): Axial {
    const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / this.size;
    const r = ((2 / 3) * y) / this.size;
    return hexRound(q, r);
  }

  /** Six corner vertices relative to hex center (pointy-top). */
  corners(cx: number, cy: number): Array<{ x: number; y: number }> {
    const out: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      out.push({
        x: cx + this.size * Math.cos(angle),
        y: cy + this.size * Math.sin(angle),
      });
    }
    return out;
  }

  /** Iterate axial cells in a rectangular offset-style bounds (q 0..cols-1, r 0..rows-1). */
  *cells(cols: number, rows: number): Generator<Axial> {
    for (let r = 0; r < rows; r++) {
      for (let q = 0; q < cols; q++) {
        yield { q, r };
      }
    }
  }
}

function hexRound(q: number, r: number): Axial {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);

  const qDiff = Math.abs(rq - q);
  const rDiff = Math.abs(rr - r);
  const sDiff = Math.abs(rs - s);

  if (qDiff > rDiff && qDiff > sDiff) {
    rq = -rr - rs;
  } else if (rDiff > sDiff) {
    rr = -rq - rs;
  }
  return { q: rq, r: rr };
}
