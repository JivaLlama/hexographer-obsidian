import { describe, expect, it } from "vitest";
import { createUndoStack } from "../src/core";
import type { EditCommand } from "../src/core";

function command(path: string, before: string, after: string, label = "Move"): EditCommand {
  return { label, patches: [{ path, fields: [{ key: "start", before, after }] }] };
}

describe("undo stack", () => {
  it("undoes and redoes through applyField", async () => {
    const notes = new Map<string, string>([["notes/a.md", "after"]]);
    const stack = createUndoStack({
      readField: (path, key) => (key === "start" ? notes.get(path) : undefined),
      applyField: (path, _key, value) => {
        notes.set(path, String(value));
      },
    });
    stack.push(command("notes/a.md", "before", "after"));
    expect(stack.canUndo()).toBe(true);
    const undone = await stack.undo();
    expect(undone?.label).toBe("Move");
    expect(notes.get("notes/a.md")).toBe("before");
    expect(stack.canRedo()).toBe(true);
    await stack.redo();
    expect(notes.get("notes/a.md")).toBe("after");
    expect(await stack.undo()).not.toBeNull();
    expect(await stack.undo()).toBeNull();
  });

  it("skips a field that changed elsewhere and reports the conflict", async () => {
    const notes = new Map([["notes/a.md", "edited"]]);
    const conflicts: string[] = [];
    const stack = createUndoStack({
      readField: (path) => notes.get(path),
      applyField: (path, _key, value) => {
        notes.set(path, String(value));
      },
      onConflict: (conflict) => conflicts.push(`${conflict.path}:${String(conflict.actual)}`),
    });
    stack.push(command("notes/a.md", "before", "after"));
    await stack.undo();
    expect(notes.get("notes/a.md")).toBe("edited");
    expect(conflicts).toEqual(["notes/a.md:edited"]);
  });

  it("caps the stack, clears a renamed-or-deleted path, and follows renames", async () => {
    const stack = createUndoStack({ limit: 3 });
    stack.push(command("a", "0", "1"));
    stack.push(command("b", "0", "1"));
    stack.push(command("a", "1", "2"));
    stack.push(command("a", "2", "3"));
    let steps = 0;
    while (stack.canUndo()) {
      await stack.undo();
      steps++;
    }
    expect(steps).toBe(3);

    const named = createUndoStack();
    named.push(command("notes/old.md", "1", "2"));
    named.push(command("notes/keep.md", "1", "2"));
    named.renamePath("notes/old.md", "notes/new.md");
    named.clear("notes/keep.md");
    const undone = await named.undo();
    expect(undone?.patches[0]?.path).toBe("notes/new.md");
    expect(named.canUndo()).toBe(false);
  });

  it("treats a multi-file drag as one command", async () => {
    const notes = new Map([
      ["a", "2"],
      ["b", "4"],
    ]);
    const stack = createUndoStack({
      readField: (path) => notes.get(path),
      applyField: (path, _key, value) => {
        notes.set(path, String(value));
      },
    });
    stack.push({
      label: "Move selection",
      patches: [
        { path: "a", fields: [{ key: "start", before: "1", after: "2" }] },
        { path: "b", fields: [{ key: "start", before: "3", after: "4" }] },
      ],
    });
    await stack.undo();
    expect(notes.get("a")).toBe("1");
    expect(notes.get("b")).toBe("3");
    await stack.redo();
    expect(notes.get("b")).toBe("4");
  });
});
