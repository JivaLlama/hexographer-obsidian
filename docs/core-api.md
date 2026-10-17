# Core API

Contract for the timeline view. Import from `src/core`. This module imports nothing from `obsidian` and nothing that touches the page. `node scripts/check-core-boundary.mjs` fails the build and `npm test` if that changes.

The plugin entry does not import the core yet. The hex painter is unchanged.

## Frozen types

`TimelineItem` is one note.

- `start` and `end` are inclusive world days: the start of each written date. `end` is `null` for a point.
- `startPrecision` and `endPrecision` are independent. `"3A 412"` to `"3A 412 Frostmoot 9"` is legal. `endPrecision` is `null` when there is no end.
- `extentTo` is the exclusive end of the occupied interval, computed when the note is parsed. Draw bars and zoomed-in point brackets from `extentOf(item)`, which is `{ from: item.start, to: item.extentTo }`. A year-precision end includes that whole year. Do not call the calendar engine for this.
- `laneId` is the frontmatter string (`"[[House Vey]]"`), or `null` for eras and unlaned items.
- `parseError` is set when a date fails. The item is still returned.
- `links.other` is always `[]` in this phase. `places` and `people` come from frontmatter. Body wikilinks are not scanned.
- `source.startRaw` / `source.endRaw` are the original strings.

`FilterState.range` is half-open `[from, to)` on world days. `itemMatches` / `filterItems` implement it. An era ignores a lane filter and still has to pass the other filters.

`EditCommand` is `{ label, patches: [{ path, fields: [{ key, before, after }] }] }`. One drag is one command.

## Moves

```ts
planMove(item, deltaDays, mode, { fine, calendar })
```

`mode` is `"move" | "resize-start" | "resize-end"`. `deltaDays` is a world-day offset; convert pixels with `Scale` before calling. The result is `{ start, end, startRaw, endRaw, command }`. Use `startRaw` / `endRaw` for the ghost tooltip and for writeback. They are the same strings.

- Move shifts both ends by the same number of calendar units (years, months, …), then formats each end at its own precision.
- `fine: true` (Alt) steps that precision down one level and writes the finer pattern.
- Resize clamps so the start does not pass the end.
- A zero-length snap that lands on the original instant returns the original raw string, so the note does not churn.
- `command.patches` is empty when nothing changed. Do not push that.

`serializeTimelineNote(markdown, { start, end })` patches frontmatter and copies the body through unchanged. `end: null` deletes the key. `applyPlanToNote(markdown, plan)` writes `startRaw` and, when present, `endRaw`.

## Lanes

```ts
packLanes(items, lanes) → { rows: Map<itemId, row>, laneHeights: Map<laneId, rowCount> }
```

Walks items in the order given and assigns the first non-overlapping row. Same order, same rows. Do not re-sort by start on every drag frame if you want items to stay put. Eras are omitted. Listed lanes have height at least 1. `laneId == null` uses `DEFAULT_LANE_ID` (`""`). Overlap is `[extent.from, extent.to)`.

## Scale

```ts
createScale({ originDays, pxPerDay, minPxPerDay, maxPxPerDay })
scaleLimitsForCalendar(calendar, { viewportPx, minutePx, spanYears })
```

`toPx` / `toDays` are relative to `originDays`. Re-base the origin when a zoom or pan ends so SVG coordinates stay small. `zoomAt(px, factor)` keeps the day under `px` fixed and clamps `pxPerDay`. Default limits: one minute is 8px at max zoom; min zoom fits the bounded era span, or 10,000 years, into 1280px.

## Calendar

World day 0 is proleptic Gregorian 1970-01-01 00:00 UTC. A calendar-local day 0 is absolute year 0, month 0, day 1. `epochOffset` is the world day of that local day 0.

`toDays` / `fromDays` speak world days. `TimelineItem.start` is a world day. Relabel an instant with `other.fromDays(item.start)`.

