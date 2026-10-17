import { type Plugin } from "obsidian";
import { WORLD_TIMELINE_VIEW, type TimelineLeafState } from "./constants";

export async function openWorldTimeline(plugin: Plugin, state: TimelineLeafState): Promise<void> {
  const { workspace } = plugin.app;
  const existing = workspace.getLeavesOfType(WORLD_TIMELINE_VIEW);
  const leaf = existing[0] ?? workspace.getLeaf("tab");
  await leaf.setViewState({
    type: WORLD_TIMELINE_VIEW,
    active: true,
    state: { configYaml: state.configYaml, sourcePath: state.sourcePath },
  });
  workspace.revealLeaf(leaf);
}
