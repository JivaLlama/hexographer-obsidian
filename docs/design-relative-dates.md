# Relative dates

Implemented in `src/core`. Import `resolveDates`, `planRelativeMove`, `parseGap`, `formatGap`, and `normalizeUnits` from that module. NOTE-FORMAT-SPEC v0.1 stores absolute date strings. Relations sit beside those strings and do not change an absolute string's meaning.

Storage stays in the note. The resolver does not write a cached day count. A later read runs the resolver again.

Two corrections from the first draft are marked inline: an unresolved anchor is a warning, and the 10-year span sketch does not shift a pure relative interval.

## Note fields

A single relation is sugar. `relations` is the form the resolver sees. Sugar and the list may both be present; the resolver appends the sugar entry after the list.

```yaml
---
type: event
calendar: reckoning
after: "[[Founding of Port Haven]]"   # sugar for one relation
gap: "2 gen + 10y"                    # optional; belongs to that sugar relation
---
```

```yaml
relations:
  - after: "[[Founding of Port Haven]]"
    gap: "2 gen"
  - before: "[[Treaty of Amber]]"
    gap: "1 gen"
  - overlaps: "[[The Long Winter]]"
```

`before` and `overlaps` are the same shape as `after`. Each entry has one of those keys, a target, and an optional `gap`. An entry may set `edge: end` (default `start`) so a span's end resolves on its own. An absolute `start` may also be present: it is one more constraint, intersected with the relations. `~4115` is an absolute year with a fuzz, not a relation.

```ts
interface TimeUnitDef {
  /** Unit id as written in `gap`, for example `gen`. */
  id: string;
  /** Inclusive span of one unit, in calendar years of the note being placed. */
  minYears: number;
  maxYears: number;
}

/** One entry in `relations`. Sugar `after` / `before` / `overlaps` becomes one of these. */
interface Relation {
  kind: "after" | "before" | "overlaps";
  /** Note path or wikilink target. Compared the same way `eraRef` is. */
  target: string;
  /** Original gap string. Absent means a zero gap. */
  gap?: string;
  /** Which edge of this note the relation constrains. Default `start`. */
  edge?: "start" | "end";
}

interface DateFuzz {
  /** Absolute written date, already parsed to a world-day interval. */
  start: Interval;
  end: Interval | null;
  /** True when the author wrote a leading `~` on that edge. */
  approximate: boolean;
}
```

Vault units live on `VaultSettings.units`. A record such as `{ gen: "40-60y" }` and a `TimeUnitDef[]` are both accepted. `50y` is a fixed unit (`minYears === maxYears`) and is not a snap unit.

`40-60y` is a closed year range. `2 gen` means twice that range: `[80, 120]` years. A fixed term `10y` adds 10 to both ends. Unknown units are a parse error on that note. This round's `~1500ya` display token is unrelated and is still not an input date.

## Bounds

Every resolved note, relative or absolute, uses one bounds model. Ranged and approximate ends share it. `~4115` is not a second system.

```ts
interface Interval {
  /** Instant the view draws. Midpoint of `[min, max]` when the resolver builds the interval. */
  likely: number;
  /** Inclusive lower bound. */
  min: number;
  /** Inclusive upper bound. Equal to `min` when the instant is exact. */
  max: number;
}

interface ResolvedBounds {
  start: Interval;
  /** Null for a point. A span always has an end interval. */
  end: Interval | null;
}
```

`likely` of a computed interval is the midpoint `(min + max) / 2`. An exact date is the zero-width interval `{ likely: d, min: d, max: d }`.

Absolute rules, applied in the note's own calendar, then stored as world days:

- An exact date is zero-width. The occupied extent of a year-precision point stays `extentOf` and is not widened by these bounds.
- `~4115` (approximate year): `min` is the start of that year, `max` is the last instant of that year, `likely` is the midpoint. The `~` is display fuzz, not a new precision. Writeback of an absolute drag still stores the year string, and keeps the `~`.
- An approximate end uses the same year rule on the end interval. It does not copy the start's width.

### Propagating anchor uncertainty

Gap `[gapMin, gapMax]` is in world days. `gapLikely` is its midpoint. A missing gap is `[0, 0]`.

For a point anchor, `after` uses the anchor's start interval as `anchorEnd` (there is no later edge). For a span, `after` uses the anchor's end interval.

- `after`: `min = anchorEnd.min + gapMin`, `max = anchorEnd.max + gapMax`, `likely = anchorEnd.likely + gapLikely`.
- `before` is the mirror image, measured from the anchor's start: `min = anchorStart.min - gapMax`, `max = anchorStart.max - gapMin`, `likely = anchorStart.likely - gapLikely`.
- `overlaps` produces the anchor's occupied interval: a point contributes its start interval; a span contributes `{ min: start.min, max: end.max, likely: midpoint }`. A gap on `overlaps` expands that window by the gap (subtract `gapMax` from `min`, add `gapMax` to `max`) and is otherwise unused.

The anchor's width is not discarded. Each hop adds it to the gap's width.

