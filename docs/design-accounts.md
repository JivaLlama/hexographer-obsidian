# Accounts

Implemented in `src/core`. Import `parseAccounts`, `barsForItem`, and `planAccountMove`. One note is still one event. Other cultures record their own version of that event on the same note, and the view draws those versions as ghosts.

## Shape

```yaml
---
type: event
calendar: reckoning
culture: "[[Vey]]"
start: "3A 412"
certainty: working
accounts:
  - by: "[[Tideborn]]"
    start: "3A 410"
    end: "3A 411"
    claim: "The harbor fell in a season"
    certainty: uncertain
  - by: "[[Sol]]"
    order: 4
    era: "[[Third Age]]"
    claim: "After the coronation"
---
```

The note's own `start` / `end` / `order` is the primary. An account never replaces that storage. Ghosts use the existing `wt-ghost` class.

```ts
interface Account {
  /** Culture wikilink or plain label. Required. */
  by: string;
  /** Set when this row gives a date. Parsed with `calendarId`. */
  startRaw?: string;
  endRaw?: string;
  start?: number;
  end?: number | null;
  startPrecision?: Precision;
  endPrecision?: Precision;
  /** Set when this row is order-only inside the named era. No `start` in that case. */
  order?: number;
  eraRef?: string;
  claim?: string;
  certainty?: Certainty;
  /**
   * Calendar of this row's date strings.
   * Defaults to the note's `calendarId` when the row omits `calendar`.
   */
  calendarId: string;
  /** Set only when the author wrote `calendar` on the row. */
  declaredCalendar?: string;
  /** Index in the authored list. A drag patches this row when invalid rows were dropped. */
  sourceIndex: number;
  warnings?: string[];
}
```

`TimelineItem.accounts` and `OrderedItem.accounts` are optional. A primary order-only note can still carry dated accounts, and the reverse. `parseTimelineNote` still returns null for an order-only note.

## Parsing and validation

`parseAccounts(value, noteCalendarId, calendars)` returns `{ accounts: Account[]; warnings: string[] }`. `parseTimelineNoteResult` attaches the kept rows and appends the warnings to the note. A bad account does not set `parseError` and does not hide the primary.

Keep a row when it has `by` and either a `start` or an `order`. Drop a row, with a warning that names `by` or `accounts[i]`, when:

- `by` is missing or blank
- both `start` and `order` are missing
- `start` and `order` are both present (one row is either dated or ordered, not both)
- `start` or `end` fails to parse

An unknown `certainty` drops only that field and warns, same as the note-level rule. It does not drop the row. A bad date drops the row so a ghost is never drawn at day 0. `claim` is an optional string. `end` without `start` is a warning and the row is dropped.

Dates parse with the row's `calendar` key when it names a loaded calendar, otherwise the note's calendar. An unknown row calendar warns and falls back to the note calendar rather than dropping a readable date. Writeback stores the calendar key only if the author wrote one.

## Writeback

A drag still changes one place.

- Dragging the primary uses `planMove` and patches `start` / `end` only. Account rows are copied through untouched, including their original strings. `applyPlanToNote` does not rewrite `accounts`.
- Dragging a ghost uses `planAccountMove(item, accountIndex, deltaDays, mode, { fine, calendar })`. It patches that row's `start` / `end` inside the `accounts` array. The primary is not patched. The command's field key is `accounts` and the before/after values are the whole array, so undo replaces the list in one step. Precision of that row follows `planMove`. Pass the row's calendar; a different id throws.
- `displayHint`, `claim`, `by`, and `certainty` are never written by a drag.

`serializeTimelineNote` accepts an optional `accounts` replace, used only by the ghost drag. `applyCommandToNote` writes that patch.

## Filter

```ts
interface FilterState {
  /** true: every ghost. false or omitted: none. A list: ghosts whose `by` matches, trimmed and case-insensitive, same as `cultures`. */
  accounts?: boolean | string[];
}
```

Omitted or `false` draws primaries only. `true` draws every account ghost. A list draws a ghost only when its `by` matches one entry. `["[[tideborn]]"]` matches `by: "[[Tideborn]]"`. Culture and calendar filters are unchanged and still apply to the primary; they do not replace this list.

Ghosts are drawn on the primary's row: a dashed outline, with `claim` in the tooltip, using the existing `wt-ghost` class. They stay on that row. The view moves a ghost onto its own row only when the outline would collide with the primary or with another ghost. That collision pass is the view's job. Core packing does not change, and ghosts are not passed to `packLanes`.

## Culture timelines

On a culture timeline for X, `barsForItem(item, { culture: X, accounts })` treats the first account `by` X as the primary bar, and the note's own start as a ghost tagged with `item.culture`. The master timeline (`culture` omitted) does the opposite: the note's start is primary, and accounts are ghosts. Storage does not change in either view.

A note appears on X's timeline when `item.culture` is X **or** some account `by` is X. `itemMatches` implements that. `FilterState.accounts` does not remove notes. A note with neither culture nor a matching account does not appear.

`false` or omitted draws the primary only. After a swap, the note's own bar is a ghost, so it stays hidden until `accounts` is `true` or a list that matches `item.culture`. `true` draws every other ghost. A list matches `by` trimmed and case-insensitive, and it does not strip `[[ ]]`.

```ts
barsForItem(item, { culture?: string, accounts?: boolean | string[] })
  → { id, primary: Bar, ghosts: Bar[] }
```

`Bar` carries `role` (`"primary"` | `"ghost"`), world-day `start` / `end` or `order` / `eraRef`, `culture`, `claim`, `certainty`, and `accountIndex` when the bar is an account row. The swapped-out note bar sets `notePrimary`. Ghosts are not `TimelineItem`s and are not passed to `packLanes`. Collision rows stay the view's job.

That matches "whose history this is". X's timeline answers what X says happened. The master answers the vault's chosen primary, with other claims beside it when `filters.accounts` is `true` or a list that includes them. A drag on X's timeline calls `planAccountMove` for the matching account row, not `planMove`, unless the bar is the note's own primary.
