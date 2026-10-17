# Core API

Contract for the timeline view. Import from `src/core`. This module imports nothing from `obsidian` and nothing that touches the page. `node scripts/check-core-boundary.mjs` fails the build and `npm test` if that changes.

The plugin entry does not import the core yet. The hex painter is unchanged.

## Frozen types

`TimelineItem` is one note.

- `start` and `end` are inclusive world days: the start of each written date. `end` is `null` for a point.
- `startPrecision` and `endPrecision` are independent. `"3A 412"` to `"3A 412 Frostmoot 9"` is legal. `endPrecision` is `null` when there is no end.
- `extentTo` is the exclusive end of the occupied interval, computed when the note is parsed. Draw bars and zoomed-in point brackets from `extentOf(item)`, which is `{ from: item.start, to: item.extentTo }`. A year-precision end includes that whole year. Do not call the calendar engine for this.
- `laneId` is the frontmatter string (`"[[House Vey]]"`), or `null` for eras and unlaned items.
- `calendarId` is the calendar of this note's date strings. Frontmatter `calendar: reckoning` sets it. When the key is missing, parsing uses the vault default passed as `defaultCalendarId`. `source.calendarId` is the same id.
- `culture` is an optional frontmatter string (`culture: "[[Tideborn]]"`). It is independent of `calendarId`: two cultures may share a calendar. Omit the key and the field is absent.
- `certainty` is optional: `"locked" | "working" | "uncertain" | "open"` (`CERTAINTIES`). The frontmatter value is trimmed and compared case-insensitively. An unknown value leaves `certainty` unset and pushes a string onto `warnings`. It does not set `parseError`.
- `displayHint` is an optional string passed through on read. A drag writeback (`planMove` / `applyPlanToNote` / `serializeTimelineNote`) never writes it. Other frontmatter keys are copied through, so the hint survives a move.
- `warnings` lists non-fatal notes. `parseError` is still the fatal date failure.
- `parseError` is set when a date fails, or when `calendar` names an engine that was not loaded. The item is still returned.
- `links.other` is always `[]` in this phase. `places` and `people` come from frontmatter. Body wikilinks are not scanned.
- `source.startRaw` / `source.endRaw` are the original strings.

`FilterState.range` is half-open `[from, to)` on world days. `itemMatches` / `filterItems` implement it. An era ignores a lane filter and still has to pass the other filters.

`FilterState.calendars` matches `item.calendarId`. `FilterState.cultures` matches `item.culture`. Both comparisons trim and ignore case. An item with no culture fails a non-empty culture list. Eras are included in both. A culture timeline sets both. A master timeline leaves them empty and shows every item. Text search also looks at the culture and the calendar id.

`EditCommand` is `{ label, patches: [{ path, fields: [{ key, before, after }] }] }`. One drag is one command.

## Order-only events

NOTE-FORMAT-SPEC v0.1 says an event `start` is required. An approved addition: `type: event` with `order: <number>`, an `era` (wikilink or era id), and no `start`. These are not `TimelineItem`s, so `start` stays a number there.

`parseTimelineNote` is unchanged for Cody's view: it still returns `TimelineItem | null`. An order-only note returns null from that function. `parseTimelineNoteResult` returns `TimelineNoteResult`:

```ts
{ kind: "dated"; item: TimelineItem } | { kind: "ordered"; item: OrderedItem }
```

`OrderedItem` is `{ id, title, order, eraRef, laneId, tags, certainty?, calendarId?, culture?, color?, displayHint?, links, warnings?, source: { path, eraRaw } }`. `calendarId` is set only when the note names a calendar. There is no date to apply the vault default to.

```ts
eraAnchors(eras, calendars?) → EraAnchor[]
groupOrderedItems(items, anchors) → OrderedGroup[]
BEFORE_RECKONING === "before reckoning"
```

`eraAnchors` matches a note path, its basename, its title, and, when `start` parses, that calendar era's id, abbreviation, and name. `era: "[[Third Age]]"`, `era: "[[eras/Third Age]]"`, and `era: 3A` can name the same era note. The first anchor in the list wins a shared alias.

`groupOrderedItems` keeps the anchor order. Missing or unknown eras share one leading group whose `eraKey`, `label`, and `unresolved` flag are `BEFORE_RECKONING`. Inside a group, items sort by `order`, then title, then id. A full tie keeps input order.

