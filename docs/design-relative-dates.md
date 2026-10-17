# Relative dates (design only)

Not implemented. Nothing in this file is exported from `src/core`. NOTE-FORMAT-SPEC v0.1 stores absolute date strings. This proposal adds relations between notes without changing those strings' meaning.

Storage stays in the note. The resolver does not write a cached day count. A later read runs the resolver again.

## Note fields

```yaml
---
type: event
calendar: reckoning
after: "[[Founding of Port Haven]]"   # wikilink or note path
gap: "2 gen"                          # optional offset; vault-defined unit
---
```

`before` and `overlaps` use the same shape. A note has at most one of `after`, `before`, or `overlaps`. `gap` is optional and belongs to that one relation. An absolute `start` may also be present: it is the author's stated date, and the relation is a check against it (see mixed constraints below). `~4115` is an absolute year with a fuzz, not a relation.

```ts
interface TimeUnitDef {
  /** Unit id as written in `gap`, for example `gen`. */
  id: string;
  /** Inclusive span of one unit, in calendar years of the note being placed. */
  minYears: number;
  maxYears: number;
}

interface RelativeClause {
  relation: "after" | "before" | "overlaps";
  /** Note path or wikilink target. Compared the same way `eraRef` is. */
  anchor: string;
  /** Original `gap` string. Absent means a zero gap. */
  gap?: string;
}

interface DateFuzz {
  /** Absolute written date, already parsed to world days. */
  start: number;
  end: number | null;
  /** True when the author wrote a leading `~`. */
  approximate: boolean;
}
```

Vault units would be added next to the exported `VaultSettings` (that type does not have `units` yet):

```ts
interface VaultSettings {
  defaultCalendarId?: string;
  /** Proposed. `gen: 40-60y` becomes `{ id: "gen", minYears: 40, maxYears: 60 }`. */
  units?: TimeUnitDef[];
}
```

`40-60y` is a closed year range. `2 gen` means twice that range: `[80, 120]` years. A bare number `2y` is a fixed year count (`minYears === maxYears`). Unknown units are a parse error on that note. This round's `~1500ya` display token is unrelated and is still not an input date.

## Bounds

Every resolved note, relative or absolute, uses one bounds model. Ranged and approximate ends share it. `~4115` is not a second system.

```ts
interface ResolvedBounds {
  /** Point the view draws when it needs one instant. Midpoint of `[min, max)` for a fuzzy start. */
  start: number;
  /** Exclusive end of a span. Null for a point. */
  end: number | null;
  /** Inclusive lower bound of the start. */
  min: number;
  /** Exclusive upper bound of the start. Equal to `min` when the date is exact. */
  max: number;
}
```

Absolute rules, applied in the note's own calendar, then stored as world days:

- An exact date: `min === start`, and `max` is `endOfDays` of that precision only when the view needs the occupied extent. The bounds `max` for an exact start is `start` (zero width). The occupied extent stays `extentOf` and is not widened.
- `~4115` (approximate year): `min` is the start of that year, `max` is the end of that year, `start` is the midpoint. The `~` is display fuzz, not a new precision. Writeback of an absolute drag still stores the year string, and keeps the `~` if it was there.
- A span with an approximate end widens `end` the same way. `start` bounds and `end` bounds are independent. The drawn bar runs from `start.min` to `end.max`.

Relative rules, once every anchor named by the note is resolved:

- `after` with gap `[gMin, gMax]` in world days: `min = anchorEnd + gMin`, `max = anchorEnd + gMax`. `anchorEnd` is the anchor's `end` if it has one, otherwise the anchor's `max`.
- `before`: `min = anchorStart - gMax`, `max = anchorStart - gMin`, where `anchorStart` is the anchor's `min`.
- `overlaps`: `min = anchor.min`, `max = anchor.max` when the anchor is a point. When the anchor is a span, `min = anchor.min` and `max = anchor.end`. This only forces the start to fall inside the anchor. It does not invent a duration.
- A missing `gap` is `[0, 0]`.
- `start` of the bounds is the midpoint `(min + max) / 2`.

