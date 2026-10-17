/**
 * Frozen presentation contract for the timeline view.
 *
 * Snippets and themes target these class names, data attributes, and custom
 * properties. Renaming a value is a breaking change. Adding a new one is not.
 * The view (Cody) owns `timeline.css`; this module only names the contract.
 *
 * Suggested defaults, derived from Obsidian theme variables:
 *
 * - `--wt-item-fill: var(--interactive-accent)`
 * - `--wt-item-stroke: var(--background-modifier-border)`
 * - `--wt-item-height: 22px` (at least 32px under `.is-mobile`)
 * - `--wt-item-radius: var(--radius-s, 4px)`
 * - `--wt-lane-bg: transparent`
 * - `--wt-lane-alt-bg: var(--background-secondary)`
 * - `--wt-lane-label: var(--text-muted)`
 * - `--wt-era-fill: var(--interactive-accent)`
 * - `--wt-era-opacity: 0.12`
 * - `--wt-tick-major: var(--text-normal)`
 * - `--wt-tick-minor: var(--text-faint)`
 * - `--wt-accent: var(--interactive-accent)`
 * - `--wt-selection: var(--interactive-accent)`
 * - `--wt-error-badge: var(--text-error, #e06c75)`
 * - `--wt-certainty-locked: var(--text-normal)`
 * - `--wt-certainty-working: var(--text-muted)`
 * - `--wt-certainty-uncertain: var(--text-warning, #c9a227)`
 * - `--wt-certainty-open: var(--text-faint)`
 *
 * A `color` frontmatter value sets `--wt-item-fill` inline on that item.
 * Tags are also exposed as `data-tags` so `.wt-item[data-tags~="war"]` works.
 */
export const WT_CLASS = {
  root: "wt-timeline",
  axis: "wt-axis",
  tick: "wt-tick",
  tickMajor: "wt-tick--major",
  tickMinor: "wt-tick--minor",
  lane: "wt-lane",
  laneAlt: "wt-lane--alt",
  laneLabel: "wt-lane-label",
  era: "wt-era",
  item: "wt-item",
  itemEvent: "wt-item--event",
  itemSpan: "wt-item--span",
  ghost: "wt-ghost",
  selection: "wt-selection",
  errorBadge: "wt-error-badge",
} as const;

export const WT_VAR = {
  itemFill: "--wt-item-fill",
  itemStroke: "--wt-item-stroke",
  itemHeight: "--wt-item-height",
  itemRadius: "--wt-item-radius",
  laneBg: "--wt-lane-bg",
  laneAltBg: "--wt-lane-alt-bg",
  laneLabel: "--wt-lane-label",
  eraFill: "--wt-era-fill",
  eraOpacity: "--wt-era-opacity",
  tickMajor: "--wt-tick-major",
  tickMinor: "--wt-tick-minor",
  accent: "--wt-accent",
  selection: "--wt-selection",
  errorBadge: "--wt-error-badge",
  certaintyLocked: "--wt-certainty-locked",
  certaintyWorking: "--wt-certainty-working",
  certaintyUncertain: "--wt-certainty-uncertain",
  certaintyOpen: "--wt-certainty-open",
} as const;

/** Data attributes set on each item element. Values are plain strings. */
export const WT_DATA = {
  type: "data-type",
  tags: "data-tags",
  lane: "data-lane",
  id: "data-id",
  /** Value is a `Certainty`: locked, working, uncertain, or open. */
  certainty: "data-certainty",
} as const;

export type WtClass = (typeof WT_CLASS)[keyof typeof WT_CLASS];
export type WtVar = (typeof WT_VAR)[keyof typeof WT_VAR];
export type WtData = (typeof WT_DATA)[keyof typeof WT_DATA];
