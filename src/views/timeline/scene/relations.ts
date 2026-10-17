import { createCalendar, parseTimelineConfig, RECKONING, type VaultSettings } from "../../../core";
import { notesFromMarkdown, type TimelineDataset } from "./dataset";

/** Sample vault unit. The plugin setting stores the same line, `gen: 40-60y`. */
export const RELATION_SETTINGS: VaultSettings = { units: { gen: "40-60y" } };

const MASTER_CONFIG = `
calendar: reckoning
source:
  folders: [samples/relations]
filters:
  accounts: true
lanes:
  order: ["[[Chain]]", "[[Accounts]]"]
view:
  from: "3A 380"
  to: "3A 640"
`;

const ACCOUNTS_CONFIG = `
calendar: reckoning
source:
  folders: [samples/relations]
filters:
  accounts: true
lanes:
  order: ["[[Chain]]", "[[Accounts]]"]
view:
  from: "3A 408"
  to: "3A 436"
`;

const CULTURE_CONFIG = `
calendar: reckoning
source:
  folders: [samples/relations]
filters:
  cultures: ["[[South]]"]
  accounts: true
view:
  from: "3A 400"
  to: "3A 450"
`;

const RELATION_NOTES: readonly { path: string; markdown: string }[] = [
  {
    path: "samples/relations/events/Marker A.md",
    markdown: `---
type: event
calendar: reckoning
start: "3A 400"
lane: "[[Chain]]"
---
# Marker A
`,
  },
  {
    path: "samples/relations/events/Marker B.md",
    markdown: `---
type: event
calendar: reckoning
after: "[[Marker A]]"
gap: "1 gen"
lane: "[[Chain]]"
---
# Marker B
`,
  },
  {
    path: "samples/relations/events/Marker C.md",
    markdown: `---
type: event
calendar: reckoning
after: "[[Marker B]]"
gap: "1 gen"
lane: "[[Chain]]"
---
# Marker C
`,
  },
  {
    path: "samples/relations/events/Marker D.md",
    markdown: `---
type: event
calendar: reckoning
after: "[[Marker C]]"
gap: "1 gen"
lane: "[[Chain]]"
---
# Marker D
`,
  },
  {
    path: "samples/relations/events/Cycle Left.md",
    markdown: `---
type: event
calendar: reckoning
after: "[[Cycle Right]]"
gap: "1 gen"
lane: "[[Chain]]"
---
# Cycle Left
`,
  },
  {
    path: "samples/relations/events/Cycle Right.md",
    markdown: `---
type: event
calendar: reckoning
after: "[[Cycle Left]]"
gap: "1 gen"
lane: "[[Chain]]"
---
# Cycle Right
`,
  },
  {
    path: "samples/relations/events/Shared Event.md",
    markdown: `---
type: event
calendar: reckoning
start: "3A 420"
culture: "[[North]]"
lane: "[[Accounts]]"
accounts:
  - by: "[[North]]"
    start: "3A 416"
    claim: "recorded earlier"
  - by: "[[South]]"
    start: "3A 428"
    claim: "recorded later"
---
# Shared Event
`,
  },
];

/** Master chain, a tighter accounts frame, or the South culture swap. */
export function relationDataset(mode: "master" | "accounts" | "culture" = "master"): TimelineDataset {
  const calendar = createCalendar(RECKONING);
  const yaml = mode === "culture" ? CULTURE_CONFIG : mode === "accounts" ? ACCOUNTS_CONFIG : MASTER_CONFIG;
  const config = parseTimelineConfig(yaml, calendar.def.id);
  const notes = notesFromMarkdown(RELATION_NOTES, [calendar], calendar.def.id);
  return {
    items: notes.items,
    ordered: notes.ordered,
    calendars: [calendar],
    calendar,
    config,
    origin: "stub",
    settings: RELATION_SETTINGS,
  };
}
