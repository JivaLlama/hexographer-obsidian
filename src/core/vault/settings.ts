import type { TimeUnitDef } from "../types";

/**
 * Plugin settings the shell passes in. The core does not read Obsidian's data store.
 * `defaultCalendarId` is the calendar a note uses when it omits `calendar`.
 */
export interface VaultSettings {
  defaultCalendarId?: string;
  /**
   * Ranged units for `gap`. Either `{ gen: "40-60y" }` or a list of `TimeUnitDef`.
   * `y`, `mo`, and `d` are built in and are not listed here.
   */
  units?: readonly TimeUnitDef[] | Readonly<Record<string, string>>;
}

export interface ResolvedCalendar {
  calendarId: string;
  /** Set when the configured id is not among the loaded calendars. */
  warning?: string;
}

/**
 * Pick the vault-default calendar id.
 * A configured id wins when it is loaded. Otherwise the built-in `gregorian` wins,
 * then the first loaded id. An unknown configured id is reported and not used.
 */
export function resolveDefaultCalendar(
  settings: VaultSettings | undefined,
  calendarIds: readonly string[]
): ResolvedCalendar {
  const configured = settings?.defaultCalendarId?.trim();
  if (configured && calendarIds.includes(configured)) return { calendarId: configured };
  const warning = configured ? `unknown default calendar "${configured}"` : undefined;
  if (calendarIds.includes("gregorian")) return warning ? { calendarId: "gregorian", warning } : { calendarId: "gregorian" };
  if (calendarIds.length > 0) {
    return warning
      ? { calendarId: calendarIds[0], warning }
      : { calendarId: calendarIds[0] };
  }
  return {
    calendarId: configured || "gregorian",
    warning: warning ?? "no calendars loaded",
  };
}
