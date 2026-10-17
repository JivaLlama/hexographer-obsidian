import { ItemView, Platform, TFile, type Plugin, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import { WORLD_TIMELINE_VIEW, readLeafState, type TimelineLeafState } from "./constants";
import { loadTimeline, openTimelineNote, vaultSettings } from "./load";
import { mountTimeline, type TimelineMount } from "./mount";
import type { RefreshBus } from "./refresh";

export class TimelineItemView extends ItemView {
  private mount: TimelineMount | null = null;
  private leafState: TimelineLeafState = { configYaml: "", sourcePath: "" };

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: Plugin,
    private readonly bus: RefreshBus
  ) {
    super(leaf);
  }

  getViewType(): string {
    return WORLD_TIMELINE_VIEW;
  }

  getDisplayText(): string {
    const path = this.leafState.sourcePath;
    if (path) {
      const base = path.split("/").pop()?.replace(/\.md$/i, "");
      if (base) return `Timeline: ${base}`;
    }
    return "World timeline";
  }

  getIcon(): string {
    return "clock";
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    this.leafState = readLeafState(state);
    await super.setState(state, result);
    if (this.mount) await this.mount.reload({ fit: true });
  }

  getState(): Record<string, unknown> {
    return { configYaml: this.leafState.configYaml, sourcePath: this.leafState.sourcePath };
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("world-timeline-view");
    this.mount = mountTimeline({
      container: this.contentEl,
      surface: "full",
      mobile: Platform.isMobile,
      load: async () => loadTimeline(this.app, this.leafState.configYaml, await vaultSettings(this.plugin)),
      onOpenItem: (itemId) => {
        void openTimelineNote(this.plugin, itemId, this.leafState.sourcePath);
      },
      subscribeRefresh: (listener) => this.bus.subscribe(listener),
      edit: {
        read: (path) => this.app.vault.adapter.read(path),
        write: async (path, markdown) => {
          const file = this.app.vault.getAbstractFileByPath(path);
          if (file instanceof TFile) await this.app.vault.modify(file, markdown);
        },
      },
    });
  }

  async onClose(): Promise<void> {
    this.mount?.destroy();
    this.mount = null;
  }
}
