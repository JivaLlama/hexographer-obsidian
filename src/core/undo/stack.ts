import type { EditCommand } from "../types";

export interface UndoConflict {
  path: string;
  key: string;
  expected: unknown;
  actual: unknown;
}

export interface UndoStackHooks {
  /** Default 100. */
  limit?: number;
  /** Current note value. When omitted, conflict checks are skipped. */
  readField?: (path: string, key: string) => unknown;
  /** Persist one field. Undo writes `before`; redo writes `after`. */
  applyField?: (path: string, key: string, value: unknown) => void | Promise<void>;
  /** A field was skipped because the note changed after the command. */
  onConflict?: (conflict: UndoConflict) => void;
}

export interface UndoStack {
  push(cmd: EditCommand): void;
  undo(): Promise<EditCommand | null>;
  redo(): Promise<EditCommand | null>;
  canUndo(): boolean;
  canRedo(): boolean;
  /** Drop every command, or every command that touches `path`. */
  clear(path?: string): void;
  /** Keep commands when a note is renamed. */
  renamePath(from: string, to: string): void;
}

const DEFAULT_LIMIT = 100;

export function createUndoStack(hooks: UndoStackHooks = {}): UndoStack {
  const limit = hooks.limit ?? DEFAULT_LIMIT;
  const undoStack: EditCommand[] = [];
  const redoStack: EditCommand[] = [];

  function push(cmd: EditCommand): void {
    const copy = cloneCommand(cmd);
    if (!hasFields(copy)) return;
    redoStack.length = 0;
    undoStack.push(copy);
    while (undoStack.length > limit) undoStack.shift();
  }

  async function step(direction: "undo" | "redo"): Promise<EditCommand | null> {
    const stack = direction === "undo" ? undoStack : redoStack;
    const cmd = stack[stack.length - 1];
    if (!cmd) return null;
    await applyCommand(cmd, direction, hooks);
    stack.pop();
    (direction === "undo" ? redoStack : undoStack).push(cmd);
    return cmd;
  }

  return {
    push,
    undo: () => step("undo"),
    redo: () => step("redo"),
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    clear(path?: string): void {
      if (path === undefined) {
        undoStack.length = 0;
        redoStack.length = 0;
        return;
      }
      retain(undoStack, path);
      retain(redoStack, path);
    },
    renamePath(from: string, to: string): void {
      for (const cmd of undoStack) rewritePath(cmd, from, to);
      for (const cmd of redoStack) rewritePath(cmd, from, to);
    },
  };
}

async function applyCommand(cmd: EditCommand, direction: "undo" | "redo", hooks: UndoStackHooks): Promise<void> {
  for (const patch of cmd.patches) {
    for (const field of patch.fields) {
      const expected = direction === "undo" ? field.after : field.before;
      const write = direction === "undo" ? field.before : field.after;
      if (hooks.readField) {
        const actual = hooks.readField(patch.path, field.key);
        if (!sameValue(actual, expected)) {
          hooks.onConflict?.({ path: patch.path, key: field.key, expected, actual });
          continue;
        }
      }
      await hooks.applyField?.(patch.path, field.key, write);
    }
  }
}

function hasFields(cmd: EditCommand): boolean {
  return cmd.patches.some((patch) => patch.fields.length > 0);
}

function retain(stack: EditCommand[], path: string): void {
  const kept = stack.filter((cmd) => !cmd.patches.some((patch) => patch.path === path));
  stack.length = 0;
  stack.push(...kept);
}

function rewritePath(cmd: EditCommand, from: string, to: string): void {
  for (const patch of cmd.patches) {
    if (patch.path === from) patch.path = to;
  }
}

function cloneCommand(cmd: EditCommand): EditCommand {
  return {
    label: cmd.label,
    patches: cmd.patches.map((patch) => ({
      path: patch.path,
      fields: patch.fields.map((field) => ({ key: field.key, before: cloneValue(field.before), after: cloneValue(field.after) })),
    })),
  };
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      out[key] = cloneValue((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => sameValue(item, b[index]));
  }
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const aKeys = Object.keys(a as Record<string, unknown>);
    const bKeys = Object.keys(b as Record<string, unknown>);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => sameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
  }
  return false;
}
