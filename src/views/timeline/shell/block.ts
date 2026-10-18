import { MarkdownRenderChild, Platform, TFile, type Plugin } from "obsidian";
import type { TimelineLeafState } from "./constants";
import { loadTimeline, openTimelineNote, vaultSettings } from "./load";
import { mountTimeline, type TimelineMount } from "./mount";
import { openWorldTimeline } from "./open";
import type { RefreshBus } from "./refresh";

export function registerTimelineBlock(plugin: Plugin, bus: RefreshBus): void {
  plugin.registerMarkdownCodeBlockProcessor("worldtimeline", (source, el, ctx) => {
    ctx.addChild(new TimelineBlock(el, plugin, source, ctx.sourcePath, bus));
  });
}

class TimelineBlock extends MarkdownRenderChild {
  private mount: TimelineMount | null = null;

  constructor(
    containerEl: HTMLElement,
    private readonly plugin: Plugin,
    private readonly source: string,
    private readonly sourcePath: string,
    private readonly bus: RefreshBus
  ) {
    super(containerEl);
  }

  onload(): void {
    const state: TimelineLeafState = { configYaml: this.source, sourcePath: this.sourcePath };
    this.mount = mountTimeline({
      container: this.containerEl,
      surface: "inline",
      mobile: Platform.isMobile,
      load: async () => loadTimeline(this.plugin.app, this.source, await vaultSettings(this.plugin)),
      onOpenFull: () => {
        void openWorldTimeline(this.plugin, state);
      },
      onOpenItem: (itemId) => {
        void openTimelineNote(this.plugin, itemId, this.sourcePath);
      },
      subscribeRefresh: (listener) => this.bus.subscribe(listener),
      edit: {
        read: (path) => this.plugin.app.vault.adapter.read(path),
        write: async (path, markdown) => {
          const file = this.plugin.app.vault.getAbstractFileByPath(path);
          if (file instanceof TFile) await this.plugin.app.vault.modify(file, markdown);
        },
      },
    });
  }

  onunload(): void {
    this.mount?.destroy();
    this.mount = null;
  }
}
