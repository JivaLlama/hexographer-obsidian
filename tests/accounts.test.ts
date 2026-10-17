import { describe, expect, it } from "vitest";
import {
  applyCommandToNote,
  applyPlanToNote,
  barsForItem,
  createCalendar,
  createUndoStack,
  filterItems,
  HARBOR,
  parseTimelineConfig,
  parseTimelineNote,
  parseTimelineNoteResult,
  planAccountMove,
  planMove,
  RECKONING,
} from "../src/core";
import type { TimelineItem } from "../src/core";

const harbor = createCalendar(HARBOR);
const reckoning = createCalendar(RECKONING);
const calendars = [harbor, reckoning];

function note(yaml: string, type = "event"): string {
  return `---\ntype: ${type}\ncalendar: harbor\n${yaml}\n---\n# Harbor fall\n`;
}

function load(yaml: string, path = "events/fall.md"): { md: string; item: TimelineItem } {
  const md = note(yaml);
  const item = parseTimelineNote(md, { path, calendars, defaultCalendarId: "harbor" });
  if (!item) throw new Error("expected a dated note");
  return { md, item };
}

const ACCOUNTS = `
start: "1000"
culture: "[[Vey]]"
certainty: working
displayHint: "around the siege"
accounts:
  - by: "[[Tideborn]]"
    start: "990"
    end: "991"
    claim: "The harbor fell in a season"
    certainty: uncertain
  - by: "[[Sol]]"
    order: 4
    era: "[[Third Age]]"
    claim: "After the coronation"
`.trim();

