/**
 * A small YAML subset: block maps, block sequences, one-line flow, quotes, and comments.
 * No anchors, tags, or multiline `|` / `>` strings. Enough for calendar files,
 * note frontmatter, and `worldtimeline` config.
 */

interface Line {
  indent: number;
  text: string;
  number: number;
}

export function parseYaml(source: string): unknown {
  const lines = preprocess(source);
  if (lines.length === 0) return null;
  const parsed = parseBlock(lines, 0, lines[0].indent);
  if (parsed.next !== lines.length) {
    throw new Error(`YAML parse error on line ${lines[parsed.next].number}: unexpected content`);
  }
  return parsed.value;
}

function preprocess(source: string): Line[] {
  const out: Line[] = [];
  const rawLines = source.replace(/\r\n/g, "\n").split("\n");
  rawLines.forEach((raw, index) => {
    if (raw.includes("\t") && /^[ \t]*\S/.test(raw) && raw.trimStart() !== raw.trim()) {
      // Tabs in indentation are rejected; tabs inside quoted scalars are fine.
      const leading = raw.match(/^[ \t]*/)?.[0] ?? "";
      if (leading.includes("\t")) {
        throw new Error(`YAML parse error on line ${index + 1}: tabs in indentation are not supported`);
      }
    }
    const trimmedEnd = raw.replace(/[ \t]+$/, "");
    if (trimmedEnd.trim() === "" || trimmedEnd.trim().startsWith("#")) return;
    const indent = trimmedEnd.match(/^ */)?.[0].length ?? 0;
    const text = stripComment(trimmedEnd.slice(indent)).trimEnd();
    if (text === "") return;
    out.push({ indent, text, number: index + 1 });
  });
  return out;
}

function stripComment(text: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && !inSingle && !escaped(text, i)) inDouble = !inDouble;
    else if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === "#" && !inSingle && !inDouble && (i === 0 || text[i - 1] === " ")) {
      return text.slice(0, i).trimEnd();
    }
  }
  return text;
}

function escaped(text: string, index: number): boolean {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) slashes++;
  return slashes % 2 === 1;
}

function parseBlock(lines: Line[], index: number, indent: number): { value: unknown; next: number } {
  if (index >= lines.length) return { value: null, next: index };
  const line = lines[index];
  if (line.indent !== indent) {
    throw new Error(`YAML parse error on line ${line.number}: expected indent ${indent}`);
  }
  if (line.text.startsWith("- ") || line.text === "-") return parseSeq(lines, index, indent);
  if (splitKey(line.text)) return parseMap(lines, index, indent);
  return { value: parseScalar(line.text), next: index + 1 };
}

function parseMap(lines: Line[], index: number, indent: number): { value: Record<string, unknown>; next: number } {
  const map: Record<string, unknown> = {};
  let i = index;
  while (i < lines.length && lines[i].indent === indent && !lines[i].text.startsWith("- ")) {
    const line = lines[i];
    const split = splitKey(line.text);
    if (!split) throw new Error(`YAML parse error on line ${line.number}: expected key: value`);
    if (split.rest === "|" || split.rest === ">") {
      throw new Error(`YAML parse error on line ${line.number}: multiline strings are not supported`);
    }
    if (split.rest === "") {
      if (i + 1 < lines.length && lines[i + 1].indent > indent) {
        const child = parseBlock(lines, i + 1, lines[i + 1].indent);
        map[split.key] = child.value;
        i = child.next;
      } else {
        map[split.key] = null;
        i++;
      }
    } else {
      map[split.key] = parseScalar(split.rest);
      i++;
    }
  }
  return { value: map, next: i };
}

function parseSeq(lines: Line[], index: number, indent: number): { value: unknown[]; next: number } {
  const arr: unknown[] = [];
  let i = index;
  while (i < lines.length && lines[i].indent === indent && (lines[i].text.startsWith("- ") || lines[i].text === "-")) {
    const content = lines[i].text === "-" ? "" : lines[i].text.slice(2);
    if (content === "") {
      if (i + 1 >= lines.length || lines[i + 1].indent <= indent) {
        arr.push(null);
        i++;
        continue;
      }
      const child = parseBlock(lines, i + 1, lines[i + 1].indent);
      arr.push(child.value);
      i = child.next;
      continue;
    }
    const split = splitKey(content);
    if (split && !content.startsWith("{") && !content.startsWith("[")) {
      const map: Record<string, unknown> = {};
      if (split.rest === "") {
        map[split.key] = null;
      } else {
        map[split.key] = parseScalar(split.rest);
      }
      i++;
      if (i < lines.length && lines[i].indent > indent && !lines[i].text.startsWith("- ")) {
        const child = parseMap(lines, i, lines[i].indent);
        Object.assign(map, child.value);
        i = child.next;
      }
      arr.push(map);
      continue;
    }
    arr.push(parseScalar(content));
    i++;
  }
  return { value: arr, next: i };
}

