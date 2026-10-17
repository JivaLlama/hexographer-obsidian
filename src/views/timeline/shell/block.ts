import { MarkdownRenderChild, Platform, type Plugin } from "obsidian";
import type { TimelineLeafState } from "./constants";
import { loadTimeline } from "./load";
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
      load: () => loadTimeline(this.plugin.app, this.source),
      onOpenFull: () => {
        void openWorldTimeline(this.plugin, state);
      },
      subscribeRefresh: (listener) => this.bus.subscribe(listener),
    });
  }

  onunload(): void {
    this.mount?.destroy();
    this.mount = null;
  }
}
