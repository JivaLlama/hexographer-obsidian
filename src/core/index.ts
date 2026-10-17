/**
 * Shared worldbuilding core. No Obsidian imports and no DOM.
 * Contract for the view side: docs/core-api.md.
 */
export {
  calendarFromUnknown,
  convert,
  createCalendar,
  fromLocalDays,
  formatYearsAgo,
  GREGORIAN,
  HARBOR,
  HARBOR_EPOCH_OFFSET,
  parseCalendarDocument,
  RECKONING,
  serializeCalendarDocument,
  toLocalDays,
  validateCalendar,
} from "./calendar";
export type {
  BeforePresentDisplay,
  CalendarDate,
  CalendarDef,
  CalendarEngine,
  DayCount,
  EraDef,
  LeapRule,
  MonthDef,
  ParseResult,
  Precision,
  Tick,
  TickUnit,
  TimeDef,
  WeekdayDef,
} from "./calendar";

export { parseTimelineConfig } from "./config/parse-config";
export { extentOf } from "./items/extent";
export { filterItems, itemMatches } from "./items/filter";
export { applyCommandToNote, applyPlanToNote, calendarForItem, parseTimelineNote, parseTimelineNoteResult, serializeTimelineNote } from "./items/frontmatter";
export type { ParseTimelineNoteOptions, TimelineWriteback } from "./items/frontmatter";
export { BEFORE_RECKONING, eraAnchors, groupOrderedItems } from "./items/ordered";
export type { EraAnchor, OrderedGroup } from "./items/ordered";
export { planMove } from "./items/plan-move";
export type { PlanMoveOptions } from "./items/plan-move";
export { finerPrecision, PRECISIONS } from "./items/precision";
export { DEFAULT_LANE_ID, packLanes } from "./layout/pack-lanes";
export type { LabelExtent, PackOptions, PackResult } from "./layout/pack-lanes";
export { commitPan, createScale, scaleLimitsForCalendar, zoomToFit } from "./layout/scale";
export type { Scale, ScaleInit, ScaleLimitOptions, ScaleLimits } from "./layout/scale";
export { WT_CLASS, WT_DATA, WT_VAR } from "./theme";
export type { WtClass, WtData, WtVar } from "./theme";
export { parseAccounts } from "./accounts/parse";
export type { AccountParse } from "./accounts/parse";
export { barsForItem } from "./accounts/bars";
export type { Bar, BarsContext, ItemBars } from "./accounts/bars";
export { planAccountMove } from "./accounts/plan";
export type { PlanAccountMoveResult } from "./accounts/plan";
export { formatGap, normalizeUnits, parseGap } from "./relations/gap";
export type { GapSpan, GapTerm } from "./relations/gap";
export { planRelativeMove } from "./relations/plan";
export type { RelativeMoveContext, RelativeMoveResult } from "./relations/plan";
export { resolveDates } from "./relations/resolve";
export type {
  Account,
  Certainty,
  EditCommand,
  FieldPatch,
  FilterState,
  Interval,
  ItemKind,
  Lane,
  MoveMode,
  OrderedItem,
  PlanMoveResult,
  Relation,
  RelationKind,
  ResolvedBounds,
  ResolvedNote,
  TimelineConfig,
  TimelineItem,
  TimelineNoteResult,
  TimeUnitDef,
} from "./types";
export { CERTAINTIES } from "./types";
export { scanVault } from "./vault/scan";
export type { ScanWarning, VaultFile, VaultScan } from "./vault/scan";
export { resolveDefaultCalendar } from "./vault/settings";
export type { ResolvedCalendar, VaultSettings } from "./vault/settings";
export { createUndoStack } from "./undo/stack";
export type { UndoConflict, UndoStack, UndoStackHooks } from "./undo/stack";
