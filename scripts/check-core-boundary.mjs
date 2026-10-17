/**
 * Fail if src/core imports Obsidian or touches the browser page.
 * Run: node scripts/check-core-boundary.mjs
 *      node scripts/check-core-boundary.mjs --self-test
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const coreRoot = path.join(root, "src", "core");

const DOM_GLOBALS = [
  "document",
  "window",
  "navigator",
  "localStorage",
  "sessionStorage",
  "HTMLElement",
  "SVGElement",
  "HTMLDocument",
  "SVGSVGElement",
  "DocumentFragment",
  "DOMParser",
  "XMLSerializer",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "getComputedStyle",
  "customElements",
  "querySelector",
  "querySelectorAll",
];

const selfTest = process.argv.includes("--self-test");

if (selfTest) {
  runSelfTest();
} else {
  const problems = walk(coreRoot);
  if (problems.length > 0) {
    console.error("src/core boundary check failed:");
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
}

function walk(dir) {
  const problems = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) problems.push(...walk(full));
    else if (entry.name.endsWith(".ts")) problems.push(...problemsInFile(full));
  }
  return problems;
}

function problemsInFile(file) {
  const source = fs.readFileSync(file, "utf8");
  const problems = [];
  for (const spec of importSpecifiers(stripComments(source))) {
    const issue = importProblem(file, spec);
    if (issue) problems.push(`${path.relative(root, file)}: ${issue}`);
  }
  const code = stripCommentsAndStrings(source);
  for (const name of DOM_GLOBALS) {
    const re = new RegExp(`\\b${name}\\b`);
    if (re.test(code)) problems.push(`${path.relative(root, file)}: references DOM global ${name}`);
  }
  return problems;
}

function importSpecifiers(source) {
  const specs = [];
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) specs.push(match[1]);
  }
  return specs;
}

function importProblem(file, spec) {
  if (spec === "obsidian" || spec.startsWith("obsidian/")) return `imports "${spec}"`;
  if (!spec.startsWith(".")) return `imports external module "${spec}"`;
  const resolved = resolveRelative(file, spec);
  if (!resolved) return `unresolved import "${spec}"`;
  if (!isInside(resolved, coreRoot)) return `import escapes src/core: "${spec}"`;
  return null;
}

function resolveRelative(file, spec) {
  const base = path.resolve(path.dirname(file), spec);
  const candidates = [base, `${base}.ts`, path.join(base, "index.ts")];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function isInside(file, dir) {
  const relative = path.relative(dir, file);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function stripComments(source) {
  return strip(source, false);
}

function stripCommentsAndStrings(source) {
  return strip(source, true);
}

function strip(source, dropStrings) {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === "//") {
      const end = source.indexOf("\n", i);
      i = end < 0 ? source.length : end;
      continue;
    }
    if (two === "/*") {
      const end = source.indexOf("*/", i + 2);
      i = end < 0 ? source.length : end + 2;
      continue;
    }
    const c = source[i];
    if (dropStrings && (c === '"' || c === "'" || c === "`")) {
      out += " ";
      i++;
      while (i < source.length) {
        if (source[i] === "\\") {
          i += 2;
          continue;
        }
        if (source[i] === c) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function runSelfTest() {
  const checks = [
    ['import { Plugin } from "obsidian";', true],
    ["import {\n  Notice\n} from 'obsidian';", true],
    ["const el = document.createElement('div');", true],
    ["window.addEventListener('resize', () => {});", true],
    ["// import { x } from 'obsidian'\nexport const a = 1;", false],
    ["/* document */\nexport const b = 1;", false],
    ['const label = "document";\nexport const c = label;', false],
    ['import { extentOf } from "./items/extent";', false],
  ];
  const failures = [];
  for (const [source, shouldFail] of checks) {
    const failed = scanSource(source);
    if (failed !== shouldFail) {
      failures.push(`expected ${shouldFail ? "failure" : "success"} for:\n${source}`);
    }
  }
  const escape = importProblem(path.join(coreRoot, "index.ts"), "../view");
  if (!escape) failures.push("import of ../view should escape src/core");
  if (failures.length > 0) {
    console.error("boundary self-test failed:");
    for (const failure of failures) console.error(failure);
    process.exit(1);
  }
}

function scanSource(source) {
  const specs = importSpecifiers(stripComments(source));
  if (specs.some((spec) => spec === "obsidian" || spec.startsWith("obsidian/"))) return true;
  const code = stripCommentsAndStrings(source);
  return DOM_GLOBALS.some((name) => new RegExp(`\\b${name}\\b`).test(code));
}
