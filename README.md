# Hexographer

Paint hex maps inside Obsidian. Biomes, roads, rivers, icons, labels. Local vault files. No cloud.

Inspired by Hexographer / Worldographer UX ideas — not a clone of their assets or formats.

Terrain and icon art: [Kenney Hexagon Pack](https://kenney.nl) (CC0), shipped under `assets/`.

## Install (local testing)

1. `npm install && npm run build` in this folder.
2. Copy (or symlink) this folder into `<vault>/.obsidian/plugins/hexographer-obsidian/`.
3. You need at least: `main.js`, `manifest.json`, `styles.css`, and the `assets/` folder.
4. Enable **Hexographer** in Settings → Community plugins.
5. Ribbon icon or command **Open hex map**.

## Vault map format

Maps are JSON files under `maps/*.hexmap.json` in the vault.

```json
{
  "version": 1,
  "name": "world",
  "hexSize": 28,
  "grid": { "cols": 20, "rows": 15 },
  "layers": {
    "biome": { "0,0": "grass", "1,0": "water" },
    "road": { "0,0": true },
    "river": { "2,1": true },
    "icon": { "1,0": "castle" },
    "label": { "1,0": "Port Haven" }
  }
}
```

Axial (pointy-top) coordinates as `"q,r"` keys.

## MVP scope

- Pointy-top hex grid, pan / zoom
- Right-side terrain palette (thumbnail + label) + icon stamps
- Paint biomes, roads, rivers, icons, labels; layer toggles; erase
- Obsidian modals for New / Open / Save → `maps/*.hexmap.json`

## License

MIT (plugin code). Kenney assets: CC0 — see `assets/LICENSE-Kenney.txt`.
