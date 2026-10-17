import { planMove, type PlanMoveOptions } from "../items/plan-move";
import type { Account, EditCommand, MoveMode, OrderedItem, PlanMoveResult, TimelineItem } from "../types";
import { accountToYaml } from "./parse";

export interface PlanAccountMoveResult extends PlanMoveResult {
  /** The account list after this drag. */
  accounts: Account[];
}

/**
 * Drag one account row. The command's field is `accounts`; before and after are the whole list.
 * The note's primary `start` / `end` are not in the command.
 * `claim`, `by`, `certainty`, and `displayHint` are left as the author wrote them.
 */
export function planAccountMove(
  item: TimelineItem | OrderedItem,
  accountIndex: number,
  deltaDays: number,
  mode: MoveMode,
  opts: PlanMoveOptions
): PlanAccountMoveResult {
  const accounts = item.accounts ?? [];
  const account = accounts[accountIndex];
  if (!account) throw new Error(`account ${accountIndex} is missing`);
  if (account.start === undefined || !account.startRaw) throw new Error(`account ${accountIndex} has no date`);
  if (opts.calendar.def.id !== account.calendarId) {
    throw new Error(
      `planAccountMove formats with the account calendar "${account.calendarId}", not "${opts.calendar.def.id}"`
    );
  }

  const synthetic = syntheticItem(item, account);
  const plan = planMove(synthetic, deltaDays, mode, opts);
  const nextAccounts = accounts.map((row, index) => {
    if (index !== accountIndex) return row;
    const startParsed = opts.calendar.parse(stripTilde(plan.startRaw));
    const updated: Account = {
      ...row,
      startRaw: plan.startRaw,
      start: plan.start,
      ...(startParsed.ok ? { startPrecision: startParsed.date.precision } : {}),
    };
    if (plan.endRaw !== undefined) {
      const endParsed = opts.calendar.parse(stripTilde(plan.endRaw));
      updated.endRaw = plan.endRaw;
      updated.end = plan.end;
      if (endParsed.ok) updated.endPrecision = endParsed.date.precision;
    }
    return updated;
  });

  const before = item.source.accountsRaw !== undefined ? item.source.accountsRaw : accounts.map(accountToYaml);
  const after = patchAccountsRaw(before, account, plan.startRaw, plan.endRaw) ?? nextAccounts.map(accountToYaml);
  const changed = plan.command.patches.length > 0;
  const command: EditCommand = {
    label: `Move ${account.by}`.trim(),
    patches: changed ? [{ path: item.source.path, fields: [{ key: "accounts", before, after }] }] : [],
  };
  return {
    start: plan.start,
    end: plan.end,
    startRaw: plan.startRaw,
    ...(plan.endRaw !== undefined ? { endRaw: plan.endRaw } : {}),
    accounts: nextAccounts,
    command,
  };
}

function syntheticItem(item: TimelineItem | OrderedItem, account: Account): TimelineItem {
  const end = account.end ?? null;
  return {
    id: item.id,
    kind: end !== null || account.endRaw ? "span" : "event",
    title: item.title,
    start: account.start ?? 0,
    end,
    extentTo: end ?? account.start ?? 0,
    startPrecision: account.startPrecision ?? "day",
    endPrecision: account.endPrecision ?? null,
    laneId: null,
    tags: [],
    calendarId: account.calendarId,
    links: { places: [], people: [], other: [] },
    source: {
      path: item.source.path,
      startRaw: account.startRaw ?? "",
      ...(account.endRaw !== undefined ? { endRaw: account.endRaw } : {}),
      calendarId: account.calendarId,
    },
  };
}

function patchAccountsRaw(
  raw: unknown,
  account: Account,
  startRaw: string,
  endRaw: string | undefined
): unknown {
  if (!Array.isArray(raw)) return null;
  const copy = clone(raw);
  const row = copy[account.sourceIndex];
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const map = row as Record<string, unknown>;
  map.start = startRaw;
  if (endRaw !== undefined) map.end = endRaw;
  return copy;
}

function stripTilde(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.startsWith("~") ? trimmed.slice(1).trim() : trimmed;
}

function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => clone(entry)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      out[key] = clone((value as Record<string, unknown>)[key]);
    }
    return out as T;
  }
  return value;
}
