import type { Plugin } from "obsidian";

/** Vault and metadata events are collapsed so a burst of writes re-renders once. */
export const REFRESH_DEBOUNCE_MS = 150;

export interface RefreshBus {
  subscribe(listener: () => void): () => void;
}

export function createRefreshBus(plugin: Plugin): RefreshBus {
  const listeners = new Set<() => void>();
  let timer: number | null = null;

  const fire = (): void => {
    timer = null;
    for (const listener of listeners) listener();
  };

  const bump = (): void => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(fire, REFRESH_DEBOUNCE_MS);
  };

  plugin.registerEvent(plugin.app.vault.on("create", bump));
  plugin.registerEvent(plugin.app.vault.on("modify", bump));
  plugin.registerEvent(plugin.app.vault.on("delete", bump));
  plugin.registerEvent(plugin.app.vault.on("rename", bump));
  plugin.registerEvent(plugin.app.metadataCache.on("changed", bump));
  plugin.register(() => {
    if (timer !== null) window.clearTimeout(timer);
    listeners.clear();
  });

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