export function splitKey(text: string): { key: string; rest: string } | null {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && !inSingle && !escaped(text, i)) inDouble = !inDouble;
    else if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === ":" && !inSingle && !inDouble) {
      const after = text[i + 1];
      if (after === undefined || after === " " || after === "\t") {
        const rawKey = text.slice(0, i).trim();
        if (!rawKey) return null;
        return { key: unquote(rawKey), rest: text.slice(i + 1).trim() };
      }
    }
  }
  return null;
}

export function parseScalar(text: string): unknown {
  const t = text.trim();
  if (t === "" || t === "null" || t === "~" || t === "Null" || t === "NULL") return null;
  if (t === "true" || t === "True" || t === "TRUE") return true;
  if (t === "false" || t === "False" || t === "FALSE") return false;
  if (t.startsWith('"') || t.startsWith("'")) return unquote(t);
  if (t.startsWith("[[")) return t;
  if (t.startsWith("{") || t.startsWith("[")) return parseFlow(t);
  if (/^-?(0|[1-9]\d*)$/.test(t)) return Number(t);
  if (/^-?\d+\.\d+$/.test(t)) return Number(t);
  return t;
}

function unquote(text: string): string {
  if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) {
    return text.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  if (text.startsWith("'") && text.endsWith("'") && text.length >= 2) {
    return text.slice(1, -1).replace(/''/g, "'");
  }
  return text;
}

function parseFlow(input: string): unknown {
  let i = 0;
  const value = parseFlowValue();
  skip();
  if (i !== input.length) {
    throw new Error(`YAML flow did not end at ${input.slice(i)}`);
  }
  return value;

  function skip(): void {
    while (input[i] === " " || input[i] === "\n" || input[i] === "\t") i++;
  }

  function parseFlowValue(): unknown {
    skip();
    if (input[i] === "{") return parseFlowMap();
    if (input[i] === "[") return parseFlowSeq();
    if (input[i] === '"' || input[i] === "'") return parseFlowQuoted();
    const start = i;
    while (i < input.length && input[i] !== "," && input[i] !== "]" && input[i] !== "}") i++;
    return parseScalar(input.slice(start, i).trim());
  }

  function parseFlowMap(): Record<string, unknown> {
    const map: Record<string, unknown> = {};
    i++; // {
    skip();
    if (input[i] === "}") {
      i++;
      return map;
    }
    while (i < input.length) {
      skip();
      const keyStart = i;
      if (input[i] === '"' || input[i] === "'") {
        const key = parseFlowQuoted();
        skip();
        if (input[i] !== ":") throw new Error("YAML flow map is missing ':'");
        i++;
        map[key] = parseFlowValue();
      } else {
        while (i < input.length && input[i] !== ":" && input[i] !== "," && input[i] !== "}") i++;
        const key = input.slice(keyStart, i).trim();
        if (input[i] !== ":") throw new Error("YAML flow map is missing ':'");
        i++;
        map[key] = parseFlowValue();
      }
      skip();
      if (input[i] === ",") {
        i++;
        continue;
      }
      if (input[i] === "}") {
        i++;
        return map;
      }
      throw new Error("YAML flow map is missing ',' or '}'");
    }
    throw new Error("YAML flow map did not close");
  }

  function parseFlowSeq(): unknown[] {
    const arr: unknown[] = [];
    i++; // [
    skip();
    if (input[i] === "]") {
      i++;
      return arr;
    }
    while (i < input.length) {
      arr.push(parseFlowValue());
      skip();
      if (input[i] === ",") {
        i++;
        continue;
      }
      if (input[i] === "]") {
        i++;
        return arr;
      }
      throw new Error("YAML flow sequence is missing ',' or ']'");
    }
    throw new Error("YAML flow sequence did not close");
  }

  function parseFlowQuoted(): string {
    const quote = input[i];
    i++;
    let out = "";
    while (i < input.length) {
      if (quote === '"' && input[i] === "\\" && i + 1 < input.length) {
        const n = input[i + 1];
        if (n === "n") out += "\n";
        else if (n === '"') out += '"';
        else if (n === "\\") out += "\\";
        else out += n;
        i += 2;
        continue;
      }
      if (quote === "'" && input[i] === "'" && input[i + 1] === "'") {
        out += "'";
        i += 2;
        continue;
      }
      if (input[i] === quote) {
        i++;
        return out;
      }
      out += input[i];
      i++;
    }
    throw new Error("unterminated quote in YAML flow");
  }
}