describe("accounts", () => {
  it("parses dated and ordered rows and warns instead of dropping the note", () => {
    const { item } = load(`
start: "1000"
accounts:
  - by: "[[Tideborn]]"
    start: "990"
    claim: "The harbor fell in a season"
    certainty: " Maybe "
  - by: "  "
    start: "1"
  - start: "2"
  - by: "[[Sol]]"
    start: "3"
    order: 1
  - by: "[[Late]]"
    end: "4"
  - by: "[[Empty]]"
  - by: "[[Nope]]"
    start: "not-a-date"
  - by: "[[Harbor]]"
    calendar: missing
    start: "980"
  - by: "[[Ordered]]"
    order: 2
    era: "[[Third Age]]"
`.trim());
    expect(item.parseError).toBeUndefined();
    expect(item.accounts?.map((account) => account.by)).toEqual(["[[Tideborn]]", "[[Harbor]]", "[[Ordered]]"]);
    const tide = item.accounts?.[0];
    expect(tide?.certainty).toBeUndefined();
    expect(tide?.claim).toBe("The harbor fell in a season");
    const tideStart = harbor.parse("990");
    expect(tideStart.ok).toBe(true);
    if (tideStart.ok) expect(tide?.start).toBe(tideStart.days);
    expect(item.accounts?.[1].declaredCalendar).toBe("missing");
    expect(item.accounts?.[1].calendarId).toBe("harbor");
    expect(item.accounts?.[1].startRaw).toBe("980");
    expect(item.accounts?.[2].order).toBe(2);
    expect(item.accounts?.[2].eraRef).toBe("[[Third Age]]");
    expect(item.accounts?.[2].start).toBeUndefined();
    const warnings = item.warnings ?? [];
    expect(warnings.some((warning) => warning.includes("unknown certainty"))).toBe(true);
    expect(warnings.some((warning) => warning.includes("missing by"))).toBe(true);
    expect(warnings.some((warning) => warning.includes("needs start or order"))).toBe(true);
    expect(warnings.some((warning) => warning.includes("start and order together"))).toBe(true);
    expect(warnings.some((warning) => warning.includes("end without start"))).toBe(true);
    expect(warnings.some((warning) => warning.includes("start failed to parse"))).toBe(true);
    expect(warnings.some((warning) => warning.includes('unknown calendar "missing"'))).toBe(true);
    expect(item.accounts?.some((account) => account.start === 0 && account.startRaw === undefined)).toBe(false);
  });

  it("does not let the accounts filter remove notes, and matches culture through account by", () => {
    const { item } = load(ACCOUNTS);
    const other = load('start: "1001"', "events/other.md").item;
    expect(filterItems([item, other], { accounts: false })).toHaveLength(2);
    expect(filterItems([item, other], { accounts: true })).toHaveLength(2);
    expect(filterItems([item, other], { accounts: ["[[Tideborn]]"] })).toHaveLength(2);
    expect(filterItems([item], { cultures: ["[[tideborn]]"] })).toEqual([item]);
    expect(filterItems([item], { cultures: ["tideborn"] })).toEqual([]);
    expect(filterItems([item], { cultures: ["[[Vey]]"] })).toEqual([item]);

    const config = parseTimelineConfig("filters:\n  accounts: true\n  cultures:\n    - \"[[Tideborn]]\"\n", "harbor");
    expect(config.filters?.accounts).toBe(true);
    const listed = parseTimelineConfig("filters:\n  accounts:\n    - \"[[Sol]]\"\n", "harbor");
    expect(listed.filters?.accounts).toEqual(["[[Sol]]"]);
  });

  it("swaps the primary bar on a culture timeline and filters ghosts without stripping brackets", () => {
    const { item } = load(ACCOUNTS);
    const master = barsForItem(item, { accounts: true });
    expect(master.primary.id).toBe(item.id);
    expect(master.primary.start).toBe(item.start);
    expect(master.ghosts.map((bar) => bar.culture)).toEqual(["[[Tideborn]]", "[[Sol]]"]);
    expect(master.ghosts[0].claim).toBe("The harbor fell in a season");
    expect(master.ghosts[0].role).toBe("ghost");
    expect(master.ghosts[1].order).toBe(4);

    expect(barsForItem(item, { accounts: false }).ghosts).toEqual([]);
    expect(barsForItem(item).ghosts).toEqual([]);
    const onlyTide = barsForItem(item, { accounts: ["[[tideborn]]"] });
    expect(onlyTide.ghosts.map((bar) => bar.culture)).toEqual(["[[Tideborn]]"]);
    expect(barsForItem(item, { accounts: ["tideborn"] }).ghosts).toEqual([]);

    const culture = barsForItem(item, { culture: "[[tideborn]]", accounts: false });
    expect(culture.primary.accountIndex).toBe(0);
    expect(culture.primary.culture).toBe("[[Tideborn]]");
    expect(culture.primary.claim).toBe("The harbor fell in a season");
    expect(culture.ghosts).toEqual([]);

    const shown = barsForItem(item, { culture: "[[Tideborn]]", accounts: ["[[vey]]"] });
    expect(shown.primary.accountIndex).toBe(0);
    expect(shown.ghosts.map((bar) => bar.notePrimary)).toEqual([true]);
    expect(shown.ghosts[0].culture).toBe("[[Vey]]");
    expect(shown.ghosts[0].start).toBe(item.start);

    const all = barsForItem(item, { culture: "[[Tideborn]]", accounts: true });
    expect(all.ghosts.map((bar) => bar.culture)).toEqual(["[[Vey]]", "[[Sol]]"]);
    expect(all.ghosts.some((bar) => bar.accountIndex === 0)).toBe(false);
  });

  it("uses the first matching account when several share a culture", () => {
    const { item } = load(`
start: "1000"
culture: "[[Vey]]"
accounts:
  - by: "[[Tideborn]]"
    start: "980"
    claim: "first"
  - by: "[[Tideborn]]"
    start: "970"
    claim: "second"
`.trim());
    const bars = barsForItem(item, { culture: "[[Tideborn]]", accounts: true });
    expect(bars.primary.claim).toBe("first");
    expect(bars.primary.accountIndex).toBe(0);
    expect(bars.ghosts.map((bar) => bar.claim)).toEqual([undefined, "second"]);
  });

  it("leaves accounts untouched when the primary is dragged", () => {
    const { md, item } = load(ACCOUNTS);
    const plan = planMove(item, harbor.daysInYear(1000), "move", { fine: false, calendar: harbor });
    expect(plan.command.patches.every((patch) => patch.fields.every((field) => field.key !== "accounts"))).toBe(true);
    const written = applyPlanToNote(md, plan);
    expect(written).toContain("The harbor fell in a season");
    expect(written).toContain("around the siege");
    const again = parseTimelineNote(written, { path: item.id, calendars, defaultCalendarId: "harbor" });
    expect(again?.accounts?.[0].startRaw).toBe("990");
    expect(again?.accounts?.[0].claim).toBe("The harbor fell in a season");
    expect(again?.accounts?.[1].order).toBe(4);
    expect(again?.displayHint).toBe("around the siege");
    expect(again?.source.startRaw).not.toBe("1000");
  });

  it("drags one account row and undoes the whole list", async () => {
    const { md, item } = load(ACCOUNTS);
    const plan = planAccountMove(item, 0, harbor.daysInYear(990), "move", { fine: false, calendar: harbor });
    expect(plan.command.patches[0].fields.map((field) => field.key)).toEqual(["accounts"]);
    expect(plan.startRaw).not.toBe("990");
    expect(plan.accounts[0].claim).toBe("The harbor fell in a season");
    expect(plan.accounts[0].by).toBe("[[Tideborn]]");
    expect(plan.accounts[0].certainty).toBe("uncertain");
    expect(plan.accounts[1].order).toBe(4);
    const written = applyCommandToNote(md, plan.command);
    const again = parseTimelineNote(written, { path: item.id, calendars, defaultCalendarId: "harbor" });
    expect(again?.accounts?.[0].startRaw).toBe(plan.startRaw);
    expect(again?.accounts?.[0].endRaw).toBe(plan.endRaw);
    expect(again?.accounts?.[0].claim).toBe("The harbor fell in a season");
    expect(again?.source.startRaw).toBe("1000");
    expect(again?.displayHint).toBe("around the siege");

    const field = plan.command.patches[0].fields[0];
    const store = new Map<string, unknown>([[field.key, field.after]]);
    const stack = createUndoStack({
      readField: (_path, key) => store.get(key),
      applyField: (_path, key, value) => {
        store.set(key, value);
      },
    });
    stack.push(plan.command);
    await stack.undo();
    expect(store.get("accounts")).toEqual(field.before);
    const undone = applyCommandToNote(written, {
      label: "undo",
      patches: [{ path: item.id, fields: [{ key: "accounts", before: field.after, after: field.before }] }],
    });
    const restored = parseTimelineNote(undone, { path: item.id, calendars, defaultCalendarId: "harbor" });
    expect(restored?.accounts?.[0].startRaw).toBe("990");
    expect(restored?.accounts?.[0].claim).toBe("The harbor fell in a season");
  });

  it("keeps ordered notes ordered and still swaps a dated account", () => {
    const md = note(`
order: 3
era: "[[Third Age]]"
culture: "[[Vey]]"
accounts:
  - by: "[[Tideborn]]"
    start: "990"
    claim: "They date it"
`.trim());
    expect(parseTimelineNote(md, { path: "events/order.md", calendars, defaultCalendarId: "harbor" })).toBeNull();
    const result = parseTimelineNoteResult(md, { path: "events/order.md", calendars, defaultCalendarId: "harbor" });
    expect(result?.kind).toBe("ordered");
    if (result?.kind !== "ordered") return;
    const bars = barsForItem(result.item, { culture: "[[Tideborn]]", accounts: true });
    expect(bars.primary.start).toBeTypeOf("number");
    expect(bars.primary.claim).toBe("They date it");
    expect(bars.ghosts[0].notePrimary).toBe(true);
    expect(bars.ghosts[0].order).toBe(3);
    expect(bars.ghosts[0].start).toBeUndefined();
  });
});
