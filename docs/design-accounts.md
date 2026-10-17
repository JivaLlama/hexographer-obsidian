# Accounts (design only)

Not implemented. Nothing in this file is exported from `src/core`. One note is still one event. Other cultures record their own version of that event on the same note, and the view draws those versions as ghosts.

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
  warnings?: string[];
}
```

`TimelineItem.accounts?: Account[]` and `OrderedItem.accounts?: Account[]` would be optional additions. A primary order-only note can still carry dated accounts, and the reverse.

## Parsing and validation

`parseAccounts(value, noteCalendarId, calendars)` returns `{ accounts: Account[]; warnings: string[] }`.

Keep a row when it has `by` and either a `start` or an `order`. Drop a row, with a warning that names `by` or `accounts[i]`, when:

- `by` is missing or blank
- both `start` and `order` are missing
- `start` and `order` are both present (one row is either dated or ordered, not both)
- `start` or `end` fails to parse

An unknown `certainty` drops only that field and warns, same as the note-level rule. It does not drop the row. A bad date drops the row so a ghost is never drawn at day 0. `claim` is an optional string. `end` without `start` is a warning and the row is dropped.

Dates parse with the row's `calendar` key when it names a loaded calendar, otherwise the note's calendar. An unknown row calendar warns and falls back to the note calendar rather than dropping a readable date. Writeback stores the calendar key only if the author wrote one.

`parseTimelineNoteResult` would attach `accounts` and append row warnings to the note's `warnings`. A bad account does not set `parseError` and does not hide the primary.

## Writeback

A drag still changes one place.

- Dragging the primary uses `planMove` and patches `start` / `end` only. Account rows are copied through untouched, including their original strings.
- Dragging a ghost patches that row's `start` / `end` (or `order` / `gap` once relative dates exist) inside the `accounts` array. The primary is not patched. The command's field key is `accounts` and the before/after values are the whole array, so undo replaces the list in one step. Precision of that row is kept the same way `planMove` keeps a note's precision.
- `displayHint`, `claim`, `by`, and `certainty` are never written by a drag.

`serializeTimelineNote` would grow an optional `accounts` replace, used only by the ghost drag. A primary `applyPlanToNote` must not rewrite the list.

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

Recommendation: on a culture timeline for X, an account `by` X is the bar that timeline treats as primary, and the note's own start is the ghost. The master timeline does the opposite: the note's start is primary, and every account is a ghost. Storage does not change in either view. The culture filter still decides which notes appear: a note appears on X's timeline when `item.culture` is X **or** some account `by` is X. A note with neither does not appear.

That matches "whose history this is". X's timeline answers what X says happened. The master answers the vault's chosen primary, with other claims beside it when `filters.accounts` is `true` or a list that includes them. A list still uses the culture swap: on X's timeline the swapped bar is the one X wrote, and the list only chooses which other ghosts are drawn.

Alternatives, if that swap is too surprising:

- **Ghosts only.** X's timeline still draws the note's start as the only bar. An account by X is an extra ghost even there. Simplest code. X's claim is easy to miss, because it looks like a decoration on someone else's date.
- **Accounts never add notes.** X's timeline only includes notes whose `culture` is X. An account by X on a Vey note shows on the master, and on X's timeline only when that note's culture is also X. Fewer surprises, and Tideborn's version of a Vey event never appears on the Tideborn timeline.
- **Replace in storage.** Dragging on X's timeline writes the note's `start` and demotes the old start into an account. Rejected: writeback would change the primary just because the view was filtered, and two cultures would fight over the same field.

The recommendation needs no new write path. The view picks which `Account` or primary `start` to pass to the existing scale and pack functions. A drag on X's timeline patches the matching account row, not the primary, unless X is the note's own `culture` and the bar is the primary.
