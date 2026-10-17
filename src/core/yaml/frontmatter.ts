/** Split a markdown note into YAML frontmatter and the untouched body. */
export function splitFrontmatter(markdown: string): { yaml: string; body: string } | null {
  const text = markdown.replace(/^\uFEFF/, "");
  if (!text.startsWith("---")) return null;
  const firstBreak = text.indexOf("\n");
  if (firstBreak < 0) return null;
  if (text.slice(0, firstBreak).trim() !== "---") return null;
  const rest = text.slice(firstBreak + 1);
  const close = rest.search(/^---[ \t]*\r?$/m);
  if (close < 0) return null;
  const yaml = rest.slice(0, close).replace(/\r?\n$/, "");
  const after = rest.slice(close);
  const lineBreak = after.indexOf("\n");
  const body = lineBreak < 0 ? "" : after.slice(lineBreak + 1);
  return { yaml, body };
}

export function joinFrontmatter(yaml: string, body: string): string {
  const trimmed = yaml.replace(/\s+$/, "");
  return `---\n${trimmed}\n---\n${body}`;
}
