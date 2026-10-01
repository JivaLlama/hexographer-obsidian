import { Plugin, WorkspaceLeaf } from "obsidian";
import { HEX_MAP_VIEW_TYPE, HexMapView } from "./view";

export default class HexographerPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerView(HEX_MAP_VIEW_TYPE, (leaf) => new HexMapView(leaf));

    this.addRibbonIcon("map", "Open hex map", () => {
      void this.activateView();
    });

    this.addCommand({
      id: "open-hex-map",
      name: "Open hex map",
      callback: () => {
        void this.activateView();
      },
    });
  }

  onunload(): void {
    // Views detach automatically; engine has no global state.
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const existing = workspace.getLeavesOfType(HEX_MAP_VIEW_TYPE);
    if (existing.length > 0) {
      leaf = existing[0];
    } else {
      leaf = workspace.getLeaf("tab");
      await leaf.setViewState({ type: HEX_MAP_VIEW_TYPE, active: true });
    }

    workspace.revealLeaf(leaf);
  }
}
