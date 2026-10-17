import { TFile, type App, type CachedMetadata } from "obsidian";
import {
  createCalendar,
  GREGORIAN,
  parseCalendarDocument,
  parseTimelineNote,
  RECKONING,
  type CalendarEngine,
  type TimelineItem,
} from "../../../core";
import { readTimelineConfig, stubDataset, type TimelineDataset } from "../scene/dataset";

/**
 * Shell adapter. The core parses notes and calendar files; it does not read the vault.
 * `source.query` is preserved on the config and is not evaluated here.
 */
export async function loadTimeline(app: App, configYaml: string): Promise<TimelineDataset> {
  const calendars = await loadCalendars(app);
  const fallback = calendars.find((engine) => engine.def.id === "gregorian") ?? calendars[0];
  const { config, error } = readTimelineConfig(configYaml, fallback.def.id);
  const calendar = calendars.find((engine) => engine.def.id === config.displayCalendarId);
  const queryNote = config.source.query ? "source.query is not evaluated yet." : undefined;

  if (!calendar) {
    return {
      ...stubDataset(calendars),
      notice: joinNotice(error, queryNote, `Unknown calendar "${config.displayCalendarId}". Showing sample dates.`),
    };
  }

  const items = await readItems(app, config, calendars);
  if (items.length === 0) {
    return {
      ...stubDataset(calendars),
      notice: joinNotice(error, queryNote, "No event, span, or era notes matched. Showing sample dates."),
    };
  }

  return {
    items,
    calendar,
    config,
    origin: "vault",
    ...(joinNotice(error, queryNote) ? { notice: joinNotice(error, queryNote) } : {}),
  };
}

async function loadCalendars(app: App): Promise<CalendarEngine[]> {
  const engines: CalendarEngine[] = [createCalendar(GREGORIAN)];
  const seen = new Set<string>(["gregorian"]);
  for (const file of app.vault.getFiles()) {
    if (!(file instanceof TFile) || !file.path.endsWith(".calendar.md")) continue;
    try {
      const def = parseCalendarDocument(await app.vault.cachedRead(file));
      if (seen.has(def.id)) continue;
      engines.push(createCalendar(def));
      seen.add(def.id);
    } catch {
      // A broken calendar note should not take the timeline down.
    }
  }
  if (!seen.has(RECKONING.id)) {
    engines.push(createCalendar(RECKONING));
  }
  return engines;
}

async function readItems(
  app: App,
  config: ReturnType<typeof readTimelineConfig>["config"],
  calendars: readonly CalendarEngine[]
): Promise<TimelineItem[]> {
  const wanted = normalizeTags(config.source.tags);
  const folders = config.source.folders;
  const broad = !folders || folders.length === 0;
  const items: TimelineItem[] = [];
  for (const file of app.vault.getMarkdownFiles()) {
    if (!folderMatch(file.path, folders)) continue;
    const cache = app.metadataCache.getFileCache(file);
    if (broad) {
      const type = cache?.frontmatter?.type;
      if (type !== "event" && type !== "span" && type !== "era") continue;
    }
    if (wanted && cache && !cacheHasTag(cache, wanted)) continue;
    let text: string;
    try {
      text = await app.vault.cachedRead(file);
    } catch {
      continue;
    }
    const item = parseTimelineNote(text, {
      path: file.path,
      calendars,
      // No vault-default setting exists yet. A note that omits `calendar`
      // is read in the block's display calendar.
      defaultCalendarId: config.displayCalendarId,
      title: file.basename,
    });
    if (!item) continue;
    if (wanted && !cache && !item.tags.some((tag) => wanted.has(tag.toLowerCase()))) continue;
    items.push(item);
  }
  return items;
}

function folderMatch(path: string, folders: readonly string[] | undefined): boolean {
  if (!folders || folders.length === 0) return true;
  return folders.some((folder) => {
    const normalized = folder.trim().replace(/^\.\//, "").replace(/\/+$/, "");
    if (!normalized) return false;
    return path === normalized || path.startsWith(`${normalized}/`);
  });
}

function normalizeTags(tags: readonly string[] | undefined): Set<string> | null {
  if (!tags || tags.length === 0) return null;
  return new Set(tags.map((tag) => tag.trim().replace(/^#/, "").toLowerCase()).filter((tag) => tag.length > 0));
}

function cacheHasTag(cache: CachedMetadata, wanted: Set<string>): boolean {
  for (const tag of cache.tags ?? []) {
    if (wanted.has(tag.tag.replace(/^#/, "").toLowerCase())) return true;
  }
  const raw = cache.frontmatter?.tags;
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  for (const tag of list) {
    if (typeof tag === "string" && wanted.has(tag.replace(/^#/, "").toLowerCase())) return true;
  }
  return false;
}

function joinNotice(...parts: Array<string | undefined>): string | undefined {
  const text = parts.filter((part): part is string => Boolean(part && part.trim())).join(" ");
  return text.length > 0 ? text : undefined;
}
