/**
 * Image cache for terrain/icons. Host supplies URL resolver (vault/plugin path → URL).
 */

export type AssetUrlResolver = (pluginRelativePath: string) => string;

export class AssetCache {
  private images = new Map<string, HTMLImageElement>();
  private failed = new Set<string>();
  private loading = new Map<string, Promise<HTMLImageElement | null>>();

  constructor(private resolveUrl: AssetUrlResolver) {}

  get(path: string): HTMLImageElement | null {
    if (this.failed.has(path)) return null;
    return this.images.get(path) ?? null;
  }

  async load(path: string): Promise<HTMLImageElement | null> {
    const existing = this.images.get(path);
    if (existing) return existing;
    if (this.failed.has(path)) return null;
    const inflight = this.loading.get(path);
    if (inflight) return inflight;

    const promise = new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.images.set(path, img);
        this.loading.delete(path);
        resolve(img);
      };
      img.onerror = () => {
        this.failed.add(path);
        this.loading.delete(path);
        resolve(null);
      };
      img.src = this.resolveUrl(path);
    });
    this.loading.set(path, promise);
    return promise;
  }

  async loadAll(paths: string[]): Promise<void> {
    await Promise.all(paths.map((p) => this.load(p)));
  }
}
