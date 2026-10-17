/** Stable block-style writer for the subset `parseYaml` accepts. */

export function stringifyYaml(value: unknown): string {
  return stringifyBlock(value, 0);
}

function stringifyBlock(value: unknown, indent: number): string {
  if (isMap(value)) return stringifyMap(value, indent);
  if (Array.isArray(value)) return stringifyArray(value, indent);
  return `${" ".repeat(indent)}${stringifyInline(value)}`;
}

function stringifyMap(map: Record<string, unknown>, indent: number): string {
  const pad = " ".repeat(indent);
  const keys = Object.keys(map);
  if (keys.length === 0) return `${pad}{}`;
  const lines: string[] = [];
  for (const key of keys) {
    const child = map[key];
    if (isBlock(child)) {
      lines.push(`${pad}${quoteKey(key)}:`);
      lines.push(stringifyBlock(child, indent + 2));
    } else {
      lines.push(`${pad}${quoteKey(key)}: ${stringifyInline(child)}`);
    }
  }
  return lines.join("\n");
}

function stringifyArray(arr: unknown[], indent: number): string {
  if (arr.length === 0) return `${" ".repeat(indent)}[]`;
  const pad = " ".repeat(indent);
  const lines: string[] = [];
  for (const item of arr) {
    if (isMap(item)) {
      const entries = Object.entries(item);
      if (entries.length === 0) {
        lines.push(`${pad}- {}`);
        continue;
      }
      const [firstKey, firstVal] = entries[0];
      if (isBlock(firstVal)) {
        lines.push(`${pad}- ${quoteKey(firstKey)}:`);
        lines.push(stringifyBlock(firstVal, indent + 4));
      } else {
        lines.push(`${pad}- ${quoteKey(firstKey)}: ${stringifyInline(firstVal)}`);
      }
      for (const [key, child] of entries.slice(1)) {
        if (isBlock(child)) {
          lines.push(`${pad}  ${quoteKey(key)}:`);
          lines.push(stringifyBlock(child, indent + 4));
        } else {
          lines.push(`${pad}  ${quoteKey(key)}: ${stringifyInline(child)}`);
        }
      }
      continue;
    }
    if (Array.isArray(item)) {
      lines.push(`${pad}-`);
      lines.push(stringifyArray(item, indent + 2));
      continue;
    }
    lines.push(`${pad}- ${stringifyInline(item)}`);
  }
  return lines.join("\n");
}

function isBlock(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return isMap(value) && Object.keys(value).length > 0;
}

function isMap(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringifyInline(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("cannot stringify a non-finite number");
    return String(value);
  }
  if (typeof value === "string") return quoteString(value);
  throw new Error("cannot stringify this value on one line");
}

function quoteKey(key: string): string {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) ? key : quoteString(key);
}

export function quoteString(value: string): string {
  if (value === "") return '""';
  if (
    value === "true" ||
    value === "false" ||
    value === "null" ||
    value === "~" ||
    /^-?(0|[1-9]\d*)(\.\d+)?$/.test(value) ||
    /[:#{}[\],&*!|>'"%@`]/.test(value) ||
    /^\s|\s$/.test(value) ||
    value.includes("\n")
  ) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
  }
  return value;
}
