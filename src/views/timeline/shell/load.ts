import { Plugin, TFile, type App, type CachedMetadata } from "obsidian";
import {
  resolveDefaultCalendar,
  scanVault,
  type TimelineConfig,
  type VaultFile,
  type VaultSettings,
} from "../../../core";
import { readTimelineConfig, stubDataset, type TimelineDataset } from "../scene/dataset";

/**
 * Shell adapter. Obsidian file reading stays here. Parsing is `scanVault`,
 * which picks the vault-default calendar with `resolveDefaultCalendar`.
 * `source.query` is preserved on the config and is not evaluated here.
 */
export async function loadTimeline(
  app: App,
  configYaml: string,
  settings?: VaultSettings
): Promise<TimelineDataset> {
  const fallback = readTimelineConfig(configYaml, "gregorian");
  const files = await readVaultFiles(app, fallback.config);
  const scan = scanVault(files, settings);
  const resolved = resolveDefaultCalendar(
    settings,
    scan.calendars.map((engine) => engine.def.id)
  );
  const { config, error } = readTimelineConfig(configYaml, resolved.calendarId);
  const calendar = scan.calendars.find((engine) => engine.def.id === config.displayCalendarId);
  const queryNote = config.source.query ? "source.query is not evaluated yet." : undefined;
  const defaultNote = resolved.warning;

  if (!calendar) {
    return {
      ...stubDataset(scan.calendars),
      notice: joinNotice(error, queryNote, defaultNote, `Unknown calendar "${config.displayCalendarId}". Showing sample dates.`),
    };
  }

  if (scan.items.length === 0 && scan.ordered.length === 0) {
    return {
      ...stubDataset(scan.calendars),
      notice: joinNotice(error, queryNote, defaultNote, "No event, span, or era notes matched. Showing sample dates."),
    };
  }

  return {
    items: scan.items,
    ordered: scan.ordered,
    calendars: scan.calendars,
    calendar,
    config,
    origin: "vault",
    ...(joinNotice(error, queryNote, defaultNote) ? { notice: joinNotice(error, queryNote, defaultNote) } : {}),
  };
}

async function readVaultFiles(app: App, config: TimelineConfig): Promise<VaultFile[]> {
  const files: VaultFile[] = [];
  const wanted = normalizeTags(config.source.tags);
  const broad = !config.source.folders || config.source.folders.length === 0;

  for (const file of app.vault.getFiles()) {
    if (!(file instanceof TFile) || !file.path.toLowerCase().endsWith(".calendar.md")) continue;
    try {
      files.push({ path: file.path, content: await app.vault.cachedRead(file) });
    } catch {
      // A broken read should not take the timeline down. scanVault reports parse failures.
    }
  }

  for (const file of app.vault.getMarkdownFiles()) {
    if (file.path.toLowerCase().endsWith(".calendar.md")) continue;
    if (!folderMatch(file.path, config.source.folders)) continue;
    const cache = app.metadataCache.getFileCache(file);
    if (broad) {
      const type = cache?.frontmatter?.type;
      if (type !== "event" && type !== "span" && type !== "era") continue;
    }
    if (wanted && cache && !cacheHasTag(cache, wanted)) continue;
    try {
      files.push({ path: file.path, content: await app.vault.cachedRead(file) });
    } catch {
      continue;
    }
  }
  return files;
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

export async function vaultSettings(plugin: Plugin): Promise<VaultSettings> {
  const data = (await plugin.loadData()) as { defaultCalendarId?: string } | null;
  const id = data?.defaultCalendarId?.trim();
  return id ? { defaultCalendarId: id } : {};
}

/** Double-click opens the note. Ordered items use the same path as dated ones. */
export async function openTimelineNote(plugin: Plugin, path: string, sourcePath: string): Promise<void> {
  const file = plugin.app.vault.getAbstractFileByPath(path);
  if (file instanceof TFile) {
    await plugin.app.workspace.getLeaf("tab").openFile(file);
    return;
  }
  await plugin.app.workspace.openLinkText(path, sourcePath, "tab");
}

function joinNotice(...parts: Array<string | undefined>): string | undefined {
  const text = parts.filter((part): part is string => Boolean(part && part.trim())).join(" ");
  return text.length > 0 ? text : undefined;
}
