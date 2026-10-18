import { WT_CLASS, WT_DATA, WT_VAR } from "../../../core";

export { WT_CLASS, WT_DATA, WT_VAR };

export function classes(...names: Array<string | false | null | undefined>): string {
  return names.filter((name): name is string => Boolean(name)).join(" ");
}
