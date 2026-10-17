import type { Precision } from "../calendar/types";
import type { Account, Certainty, OrderedItem, TimelineItem } from "../types";

/** One bar the view can draw. Ghosts are not passed to `packLanes`. */
export interface Bar {
  id: string;
  role: "primary" | "ghost";
  start?: number;
  end?: number | null;
  startPrecision?: Precision;
  endPrecision?: Precision | null;
  calendarId?: string;
  /** Culture label used when a list filter selects this ghost. */
  culture?: string;
  claim?: string;
  certainty?: Certainty;
  accountIndex?: number;
  /** The note's own bar, drawn as a ghost on a culture timeline. */
  notePrimary?: boolean;
  order?: number;
  eraRef?: string;
}

export interface ItemBars {
  id: string;
  primary: Bar;
  ghosts: Bar[];
}

export interface BarsContext {
  /**
   * Culture timeline for this culture. Omit for the master timeline.
   * On a culture timeline, the first account `by` that culture becomes the primary,
   * and the note's own start is a ghost tagged with `item.culture`.
   */
  culture?: string;
  /**
   * `true` draws every ghost. `false` or omitted draws none.
   * A list matches `by` (or the swapped note's culture) trimmed and case-insensitive.
   * Brackets are part of the string: `[[tideborn]]` does not match `tideborn`.
   */
  accounts?: boolean | string[];
}

/**
 * Primary and ghost bars for one note.
 * Storage does not change. A ghost stays off `packLanes`; collision rows are the view's job.
 */
export function barsForItem(item: TimelineItem | OrderedItem, ctx: BarsContext = {}): ItemBars {
  const accounts = item.accounts ?? [];
  const culture = ctx.culture?.trim();
  const swapIndex = culture ? accounts.findIndex((account) => labelsMatch(account.by, culture)) : -1;
  const primary = swapIndex >= 0 ? barFromAccount(item, accounts[swapIndex], swapIndex, "primary") : barFromNote(item, "primary");
  const ghosts: Bar[] = [];
  if (swapIndex >= 0 && ghostVisible(item.culture, ctx.accounts)) {
    ghosts.push(barFromNote(item, "ghost"));
  }
  accounts.forEach((account, index) => {
    if (index === swapIndex) return;
    if (!ghostVisible(account.by, ctx.accounts)) return;
    ghosts.push(barFromAccount(item, account, index, "ghost"));
  });
  return { id: item.id, primary, ghosts };
}

function ghostVisible(by: string | undefined, accounts: BarsContext["accounts"]): boolean {
  if (accounts === true) return true;
  if (!Array.isArray(accounts) || !by) return false;
  return accounts.some((entry) => labelsMatch(entry, by));
}

function barFromNote(item: TimelineItem | OrderedItem, role: "primary" | "ghost"): Bar {
  const id = role === "primary" ? item.id : `${item.id}#primary`;
  const base: Bar = {
    id,
    role,
    culture: item.culture,
    ...(item.certainty ? { certainty: item.certainty } : {}),
    ...(item.calendarId ? { calendarId: item.calendarId } : {}),
    ...(role === "ghost" ? { notePrimary: true } : {}),
  };
  if (isDated(item)) {
    return {
      ...base,
      start: item.start,
      end: item.end,
      startPrecision: item.startPrecision,
      endPrecision: item.endPrecision,
    };
  }
  return { ...base, order: item.order, eraRef: item.eraRef };
}

function barFromAccount(
  item: TimelineItem | OrderedItem,
  account: Account,
  index: number,
  role: "primary" | "ghost"
): Bar {
  const bar: Bar = {
    id: `${item.id}#${index}`,
    role,
    accountIndex: index,
    culture: account.by,
    calendarId: account.calendarId,
    ...(account.claim ? { claim: account.claim } : {}),
    ...(account.certainty ? { certainty: account.certainty } : {}),
  };
  if (account.order !== undefined) {
    bar.order = account.order;
    if (account.eraRef) bar.eraRef = account.eraRef;
    return bar;
  }
  bar.start = account.start;
  bar.end = account.end ?? null;
  bar.startPrecision = account.startPrecision;
  bar.endPrecision = account.endPrecision ?? null;
  return bar;
}

function isDated(item: TimelineItem | OrderedItem): item is TimelineItem {
  return "start" in item && typeof (item as TimelineItem).start === "number";
}

function labelsMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
