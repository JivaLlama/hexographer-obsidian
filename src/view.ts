import { ItemView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import {
  HexLayers,
  HexRenderer,
  MAP_DIR,
  MAP_EXT,
  createPaintState,
  defaultMap,
  deserializeMap,
  mapPath,
  paintCell,
  serializeMap,
  stringifyMap,
  type BiomeId,
  type HexMapData,
  type LayerKind,
  type PaintState,
  type PaintTool,
} from "./hex";
import { HexToolbar } from "./ui/toolbar";

export const HEX_MAP_VIEW_TYPE = "hex-map-view";

export class HexMapView extends ItemView {
  private canvasEl!: HTMLCanvasElement;
  private statusEl!: HTMLElement;
  private wrapEl!: HTMLElement;
  private toolbar!: HexToolbar;

  private layers = new HexLayers();
  private paint: PaintState = createPaintState();
  private renderer!: HexRenderer;
  private mapMeta: Pick<HexMapData, "name" | "hexSize" | "grid"> = {
    name: "untitled",
    hexSize: 24,
    grid: { cols: 20, rows: 15 },
  };
  private filePath: string | null = null;
  private dirty = false;

  private painting = false;
  private panning = false;
  private lastPan: { x: number; y: number } | null = null;
  private lastPaintKey: string | null = null;
  private raf = 0;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return HEX_MAP_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.mapMeta.name ? `Hex: ${this.mapMeta.name}` : "Hex map";
  }

  getIcon(): string {
    return "map";
  }

  async onOpen(): Promise<void> {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("hex-map-view");

    this.toolbar = new HexToolbar(root, {
      onTool: (t) => this.setTool(t),
      onBiome: (b) => this.setBiome(b),
      onLayerToggle: (k) => this.toggleLayer(k),
      onNew: () => void this.newMap(),
      onOpen: () => void this.openMap(),
      onSave: () => void this.saveMap(),
    });

    this.wrapEl = root.createDiv({ cls: "hex-map-canvas-wrap" });
    this.canvasEl = this.wrapEl.createEl("canvas");
    this.statusEl = root.createDiv({ cls: "hex-map-status" });

    this.renderer = new HexRenderer(
      this.mapMeta.hexSize,
      this.mapMeta.grid.cols,
      this.mapMeta.grid.rows,
      this.layers
    );

    this.bindCanvas();
    this.syncToolbar();
    this.scheduleDraw();
    this.setStatus("New map — paint biomes, roads, labels. Save to maps/*.hexmap.json");

    // Resize observer
    const ro = new ResizeObserver(() => this.scheduleDraw());
    ro.observe(this.wrapEl);
    this.register(() => ro.disconnect());
  }

  async onClose(): Promise<void> {
    if (this.raf) cancelAnimationFrame(this.raf);
  }

  private bindCanvas(): void {
    const c = this.canvasEl;

    this.registerDomEvent(c, "pointerdown", (e: PointerEvent) => {
      c.setPointerCapture(e.pointerId);
      if (e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey)) {
        this.panning = true;
        this.lastPan = { x: e.clientX, y: e.clientY };
        return;
      }
      if (e.button === 0) {
        this.painting = true;
        this.lastPaintKey = null;
        this.applyAtEvent(e);
      }
    });

    this.registerDomEvent(c, "pointermove", (e: PointerEvent) => {
      if (this.panning && this.lastPan) {
        const dx = e.clientX - this.lastPan.x;
        const dy = e.clientY - this.lastPan.y;
        this.renderer.camera.x += dx / this.renderer.camera.zoom;
        this.renderer.camera.y += dy / this.renderer.camera.zoom;
        this.lastPan = { x: e.clientX, y: e.clientY };
        this.scheduleDraw();
        return;
      }
      if (this.painting) {
        this.applyAtEvent(e);
      } else {
        const rect = c.getBoundingClientRect();
        const ax = this.renderer.screenToAxial(e.clientX - rect.left, e.clientY - rect.top);
        this.setStatus(`q=${ax.q} r=${ax.r} · tool=${this.paint.tool} · ${this.filePath ?? "unsaved"}`);
      }
    });

    this.registerDomEvent(c, "pointerup", () => {
      this.painting = false;
      this.panning = false;
      this.lastPan = null;
      this.lastPaintKey = null;
    });

    this.registerDomEvent(c, "pointercancel", () => {
      this.painting = false;
      this.panning = false;
      this.lastPan = null;
    });

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const rect = c.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const before = this.renderer.screenToWorld(sx, sy);
      this.renderer.camera.zoom = Math.min(4, Math.max(0.25, this.renderer.camera.zoom * factor));
      const after = this.renderer.screenToWorld(sx, sy);
      this.renderer.camera.x += after.x - before.x;
      this.renderer.camera.y += after.y - before.y;
      this.scheduleDraw();
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    this.register(() => c.removeEventListener("wheel", onWheel));

    this.registerDomEvent(c, "contextmenu", (e: Event) => e.preventDefault());
  }

  private applyAtEvent(e: PointerEvent): void {
    const rect = this.canvasEl.getBoundingClientRect();
    const { q, r } = this.renderer.screenToAxial(e.clientX - rect.left, e.clientY - rect.top);
    if (q < 0 || r < 0 || q >= this.mapMeta.grid.cols || r >= this.mapMeta.grid.rows) return;

    const key = `${q},${r}`;
    if (key === this.lastPaintKey) return;
    this.lastPaintKey = key;

    let labelText: string | undefined;
    if (this.paint.tool === "label") {
      const existing = this.layers.getLabel(q, r) ?? "";
      const next = window.prompt("Label text (empty to clear):", existing);
      if (next === null) return;
      labelText = next;
    }

    if (paintCell(this.layers, q, r, this.paint, labelText)) {
      this.dirty = true;
      this.scheduleDraw();
    }
  }

  private setTool(tool: PaintTool): void {
    this.paint.tool = tool;
    if (tool === "road") this.paint.roadOn = true;
    this.syncToolbar();
  }

  private setBiome(biome: BiomeId): void {
    this.paint.biome = biome;
    this.paint.tool = "biome";
    this.syncToolbar();
  }

  private toggleLayer(kind: LayerKind): void {
    this.layers.toggleVisibility(kind);
    this.syncToolbar();
    this.scheduleDraw();
  }

  private syncToolbar(): void {
    this.toolbar.sync({
      tool: this.paint.tool,
      biome: this.paint.biome,
      layers: { ...this.layers.visibility },
    });
  }

  private scheduleDraw(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
    });
  }

  private draw(): void {
    const wrap = this.wrapEl;
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (w < 1 || h < 1) return;

    this.canvasEl.width = Math.floor(w * dpr);
    this.canvasEl.height = Math.floor(h * dpr);
    this.canvasEl.style.width = `${w}px`;
    this.canvasEl.style.height = `${h}px`;

    const ctx = this.canvasEl.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.renderer.draw(ctx, w, h);
  }

  private setStatus(msg: string): void {
    this.statusEl.setText(msg + (this.dirty ? " · modified" : ""));
  }

  private loadData(data: HexMapData, path: string | null): void {
    this.mapMeta = {
      name: data.name,
      hexSize: data.hexSize,
      grid: { ...data.grid },
    };
    this.layers.loadFromData(data);
    this.renderer = new HexRenderer(
      data.hexSize,
      data.grid.cols,
      data.grid.rows,
      this.layers,
      this.renderer?.camera
    );
    this.filePath = path;
    this.dirty = false;
    this.syncToolbar();
    this.scheduleDraw();
  }

  async newMap(): Promise<void> {
    const name = window.prompt("Map name:", "untitled");
    if (!name) return;
    const cols = Number(window.prompt("Columns:", "20") ?? "20");
    const rows = Number(window.prompt("Rows:", "15") ?? "15");
    const data = defaultMap(name, Number.isFinite(cols) ? cols : 20, Number.isFinite(rows) ? rows : 15);
    this.loadData(data, null);
    this.setStatus(`New map "${name}"`);
  }

  async openMap(): Promise<void> {
    const files = this.app.vault
      .getFiles()
      .filter((f) => f.path.endsWith(MAP_EXT) || f.path.includes(`${MAP_DIR}/`));
    const hexFiles = files.filter((f) => f.path.endsWith(MAP_EXT));
    if (hexFiles.length === 0) {
      new Notice(`No ${MAP_EXT} files found. Create maps under ${MAP_DIR}/`);
      return;
    }
    const names = hexFiles.map((f) => f.path);
    const pick = window.prompt(`Open map (enter path):\n${names.join("\n")}`, names[0]);
    if (!pick) return;
    const file = this.app.vault.getAbstractFileByPath(pick);
    if (!(file instanceof TFile)) {
      new Notice(`Not found: ${pick}`);
      return;
    }
    try {
      const raw = await this.app.vault.read(file);
      const data = deserializeMap(raw);
      this.loadData(data, file.path);
      this.setStatus(`Opened ${file.path}`);
    } catch (err) {
      new Notice(`Failed to open: ${String(err)}`);
    }
  }

  async saveMap(): Promise<void> {
    const data = serializeMap(this.mapMeta, this.layers);
    const body = stringifyMap(data);
    let path = this.filePath;
    if (!path) {
      path = mapPath(this.mapMeta.name);
      const choose = window.prompt("Save path:", path);
      if (!choose) return;
      path = choose.endsWith(MAP_EXT) ? choose : mapPath(choose.replace(/\.hexmap\.json$/i, ""));
    }

    try {
      await this.ensureFolder(path);
      const existing = this.app.vault.getAbstractFileByPath(path);
      if (existing instanceof TFile) {
        await this.app.vault.modify(existing, body);
      } else {
        await this.app.vault.create(path, body);
      }
      this.filePath = path;
      this.dirty = false;
      this.setStatus(`Saved ${path}`);
      new Notice(`Saved ${path}`);
    } catch (err) {
      new Notice(`Save failed: ${String(err)}`);
    }
  }

  private async ensureFolder(filePath: string): Promise<void> {
    const parts = filePath.split("/");
    if (parts.length < 2) return;
    let acc = "";
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i];
      const af = this.app.vault.getAbstractFileByPath(acc);
      if (!af) {
        await this.app.vault.createFolder(acc);
      }
    }
  }
}
