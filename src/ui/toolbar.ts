import { BIOME_COLORS, BIOME_LIST, type BiomeId, type LayerKind, type PaintTool } from "../hex";

export interface ToolbarCallbacks {
  onTool: (tool: PaintTool) => void;
  onBiome: (biome: BiomeId) => void;
  onLayerToggle: (kind: LayerKind) => void;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
}

export interface ToolbarState {
  tool: PaintTool;
  biome: BiomeId;
  layers: { biome: boolean; road: boolean; label: boolean };
}

/**
 * Simple DOM toolbar — biome swatches, road/label/erase, layer toggles, file ops.
 */
export class HexToolbar {
  readonly el: HTMLElement;
  private toolBtns = new Map<PaintTool, HTMLElement>();
  private biomeBtns = new Map<BiomeId, HTMLElement>();
  private layerBtns = new Map<LayerKind, HTMLElement>();

  constructor(parent: HTMLElement, private cb: ToolbarCallbacks) {
    this.el = parent.createDiv({ cls: "hex-map-toolbar" });
    this.build();
  }

  private build(): void {
    this.el.empty();

    this.addBtn("New", () => this.cb.onNew());
    this.addBtn("Open", () => this.cb.onOpen());
    this.addBtn("Save", () => this.cb.onSave());
    this.sep();

    this.el.createSpan({ cls: "hex-toolbar-label", text: "Tool" });
    this.toolBtns.set("biome", this.addToolBtn("Biome", "biome"));
    this.toolBtns.set("road", this.addToolBtn("Road", "road"));
    this.toolBtns.set("label", this.addToolBtn("Label", "label"));
    this.toolBtns.set("erase", this.addToolBtn("Erase", "erase"));
    this.sep();

    this.el.createSpan({ cls: "hex-toolbar-label", text: "Biome" });
    for (const id of BIOME_LIST) {
      const btn = this.el.createEl("button", {
        cls: "hex-biome-swatch",
        attr: { title: id, "aria-label": id },
      });
      btn.style.backgroundColor = BIOME_COLORS[id];
      btn.addEventListener("click", () => {
        this.cb.onBiome(id);
        this.cb.onTool("biome");
      });
      this.biomeBtns.set(id, btn);
    }
    this.sep();

    this.el.createSpan({ cls: "hex-toolbar-label", text: "Layers" });
    this.layerBtns.set("biome", this.addLayerBtn("Biomes", "biome"));
    this.layerBtns.set("road", this.addLayerBtn("Roads", "road"));
    this.layerBtns.set("label", this.addLayerBtn("Labels", "label"));
  }

  sync(state: ToolbarState): void {
    for (const [tool, el] of this.toolBtns) {
      el.toggleClass("is-active", tool === state.tool);
    }
    for (const [id, el] of this.biomeBtns) {
      el.toggleClass("is-active", id === state.biome);
    }
    for (const [kind, el] of this.layerBtns) {
      el.toggleClass("is-active", state.layers[kind]);
    }
  }

  private addBtn(label: string, onClick: () => void): HTMLElement {
    const btn = this.el.createEl("button", { cls: "hex-tool-btn", text: label });
    btn.addEventListener("click", onClick);
    return btn;
  }

  private addToolBtn(label: string, tool: PaintTool): HTMLElement {
    return this.addBtn(label, () => this.cb.onTool(tool));
  }

  private addLayerBtn(label: string, kind: LayerKind): HTMLElement {
    return this.addBtn(label, () => this.cb.onLayerToggle(kind));
  }

  private sep(): void {
    this.el.createDiv({ cls: "hex-toolbar-sep" });
  }
}
