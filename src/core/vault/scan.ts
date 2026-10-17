import { createCalendar, GREGORIAN, parseCalendarDocument } from "../calendar";
import type { CalendarEngine } from "../calendar/types";
import { parseTimelineNoteResult } from "../items/frontmatter";
import type { OrderedItem, TimelineItem } from "../types";
import { resolveDefaultCalendar, type VaultSettings } from "./settings";

export interface VaultFile {
  path: string;
  content: string;
}

export interface ScanWarning {
  path: string;
  message: string;
}

export interface VaultScan {
  /** Dated events, spans, and eras, in file order. Eras are also listed on `eras`. */
  items: TimelineItem[];
  ordered: OrderedItem[];
  eras: TimelineItem[];
  calendars: CalendarEngine[];
  warnings: ScanWarning[];
}

/**
 * Pure vault scan. The shell supplies `{ path, content }` and does the file I/O.
 * Calendar files are `*.calendar.md`. Gregorian is always loaded first; a file
 * with that id is skipped. Other duplicate ids keep the first file.
 */
export function scanVault(files: readonly VaultFile[], settings?: VaultSettings): VaultScan {
  const warnings: ScanWarning[] = [];
  const calendars: CalendarEngine[] = [createCalendar(GREGORIAN)];
  const seen = new Set<string>([GREGORIAN.id]);

  for (const file of files) {
    if (!isCalendarFile(file.path)) continue;
    try {
      const def = parseCalendarDocument(file.content);
      if (seen.has(def.id)) {
        warnings.push({ path: file.path, message: `duplicate calendar "${def.id}"` });
        continue;
      }
      calendars.push(createCalendar(def));
      seen.add(def.id);
    } catch (error) {
      warnings.push({ path: file.path, message: error instanceof Error ? error.message : String(error) });
    }
  }

  const resolved = resolveDefaultCalendar(
    settings,
    calendars.map((engine) => engine.def.id)
  );
  if (resolved.warning) warnings.push({ path: "", message: resolved.warning });

  const items: TimelineItem[] = [];
  const ordered: OrderedItem[] = [];
  const eras: TimelineItem[] = [];

  for (const file of files) {
    if (isCalendarFile(file.path) || !file.path.toLowerCase().endsWith(".md")) continue;
    let result: ReturnType<typeof parseTimelineNoteResult>;
    try {
      result = parseTimelineNoteResult(file.content, {
        path: file.path,
        calendars,
        defaultCalendarId: resolved.calendarId,
      });
    } catch (error) {
      warnings.push({ path: file.path, message: error instanceof Error ? error.message : String(error) });
      continue;
    }
    if (!result) {
      if (hasTimelineFrontmatter(file.content)) {
        warnings.push({ path: file.path, message: "timeline frontmatter could not be read" });
      }
      continue;
    }
    const noteWarnings = result.item.warnings ?? [];
    for (const message of noteWarnings) warnings.push({ path: file.path, message });
    if (result.kind === "ordered") {
      ordered.push(result.item);
      continue;
    }
    items.push(result.item);
    if (result.item.kind === "era") eras.push(result.item);
    if (result.item.parseError) warnings.push({ path: file.path, message: result.item.parseError });
  }

  return { items, ordered, eras, calendars, warnings };
}

function isCalendarFile(path: string): boolean {
  return path.toLowerCase().endsWith(".calendar.md");
}

function hasTimelineFrontmatter(content: string): boolean {
  return /^---\s*\n[\s\S]*?\btype:\s*(event|span|era)\b/m.test(content);
}
