import {
  BIOME_DEFS,
  ICON_DEFS,
  type AssetCache,
  type BiomeId,
  type PaintTool,
} from "../hex";

export interface PaletteCallbacks {
  onBiome: (biome: BiomeId) => void;
  onIcon: (iconId: string) => void;
  onTool: (tool: PaintTool) => void;
}

export interface PaletteState {
  tool: PaintTool;
  biome: BiomeId;
  icon: string;
}

/**
 * Right-side terrain/icon palette: thumbnail + label (screenshot-inspired, not a clone).
 */
export class HexPalette {
  readonly el: HTMLElement;
  private biomeBtns = new Map<BiomeId, HTMLElement>();
  private iconBtns = new Map<string, HTMLElement>();

  constructor(
    parent: HTMLElement,
    private cb: PaletteCallbacks,
    private assets: AssetCache | null
  ) {
    this.el = parent.createDiv({ cls: "hex-map-palette" });
    this.build();
  }

  private build(): void {
    this.el.empty();

    this.el.createEl("h3", { cls: "hex-palette-title", text: "Terrain" });
    const terrainGrid = this.el.createDiv({ cls: "hex-palette-grid" });

    for (const def of BIOME_DEFS) {
      const btn = terrainGrid.createEl("button", {
        cls: "hex-palette-tile",
        attr: { title: def.label, "aria-label": def.label },
      });
      const thumb = btn.createDiv({ cls: "hex-palette-thumb" });
      if (def.tile && this.assets) {
        const img = this.assets.get(def.tile);
        if (img) {
          const el = thumb.createEl("img", { attr: { alt: def.label } });
          el.src = img.src;
        } else {
          thumb.style.backgroundColor = def.color;
          // Load async and refresh thumb
          void this.assets.load(def.tile).then((loaded) => {
            if (!loaded) return;
            thumb.empty();
            const el = thumb.createEl("img", { attr: { alt: def.label } });
            el.src = loaded.src;
          });
        }
      } else {
        thumb.style.backgroundColor = def.color;
      }
      btn.createSpan({ cls: "hex-palette-label", text: def.label });
      btn.addEventListener("click", () => {
        this.cb.onBiome(def.id);
        this.cb.onTool("biome");
      });
      this.biomeBtns.set(def.id, btn);
    }

    this.el.createEl("h3", { cls: "hex-palette-title", text: "Icons" });
    const iconGrid = this.el.createDiv({ cls: "hex-palette-grid" });

    for (const def of ICON_DEFS) {
      const btn = iconGrid.createEl("button", {
        cls: "hex-palette-tile",
        attr: { title: def.label, "aria-label": def.label },
      });
      const thumb = btn.createDiv({ cls: "hex-palette-thumb hex-palette-thumb-icon" });
      if (this.assets) {
        const img = this.assets.get(def.icon);
        if (img) {
          const el = thumb.createEl("img", { attr: { alt: def.label } });
          el.src = img.src;
        } else {
          void this.assets.load(def.icon).then((loaded) => {
            if (!loaded) return;
            thumb.empty();
            const el = thumb.createEl("img", { attr: { alt: def.label } });
            el.src = loaded.src;
          });
        }
      }
      btn.createSpan({ cls: "hex-palette-label", text: def.label });
      btn.addEventListener("click", () => {
        this.cb.onIcon(def.id);
        this.cb.onTool("icon");
      });
      this.iconBtns.set(def.id, btn);
    }

    this.el.createDiv({
      cls: "hex-palette-hint",
      text: "Alt+drag or middle-click to pan · wheel to zoom",
    });
  }

  /** Rebuild thumbs after assets finish loading. */
  refreshAssets(assets: AssetCache): void {
    this.assets = assets;
    this.build();
  }

  sync(state: PaletteState): void {
    for (const [id, el] of this.biomeBtns) {
      el.toggleClass("is-active", state.tool === "biome" && id === state.biome);
    }
    for (const [id, el] of this.iconBtns) {
      el.toggleClass("is-active", state.tool === "icon" && id === state.icon);
    }
  }
}