A number `order` together with a `start` stays a dated event. `order` is ignored for placement. A non-numeric `order` and no `start` stays a dated note with `parseError` "missing start" and a warning.

## Scale

`commitPan(scale, translatePx)` and `scale.commitPan(translatePx)` rebase `originDays`. A positive translate reveals earlier days: `originDays - translatePx / pxPerDay`. A zero translate returns the same scale.

`zoomToFit(scale, extent, viewportPx, padding = 0)` and `scale.zoomToFit(extent, viewportPx, padding)` fit the world-day extent across the viewport, then clamp `pxPerDay` to the scale's limits. Padding is pixels per side, and it is capped at a quarter of the viewport. The extent is centered in whatever width remains after clamping.

## Vault scan

The shell still does file I/O. It passes `{ path, content }[]` and a `VaultSettings` (`{ defaultCalendarId? }`).

```ts
resolveDefaultCalendar(settings, calendarIds) → { calendarId, warning? }
scanVault(files, settings?) → { items, ordered, eras, calendars, warnings }
```

`resolveDefaultCalendar` uses `settings.defaultCalendarId` when that id is loaded. An unknown id sets `warning` and is not used. Otherwise `gregorian` wins, then the first loaded id.

`scanVault` always loads `GREGORIAN` first. `*.calendar.md` files are calendars. A second `gregorian` file, or any other duplicate id, is skipped with a warning. `items` is every dated note in file order, including eras. `eras` is that era subset. `ordered` is the order-only events. `warnings` collects calendar failures, duplicate ids, note `warnings`, and `parseError`s. A note that is not an event, span, or era is ignored.

## Lane labels

`packLanes(items, lanes, options?)` is unchanged when `options` is omitted. `options.labelExtent(item)` returns a world-day interval `{ from, to }` reserved for the label, or null. The packed interval is the union of `extentOf(item)` and that interval, so a point label can keep the next point off its row. The view converts pixels to days before calling.

## Moves

```ts
planMove(item, deltaDays, mode, { fine, calendar })
```

`mode` is `"move" | "resize-start" | "resize-end"`. `deltaDays` is a world-day offset; convert pixels with `Scale` before calling. The result is `{ start, end, startRaw, endRaw, command }`. Use `startRaw` / `endRaw` for the ghost tooltip and for writeback. They are the same strings.

Pass `calendarForItem(item, calendars)` as `calendar`. That is the note's calendar, not the display calendar. `planMove` throws when the ids differ, so a drag cannot rewrite a Harbor date as a Reckoning string. `applyPlanToNote` does not add or change `calendar` or `culture`. A note that omitted `calendar` still omits it after the drag, and a later parse with the same vault default reads it back.

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

`toDays` / `fromDays` speak world days. `TimelineItem.start` is a world day. Relabel an instant on the master axis with the display calendar: `display.fromDays(item.start)` then `display.format`. Do not reformat the note.

`convert(localDays, from, to)` rebases a count measured from `from`'s own day 0 onto `to`'s day 0 (`local + from.epochOffset - to.epochOffset`). Do not pass `item.start` through it.

A vault has many calendars. One master timeline displays every item in any chosen calendar, because every item is already a world day. A culture timeline displays that culture's calendar and filters to its `calendarId` and `culture`. Harbor's local day 0 is world day 10000, so it does not share an epoch with Reckoning; the same world day still lines up on the master axis.

```ts
createCalendar(def)   // throws on validateCalendar errors
validateCalendar(def) // string[]; empty means usable
GREGORIAN             // BCE/CE, Sunday-first weeks, nested leap rule
RECKONING             // sample; see samples/calendars/reckoning.calendar.md
HARBOR                // second sample; epochOffset 10000; samples/calendars/harbor.calendar.md
formatYearsAgo(def, absoluteYear)  // "1500 ya"; throws without display.mode
parseCalendarDocument(markdown)
serializeCalendarDocument(def, prose?)
```

Vault calendar files are markdown with YAML frontmatter. The subset is block maps, block lists, one-line flow, quotes, and comments. No anchors and no `|` blocks. Quote values that contain `#`.