If the note has both an absolute `start` and a relation, the resolved bounds are the intersection. An empty intersection is a warning (`relation does not meet the written date`) and the drawn bounds stay the absolute ones. The relation is not discarded.

## Resolution order

`resolveDates` walks notes until no new note resolves.

1. Parse every absolute `start` / `end`, including `~` years, into `ResolvedBounds`. These notes are resolved. They do not wait on anyone.
2. Build the graph. An edge runs from a relative note to the note its `anchor` names. Matching is path, basename, and title, same as `eraAnchors`.
3. Cycles are a parse error, not a warning. The error names the cycle in anchor order, for example `cycle: [[A]] → [[B]] → [[A]]`. Every note on the cycle stays unresolved. A note that only depends on a cycle member is also unresolved, with `unresolved anchor` pointing at that member.
4. A note whose anchors are all resolved is resolved in the next pass, using the rules above. Passes repeat so a chain `C after B after A` resolves A, then B, then C.
5. An anchor that names no note is `unresolved anchor [[X]]`. That note gets no bounds. Descendants that need it stay unresolved the same way. Do not invent a start and do not put the note in `before reckoning` (that group is only for order-only items).

Order-only items (`OrderedItem`) are not inputs. They have no day count to anchor.

## Mixed calendars

Anchors are world days before any gap is added. A gap written in years converts through the **dependent** note's calendar, at the absolute year of the anchor instant: `days = years * calendar.daysInYear(anchorYear)`. The two ends of a `40-60y` unit use that same year length, so the bound is a day range, not a second calendar. The dependent's `calendarId` is the one on its note (vault default when omitted). The anchor's calendar is not used for the gap. Display of the resolved instant uses the dependent's calendar via `fromDays`. Do not pass the world day through `convert`.

A gap in days (`10d`) is already a world-day count and skips the year length. Month gaps (`2mo`) use the dependent calendar's month length at the anchor. Units in `VaultSettings` are year ranges only; `d` and `mo` are built in.

## Drag

Dragging a relative item edits `gap`, not `start`.

```ts
interface RelativeMove {
  gap: string;
  command: EditCommand; // patches [{ key: "gap", before, after }]
}

function planRelativeMove(
  clause: RelativeClause,
  deltaDays: number,
  calendar: CalendarEngine,
  units: readonly TimeUnitDef[]
): RelativeMove;
```

The new gap is the old gap plus `deltaDays`, snapped to the unit the gap already uses (`gen` stays `gen`, `d` stays `d`). Snapping uses the same tie rule as `planMove` (later boundary). The anchor note is not patched.

Dragging an anchor uses the existing `planMove` and writes only that note's `start` / `end`. Dependents are not patched. Their `gap` strings stay put. The view runs `resolveDates` again, and the dependents move because the anchor's world day moved. An absolute dependent that merely checked a relation does not move; its written date is still the source of truth, and the relation warning updates.

```ts
interface ResolveInput {
  notes: Array<{
    id: string;
    calendarId: string;
    startRaw?: string;
    endRaw?: string;
    /** Leading `~` on an absolute year. */
    approximate?: boolean;
    relative?: RelativeClause;
  }>;
  calendars: readonly CalendarEngine[];
  units: readonly TimeUnitDef[];
}

interface ResolvedNote {
  id: string;
  bounds?: ResolvedBounds;
  /** Cycle text, or `unresolved anchor …`. Absent when `bounds` is set. */
  error?: string;
  warnings?: string[];
}

function resolveDates(input: ResolveInput): ResolvedNote[];
```

`planRelativeMove` and `resolveDates` are the whole pure API. The shell applies `EditCommand` the same way it applies a dated drag. No Obsidian and no DOM.
