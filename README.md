# Hexographer

Paint hex maps inside Obsidian. Biomes, roads, labels. Local vault files. No cloud.

Inspired by Hexographer / Worldographer — not a clone of their assets or formats.

## Install (local testing)

1. `npm install && npm run build` in this folder.
2. Copy (or symlink) this folder into `<vault>/.obsidian/plugins/hexographer-obsidian/`.
3. You need at least: `main.js`, `manifest.json`, `styles.css`.
4. Enable **Hexographer** in Settings → Community plugins.
5. Ribbon icon or command **Open hex map**.

## Vault map format

Maps are JSON files under `maps/*.hexmap.json` in the vault.

Example path: `maps/world.hexmap.json`

```json
{
  "version": 1,
  "name": "world",
  "hexSize": 24,
  "grid": { "cols": 20, "rows": 15 },
  "layers": {
    "biome": { "0,0": "grass", "1,0": "water" },
    "road": { "0,0": true },
    "label": { "1,0": "Port Haven" }
  }
}
```

Axial (pointy-top) coordinates as `"q,r"` keys.

## MVP scope

- Hex grid (pointy-top axial)
- Paint biomes, roads, labels
- Layer toggles, erase
- Pan / zoom canvas
- Load / save `.hexmap.json`

## Phase 2 (not yet)

Wiki-style note links on hexes + hover popups. See `PLAN.md`.

## License

MIT