Precision patterns required on a definition: `era` (only if it has eras), `year`, `month`, `day`, `hour`, `minute`. Tokens: `{E}` abbr, `{EEEE}` name, `{y}` `{yyyy}`, `{M}` `{MM}` `{MMM}` `{MMMM}`, `{d}` `{dd}`, `{H}` `{HH}`, `{m}` `{mm}`.

`fromDays(days, precision?)` truncates. Omitted precision is `day` on a minute boundary, `hour` on an hour, otherwise `minute`. Era precision denotes the whole era (`year` is 1). An unbounded backward era (BCE) has chronological start `-Infinity`; prefer year-or-finer strings for those notes.

`snap` rounds to the nearest boundary. Ties go to the later one. `add` of months and years clamps the day (31 Jan + 1 month → 28/29 Feb).

`ticks(range, pxPerDay, minLabelPx)` returns `{ major, minor }`. Week ticks are every `weekdays.length` days from local day 0. Intercalary days outside the week make `weekday()` return `null`.

Leap cycles longer than 100,000 years are rejected. Use `kind: "list"` for irregular years. `hasYearZero: false` skips a labeled year 0 (displayed −1 is absolute 0). Gregorian does this. Reckoning does not.

### Years-ago labels

Optional calendar field, display only:

```ts
display: { mode: "before-present"; presentYear: number; suffix: string }
```

`presentYear` is an absolute year. Year Y is labeled `(presentYear - Y) suffix`, for example `1500 ya`. `{ya}` is a format token for `format(date, "{ya}")` and for an extra named pattern. It is not accepted as input: `parse("1500 ya")` and `parse("~1500ya")` fail. A required precision pattern (`year`, `day`, …) must not contain `{ya}`, so `planMove` writeback stays an absolute ascending year. Year, decade, century, and millennium ticks use the years-ago label when `display` is set. Finer ticks stay in the calendar's own patterns. Note strings are unchanged.

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

Data attributes: `data-type`, `data-tags` (space-separated), `data-lane`, `data-id`, `data-certainty` (`WT_DATA.certainty`).

Certainty variables: `--wt-certainty-locked`, `--wt-certainty-working`, `--wt-certainty-uncertain`, `--wt-certainty-open` (`WT_VAR.certaintyLocked` and the three beside it). Set `data-certainty` from `item.certainty`. The view owns the actual colors.

## Config

`parseTimelineConfig(yaml, fallbackCalendarId)` reads a `worldtimeline` block. `source.query` is returned as a string. The shell evaluates it.

`displayCalendarId` is the axis. YAML `displayCalendar` sets it. YAML `calendar` is the same key when `displayCalendar` is absent. It is not a filter, and it is not the calendar stored on a note.

```yaml
# Master: every item, labeled in Gregorian.
displayCalendar: gregorian

# Culture: Harbor notes of one people, labeled in the Harbor Count.
displayCalendar: harbor
filters:
  calendars: [harbor]
  cultures: ["[[Tideborn]]"]
```

`filters.calendar` and `filters.culture` are accepted as a single string and stored on `calendars` / `cultures`. `view.from` and `view.to` are strings in the display calendar.

## Design only, not exported

These names are proposals. Do not import them.

- Relative dates: [design-relative-dates.md](design-relative-dates.md). `Interval` (`{ likely, min, max }`), `ResolvedBounds` (`{ start: Interval, end: Interval | null }`), `Relation`, `TimeUnitDef`, `ResolveInput`, `resolveDates`, `planRelativeMove`. `relations` is the list; `after` / `before` / `overlaps` are sugar. Anchor uncertainty compounds. A gap is a sum such as `2 gen + 10y`. Not in NOTE-FORMAT-SPEC v0.1. Not exported.
- Accounts: [design-accounts.md](design-accounts.md). `Account`, `parseAccounts`, `FilterState.accounts?: boolean | string[]`. Ghosts are dashed outlines on the primary's row; a ghost row is only for a collision, and that pass is the view's. The culture-timeline swap stands. Not implemented.

## Checks

`npm test` runs the boundary script, `tsc -p tsconfig.core.json` (no DOM lib), and Vitest in Node. `npm run build` runs the boundary script, both typechecks, and the existing esbuild bundle.