Three-deep chain. `gen` is 40–60y, so one `gen` is `[40, 60]` with midpoint 50. A is an exact point at year 1000. B, C, and D are points, each `after` the previous with gap `1 gen`. Numbers are years; the resolver adds the same intervals in world days.

| Note | Rule | min | likely | max | width |
| --- | --- | --- | --- | --- | --- |
| A | exact 1000 | 1000 | 1000 | 1000 | 0 |
| B | after A, 1 gen | 1040 | 1050 | 1060 | 20 |
| C | after B, 1 gen | 1080 | 1100 | 1120 | 40 |
| D | after C, 1 gen | 1120 | 1150 | 1180 | 60 |

B takes A's zero width plus the gen. C takes B's 20 years plus another gen, so 40. D takes C's 40 plus another gen, so 60. The uncertainty compounds; it does not reset at each hop.

The mirror for `before A` with `1 gen` is `min = 1000 - 60 = 940`, `max = 1000 - 40 = 960`, `likely = 950`.

### End interval

`end` is null only for a point. A span has its own end interval. Two rules:

- **Absolute duration.** The start has a written absolute date (exact or `~`) and the end is an exact absolute date with no `~` and no relation of its own. The duration `D` is the world-day length from that written start's nominal instant (the exact instant, or the midpoint of a `~` year) to the written end. After the start interval is finalized — the written start intersected with any start relations — the end interval is that interval shifted by `D`: `end.min = start.min + D`, `end.max = start.max + D`, `end.likely = start.likely + D`. The length stays put. The end is not pinned to a zero-width world day. A `~` year inside a wider relation keeps the year's width, and the end keeps that same width.
- **Independent end.** An approximate end (`end: "~1100"`) or a relation with `edge: end` resolves on its own, with the same interval rules as a start. It does not inherit the start's width. A pure relative start (no absolute start date) plus an exact `end` is this case too: there is no written nominal to measure `D` from, so the end is the zero-width written instant.

The first draft said a span whose start is chain note C (width 40 years) and whose nominal length is 10 years would end at `[1090, 1130]`. That sketch does not occur. A pure relative start has no written nominal, so the exact end stays zero-width. A written `~` year is intersected with the relation and is the width `D` preserves, which is one year, not C's 40.

After both edges exist, validate `end >= start`. The pair is possible when `end.max >= start.min`. Warn, and keep the bounds, when no such pair exists (`end.max < start.min`) or when the drawn points are already backwards (`end.likely < start.likely`). The warning names both ranges. Do not clamp one edge to the other.

### Intersecting relations

Each relation on an edge produces an interval. Intersect them in list order, and intersect the absolute interval too when that edge has one.

```ts
function intersect(a: Interval, b: Interval): Interval | null {
  const min = Math.max(a.min, b.min);
  const max = Math.min(a.max, b.max);
  if (min > max) return null;
  const mid = (min + max) / 2;
  const likely = Math.min(max, Math.max(min, a.likely));
  return { min, max, likely: likely === a.likely ? a.likely : mid };
}
```

`likely` stays at the previous likely point when that point still lies inside the overlap, so an exact date inside a wide relation does not jump to the middle. Otherwise it becomes the midpoint of the overlap.

An empty intersection is the same warning as an absolute date that misses its relation: `relation does not meet the written date`. The note still resolves. Draw the absolute interval when there is one, otherwise the first relation's interval. Do not drop the relations.

Example. A is exact at 1000. `after A` with `1 gen` is `[1040, 1060]`. `before` an exact 1100 with `1 gen` is `[1040, 1060]`. The intersection is `[1040, 1060]`. The same `before` with a zero gap is the point 1100, the intersection is empty, and the warning is `relation does not meet the written date`.

## Resolution order

`resolveDates` walks notes until no new note resolves.

1. Parse every absolute `start` / `end`, including `~` years, into `ResolvedBounds`. These notes are resolved. They do not wait on anyone. A span whose end is an absolute duration is not finished in this step; its end is shifted after the start's relations are intersected.
2. Build the graph. An edge runs from a note to each relation `target`. Matching is path, basename, and title, same as `eraAnchors`.
3. A cycle is an error, not a warning. The error names the cycle in title order, for example `cycle: [[A]] → [[B]] → [[A]]`. Every note on the cycle stays unresolved (`bounds` unset). A note that only depends on a cycle member is also unresolved, with a warning `unresolved anchor [[X]]` pointing at that member. It does not get a second cycle error.
4. A note whose targets are all resolved is resolved in the next pass. Passes repeat so the chain A → B → C → D resolves in that order, compounding the intervals above.
5. A target that names no note is a warning, `unresolved anchor [[X]]`, not an error. That note gets no bounds. Descendants that need it stay unresolved the same way. Do not invent a start and do not put the note in `before reckoning` (that group is only for order-only items). The first draft put this warning in `error` beside cycles. A dangling anchor is not a cycle, so it stays a warning.

Order-only items (`OrderedItem`) are not inputs. They have no day count to anchor.

