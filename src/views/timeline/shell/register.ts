import { PluginSettingTab, Setting, type Plugin } from "obsidian";
import { registerTimelineBlock } from "./block";
import { WORLD_TIMELINE_VIEW } from "./constants";
import { TimelineItemView } from "./item-view";
import { openWorldTimeline } from "./open";
import { createRefreshBus } from "./refresh";

export function registerWorldTimeline(plugin: Plugin): void {
  const bus = createRefreshBus(plugin);
  plugin.registerView(WORLD_TIMELINE_VIEW, (leaf) => new TimelineItemView(leaf, plugin, bus));
  registerTimelineBlock(plugin, bus);

  plugin.addCommand({
    id: "open-world-timeline",
    name: "Open world timeline",
    callback: () => {
      void openWorldTimeline(plugin, { configYaml: "", sourcePath: "" });
    },
  });

  plugin.addRibbonIcon("clock", "Open world timeline", () => {
    void openWorldTimeline(plugin, { configYaml: "", sourcePath: "" });
  });

  plugin.addSettingTab(new WorldTimelineSettingTab(plugin));
}

/** One unit per line, for example `gen: 40-60y`. Empty leaves vault units unset. */
class WorldTimelineSettingTab extends PluginSettingTab {
  constructor(private readonly host: Plugin) {
    super(host.app, host);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    void this.host.loadData().then((data: { units?: string } | null) => {
      new Setting(containerEl)
        .setName("Time units")
        .setDesc("One unit per line, for example gen: 40-60y. Built-in units are y, mo, and d.")
        .addTextArea((text) => {
          text.setPlaceholder("gen: 40-60y");
          text.setValue(typeof data?.units === "string" ? data.units : "");
          text.onChange(async (value) => {
            const current = ((await this.host.loadData()) as Record<string, unknown> | null) ?? {};
            await this.host.saveData({ ...current, units: value });
          });
        });
    });
  }
}
