# Hexographer — phased plan

Inspiration: Hexographer / Worldographer for hex cartography UX. We are not cloning proprietary assets, icons, or file formats — just the useful idea of layered hex paint for worldbuilding notes.

## Architecture

- **Obsidian plugin first** (`src/main.ts`, `src/view.ts`, `src/ui/`)
- **Thin hex engine** under `src/hex/` — no Obsidian imports — so a standalone host (Electron, browser, Godot bridge, etc.) can wrap it later

## Phase 0 — scaffold (done / day one)

- Sample-plugin shape: esbuild, TypeScript, manifest
- Custom ItemView + ribbon/command
- Empty canvas host + toolbar shell

## Phase 1 — MVP paint (current)

- `HexGrid`: pointy-top axial coords, pixel ↔ hex
- Layers: `biome` | `road` | `label`
- Tools: biome brush, road, label, erase
- Layer visibility toggles
- 2D canvas: pan, zoom, click/drag paint
- Serialize / deserialize → `maps/*.hexmap.json`
- New map / open map / save

## Phase 2 — note links & hover

- Store optional `notePath` (or wiki-link) per hex
- Click / Cmd-click opens note
- Hover popup: note title + preview snippet
- Backlinks awareness (hexes that point at current note)

## Phase 3 — Obsidian embed / block

- Code block or embed: ` ```hexmap` or `![[maps/world.hexmap.json]]`
- Read-only or light-edit inline preview in reading/live preview
- Optional thumbnail for file explorer

## Phase 4 — optional standalone

- Wrap `src/hex/` in a minimal HTML/canvas host
- Same JSON format; import/export with vault
- No Obsidian API dependency in the engine

## Non-goals (near term)

- Full Hexographer feature parity
- Proprietary tile / icon sets
- Multiplayer / cloud sync beyond the vault
