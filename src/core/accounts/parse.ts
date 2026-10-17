import type { CalendarEngine, Precision } from "../calendar/types";
import { CERTAINTIES, type Account, type Certainty } from "../types";
import { splitApproximate } from "../relations/approximate";

export interface AccountParse {
  accounts: Account[];
  warnings: string[];
}

/**
 * Keep a row that has `by` and either `start` or `order`.
 * A bad date drops the row. An unknown certainty drops only that field.
 * An unknown row calendar warns and falls back to the note calendar.
 */
export function parseAccounts(
  value: unknown,
  noteCalendarId: string,
  calendars: readonly CalendarEngine[]
): AccountParse {
  if (value === undefined || value === null) return { accounts: [], warnings: [] };
  if (!Array.isArray(value)) return { accounts: [], warnings: ["accounts must be a list"] };
  const accounts: Account[] = [];
  const warnings: string[] = [];
  value.forEach((entry, index) => {
    const parsed = parseRow(entry, index, noteCalendarId, calendars);
    warnings.push(...parsed.warnings);
    if (parsed.account) accounts.push(parsed.account);
  });
  return { accounts, warnings };
}

export function accountToYaml(account: Account): Record<string, unknown> {
  const row: Record<string, unknown> = { by: account.by };
  if (account.declaredCalendar) row.calendar = account.declaredCalendar;
  if (account.order !== undefined) {
    row.order = account.order;
    if (account.eraRef) row.era = account.eraRef;
  } else {
    if (account.startRaw !== undefined) row.start = account.startRaw;
    if (account.endRaw !== undefined) row.end = account.endRaw;
  }
  if (account.claim) row.claim = account.claim;
  if (account.certainty) row.certainty = account.certainty;
  return row;
}

function parseRow(
  value: unknown,
  index: number,
  noteCalendarId: string,
  calendars: readonly CalendarEngine[]
): { account?: Account; warnings: string[] } {
  const where = `accounts[${index}]`;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { warnings: [`${where}: expected a map`] };
  }
  const map = value as Record<string, unknown>;
  const by = scalarString(map.by)?.trim() ?? "";
  const label = by || where;
  if (!by) return { warnings: [`${where}: missing by`] };

  const startRaw = scalarString(map.start);
  const endRaw = scalarString(map.end);
  const order = finiteNumber(map.order);
  const hasStart = startRaw !== undefined && startRaw.trim().length > 0;
  const hasOrder = order !== undefined;
  if (hasStart && hasOrder) return { warnings: [`${label}: start and order together`] };
  if (!hasStart && endRaw !== undefined && endRaw.trim().length > 0) {
    return { warnings: [`${label}: end without start`] };
  }
  if (!hasStart && !hasOrder) return { warnings: [`${label}: needs start or order`] };

  const warnings: string[] = [];
  const declared = scalarString(map.calendar)?.trim();
  let calendarId = noteCalendarId;
  if (declared) {
    if (calendars.some((engine) => engine.def.id === declared)) calendarId = declared;
    else {
      warnings.push(`${label}: unknown calendar "${declared}"`);
      calendarId = noteCalendarId;
    }
  }
  const certainty = readCertainty(map.certainty, label);
  warnings.push(...certainty.warnings);

  const account: Account = {
    by,
    calendarId,
    ...(declared ? { declaredCalendar: declared } : {}),
    sourceIndex: index,
    ...(scalarString(map.claim)?.trim() ? { claim: scalarString(map.claim)?.trim() } : {}),
    ...(certainty.certainty ? { certainty: certainty.certainty } : {}),
  };

  if (hasOrder) {
    account.order = order;
    const era = scalarString(map.era)?.trim();
    if (era) account.eraRef = era;
    if (warnings.length > 0) account.warnings = [...warnings];
    return { account, warnings };
  }

  const calendar = calendars.find((engine) => engine.def.id === calendarId);
  if (!calendar) {
    warnings.push(`${label}: unknown calendar "${calendarId}"`);
    return { warnings };
  }
  const start = parseEdge(calendar, startRaw ?? "");
  if (!start) {
    warnings.push(`${label}: start failed to parse`);
    return { warnings };
  }
  account.startRaw = start.raw;
  account.start = start.days;
  account.startPrecision = start.precision;
  if (endRaw !== undefined && endRaw.trim().length > 0) {
    const end = parseEdge(calendar, endRaw);
    if (!end) {
      warnings.push(`${label}: end failed to parse`);
      return { warnings };
    }
    account.endRaw = end.raw;
    account.end = end.days;
    account.endPrecision = end.precision;
  } else {
    account.end = null;
    account.endPrecision = null;
  }
  if (warnings.length > 0) account.warnings = [...warnings];
  return { account, warnings };
}

function parseEdge(
  calendar: CalendarEngine,
  raw: string
): { raw: string; days: number; precision: Precision } | null {
  const split = splitApproximate(raw);
  if (!split.text) return null;
  const parsed = calendar.parse(split.text);
  if (!parsed.ok) return null;
  return { raw: raw.trim(), days: parsed.days, precision: parsed.date.precision };
}

function readCertainty(value: unknown, label: string): { certainty?: Certainty; warnings: string[] } {
  if (value === undefined || value === null || value === "") return { warnings: [] };
  if (typeof value !== "string") return { warnings: [`${label}: certainty must be a string`] };
  const trimmed = value.trim().toLowerCase();
  if (CERTAINTIES.includes(trimmed as Certainty)) return { certainty: trimmed as Certainty, warnings: [] };
  return { warnings: [`${label}: unknown certainty "${value.trim()}"`] };
}

function scalarString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
