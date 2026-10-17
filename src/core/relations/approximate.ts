/** Split a leading `~` off a date string. `~4115` and `~ 4115` are approximate. */
export function splitApproximate(raw: string): { text: string; approximate: boolean } {
  const trimmed = raw.trim();
  if (trimmed.startsWith("~")) {
    const text = trimmed.slice(1).trim();
    if (text.length > 0) return { text, approximate: true };
  }
  return { text: trimmed, approximate: false };
}

export function withTilde(raw: string, approximate: boolean | undefined): string {
  if (!approximate || raw.startsWith("~")) return raw;
  return `~${raw}`;
}
