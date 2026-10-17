/**
 * Shared worldbuilding core. No Obsidian imports and no DOM.
 * Contract for the view side: docs/core-api.md.
 */
export {
  calendarFromUnknown,
  convert,
  createCalendar,
  fromLocalDays,
  GREGORIAN,
  parseCalendarDocument,
  RECKONING,
  serializeCalendarDocument,
  toLocalDays,
  validateCalendar,
} from "./calendar";
export type {
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
export { applyPlanToNote, parseTimelineNote, serializeTimelineNote } from "./items/frontmatter";
export type { ParseTimelineNoteOptions, TimelineWriteback } from "./items/frontmatter";
export { planMove } from "./items/plan-move";
export type { PlanMoveOptions } from "./items/plan-move";
export { finerPrecision, PRECISIONS } from "./items/precision";
export { DEFAULT_LANE_ID, packLanes } from "./layout/pack-lanes";
export type { PackResult } from "./layout/pack-lanes";
export { createScale, scaleLimitsForCalendar } from "./layout/scale";
export type { Scale, ScaleInit, ScaleLimitOptions, ScaleLimits } from "./layout/scale";
export { WT_CLASS, WT_DATA, WT_VAR } from "./theme";
export type { WtClass, WtData, WtVar } from "./theme";
export type {
  EditCommand,
  FieldPatch,
  FilterState,
  ItemKind,
  Lane,
  MoveMode,
  PlanMoveResult,
  TimelineConfig,
  TimelineItem,
} from "./types";
export { createUndoStack } from "./undo/stack";
export type { UndoConflict, UndoStack, UndoStackHooks } from "./undo/stack";
