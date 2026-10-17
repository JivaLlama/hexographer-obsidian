import { type Plugin } from "obsidian";
import { registerTimelineBlock } from "./block";
import { WORLD_TIMELINE_VIEW } from "./constants";
import { TimelineItemView } from "./item-view";
import { openWorldTimeline } from "./open";
import { createRefreshBus } from "./refresh";

export function registerWorldTimeline(plugin: Plugin): void {
  const bus = createRefreshBus(plugin);
  plugin.registerView(WORLD_TIMELINE_VIEW, (leaf) => new TimelineItemView(leaf, bus));
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
}