`convert(localDays, from, to)` rebases a count measured from `from`'s own day 0 onto `to`'s day 0 (`local + from.epochOffset - to.epochOffset`). Do not pass `item.start` through it.

```ts
createCalendar(def)   // throws on validateCalendar errors
validateCalendar(def) // string[]; empty means usable
GREGORIAN             // BCE/CE, Sunday-first weeks, nested leap rule
RECKONING             // sample; see samples/calendars/reckoning.calendar.md
parseCalendarDocument(markdown)
serializeCalendarDocument(def, prose?)
```

Vault calendar files are markdown with YAML frontmatter. The subset is block maps, block lists, one-line flow, quotes, and comments. No anchors and no `|` blocks. Quote values that contain `#`.

Precision patterns required on a definition: `era` (only if it has eras), `year`, `month`, `day`, `hour`, `minute`. Tokens: `{E}` abbr, `{EEEE}` name, `{y}` `{yyyy}`, `{M}` `{MM}` `{MMM}` `{MMMM}`, `{d}` `{dd}`, `{H}` `{HH}`, `{m}` `{mm}`.

`fromDays(days, precision?)` truncates. Omitted precision is `day` on a minute boundary, `hour` on an hour, otherwise `minute`. Era precision denotes the whole era (`year` is 1). An unbounded backward era (BCE) has chronological start `-Infinity`; prefer year-or-finer strings for those notes.

`snap` rounds to the nearest boundary. Ties go to the later one. `add` of months and years clamps the day (31 Jan + 1 month → 28/29 Feb).

`ticks(range, pxPerDay, minLabelPx)` returns `{ major, minor }`. Week ticks are every `weekdays.length` days from local day 0. Intercalary days outside the week make `weekday()` return `null`.

Leap cycles longer than 100,000 years are rejected. Use `kind: "list"` for irregular years. `hasYearZero: false` skips a labeled year 0 (displayed −1 is absolute 0). Gregorian does this. Reckoning does not.

Safe integer days only (`±2^53`). Minute resolution is reliable for day counts well under `2^53 / minutesPerDay`.

## Undo

```ts
createUndoStack({ limit = 100, readField, applyField, onConflict })
```

`undo()` / `redo()` return `Promise<EditCommand | null>`. When `readField` is set, a field is skipped if the note's current value is not the command's `after` (undo) or `before` (redo), and `onConflict` fires. The core does not show notices. `clear(path)` drops every command that touches that path. `renamePath(from, to)` rewrites paths. `push` drops the redo branch.

## Theme contract

Renames are breaking. Additions are not. Defaults belong in the view's CSS; they are comments on `WT_CLASS` / `WT_VAR` in `src/core/theme.ts`.

Classes: `wt-timeline`, `wt-axis`, `wt-tick`, `wt-tick--major`, `wt-tick--minor`, `wt-lane`, `wt-lane--alt`, `wt-lane-label`, `wt-era`, `wt-item`, `wt-item--event`, `wt-item--span`, `wt-ghost`, `wt-selection`, `wt-error-badge`.

Variables: `--wt-item-fill`, `--wt-item-stroke`, `--wt-item-height`, `--wt-item-radius`, `--wt-lane-bg`, `--wt-lane-alt-bg`, `--wt-lane-label`, `--wt-era-fill`, `--wt-era-opacity`, `--wt-tick-major`, `--wt-tick-minor`, `--wt-accent`, `--wt-selection`, `--wt-error-badge`.

Data attributes: `data-type`, `data-tags` (space-separated), `data-lane`, `data-id`.

## Config

`parseTimelineConfig(yaml, fallbackCalendarId)` reads a `worldtimeline` block. `source.query` is returned as a string. The shell evaluates it.

## Checks

`npm test` runs the boundary script, `tsc -p tsconfig.core.json` (no DOM lib), and Vitest in Node. `npm run build` runs the boundary script, both typechecks, and the existing esbuild bundle.
