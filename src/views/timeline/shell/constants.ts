export const WORLD_TIMELINE_VIEW = "world-timeline-view";

export interface TimelineLeafState {
  configYaml: string;
  sourcePath: string;
}

export function readLeafState(state: unknown): TimelineLeafState {
  if (!state || typeof state !== "object") return { configYaml: "", sourcePath: "" };
  const raw = state as Record<string, unknown>;
  return {
    configYaml: typeof raw.configYaml === "string" ? raw.configYaml : "",
    sourcePath: typeof raw.sourcePath === "string" ? raw.sourcePath : "",
  };
}
