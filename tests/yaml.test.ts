import { describe, expect, it } from "vitest";
import { parseYaml } from "../src/core/yaml/parse";
import { stringifyYaml } from "../src/core/yaml/stringify";

describe("yaml subset", () => {
  it("parses maps, lists, quotes, and comments", () => {
    const value = parseYaml(`
# header
name: The Reckoning
count: 3
flag: true
empty: null
lane: "[[House Vey]]"
tags: [war, siege]
nested:
  kind: cycle
  every: 4
months:
  - id: thawmere
    name: Thawmere
    days: 30
  - id: yearsend
    days: 5
    intercalary: true # festival
`);
    expect(value).toEqual({
      name: "The Reckoning",
      count: 3,
      flag: true,
      empty: null,
      lane: "[[House Vey]]",
      tags: ["war", "siege"],
      nested: { kind: "cycle", every: 4 },
      months: [
        { id: "thawmere", name: "Thawmere", days: 30 },
        { id: "yearsend", days: 5, intercalary: true },
      ],
    });
  });

  it("keeps a wikilink scalar instead of treating it as a flow list", () => {
    expect(parseYaml('lane: [[House Vey]]')).toEqual({ lane: "[[House Vey]]" });
  });

  it("round-trips a nested document", () => {
    const value = {
      id: "reckoning",
      names: ["Thawmere", "Frostmoot"],
      leap: { kind: "nested", rules: [{ every: 4, leap: true }] },
      note: "3A 412 Frostmoot 3",
    };
    expect(parseYaml(stringifyYaml(value))).toEqual(value);
  });
});