## Mixed calendars

Resolved instants are world days before any gap is added. A gap written in years converts through the **dependent** note's calendar, at the absolute year of the anchor's `likely` instant: `days = years * calendar.daysInYear(anchorYear)`. Both ends of a `40–60y` unit use that same year length. The dependent's `calendarId` is the one on its note (vault default when omitted). The anchor's calendar is not used for the gap. Display of the resolved instant uses the dependent's calendar via `fromDays`. Do not pass the world day through `convert`.

A gap in days (`10d`) is already a world-day count and skips the year length. Month terms (`2mo`) use the dependent calendar's month length at the anchor. Vault units are year ranges; `y`, `mo`, and `d` are built in.

## Drag

Dragging a relative item edits `gap`, not `start`. Dragging one entry of `relations` edits that entry's gap. The sugar form patches the `gap` key. The list form patches `relations`.

```ts
interface GapTerm {
  /** Whole number. Negative when the sum runs the other way. */
  count: number;
  /** A vault unit id, or built-in `y`, `mo`, `d`. */
  unit: string;
}

interface RelativeMoveContext {
  /** The note's calendar. Throws when its id is not `item.calendarId`. */
  calendar: CalendarEngine;
  units?: VaultSettings["units"];
  /** Which relation to edit. Default 0. The sugar entry is last when both forms are present. */
  relationIndex?: number;
  /** Anchor likely world day. `daysInYear` is read in `calendar` at this instant. */
  anchorDays: number;
}

interface RelativeMoveResult {
  gap: string;
  relations: Relation[];
  command: EditCommand;
}

function planRelativeMove(item: TimelineItem, deltaDays: number, ctx: RelativeMoveContext): RelativeMoveResult;
```

`deltaDays` has the same sign as `planMove`: positive moves the item later. For `after` and `overlaps`, add that delta to the gap. For `before`, subtract it (moving later shortens the time before the anchor). `ctx.anchorDays` is the anchor's likely world day. The drag does not re-resolve the anchor.

The gap is a sum of terms, for example `2 gen + 10y`. Parse `+` and a spaced `-` (`2 gen - 10y` is `2 gen` plus `-10y`).

Snap with the unit's midpoint, not its min or max. `gen` at 40–60y counts as 50y. The snap unit is the coarsest ranged term in the gap (a vault unit with `minYears !== maxYears`). A gap with no ranged term snaps in whole years.

1. Convert `deltaDays` to years with `daysInYear` at the anchor's likely year. Call that `deltaYears`.
2. `mid` is the snap unit's midpoint in years.
3. When `|deltaYears| >= mid`, `steps` is `deltaYears / mid` truncated toward zero, and `remainderYears = deltaYears - steps * mid`. Otherwise `steps` is 0 and the whole delta is the remainder.
4. Add `steps` to that term's count.
5. Round the remainder to a whole year of this calendar. A tie goes to the later date, the same tie as `planMove`.
6. Add those years to the `y` term. Drop a term whose count is 0. Write a negative year term as `- Ny`.

Examples, `gen` midpoint 50y:

| Drag | `|delta| >= 50` | Result |
| --- | --- | --- |
| `2 gen` + 60y | yes, one gen, 10y left | `3 gen + 10y` |
| `2 gen` + 30y | no | `2 gen + 30y` |
| `2 gen` − 60y | yes, minus one gen, −10y left | `1 gen - 10y` |
| `2 gen + 10y` + 60y | yes | `3 gen + 20y` |

The anchor note is not patched.

Dragging an anchor uses the existing `planMove` and writes only that note's `start` / `end`. Dependents are not patched. Their gap strings stay put. The view runs `resolveDates` again, and the dependents' intervals move because the anchor's interval moved, uncertainty included. An absolute dependent that merely checked a relation does not move; its written date is still the source of truth, and the relation warning updates.

```ts
function resolveDates(
  items: readonly TimelineItem[],
  settings: VaultSettings | undefined,
  calendars: readonly CalendarEngine[]
): ResolvedNote[];
```

`settings.units` supplies ranged units. Each `TimelineItem` already carries `relations`, `source.startRaw` / `endRaw`, and the approximate flags. A separate `ResolveInput` is not used. `ResolvedNote.error` is a cycle or a gap/calendar failure (`unknown unit "age"`, `invalid gap "…"`, `unknown calendar "…"`). `warnings` holds `unresolved anchor [[X]]`, `relation does not meet the written date`, and `end [min, max] is before start [min, max]`.

A note with relations and no `start` is still a `TimelineItem`. `parseTimelineNote` returns it. `item.start` is `0` and `source.startRaw` is `""`. That `0` is not a world day; draw `bounds`. `itemMatches` still uses `extentOf` for a range filter, so filter on resolved bounds when the note has no written start.

`planRelativeMove` and `resolveDates` are the whole pure API. `applyCommandToNote` writes the command's `gap` or `relations` patch. The shell can apply `EditCommand` the same way it applies a dated drag. No Obsidian and no DOM.
