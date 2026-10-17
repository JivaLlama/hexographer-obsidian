import {
  applyPlanToNote,
  calendarForItem,
  parseTimelineNoteResult,
  planAccountMove,
  planMove,
  planRelativeMove,
  resolveDates,
  type CalendarEngine,
  type ResolvedNote,
  type TimelineItem,
  type VaultSettings,
} from "../../../core";
import type { RelativeMoveContext } from "../../../core";

/**
 * Gap string shown while a relative note is dragged.
 * Positive `deltaDays` moves later. The snap is the unit midpoint plus whole years.
 */
export function gapDragText(item: TimelineItem, deltaDays: number, ctx: RelativeMoveContext): string {
  return planRelativeMove(item, deltaDays, ctx).gap;
}

/** Likely world day of the anchor a relation is measured from. */
export function anchorDaysFor(
  item: TimelineItem,
  items: readonly TimelineItem[],
  resolved: readonly ResolvedNote[],
  relationIndex = 0
): number {
  const relation = item.relations?.[relationIndex];
  if (!relation) throw new Error("relation is missing");
  const anchor = findAnchor(relation.target, items);
  if (!anchor) throw new Error(`unresolved anchor ${relation.target}`);
  const bounds = resolved.find((note) => note.id === anchor.id)?.bounds;
  if (!bounds) throw new Error(`unresolved anchor ${relation.target}`);
  if (relation.kind === "before") return bounds.start.likely;
  return bounds.end?.likely ?? bounds.start.likely;
}

export interface AnchorMoveResolution {
  before: ResolvedNote[];
  after: ResolvedNote[];
}

/**
 * Write an anchor with `planMove`, then resolve again.
 * Dependents keep their gap strings and move with the anchor.
 */
export function dependentsAfterAnchorMove(input: {
  notes: readonly { path: string; markdown: string }[];
  anchorId: string;
  deltaDays: number;
  settings?: VaultSettings;
  calendars: readonly CalendarEngine[];
  defaultCalendarId: string;
}): AnchorMoveResolution {
  const first = parseNotes(input.notes, input.calendars, input.defaultCalendarId);
  const before = resolveDates(first, input.settings, input.calendars);
  const anchor = first.find((item) => item.id === input.anchorId);
  if (!anchor) throw new Error(`missing anchor ${input.anchorId}`);
  const calendar = calendarForItem(anchor, input.calendars);
  const plan = planMove(anchor, input.deltaDays, "move", { fine: false, calendar });
  const next = input.notes.map((note) =>
    note.path === input.anchorId ? { path: note.path, markdown: applyPlanToNote(note.markdown, plan) } : note
  );
  const second = parseNotes(next, input.calendars, input.defaultCalendarId);
  return { before, after: resolveDates(second, input.settings, input.calendars) };
}

export function accountDragText(
  item: TimelineItem,
  accountIndex: number,
  deltaDays: number,
  calendars: readonly CalendarEngine[]
): string {
  const account = item.accounts?.[accountIndex];
  if (!account) throw new Error(`account ${accountIndex} is missing`);
  const calendar = calendars.find((engine) => engine.def.id === account.calendarId);
  if (!calendar) throw new Error(`unknown calendar "${account.calendarId}"`);
  const plan = planAccountMove(item, accountIndex, deltaDays, "move", { fine: false, calendar });
  return plan.endRaw ? `${plan.startRaw} – ${plan.endRaw}` : plan.startRaw;
}

function parseNotes(
  notes: readonly { path: string; markdown: string }[],
  calendars: readonly CalendarEngine[],
  defaultCalendarId: string
): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const note of notes) {
    const result = parseTimelineNoteResult(note.markdown, {
      path: note.path,
      calendars,
      defaultCalendarId,
      title: titleFromPath(note.path),
    });
    if (result && result.kind === "dated") items.push(result.item);
  }
  return items;
}

function findAnchor(target: string, items: readonly TimelineItem[]): TimelineItem | undefined {
  const names = refAliases(target);
  for (const item of items) {
    if (itemAliases(item).some((name) => names.includes(name))) return item;
  }
  return undefined;
}

function itemAliases(item: TimelineItem): string[] {
  const base = item.id.split("/").pop() ?? item.id;
  return uniqueLower([item.id, item.id.replace(/\.md$/i, ""), base, base.replace(/\.md$/i, ""), item.title]);
}

function refAliases(target: string): string[] {
  const trimmed = target.trim();
  const values = [trimmed];
  const wiki = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/.exec(trimmed);
  if (wiki) {
    values.push(wiki[1] ?? trimmed);
    if (wiki[2]) values.push(wiki[2]);
    const base = (wiki[1] ?? trimmed).split("/").pop() ?? trimmed;
    values.push(base.replace(/\.md$/i, ""));
  }
  return uniqueLower(values);
}

function uniqueLower(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function titleFromPath(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.md$/i, "");
}
