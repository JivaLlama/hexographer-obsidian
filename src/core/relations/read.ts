import type { Relation, RelationKind } from "../types";

const KINDS: readonly RelationKind[] = ["after", "before", "overlaps"];

export interface RelationRead {
  relations: Relation[];
  form?: "sugar" | "list" | "mixed";
  gapRaw?: string;
  relationsRaw?: unknown;
  listCount: number;
  warnings: string[];
}

/**
 * Sugar keys and a `relations` list may both be present.
 * The sugar entry is appended after the list. A single `gap` belongs to the sugar entry.
 * More than one sugar key keeps the first of `after`, `before`, `overlaps` and warns.
 */
export function readRelations(fields: Record<string, unknown>): RelationRead {
  const warnings: string[] = [];
  const list: Relation[] = [];
  if (fields.relations !== undefined) {
    if (!Array.isArray(fields.relations)) warnings.push("relations must be a list");
    else {
      fields.relations.forEach((entry, index) => {
        const relation = readEntry(entry, index);
        if (!relation) warnings.push(`relations[${index}] needs after, before, or overlaps`);
        else list.push(relation);
      });
    }
  }

  const sugarKeys = KINDS.filter((kind) => scalarString(fields[kind]));
  if (sugarKeys.length > 1) warnings.push("only one of after, before, or overlaps is used; extra keys ignored");
  const sugarKey = sugarKeys[0];
  const gapRaw = scalarString(fields.gap);
  const sugar: Relation[] = [];
  if (sugarKey) {
    const target = scalarString(fields[sugarKey]) ?? "";
    const edge = fields.edge === "end" ? "end" : fields.edge === "start" ? "start" : undefined;
    sugar.push({
      kind: sugarKey,
      target,
      ...(gapRaw ? { gap: gapRaw } : {}),
      ...(edge ? { edge } : {}),
    });
  } else if (gapRaw && list.length === 0) {
    warnings.push("gap without after, before, or overlaps");
  }

  let form: RelationRead["form"];
  if (list.length > 0 && sugar.length > 0) form = "mixed";
  else if (sugar.length > 0) form = "sugar";
  else if (list.length > 0 || Array.isArray(fields.relations)) form = "list";

  return {
    relations: [...list, ...sugar],
    form,
    gapRaw,
    relationsRaw: fields.relations,
    listCount: list.length,
    warnings,
  };
}

export function relationsToYaml(relations: readonly Relation[]): Record<string, unknown>[] {
  return relations.map((relation) => {
    const row: Record<string, unknown> = { [relation.kind]: relation.target };
    if (relation.gap) row.gap = relation.gap;
    if (relation.edge === "end") row.edge = "end";
    return row;
  });
}

function readEntry(value: unknown, sourceIndex: number): Relation | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const map = value as Record<string, unknown>;
  const kind = KINDS.find((candidate) => scalarString(map[candidate]));
  if (!kind) return undefined;
  const edge = map.edge === "end" ? "end" : map.edge === "start" ? "start" : undefined;
  const gap = scalarString(map.gap);
  return {
    kind,
    target: scalarString(map[kind]) ?? "",
    ...(gap ? { gap } : {}),
    ...(edge ? { edge } : {}),
    sourceIndex,
  };
}

function scalarString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}
